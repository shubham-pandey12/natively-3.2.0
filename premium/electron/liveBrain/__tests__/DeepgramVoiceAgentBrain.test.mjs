import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer } from 'ws';

const require = createRequire(import.meta.url);
const load = name => require(`../../../../dist-electron/premium/electron/liveBrain/${name}.js`);
const { DeepgramVoiceAgentBrain, resolveByoEndpoint } = load('brains/DeepgramVoiceAgentBrain');
const { buildDeepgramInstructions, buildProviderInstructions, DEEPGRAM_MAX_MANAGED_PROMPT_CHARS, FILLER_TURN_RULE } = load('instructions');
const { createLiveBrain } = load('index');
const { testConnection } = load('meeting');
const {
    CONTEXT_INTELLIGENCE_LAYER, CORE_IDENTITY, EXECUTION_CONTRACT, HUMAN_SPOKEN_ANSWER_CONTRACT,
    MODE_TECHNICAL_INTERVIEW_PROMPT, UNIVERSAL_WHAT_TO_ANSWER_PROMPT,
} = require('../../../../dist-electron/electron/llm/prompts.js');

const apiKey = 'dg_fake_key_for_deepgram_voice_agent_tests_0123456789';

function makeContext(overrides = {}) {
    return {
        sessionId: 'dg-test',
        responseNamespace: 'dg-test:1',
        instructions: 'Answer concisely.',
        notebook: {
            topics: [],
            currentTopic: null,
            requirements: [],
            constraints: [],
            clarifications: [],
            decisions: [],
            answered: [],
            summary: '',
            updatedAt: 0,
        },
        recentTurns: [],
        signal: new AbortController().signal,
        ...overrides,
    };
}

function sendJson(socket, payload) {
    socket.send(JSON.stringify(payload));
}

async function until(read, timeoutMs = 2_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = read();
        if (value) return value;
        await delay(5);
    }
    assert.fail('Timed out waiting for DeepgramVoiceAgentBrain condition');
}

