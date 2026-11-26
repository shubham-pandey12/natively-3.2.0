import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer } from 'ws';
import { FakeClock } from '../../autoAnswer/__tests__/fakeClock.mjs';

const require = createRequire(import.meta.url);
const { GeminiLiveBrain, GEMINI_AUTOMATIC_ACTIVITY_DETECTION } = require('../../../../dist-electron/premium/electron/liveBrain/brains/GeminiLiveBrain.js');
const { testConnection } = require('../../../../dist-electron/premium/electron/liveBrain/meeting.js');
const ctx = () => ({ sessionId: 'mock', instructions: 'Answer after speech.', signal: new AbortController().signal });
const output = text => ({ serverContent: { outputTranscription: { text } } });
const speech = text => ({ serverContent: { inputTranscription: { text, finished: true } } });
const send = (socket, payload) => socket.send(JSON.stringify(payload));
const realSetTimeout = setTimeout;

async function until(read) {
    for (let i = 0; i < 200; i++) {
        const value = read();
        if (value) return value;
        await new Promise(resolve => realSetTimeout(resolve, 5));
    }
    assert.fail('Expected a transport event');
}

async function rig(t, options = {}) {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    const connections = [];
    server.on('connection', (socket, request) => {
        const entry = { socket, requests: [], at: Date.now() };
        connections.push(entry);
        assert.equal(request.headers['x-goog-api-key'], 'fake-gemini-key-for-tests');
        socket.on('message', (data) => {
            const message = JSON.parse(data.toString());
            entry.requests.push(message);
            if (message.setup) {
                if (options.replyToSetup) options.replyToSetup(socket, connections.length);
                else send(socket, { setupComplete: {} });
            }
        });
    });
    const endpoint = `ws://127.0.0.1:${server.address().port}`;
    const brain = new GeminiLiveBrain({ apiKey: 'fake-gemini-key-for-tests', model: 'test-model', endpoint, backoffMs: options.backoffMs ?? [10, 20], rolloverClock: options.rolloverClock });
    const events = [];
    brain.onEvent(event => events.push(event));
    t.after(async () => {
        await brain.stop();
        for (const socket of server.clients) socket.terminate();
        await new Promise(resolve => server.close(resolve));
    });
    return { brain, events, connections, endpoint };
}

test('Gemini setup enables both transcriptions and streams deltas immediately while discarding audio', async t => {
    const { brain, events, connections } = await rig(t);
    await brain.start(ctx());
    const { socket, requests } = connections[0];
    assert.deepEqual(requests[0].setup, {
        model: 'models/test-model', generationConfig: { responseModalities: ['AUDIO'] },
        systemInstruction: { parts: [{ text: 'Answer after speech.' }] },
        realtimeInputConfig: { automaticActivityDetection: GEMINI_AUTOMATIC_ACTIVITY_DETECTION },
        inputAudioTranscription: {}, outputAudioTranscription: {},
        sessionResumption: {}, contextWindowCompression: { slidingWindow: {} },
    });
    brain.pushInterviewerAudio(new Int16Array([100, -200]), 16_000);
    brain.addCandidateText('   I would cache reads.   ', Date.now());
    const audio = await until(() => requests.find(message => message.realtimeInput)?.realtimeInput.audio);
    assert.equal(audio.mimeType, 'audio/pcm;rate=16000');
    assert.deepEqual(Buffer.from(audio.data, 'base64'), Buffer.from([100, 0, 56, 255]));
    assert.deepEqual(await until(() => requests.find(message => message.clientContent)?.clientContent), {
        turns: [{ role: 'user', parts: [{ text: 'Candidate said: I would cache reads.' }] }], turnComplete: false,
    });

    send(socket, speech('What about invalidation?'));
    send(socket, { serverContent: {
        modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] }, outputTranscription: { text: 'I would' },
    } });
    await until(() => events.some(event => event.type === 'response_delta'));
    assert.deepEqual(events.filter(event => event.type.startsWith('response_')).map(event => [event.type, event.responseId, event.text]), [
        ['response_started', 'mock:1', undefined], ['response_delta', 'mock:1', 'I would'],
    ]);
    send(socket, output(' use a TTL.'));
    send(socket, { serverContent: { turnComplete: true } });
    await until(() => events.some(event => event.type === 'response_done'));
    assert.deepEqual(events.filter(event => event.type === 'response_delta').map(event => event.text), ['I would', ' use a TTL.']);
    assert.deepEqual(events.at(-1), { type: 'response_done', responseId: 'mock:1', status: 'completed' });
    assert.equal(events.find(event => event.type === 'interviewer_transcript').final, true);
});

