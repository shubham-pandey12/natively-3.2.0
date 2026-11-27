import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer } from 'ws';

const require = createRequire(import.meta.url);
const load = name => require(`../../../../dist-electron/premium/electron/liveBrain/${name}.js`);
const { DeepgramFluxBrain, DEEPGRAM_FLUX_FRAME_BYTES } = load('brains/DeepgramFluxBrain');
const { createLiveBrain } = load('index');
const { testConnection } = load('meeting');
const { AnswerWriter } = load('AnswerWriter');
const { ResponseOrchestrator } = load('ResponseOrchestrator');

const apiKey = 'dg_fake_key_for_deepgram_flux_tests_0123456789';

function makeContext(overrides = {}) {
    return {
        sessionId: 'flux-test',
        responseNamespace: 'flux-test:1',
        instructions: '',
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
    assert.fail('Timed out waiting for DeepgramFluxBrain condition');
}

async function createRig(t, opts = {}) {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    const connections = [];
    server.on('connection', (socket, request) => {
        assert.equal(request.headers.authorization, `Token ${apiKey}`);
        const attempt = connections.length + 1;
        const entry = { socket, url: request.url || '', jsonMessages: [], binaryFrames: [] };
        connections.push(entry);
        if (opts.onOpen) {
            opts.onOpen(socket, attempt, entry);
        } else {
            sendJson(socket, { type: 'Connected', request_id: `req-${attempt}`, sequence_id: 0 });
        }
        socket.on('message', (data, isBinary) => {
            if (isBinary) {
                entry.binaryFrames.push(Buffer.from(data));
                return;
            }
            entry.jsonMessages.push(JSON.parse(data.toString()));
        });
    });

    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const endpoint = `ws://127.0.0.1:${address.port}`;
    const brain = new DeepgramFluxBrain({
        apiKey,
        endpoint,
        backoffMs: [],
        ...opts.brainOptions,
    });
    const events = [];
    brain.onEvent(event => events.push(event));

    t.after(async () => {
        await brain.stop();
        server.close();
        for (const entry of connections) entry.socket.terminate();
    });

    return { brain, events, connections, endpoint, server };
}

test('Flux handshake connects to /v2/listen with linear16 16kHz, streams 80ms binary PCM, and closes with CloseStream', async (t) => {
    const { brain, events, connections } = await createRig(t);
    await brain.start(makeContext());

    const conn = connections[0];
    assert.match(conn.url, /model=flux-general-multi/);
    assert.match(conn.url, /encoding=linear16/);
    assert.match(conn.url, /sample_rate=16000/);
    assert.match(conn.url, /eot_threshold=0\.95/);
    assert.match(conn.url, /eager_eot_threshold=0\.5/);
    assert.match(conn.url, /eot_timeout_ms=1500/);
    assert.ok(events.some(e => e.type === 'status' && e.status === 'ready'));

    // Push 100 ms of 48 kHz mono -> 1,600 samples at 16 kHz = 3,200 bytes -> 1 x 2,560B (80 ms) frame buffered + remainder flushed on stop.
    const pcm48k = new Int16Array(4_800).fill(500);
    brain.pushInterviewerAudio(pcm48k, 48_000);
    await until(() => conn.binaryFrames.length >= 1);
    assert.equal(conn.binaryFrames[0].length, DEEPGRAM_FLUX_FRAME_BYTES);

    // Unexpected binary frames from server must be ignored per D6.
    conn.socket.send(Buffer.from([1, 2, 3, 4]), { binary: true });
    await delay(20);
    assert.ok(!events.some(e => e.type === 'error'));

    await brain.stop();
    await until(() => conn.jsonMessages.some(m => m.type === 'CloseStream'));
    assert.equal(conn.jsonMessages.some(m => m.type === 'KeepAlive'), false, '/v2/listen must never receive KeepAlive');
    assert.equal(events.at(-1).type, 'status');
    assert.equal(events.at(-1).status, 'closed');
});

test('resumed Flux turns yield one answer after confirmed EndOfTurn', async (t) => {
    const { brain, events, connections } = await createRig(t);
    await brain.start(makeContext());
    const conn = connections[0];

    sendJson(conn.socket, { type: 'TurnInfo', event: 'StartOfTurn', turn_index: 0, transcript: '' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'Update', turn_index: 0, transcript: 'How would you design a system' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'EagerEndOfTurn', turn_index: 0, transcript: 'How would you design a system that can handle' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'TurnResumed', turn_index: 0, transcript: 'How would you design a system that can handle' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'Update', turn_index: 0, transcript: 'How would you design a system that can handle millions of users?' });

    await until(() => events.filter(e => e.type === 'interviewer_transcript' && !e.final).length >= 3);
    assert.equal(events.filter(e => e.type === 'decision').length, 0, 'in-progress updates must not trigger answers');

    sendJson(conn.socket, {
        type: 'TurnInfo',
        event: 'EndOfTurn',
        turn_index: 0,
        transcript: 'How would you design a system that can handle millions of users?',
    });
    // Duplicate / stale EndOfTurn for the same or earlier turn_index must be dropped.
    sendJson(conn.socket, {
        type: 'TurnInfo',
        event: 'EndOfTurn',
        turn_index: 0,
        transcript: 'How would you design a system that can handle millions of users?',
    });

    await until(() => events.filter(e => e.type === 'decision').length === 1);
    const decisions = events.filter(e => e.type === 'decision');
    const finals = events.filter(e => e.type === 'interviewer_transcript' && e.final);
    assert.equal(decisions.length, 1);
    assert.equal(finals.length, 1);
    assert.equal(decisions[0].action, 'answer');
    assert.equal(decisions[0].question, 'How would you design a system that can handle millions of users?');
});

test('empty EndOfTurn emits response_silent without triggering an answer', async (t) => {
    const { brain, events, connections } = await createRig(t);
    await brain.start(makeContext());
    const conn = connections[0];

    sendJson(conn.socket, { type: 'TurnInfo', event: 'StartOfTurn', turn_index: 0, transcript: '' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'EndOfTurn', turn_index: 0, transcript: '   ' });

    await until(() => events.some(e => e.type === 'response_silent'));
    assert.equal(events.filter(e => e.type === 'decision').length, 0);
});

test('sparse capture pads zero-PCM frames after 300ms without sending KeepAlive JSON', async (t) => {
    const { brain, connections } = await createRig(t);
    await brain.start(makeContext());
    const conn = connections[0];
    await until(() => conn.binaryFrames.length >= 1, 1_200);
    assert.equal(conn.binaryFrames[0].length, DEEPGRAM_FLUX_FRAME_BYTES);
    assert.ok(conn.binaryFrames[0].every(b => b === 0));
    assert.equal(conn.jsonMessages.some(m => m.type === 'KeepAlive'), false);
});

test('401 auth error is fatal without retry; network drop retries and resets turn_index tracking', async (t) => {
    const rejectedServer = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(rejectedServer, 'listening');
    let sockets = 0;
    rejectedServer.on('connection', (socket) => {
        sockets++;
        socket.close(4001, 'invalid_auth');
    });
    const addr = rejectedServer.address();
    const authBrain = new DeepgramFluxBrain({ apiKey, endpoint: `ws://127.0.0.1:${addr.port}`, backoffMs: [5, 5, 5] });
    const authEvents = [];
    authBrain.onEvent(e => authEvents.push(e));
    t.after(async () => { await authBrain.stop(); rejectedServer.close(); });
    await assert.rejects(() => authBrain.start(makeContext()), /auth/);
    assert.equal(sockets, 1);
    assert.ok(authEvents.some(e => e.type === 'error' && e.code === 'auth' && e.fatal));

    let attemptCount = 0;
    const { brain, events, connections } = await createRig(t, {
        brainOptions: { backoffMs: [10, 10, 10] },
        onOpen: (socket, attempt) => {
            attemptCount = attempt;
            sendJson(socket, { type: 'Connected', sequence_id: 0 });
        },
    });
    await brain.start(makeContext());
    connections[0].socket.terminate();
    await until(() => attemptCount === 2 && connections[1] && events.filter(e => e.type === 'status' && e.status === 'ready').length === 2);
    // New connection starts turn_index at 0 again and must be accepted.
    sendJson(connections[1].socket, { type: 'TurnInfo', event: 'EndOfTurn', turn_index: 0, transcript: 'Still here?' });
    await until(() => events.some(e => e.type === 'decision' && e.question === 'Still here?'));
});

test('Test Connection separates Flux WS verification from active AI route status and distinguishes configured vs replied', async (t) => {
    const { endpoint } = await createRig(t);
    const fluxBrainFactory = createLiveBrain('deepgram-flux', { apiKey, endpoint });
    assert.equal(fluxBrainFactory.id, 'deepgram-flux');

    const ok = await testConnection({
        provider: 'deepgram-flux',
        apiKey,
        endpoint,
        testAiRoute: async () => ({
            provider: 'codex-cli',
            providerLabel: 'Codex CLI',
            model: 'gpt-5.3-codex',
            configured: true,
            replied: true,
            detail: 'Codex CLI (gpt-5.3-codex) replied.',
        }),
    });
    assert.equal(ok.success, true);
    assert.equal(ok.fluxResult.connected, true);
    assert.equal(ok.fluxResult.aiRoute.configured, true);
    assert.equal(ok.fluxResult.aiRoute.replied, true);

    const configuredFailed = await testConnection({
        provider: 'deepgram-flux',
        apiKey,
        endpoint,
        testAiRoute: async () => ({
            provider: 'ollama',
            providerLabel: 'Ollama',
            model: 'qwen2.5:7b',
            configured: true,
            replied: false,
            detail: 'Ollama (qwen2.5:7b) is configured, but test reply failed: connection refused',
        }),
    });
    assert.equal(configuredFailed.success, false);
    assert.equal(configuredFailed.error, 'ai_provider_test_failed');
    assert.equal(configuredFailed.fluxResult.connected, true);
    assert.equal(configuredFailed.fluxResult.aiRoute.configured, true);
    assert.equal(configuredFailed.fluxResult.aiRoute.replied, false);

    const unconfigured = await testConnection({
        provider: 'deepgram-flux',
        apiKey,
        endpoint,
        testAiRoute: async () => ({
            provider: 'openai',
            providerLabel: 'OpenAI',
            model: 'gpt-4o-mini',
            configured: false,
            replied: false,
            reason: 'Add an OpenAI API key in AI Providers.',
            detail: 'Add an OpenAI API key in AI Providers.',
        }),
    });
    assert.equal(unconfigured.success, false);
    assert.equal(unconfigured.error, 'ai_provider_unconfigured');
    assert.equal(unconfigured.fluxResult.connected, true);
    assert.equal(unconfigured.fluxResult.aiRoute.configured, false);
    assert.equal(unconfigured.fluxResult.aiRoute.replied, false);
});

test('Phase 2 Flux turnKey scoping: duplicate EagerEndOfTurn dedupes, TurnResumed allows a fresh eager draft, and reconnect changes turnKey', async (t) => {
    let attemptCount = 0;
    const { brain, events, connections } = await createRig(t, {
        brainOptions: { backoffMs: [10, 10, 10] },
        onOpen: (socket, attempt) => {
            attemptCount = attempt;
            sendJson(socket, { type: 'Connected', sequence_id: 0 });
        },
    });
    await brain.start(makeContext());
    const conn1 = connections[0];

    sendJson(conn1.socket, { type: 'TurnInfo', event: 'StartOfTurn', turn_index: 0, transcript: '' });
    // Duplicate EagerEndOfTurn with identical transcript emits one eager event.
    sendJson(conn1.socket, { type: 'TurnInfo', event: 'EagerEndOfTurn', turn_index: 0, transcript: 'How would you design a system' });
    sendJson(conn1.socket, { type: 'TurnInfo', event: 'EagerEndOfTurn', turn_index: 0, transcript: 'How would you design a system' });
    // TurnResumed cancels active eager turn; a subsequent EagerEndOfTurn opens a fresh draft event.
    sendJson(conn1.socket, { type: 'TurnInfo', event: 'TurnResumed', turn_index: 0, transcript: 'How would you design a system that scales' });
    sendJson(conn1.socket, { type: 'TurnInfo', event: 'EagerEndOfTurn', turn_index: 0, transcript: 'How would you design a system that scales globally?' });
    sendJson(conn1.socket, { type: 'TurnInfo', event: 'EndOfTurn', turn_index: 0, transcript: 'How would you design a system that scales globally?' });

    await until(() => events.filter(e => e.type === 'decision').length === 1);
    const eagers = events.filter(e => e.type === 'eager_end_of_turn');
    const resumed = events.filter(e => e.type === 'turn_resumed');
    const decisions = events.filter(e => e.type === 'decision');
    assert.equal(eagers.length, 2);
    assert.equal(resumed.length, 1);
    assert.equal(eagers[0].turnKey, resumed[0].turnKey);
    assert.equal(eagers[1].turnKey, decisions[0].turnKey);
    assert.equal(decisions[0].question, 'How would you design a system that scales globally?');

    // Start turn_index=0 eager on connection 1, then drop socket and reconnect.
    sendJson(conn1.socket, { type: 'TurnInfo', event: 'StartOfTurn', turn_index: 1, transcript: '' });
    sendJson(conn1.socket, { type: 'TurnInfo', event: 'EagerEndOfTurn', turn_index: 1, transcript: 'What about sharding?' });
    await until(() => events.filter(e => e.type === 'eager_end_of_turn').length === 3);
    const preReconnectTurnKey = events.filter(e => e.type === 'eager_end_of_turn').at(-1).turnKey;

    conn1.socket.terminate();
    await until(() => attemptCount === 2 && connections[1] && events.filter(e => e.type === 'status' && e.status === 'ready').length === 2);
    sendJson(connections[1].socket, { type: 'TurnInfo', event: 'EndOfTurn', turn_index: 0, transcript: 'What about sharding?' });
    await until(() => events.filter(e => e.type === 'decision').length === 2);
    const reconnectDecision = events.filter(e => e.type === 'decision').at(-1);
    assert.notEqual(reconnectDecision.turnKey, preReconnectTurnKey);
});

test('Phase 5: Flux holds captured S3 filler sequence while streaming real questions', async (t) => {
    const { brain, events, connections } = await createRig(t);
    await brain.start(makeContext());
    const conn = connections[0];

    // Exact reproduced S3 sequence from Windows Electron trace:
    sendJson(conn.socket, { type: 'TurnInfo', event: 'StartOfTurn', turn_index: 0, transcript: '' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'Update', turn_index: 0, transcript: 'É mesmo' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'Update', turn_index: 0, transcript: 'É mesmo?' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'EagerEndOfTurn', turn_index: 0, transcript: 'É mesmo?' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'Update', turn_index: 0, transcript: 'Emem.' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'TurnResumed', turn_index: 0, transcript: 'Emem.' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'Update', turn_index: 0, transcript: 'Mhmm.' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'EndOfTurn', turn_index: 0, transcript: 'Mhmm.' });

    await until(() => events.filter(e => e.type === 'decision').length === 1);
    assert.equal(events.filter(e => e.type === 'interviewer_transcript' && !e.final).length, 0);
    assert.equal(events.filter(e => e.type === 'interviewer_transcript' && e.final).at(-1).text, 'Mhmm.');

    // Question beginning with a short word still streams once the partial reaches 12 characters.
    sendJson(conn.socket, { type: 'TurnInfo', event: 'StartOfTurn', turn_index: 1, transcript: '' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'Update', turn_index: 1, transcript: 'A' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'Update', turn_index: 1, transcript: 'A cache?' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'Update', turn_index: 1, transcript: 'A cache with TTL?' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'EndOfTurn', turn_index: 1, transcript: 'A cache with TTL?' });

    await until(() => events.filter(e => e.type === 'decision').length === 2);
    const turn1Partials = events.filter(e => e.type === 'interviewer_transcript' && !e.final);
    assert.deepEqual(turn1Partials.map(e => e.text), ['A cache with TTL?']);

    // Flux multilingual partials can contain no spaces. Short confirmed questions
    // still reach the writer even if their opening partial was held.
    const unsegmented = '分散システムの設計を説明してください';
    sendJson(conn.socket, { type: 'TurnInfo', event: 'StartOfTurn', turn_index: 2, transcript: '' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'Update', turn_index: 2, transcript: unsegmented });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'EndOfTurn', turn_index: 2, transcript: unsegmented });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'StartOfTurn', turn_index: 3, transcript: '' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'Update', turn_index: 3, transcript: 'A cache?' });
    sendJson(conn.socket, { type: 'TurnInfo', event: 'EndOfTurn', turn_index: 3, transcript: 'A cache?' });

    await until(() => events.filter(e => e.type === 'decision').length === 4);
    assert.deepEqual(events.filter(e => e.type === 'interviewer_transcript' && !e.final).map(e => e.text),
        ['A cache with TTL?', unsegmented]);
    assert.equal(events.filter(e => e.type === 'decision').at(-1).question, 'A cache?');
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