async function createRig(t, opts = {}) {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    const connections = [];
    server.on('connection', (socket, request) => {
        assert.equal(request.headers.authorization, `Token ${apiKey}`);
        const attempt = connections.length + 1;
        const entry = { socket, jsonMessages: [], binaryFrames: [] };
        connections.push(entry);
        if (opts.onOpen) {
            opts.onOpen(socket, attempt);
        } else {
            sendJson(socket, { type: 'Welcome', session_id: `sess-${attempt}` });
        }
        socket.on('message', (data, isBinary) => {
            if (isBinary) {
                entry.binaryFrames.push(Buffer.from(data));
                return;
            }
            const parsed = JSON.parse(data.toString());
            entry.jsonMessages.push(parsed);
            if (parsed.type === 'Settings') {
                if (opts.onSettings) opts.onSettings(socket, parsed, attempt);
                else sendJson(socket, { type: 'SettingsApplied' });
            } else if (parsed.type === 'InjectUserMessage') {
                opts.onInject?.(socket, parsed);
            }
        });
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const endpoint = `ws://127.0.0.1:${address.port}`;
    const brain = new DeepgramVoiceAgentBrain({
        apiKey,
        endpoint,
        backoffMs: [],
        ...opts.brainOptions,
    });
    const events = [];
    brain.onEvent(event => events.push(event));

    t.after(async () => {
        await brain.stop();
        for (const client of server.clients) client.terminate();
        await new Promise(resolve => server.close(() => resolve()));
    });

    return { brain, events, connections, endpoint };
}

test('handshake Welcome -> Settings -> SettingsApplied transitions to ready and streams 16 kHz raw binary PCM', async t => {
    const { brain, events, connections } = await createRig(t, {
        brainOptions: {
            deepgramThink: {
                thinkMode: 'managed',
                managedProvider: 'open_ai',
                managedModel: 'gpt-4o-mini',
            },
        },
    });
    await brain.start(makeContext());

    assert.equal(events.some(e => e.type === 'status' && e.status === 'ready'), true);
    const settings = connections[0].jsonMessages.find(m => m.type === 'Settings');
    assert.ok(settings);
    assert.deepEqual(settings.audio, {
        input: { encoding: 'linear16', sample_rate: 16_000 },
        output: { encoding: 'linear16', sample_rate: 16_000, container: 'none' },
    });
    assert.deepEqual(settings.agent.listen, { provider: { type: 'deepgram', version: 'v2', model: 'flux-general-multi' } });
    assert.deepEqual(settings.agent.think, {
        provider: { type: 'open_ai', model: 'gpt-4o-mini' },
        prompt: 'Answer concisely.',
    });
    assert.deepEqual(settings.agent.speak, { provider: { type: 'deepgram', model: 'aura-2-asteria-en' } });

    // 320 samples at 16 kHz = 640 bytes (one raw binary PCM frame)
    brain.pushInterviewerAudio(new Int16Array(320).fill(512), 16_000);
    const frame = await until(() => connections[0].binaryFrames[0]);
    assert.equal(frame.length, 640);
    assert.equal(frame.readInt16LE(0), 512);
});

test('keeps multiple text chunks in one answer and rejects late output after a correction', async t => {
    const { brain, events, connections } = await createRig(t);
    await brain.start(makeContext());
    const { socket } = connections[0];
    socket.send(Buffer.alloc(640, 1), { binary: true });

    sendJson(socket, { type: 'ConversationText', role: 'user', content: 'What is sharding?' });
    sendJson(socket, { type: 'ConversationText', role: 'assistant', content: 'Choose a shard key.' });
    sendJson(socket, { type: 'ConversationText', role: 'assistant', content: 'Watch for hotspots.' });
    await until(() => events.filter(event => event.type === 'response_delta').length === 2);
    const first = events.find(event => event.type === 'response_started');
    assert.ok(first && first.type === 'response_started');
    assert.deepEqual(events.filter(event => event.type === 'response_delta'), [
        { type: 'response_delta', responseId: first.responseId, text: 'Choose a shard key.' },
        { type: 'response_delta', responseId: first.responseId, text: ' Watch for hotspots.' },
    ]);
    assert.equal(events.some(event => event.type === 'response_done'), false);
    assert.ok(events.some(event => event.type === 'interviewer_speech_stopped'));

    sendJson(socket, { type: 'UserStartedSpeaking' });
    sendJson(socket, { type: 'ConversationText', role: 'assistant', content: 'Late output.' });
    sendJson(socket, { type: 'ConversationText', role: 'user', content: 'Actually, use MongoDB.' });
    sendJson(socket, { type: 'AgentAudioDone' }); // Late completion for the interrupted answer.
    sendJson(socket, { type: 'AgentThinking' });
    sendJson(socket, { type: 'ConversationText', role: 'assistant', content: 'Start with a MongoDB sharding strategy.' });
    sendJson(socket, { type: 'AgentAudioDone' });
    await until(() => events.filter(event => event.type === 'response_done').length === 2);
    const started = events.filter(event => event.type === 'response_started');
    assert.equal(started.length, 2);
    assert.deepEqual(events.filter(event => event.type === 'response_done'), [
        { type: 'response_done', responseId: first.responseId, status: 'cancelled' },
        { type: 'response_done', responseId: started[1].responseId, status: 'completed' },
    ]);
    assert.equal(events.filter(event => event.type === 'response_delta').length, 3);
    assert.equal(events.some(event => event.type === 'response_silent'), false);
    assert.equal(connections[0].jsonMessages.some(m => m.type === 'response.cancel'), false);
});

test('KeepAlive is sent every 8 seconds while idle and suppressed during continuous audio', async t => {
    t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 10_000 });
    const { brain, connections } = await createRig(t);
    await brain.start(makeContext());

    // Continuous audio for 20 s -> no KeepAlive sent.
    for (let i = 0; i < 20; i++) {
        t.mock.timers.tick(1_000);
        brain.pushInterviewerAudio(new Int16Array(320).fill(200), 16_000);
    }
    await delay(10);
    assert.equal(connections[0].jsonMessages.filter(m => m.type === 'KeepAlive').length, 0);

    // Idle >= 8 s -> KeepAlive sent (timer phase at +4 s and +12 s from last audio).
    t.mock.timers.tick(12_000);
    const keepAlives1 = await until(() => connections[0].jsonMessages.filter(m => m.type === 'KeepAlive').length >= 1);
    assert.equal(keepAlives1, true);

    t.mock.timers.tick(8_000);
    const keepAlives2 = await until(() => connections[0].jsonMessages.filter(m => m.type === 'KeepAlive').length >= 2);
    assert.equal(keepAlives2, true);
});