test('interruption cancels the active generation, discards late chunks and admits the next turn', async t => {
    const { brain, events, connections } = await rig(t);
    await brain.start(ctx());
    const { socket } = connections[0];
    send(socket, output('First answer'));
    send(socket, { serverContent: { interrupted: true } });
    send(socket, output('late old text'));
    send(socket, { serverContent: { turnComplete: true } });
    send(socket, speech('Second question'));
    send(socket, output('Replacement'));
    send(socket, { serverContent: { turnComplete: true } });
    await until(() => events.filter(event => event.type === 'response_done').length === 2);
    assert.deepEqual(events.filter(event => event.type === 'response_delta').map(({ responseId, text }) => [responseId, text]), [
        ['mock:1', 'First answer'], ['mock:2', 'Replacement'],
    ]);
    assert.deepEqual(events.filter(event => event.type === 'response_done').map(({ status }) => status), ['cancelled', 'completed']);
    const cancelled = events.findIndex(event => event.type === 'response_done' && event.status === 'cancelled');
    assert.equal(events[cancelled + 1].type, 'interviewer_speech_started');
});

test('interviewer backchannel transcripts alone do not cancel or replace Gemini output', async t => {
    const { brain, events, connections } = await rig(t);
    await brain.start(ctx());
    const { socket } = connections[0];
    send(socket, output('Use an idempotency key'));
    for (const text of ['Mm-hmm.', 'Okay.', 'Right.']) send(socket, speech(text));
    send(socket, output(' for every write.'));
    send(socket, { serverContent: { turnComplete: true } });
    await until(() => events.some(event => event.type === 'response_done'));
    assert.deepEqual(events.filter(event => event.type === 'response_delta').map(event => event.text), [
        'Use an idempotency key', ' for every write.',
    ]);
    assert.deepEqual(events.filter(event => event.type === 'response_done').map(event => event.status), ['completed']);
});

test('silence emits no answer and clarification follow-up sends a new client turn', async t => {
    const { brain, events, connections } = await rig(t);
    await brain.start(ctx());
    const { socket, requests } = connections[0];
    send(socket, { serverContent: { turnComplete: true } });
    await until(() => events.some(event => event.type === 'response_silent'));
    assert.equal(events.some(event => event.type === 'response_started'), false);
    send(socket, output('Ask: What scale?'));
    send(socket, { serverContent: { turnComplete: true } });
    await until(() => events.some(event => event.type === 'response_done'));
    brain.requestClarificationAnswer();
    const content = await until(() => requests.find(message => message.clientContent)?.clientContent);
    assert.equal(content.turnComplete, true);
    assert.match(content.turns[0].parts[0].text, /state a reasonable assumption/);
    assert.equal(content.turns[0].role, 'user');
});

test('goAway emits the deadline and reconnects with the resumable handle', async t => {
    const { brain, events, connections } = await rig(t);
    await brain.start(ctx());
    send(connections[0].socket, { sessionResumptionUpdate: { resumable: true, newHandle: 'fake-handle' } });
    send(connections[0].socket, { goAway: { timeLeft: '30.250s' } });
    assert.deepEqual((await until(() => connections[1]?.requests[0]?.setup)).sessionResumption, { handle: 'fake-handle' });
    assert.deepEqual(events.find(event => event.type === 'session_expiring'), { type: 'session_expiring', inMs: 30_250 });
});