test('3 drops each after 30 s ready reset failures so 4th drop retries, and empty EndOfTurn does not reset failures', async t => {
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

    // Quick drops (< 30 s) with empty EndOfTurn in between must NOT reset failures.
    const r2 = await createRig(t, { brainOptions: { backoffMs: [5, 5] } });
    await r2.brain.start(makeContext());
    for (let i = 0; i < 3; i++) {
        await until(() => r2.events.filter(e => e.type === 'status' && e.status === 'ready').length === i + 1);
        sendJson(r2.connections[i].socket, { type: 'TurnInfo', event: 'EndOfTurn', turn_index: 0, transcript: '   ' });
        await until(() => r2.events.filter(e => e.type === 'response_silent').length === i + 1);
        r2.connections[i].socket.terminate();
    }
    await until(() => r2.events.some(e => e.type === 'error' && e.fatal));
    assert.equal(r2.connections.length, 3);
});

test('bufferedAmount > 1 MiB drops audio while CloseStream still sends, and sustained > 5 s fails with network', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 10_000 });
    const { brain, connections, events } = await createRig(t, { brainOptions: { backoffMs: [5, 5] } });
    await brain.start(makeContext());
    const conn = connections[0];
    Object.defineProperty(brain.socket, 'bufferedAmount', { get: () => 2 * 1024 * 1024, configurable: true });
    brain.pushInterviewerAudio(new Int16Array(1_280).fill(100), 16_000);
    await delay(20);
    assert.equal(conn.binaryFrames.length, 0);
    assert.equal(events.some(e => e.type === 'error'), false);

    t.mock.timers.tick(5_001);
    brain.pushInterviewerAudio(new Int16Array(1_280).fill(100), 16_000);
    await until(() => events.some(e => e.type === 'error' && e.code === 'network' && !e.fatal));
    await until(() => events.filter(e => e.type === 'status' && e.status === 'ready').length === 2);

    Object.defineProperty(brain.socket, 'bufferedAmount', { get: () => 2 * 1024 * 1024, configurable: true });
    await brain.stop();
    await until(() => connections[1].jsonMessages.some(m => m.type === 'CloseStream'));
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