test('BYO endpoint config construction supports OpenAI, Anthropic, Google, Groq, OpenRouter, and custom', async t => {
    const byoCases = [
        ['openai', 'sk-openai-1', 'gpt-4o', 'open_ai', 'https://api.openai.com/v1/chat/completions', 'Authorization', 'Bearer sk-openai-1'],
        ['anthropic', 'sk-ant-1', 'claude-sonnet-4-5', 'anthropic', 'https://api.anthropic.com/v1/messages', 'x-api-key', 'sk-ant-1'],
        ['google', 'AIza-google-1', 'gemini-2.5-flash', 'open_ai', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', 'Authorization', 'Bearer AIza-google-1'],
        ['groq', 'gsk_groq-1', 'qwen/qwen3.8-27b', 'groq', 'https://api.groq.com/openai/v1/chat/completions', 'Authorization', 'Bearer gsk_groq-1'],
        ['openrouter', 'sk-or-1', 'openai/gpt-4o-mini', 'open_ai', 'https://openrouter.ai/api/v1/chat/completions', 'Authorization', 'Bearer sk-or-1'],
    ];

    for (const [provider, key, model, expectedType, expectedUrl, hdrKey, hdrVal] of byoCases) {
        const resolved = resolveByoEndpoint(provider, key, model);
        assert.equal(resolved.providerType, expectedType);
        assert.equal(resolved.model, model);
        assert.equal(resolved.url, expectedUrl);
        assert.equal(resolved.headers[hdrKey], hdrVal);
    }

    const custom = resolveByoEndpoint('custom', undefined, 'my-model', 'https://llm.example.com/v1/chat/completions', 'Authorization: Bearer custom-tok');
    assert.equal(custom.url, 'https://llm.example.com/v1/chat/completions');
    assert.equal(custom.headers.Authorization, 'Bearer custom-tok');

    const { brain, connections } = await createRig(t, {
        brainOptions: {
            deepgramThink: {
                thinkMode: 'byo',
                managedProvider: 'open_ai',
                managedModel: 'gpt-4o-mini',
                byoKeyProvider: 'groq',
                byoApiKey: 'gsk_test_123',
                byoModel: 'qwen/qwen3.8-27b',
            },
        },
    });
    await brain.start(makeContext());
    const settings = connections[0].jsonMessages.find(m => m.type === 'Settings');
    assert.deepEqual(settings.agent.think.endpoint, {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: { Authorization: 'Bearer gsk_test_123' },
    });
    assert.deepEqual(settings.agent.think.provider, { type: 'groq', model: 'qwen/qwen3.8-27b' });
});

test('compact instructions stay <= 25,000 chars for managed mode and omit heavy blocks', () => {
    const compact = buildDeepgramInstructions({ modeName: 'Technical Interview', modeTemplate: 'technical-interview' });
    assert.ok(compact.length <= DEEPGRAM_MAX_MANAGED_PROMPT_CHARS);
    assert.ok(compact.includes(CORE_IDENTITY.trim()));
    assert.ok(compact.includes(EXECUTION_CONTRACT.trim()));
    assert.ok(compact.includes(HUMAN_SPOKEN_ANSWER_CONTRACT.trim()));
    assert.ok(!compact.includes(UNIVERSAL_WHAT_TO_ANSWER_PROMPT.trim()));
    assert.ok(!compact.includes(CONTEXT_INTELLIGENCE_LAYER.trim()));
    assert.ok(!compact.includes(MODE_TECHNICAL_INTERVIEW_PROMPT.trim()));
    assert.ok(buildDeepgramInstructions({ modePrompt: 'Use the active custom mode.' }).includes('Use the active custom mode.'));

    const warnings = [];
    const origWarn = console.warn;
    console.warn = (msg) => { warnings.push(String(msg ?? '')); };
    try {
        const notebookText = 'The interviewer requires a single database.';
        const profileContext = 'Profile starts here.\n' + 'X'.repeat(10_000);
        const bounded = buildDeepgramInstructions({ notebookText, profileContext });
        assert.ok(bounded.length <= DEEPGRAM_MAX_MANAGED_PROMPT_CHARS);
        assert.ok(bounded.includes(FILLER_TURN_RULE));
        assert.ok(bounded.includes('Ask for clarification only when missing information materially changes the answer. Ask one short question. Never repeat a clarification or ask for information already supplied.'));
        assert.ok(bounded.includes(notebookText));
        assert.ok(bounded.indexOf('Profile starts here.') > bounded.indexOf(notebookText));
        assert.ok(!bounded.includes('XXXX'));
        assert.ok(bounded.endsWith('[context truncated]'));

        const reference = content => '<reference_file format="json">\n'
            + JSON.stringify({ content }) + '\n</reference_file>';
        const firstReference = reference('A short reference.');
        const oversizedReference = reference('Y'.repeat(10_000));
        const withReferences = buildDeepgramInstructions({ modeContext: firstReference + '\n\n' + oversizedReference });
        assert.ok(withReferences.length <= DEEPGRAM_MAX_MANAGED_PROMPT_CHARS);
        assert.ok(withReferences.includes(firstReference));
        assert.equal(withReferences.match(/<reference_file\b/g)?.length, 1);
        assert.equal(withReferences.match(/<\/reference_file>/g)?.length, 1);
        assert.ok(withReferences.endsWith('[context truncated]'));
        assert.ok(warnings.some(w => w.includes('25000')));
    } finally {
        console.warn = origWarn;
    }

});

test('D20 managed mode caps the live candidate prompt and BYO keeps all context', t => {
    const warning = t.mock.method(console, 'warn', () => {});
    const reference = content => `<reference_file format="json">\n${JSON.stringify({ content })}\n</reference_file>`;
    const smallReference = reference('Small reference.');
    const bigReference = reference('x'.repeat(30_000));
    const ctx = {
        modeName: 'My interview', profileContext: 'Built a queue', notebookText: 'Needs retries',
        modeContext: [smallReference, bigReference].join('\n\n'), standingSkills: 'Speak plainly.',
    };
    const managed = buildProviderInstructions(ctx, 'full', 'deepgram-voice-agent', 'managed');
    const byo = buildProviderInstructions(ctx, 'full', 'deepgram-voice-agent', 'byo');
    assert.ok(managed.length <= DEEPGRAM_MAX_MANAGED_PROMPT_CHARS);
    assert.ok(managed.includes(smallReference));
    assert.equal(managed.match(/<reference_file\b/g)?.length, 1);
    assert.match(managed, /\[context truncated\]\n\nRemember:/);
    assert.ok(byo.includes(bigReference));
    assert.ok(byo.includes('Speak plainly.'));
    assert.equal(warning.mock.callCount(), 1);

    const oversizedSkills = buildProviderInstructions({
        ...ctx, modeContext: smallReference, standingSkills: 'x'.repeat(30_000),
    }, 'full', 'deepgram-voice-agent', 'managed');
    assert.ok(oversizedSkills.length <= DEEPGRAM_MAX_MANAGED_PROMPT_CHARS);
    assert.ok(oversizedSkills.includes(smallReference));
    assert.ok(!oversizedSkills.includes('<standing_skills>'));
    assert.match(oversizedSkills, /\[context truncated\]\n\nRemember:/);
});

test('401 auth error emits fatal auth error without retries', async t => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    let attempts = 0;
    server.on('connection', socket => {
        attempts++;
        sendJson(socket, { type: 'Error', code: 'INVALID_AUTH', description: 'Unauthorized' });
    });
    const addr = server.address();
    const brain = new DeepgramVoiceAgentBrain({ apiKey, endpoint: `ws://127.0.0.1:${addr.port}`, backoffMs: [5, 5, 5] });
    const events = [];
    brain.onEvent(e => events.push(e));
    t.after(async () => {
        await brain.stop();
        for (const c of server.clients) c.terminate();
        await new Promise(r => server.close(() => r()));
    });

    await assert.rejects(brain.start(makeContext()), { code: 'auth' });
    assert.equal(attempts, 1);
    assert.deepEqual(events.filter(e => e.type === 'error'), [
        { type: 'error', code: 'auth', fatal: true },
    ]);
});