test('goAway waits for a streaming answer to complete and restarts silence fill on the resumed socket', async t => {
    t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 10_000 });
    const { brain, events, connections } = await rig(t, { rolloverClock: new FakeClock() });
    await brain.start(ctx());
    const { socket } = connections[0];
    send(socket, { sessionResumptionUpdate: { resumable: true, newHandle: 'handle' } });
    send(socket, output('First'));
    send(socket, { goAway: { timeLeft: '20s' } });
    await until(() => events.some(event => event.type === 'session_expiring'));
    assert.equal(connections.length, 1);
    send(socket, output(' answer'));
    send(socket, { serverContent: { turnComplete: true } });
    await until(() => events.filter(event => event.type === 'status' && event.status === 'ready').length === 2);
    assert.equal(events.find(event => event.type === 'response_done').status, 'completed');
    assert.equal(connections[1].requests[0].setup.sessionResumption.handle, 'handle');
    t.mock.timers.tick(500);
    const filled = await until(() => connections[1].requests.find(message => message.realtimeInput?.audio));
    assert.ok(Buffer.from(filled.realtimeInput.audio.data, 'base64').every(byte => byte === 0));
});

test('goAway cancels a continuing answer one second before the deadline', async t => {
    const clock = new FakeClock();
    const { brain, events, connections } = await rig(t, { rolloverClock: clock });
    await brain.start(ctx());
    const { socket } = connections[0];
    send(socket, { sessionResumptionUpdate: { resumable: true, newHandle: 'handle' } });
    send(socket, output('Still answering'));
    send(socket, { goAway: { timeLeft: '5s' } });
    await until(() => events.some(event => event.type === 'session_expiring'));
    clock.advance(3_999);
    assert.equal(connections.length, 1);
    assert.ok(!events.some(event => event.type === 'response_done'));
    clock.advance(1);
    await until(() => connections[1]?.requests[0]?.setup);
    assert.equal(events.find(event => event.type === 'response_done').status, 'cancelled');
});

test('goAway uses an interruption as the next rollover boundary', async t => {
    const { brain, events, connections } = await rig(t);
    await brain.start(ctx());
    const { socket } = connections[0];
    send(socket, { sessionResumptionUpdate: { resumable: true, newHandle: 'handle' } });
    send(socket, output('First answer'));
    send(socket, { goAway: { timeLeft: '20s' } });
    await until(() => events.some(event => event.type === 'session_expiring'));
    assert.equal(connections.length, 1);
    send(socket, { serverContent: { interrupted: true } });
    await until(() => connections[1]?.requests[0]?.setup);
    assert.equal(events.find(event => event.type === 'response_done').status, 'cancelled');
});

for (const notice of [{ timeLeft: '1.4s' }, {}]) {
    test(`goAway with ${notice.timeLeft ?? 'no deadline'} rolls immediately even during an answer`, async t => {
        const { brain, events, connections } = await rig(t);
        await brain.start(ctx());
        const { socket } = connections[0];
        send(socket, { sessionResumptionUpdate: { resumable: true, newHandle: 'handle' } });
        send(socket, output('In progress'));
        send(socket, { goAway: notice });
        await until(() => connections[1]?.requests[0]?.setup);
        assert.equal(events.find(event => event.type === 'response_done').status, 'cancelled');
    });
}

test('candidate context waits for Gemini to finish the interviewer turn', async t => {
    const { brain, events, connections } = await rig(t);
    await brain.start(ctx());
    const { socket, requests } = connections[0];
    send(socket, speech('How would you handle retries?'));
    await until(() => events.find(event => event.type === 'interviewer_transcript'));
    brain.addCandidateText('I use a retry budget.', Date.now());
    send(socket, output('I would limit retries.'));
    await until(() => events.find(event => event.type === 'response_delta'));
    assert.equal(requests.some(message => message.clientContent), false);
    send(socket, { serverContent: { turnComplete: true, interactionStatus: 'IDLE' } });
    const clientContent = await until(() => requests.find(message => message.clientContent)?.clientContent);
    assert.equal(clientContent.turnComplete, false);
    assert.equal(clientContent.turns[0].parts[0].text, 'Candidate said: I use a retry budget.');
});