test('EagerEndOfTurn(turn 0) followed by StartOfTurn(turn 1) cancels the private writer draft', async t => {
    const { brain, connections, events } = await createRig(t);
    const draft = new AbortController();
    const writer = new AnswerWriter({
        startLiveBrainDraft: request => ({ ...request, draftId: 1, routeKey: 'route', canAdopt: () => true,
            adopt: () => assert.fail('Draft must remain private'), cancel: reason => draft.abort(reason) }),
        runLiveBrainAnswer: () => assert.fail('StartOfTurn must not dispatch a final answer'),
    });
    const orchestrator = new ResponseOrchestrator({
        answerWriter: writer, clock: { now: Date.now, setTimeout, clearTimeout },
        overlay: { showQuestion() {}, setInterviewerSpeaking() {} },
    });
    brain.onEvent(event => orchestrator.handleEvent(event));
    await brain.start(makeContext());
    const { socket } = connections[0];

    sendJson(socket, { type: 'TurnInfo', event: 'StartOfTurn', sequence_id: 1, turn_index: 0, transcript: '' });
    sendJson(socket, { type: 'TurnInfo', event: 'EagerEndOfTurn', sequence_id: 2, turn_index: 0, transcript: 'How would you scale' });
    await until(() => events.some(e => e.type === 'eager_end_of_turn'));
    const eager = events.find(e => e.type === 'eager_end_of_turn');

    sendJson(socket, { type: 'TurnInfo', event: 'StartOfTurn', sequence_id: 3, turn_index: 1, transcript: '' });
    await until(() => events.some(e => e.type === 'turn_resumed' && e.turnKey === eager.turnKey));
    assert.equal(draft.signal.reason, 'turn_resumed');
});

test('replayed older sequence_id EagerEndOfTurn after TurnResumed is dropped', async t => {
    const { brain, connections, events } = await createRig(t);
    await brain.start(makeContext());
    const { socket } = connections[0];

    sendJson(socket, { type: 'TurnInfo', event: 'StartOfTurn', sequence_id: 1, turn_index: 0, transcript: '' });
    sendJson(socket, { type: 'TurnInfo', event: 'EagerEndOfTurn', sequence_id: 2, turn_index: 0, transcript: 'How would you design' });
    sendJson(socket, { type: 'TurnInfo', event: 'TurnResumed', sequence_id: 3, turn_index: 0, transcript: 'How would you design a queue' });
    // Replayed older sequence_id must be ignored.
    sendJson(socket, { type: 'TurnInfo', event: 'EagerEndOfTurn', sequence_id: 2, turn_index: 0, transcript: 'How would you design' });
    await until(() => events.some(e => e.type === 'turn_resumed'));
    await delay(20);
    assert.equal(events.filter(e => e.type === 'eager_end_of_turn').length, 1);
});