test('network failure retries up to 3 times then emits fatal network error', async t => {
    const { brain, events, connections } = await createRig(t, {
        onOpen: socket => { socket.close(1011, 'upstream drop'); },
        brainOptions: { backoffMs: [5, 5, 5] },
    });

    await assert.rejects(brain.start(makeContext()), { code: 'network' });
    assert.equal(connections.length, 4);
    const errors = events.filter(e => e.type === 'error');
    assert.deepEqual(errors.map(e => [e.code, e.fatal]), [
        ['network', false],
        ['network', false],
        ['network', false],
        ['network', true],
    ]);
});

test('refreshes history on a live reconnect and exhausts retries on repeated drops after readiness', async t => {
    const { brain, events, connections } = await createRig(t, { brainOptions: { backoffMs: [5] } });
    const initial = makeContext();
    let recentTurns = initial.recentTurns;
    await brain.start({
        ...initial,
        refreshContext: () => ({ instructions: initial.instructions, notebook: initial.notebook, recentTurns }),
    });

    recentTurns = [{ role: 'candidate', text: 'Use email only.', at: 1 }];
    sendJson(connections[0].socket, { type: 'Warning', code: 'MAXIMUM_SESSION_LENGTH_APPROACHING' });
    await until(() => events.some(event => event.type === 'session_expiring'));
    sendJson(connections[0].socket, { type: 'Error', code: 'INTERNAL_SERVER_ERROR', description: 'Sensitive upstream detail' });
    await until(() => events.filter(event => event.type === 'status' && event.status === 'ready').length === 2);
    const settings = connections[1].jsonMessages.find(message => message.type === 'Settings');
    assert.deepEqual(settings.agent.context.messages, [
        { type: 'History', role: 'user', content: 'Candidate said: Use email only.' },
    ]);
    connections[1].socket.close(1011, 'upstream failure');
    await until(() => events.some(event => event.type === 'error' && event.fatal));
    assert.equal(connections.length, 2);
    assert.deepEqual(events.filter(event => event.type === 'error'), [
        { type: 'error', code: 'network', fatal: false },
        { type: 'error', code: 'network', fatal: true },
    ]);
});