test('manual cancellation suppresses a pending answer without dropping the next turn', async t => {
    const { brain, events, connections } = await rig(t);
    await brain.start(ctx());
    const { socket } = connections[0];
    send(socket, speech('First question'));
    await until(() => events.some(event => event.type === 'interviewer_transcript'));
    brain.cancelResponse('manual_answer');
    send(socket, output('Suppressed answer'));
    send(socket, { serverContent: { turnComplete: true } });
    send(socket, speech('Second question'));
    send(socket, output('Current answer'));
    send(socket, { serverContent: { turnComplete: true } });
    await until(() => events.some(event => event.type === 'response_done'));
    assert.deepEqual(events.filter(event => event.type === 'response_delta').map(event => event.text), ['Current answer']);
});

test('429 backs off before reconnecting and a socket drop backs off again', async t => {
    const { brain, events, connections } = await rig(t, {
        backoffMs: [30, 60],
        replyToSetup(socket, attempt) {
            if (attempt === 1) send(socket, { error: { code: 429, message: 'Too many requests' } });
            else send(socket, { setupComplete: {} });
        },
    });
    await brain.start(ctx());
    assert.ok(connections[1].at - connections[0].at >= 25);
    connections[1].socket.terminate();
    await until(() => events.filter(event => event.type === 'status' && event.status === 'ready').length === 2);
    assert.ok(connections[2].at - connections[1].at >= 55);
    assert.deepEqual(events.filter(event => event.type === 'error').map(({ code, fatal }) => [code, fatal]), [
        ['rate_limited', false], ['network', false],
    ]);
});

for (const [code, providerError] of [['auth', { code: 403 }], ['quota', { code: 429, message: 'Daily quota exhausted' }]]) {
    test(`${code} errors are fatal without retry`, async t => {
        const { brain, events, connections } = await rig(t, {
            replyToSetup: socket => send(socket, { error: providerError }),
        });
        await assert.rejects(brain.start(ctx()), { code });
        await delay(30);
        assert.equal(connections.length, 1);
        assert.deepEqual(events.find(event => event.type === 'error'), { type: 'error', code, fatal: true });
    });
}

test('repeated setup failures exhaust the retry budget and stop', async t => {
    const { brain, events, connections } = await rig(t, { replyToSetup: socket => socket.terminate() });
    await assert.rejects(brain.start(ctx()), { code: 'network' });
    assert.equal(connections.length, 3);
    assert.deepEqual(events.filter(event => event.type === 'error').map(event => event.fatal), [false, false, true]);
});

test('Settings connection handshake sends only setup and closes', async t => {
    const { endpoint, connections } = await rig(t);
    const result = await testConnection({ apiKey: 'fake-gemini-key-for-tests', endpoint });
    assert.deepEqual(result, { success: true, message: 'Connected to Gemini Live.' });
    assert.deepEqual(connections[0].requests.map(message => Object.keys(message)), [['setup']]);
    await until(() => connections[0].socket.readyState === 3);
});

test('a silent capture is padded with zeros so the audio stream stays at real-time pace', async t => {
    const { brain, connections } = await rig(t);
    await brain.start(ctx());
    const { requests } = connections[0];
    // No audio pushed at all: the capture went quiet.
    await delay(900);
    const sentMs = requests
        .filter(message => message.realtimeInput)
        .reduce((ms, message) => ms + Buffer.from(message.realtimeInput.audio.data, 'base64').length / 32, 0);
    assert.ok(sentMs >= 400 && sentMs <= 1_000, `expected roughly real-time silence, got ${sentMs} ms`);
    const zeros = requests.filter(message => message.realtimeInput)
        .every(message => Buffer.from(message.realtimeInput.audio.data, 'base64').every(byte => byte === 0));
    assert.ok(zeros, 'the fill is silence');
    // Real audio that keeps pace needs no fill.
    await brain.stop();
});
