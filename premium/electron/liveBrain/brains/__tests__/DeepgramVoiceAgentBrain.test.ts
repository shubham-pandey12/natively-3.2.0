import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer, type WebSocket } from 'ws';
import { DeepgramVoiceAgentBrain, resolveByoEndpoint } from '../DeepgramVoiceAgentBrain';
import { buildDeepgramInstructions, buildProviderInstructions, DEEPGRAM_MAX_MANAGED_PROMPT_CHARS } from '../../instructions';
import { createLiveBrain } from '../../index';
import { testConnection } from '../../meeting';
import type { LiveBrainEvent, LiveBrainStartContext } from '../../types';
import { CONTEXT_INTELLIGENCE_LAYER, CORE_IDENTITY, EXECUTION_CONTRACT, HUMAN_SPOKEN_ANSWER_CONTRACT, MODE_TECHNICAL_INTERVIEW_PROMPT, UNIVERSAL_WHAT_TO_ANSWER_PROMPT } from '../../../../../electron/llm/prompts';

const apiKey = 'dg_fake_key_for_deepgram_voice_agent_tests_0123456789';

function makeContext(overrides: Partial<LiveBrainStartContext> = {}): LiveBrainStartContext {
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

function sendJson(socket: WebSocket, payload: Record<string, unknown>): void {
    socket.send(JSON.stringify(payload));
}

async function until<T>(read: () => T | undefined | false, timeoutMs = 2_000): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = read();
        if (value) return value;
        await delay(5);
    }
    assert.fail('Timed out waiting for DeepgramVoiceAgentBrain condition');
}

interface RigConnection {
    socket: WebSocket;
    jsonMessages: Array<Record<string, unknown>>;
    binaryFrames: Buffer[];
}

async function createRig(
    t: test.TestContext,
    opts: {
        onOpen?: (socket: WebSocket, attempt: number) => void;
        onSettings?: (socket: WebSocket, settings: Record<string, unknown>, attempt: number) => void;
        onInject?: (socket: WebSocket, msg: Record<string, unknown>) => void;
        brainOptions?: Partial<ConstructorParameters<typeof DeepgramVoiceAgentBrain>[0]>;
    } = {},
) {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    const connections: RigConnection[] = [];
    server.on('connection', (socket, request) => {
        assert.equal(request.headers.authorization, `Token ${apiKey}`);
        const attempt = connections.length + 1;
        const entry: RigConnection = { socket, jsonMessages: [], binaryFrames: [] };
        connections.push(entry);
        if (opts.onOpen) {
            opts.onOpen(socket, attempt);
        } else {
            sendJson(socket, { type: 'Welcome', session_id: `sess-${attempt}` });
        }
        socket.on('message', (data, isBinary) => {
            if (isBinary) {
                entry.binaryFrames.push(Buffer.from(data as Buffer));
                return;
            }
            const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
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
    const events: LiveBrainEvent[] = [];
    brain.onEvent(event => events.push(event));

    t.after(async () => {
        await brain.stop();
        for (const client of server.clients) client.terminate();
        await new Promise<void>(resolve => server.close(() => resolve()));
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
    const settings = connections[0].jsonMessages.find(m => m.type === 'Settings') as any;
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

test('KeepAlive is sent every 8 seconds', async t => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    const { brain, connections } = await createRig(t);
    await brain.start(makeContext());

    t.mock.timers.tick(8_000);
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
    ] as const;

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
    const settings = connections[0].jsonMessages.find(m => m.type === 'Settings') as any;
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

    const warnings: string[] = [];
    const origWarn = console.warn;
    console.warn = (msg?: unknown) => { warnings.push(String(msg ?? '')); };
    try {
        const bounded = buildDeepgramInstructions({ profileContext: 'X'.repeat(10_000) });
        assert.ok(bounded.length <= DEEPGRAM_MAX_MANAGED_PROMPT_CHARS);
        assert.ok(warnings.some(w => w.includes('25000')));
    } finally {
        console.warn = origWarn;
    }

    assert.ok(buildProviderInstructions({}, 'full', 'deepgram-voice-agent', 'managed').length <= DEEPGRAM_MAX_MANAGED_PROMPT_CHARS);
    assert.ok(buildProviderInstructions({}, 'full', 'deepgram-voice-agent', 'byo').length > DEEPGRAM_MAX_MANAGED_PROMPT_CHARS);
});

test('401 auth error emits fatal auth error without retries', async t => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    let attempts = 0;
    server.on('connection', socket => {
        attempts++;
        sendJson(socket, { type: 'Error', code: 'INVALID_AUTH', description: 'Unauthorized' });
    });
    const addr = server.address() as { port: number };
    const brain = new DeepgramVoiceAgentBrain({ apiKey, endpoint: `ws://127.0.0.1:${addr.port}`, backoffMs: [5, 5, 5] });
    const events: LiveBrainEvent[] = [];
    brain.onEvent(e => events.push(e));
    t.after(async () => {
        await brain.stop();
        for (const c of server.clients) c.terminate();
        await new Promise<void>(r => server.close(() => r()));
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
    const errors = events.filter(e => e.type === 'error') as Array<Extract<LiveBrainEvent, { type: 'error' }>>;
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
    const settings = connections[1].jsonMessages.find(message => message.type === 'Settings') as any;
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
    const settings = connections[0].jsonMessages.find(m => m.type === 'Settings') as any;
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
    assert.match(ok.message!, /Deepgram key verified/);

    // Test Connection when key succeeds (SettingsApplied) but Think times out
    const rig3 = await createRig(t);
    const badThink = await testConnection({ provider: 'deepgram-voice-agent', apiKey, endpoint: rig3.endpoint, setupTimeoutMs: 1_000, thinkTimeoutMs: 60 });
    assert.equal(badThink.success, false);
    assert.match(badThink.message!, /Deepgram key valid, but Think model failed/);

    assert.equal(createLiveBrain('deepgram-voice-agent', { apiKey }).id, 'deepgram-voice-agent');
});