test('rollover replays notebook and recentTurns via agent.context.messages and Test Connection checks key + Think', async t => {
    const { brain, connections } = await createRig(t);
    await brain.start(makeContext({
        notebook: {
            topics: ['notifications'],
            currentTopic: 'notifications',
            requirements: [],
            constraints: ['email only'],
            clarifications: [],
            decisions: [],
            answered: [],
            summary: 'Email only policy.',
            updatedAt: 1,
        },
        recentTurns: [
            { role: 'interviewer', text: 'Use email only.', at: 1 },
            { role: 'candidate', text: 'I will queue in SQS.', at: 2 },
            { role: 'assistant', text: 'Use a dedicated email queue.', at: 3 },
        ],
    }));
    const settings = connections[0].jsonMessages.find(m => m.type === 'Settings');
    assert.deepEqual(settings.agent.context.messages, [
        { type: 'History', role: 'user', content: 'Earlier interview summary: Email only policy.' },
        { type: 'History', role: 'user', content: 'Use email only.' },
        { type: 'History', role: 'user', content: 'Candidate said: I will queue in SQS.' },
        { type: 'History', role: 'assistant', content: 'Use a dedicated email queue.' },
    ]);

    // Test Connection success (SettingsApplied + InjectUserMessage -> ConversationText)
    const rig2 = await createRig(t, {
        onInject: socket => sendJson(socket, { type: 'ConversationText', role: 'assistant', content: 'OK' }),
    });
    const ok = await testConnection({ provider: 'deepgram-voice-agent', apiKey, endpoint: rig2.endpoint, setupTimeoutMs: 1_000, thinkTimeoutMs: 1_000 });
    assert.equal(ok.success, true);
    assert.match(ok.message, /Deepgram key verified/);

    // Test Connection when key succeeds (SettingsApplied) but Think times out
    const rig3 = await createRig(t);
    const badThink = await testConnection({ provider: 'deepgram-voice-agent', apiKey, endpoint: rig3.endpoint, setupTimeoutMs: 1_000, thinkTimeoutMs: 60 });
    assert.equal(badThink.success, false);
    assert.match(badThink.message, /Deepgram key valid, but Think model failed/);

    assert.equal(createLiveBrain('deepgram-voice-agent', { apiKey }).id, 'deepgram-voice-agent');
});

test('bare close 1008 is fatal protocol without retry while 1006 is network retry', async t => {
    const r1 = await createRig(t, { brainOptions: { backoffMs: [5, 5] } });
    await r1.brain.start(makeContext());
    r1.connections[0].socket.close(1008);
    await until(() => r1.events.some(e => e.type === 'error'));
    await delay(30);
    assert.deepEqual(r1.events.filter(e => e.type === 'error'), [{ type: 'error', code: 'protocol', fatal: true }]);
    assert.equal(r1.connections.length, 1);

    const r2 = await createRig(t, { brainOptions: { backoffMs: [5, 5] } });
    await r2.brain.start(makeContext());
    r2.connections[0].socket.terminate();
    await until(() => r2.events.filter(e => e.type === 'status' && e.status === 'ready').length === 2);
    assert.deepEqual(r2.events.filter(e => e.type === 'error'), [{ type: 'error', code: 'network', fatal: false }]);
});

test('3 drops each after 30 s ready reset failures so 4th drop still retries', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 10_000 });
    const { brain, connections, events } = await createRig(t, { brainOptions: { backoffMs: [5, 5, 5] } });
    await brain.start(makeContext());
    for (let i = 0; i < 4; i++) {
        await until(() => events.filter(e => e.type === 'status' && e.status === 'ready').length === i + 1);
        t.mock.timers.tick(30_000);
        connections[i].socket.terminate();
    }
    await until(() => events.filter(e => e.type === 'status' && e.status === 'ready').length === 5);
    assert.equal(events.some(e => e.type === 'error' && e.fatal), false);
    assert.equal(events.filter(e => e.type === 'error' && !e.fatal).length, 4);
});

test('bufferedAmount > 1 MiB drops audio while JSON control still sends, and sustained > 5 s fails with network', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 10_000 });
    const { brain, connections, events } = await createRig(t, { brainOptions: { backoffMs: [5, 5] } });
    await brain.start(makeContext());
    const conn = connections[0];
    Object.defineProperty(brain.socket, 'bufferedAmount', { get: () => 2 * 1024 * 1024, configurable: true });
    brain.pushInterviewerAudio(new Int16Array(320).fill(100), 16_000);
    await delay(20);
    assert.equal(conn.binaryFrames.length, 0);
    assert.equal(events.some(e => e.type === 'error'), false);

    assert.equal(brain.injectUserMessage('Hello'), true);
    await until(() => conn.jsonMessages.some(m => m.type === 'InjectUserMessage'));

    t.mock.timers.tick(5_001);
    brain.pushInterviewerAudio(new Int16Array(320).fill(100), 16_000);
    await until(() => events.some(e => e.type === 'error' && e.code === 'network' && !e.fatal));
    await until(() => events.filter(e => e.type === 'status' && e.status === 'ready').length === 2);
});

test('stop() inside non-fatal error listener emits no degraded after closed and schedules no retry', async t => {
    const { brain, connections, events } = await createRig(t, { brainOptions: { backoffMs: [5, 5] } });
    await brain.start(makeContext());
    brain.onEvent(event => {
        if (event.type === 'error' && !event.fatal) void brain.stop();
    });
    connections[0].socket.terminate();
    await until(() => events.some(e => e.type === 'status' && e.status === 'closed'));
    await delay(30);
    const closedIdx = events.findIndex(e => e.type === 'status' && e.status === 'closed');
    assert.equal(events.length, closedIdx + 1);
    assert.equal(events.some(e => e.type === 'status' && e.status === 'degraded'), false);
    assert.equal(connections.length, 1);
});

test('stop() inside ready listener rejects start() and does not resolve as ready', async t => {
    const { brain, events } = await createRig(t);
    brain.onEvent(event => {
        if (event.type === 'status' && event.status === 'ready') void brain.stop();
    });
    await assert.rejects(() => brain.start(makeContext()));
    assert.equal(events.at(-1)?.status, 'closed');
});

test('Error ASR_CONNECTION_CLOSED triggers non-fatal retry', async t => {
    const { brain, connections, events } = await createRig(t, { brainOptions: { backoffMs: [5, 5] } });
    await brain.start(makeContext());
    sendJson(connections[0].socket, { type: 'Error', code: 'ASR_CONNECTION_CLOSED', description: 'ASR connection closed' });
    await until(() => events.filter(e => e.type === 'status' && e.status === 'ready').length === 2);
    assert.deepEqual(events.filter(e => e.type === 'error'), [{ type: 'error', code: 'network', fatal: false }]);
});

test('BYO rejects private/localhost URL and unknown provider before connect without logging secret', async t => {
    const secret = 'Bearer super-secret-byo-token-xyz';
    const logged = [];
    const origLog = console.log;
    const origWarn = console.warn;
    const origError = console.error;
    console.log = (...args) => { logged.push(args.map(String).join(' ')); };
    console.warn = (...args) => { logged.push(args.map(String).join(' ')); };
    console.error = (...args) => { logged.push(args.map(String).join(' ')); };
    try {
        const { brain: b1, connections: c1 } = await createRig(t, {
            brainOptions: {
                deepgramThink: {
                    thinkMode: 'byo',
                    managedProvider: 'open_ai',
                    managedModel: 'gpt-4o-mini',
                    byoKeyProvider: 'custom',
                    byoModel: 'llama3',
                    byoCustomUrl: 'https://127.0.0.1:11434/v1',
                    byoCustomHeader: secret,
                },
            },
        });
        await assert.rejects(() => b1.start(makeContext()), { code: 'unsupported' });
        assert.equal(c1.length, 0);

        const { brain: b2, connections: c2 } = await createRig(t, {
            brainOptions: {
                deepgramThink: {
                    thinkMode: 'byo',
                    managedProvider: 'open_ai',
                    managedModel: 'gpt-4o-mini',
                    byoKeyProvider: 'ollama',
                    byoApiKey: secret,
                    byoModel: 'llama3',
                },
            },
        });
        await assert.rejects(() => b2.start(makeContext()), { code: 'unsupported' });
        assert.equal(c2.length, 0);
        assert.equal(logged.some(line => line.includes(secret)), false);
    } finally {
        console.log = origLog;
        console.warn = origWarn;
        console.error = origError;
    }
});

test('Voice Agent ignores stale assistant text and audio done until the new turn boundary', async t => {
    const { brain, events, connections } = await createRig(t);
    await brain.start(makeContext());
    const { socket } = connections[0];
    const send = (type, fields = {}) => sendJson(socket, { type, ...fields });
    const say = (role, content) => send('ConversationText', { role, content });
    say('user', 'First question?');
    say('assistant', 'First answer.');
    await until(() => events.some(event => event.type === 'response_delta'));
    send('UserStartedSpeaking');
    say('user', 'Second question?');
    say('assistant', 'Stale text.');
    send('AgentAudioDone');
    send('AgentThinking');
    say('assistant', 'Second answer.');
    send('AgentAudioDone');
    await until(() => events.filter(event => event.type === 'response_done').length === 2);
    assert.deepEqual(events.filter(event => event.type === 'response_delta').map(event => event.text), ['First answer.', 'Second answer.']);
    assert.deepEqual(events.filter(event => event.type === 'response_done').map(event => event.status), ['cancelled', 'completed']);
});

// AgentThinking is not guaranteed every turn: the post-barge-in gate must not
// mute every later answer when it never arrives.
for (const [label, opener] of [['AgentStartedSpeaking', 'speaking'], ['the safety timeout', 'timeout']]) {
    test(`Voice Agent reopens answers after a barge-in via ${label} without AgentThinking`, async t => {
        const { brain, events, connections } = await createRig(t, { brainOptions: { agentBoundaryTimeoutMs: 50 } });
        await brain.start(makeContext());
        const { socket } = connections[0];
        const send = (type, fields = {}) => sendJson(socket, { type, ...fields });
        const say = (role, content) => send('ConversationText', { role, content });
        say('user', 'First question?');
        say('assistant', 'First answer.');
        await until(() => events.some(event => event.type === 'response_delta'));
        send('UserStartedSpeaking');
        say('user', 'Second question?');
        if (opener === 'speaking') send('AgentStartedSpeaking');
        else await new Promise(resolve => setTimeout(resolve, 120));
        say('assistant', 'Second answer.');
        send('AgentAudioDone');
        await until(() => events.filter(event => event.type === 'response_done').length === 2);
        assert.deepEqual(events.filter(event => event.type === 'response_delta').map(event => event.text), ['First answer.', 'Second answer.']);
        // A third turn after the gate opened still answers normally.
        say('user', 'Third question?');
        say('assistant', 'Third answer.');
        send('AgentAudioDone');
        await until(() => events.filter(event => event.type === 'response_done').length === 3);
        assert.deepEqual(events.filter(event => event.type === 'response_done').map(event => event.status), ['cancelled', 'completed', 'completed']);
    });
}
