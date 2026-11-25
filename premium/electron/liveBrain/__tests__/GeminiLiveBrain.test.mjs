import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer } from 'ws';

const require = createRequire(import.meta.url);
const { GeminiLiveBrain } = require('../../../../dist-electron/premium/electron/liveBrain/brains/GeminiLiveBrain.js');
const { testConnection } = require('../../../../dist-electron/premium/electron/liveBrain/meeting.js');
const ctx = () => ({ sessionId: 'mock', instructions: 'Decide after speech.', signal: new AbortController().signal });
const call = (id, args) => ({ toolCall: { functionCalls: [{ id, name: 'decide_turn', args }] } });
const speech = text => ({ serverContent: { inputTranscription: { text, finished: true } } });
const send = (socket, payload) => socket.send(JSON.stringify(payload));

async function until(read) {
    for (let i = 0; i < 200; i++) {
        const value = read();
        if (value) return value;
        await delay(5);
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
    const brain = new GeminiLiveBrain({ apiKey: 'fake-gemini-key-for-tests', model: 'test-model', endpoint, backoffMs: options.backoffMs ?? [10, 20] });
    const events = [];
    brain.onEvent(event => events.push(event));
    t.after(async () => {
        await brain.stop();
        for (const socket of server.clients) socket.terminate();
        await new Promise(resolve => server.close(resolve));
    });
    return { brain, events, connections, endpoint };
}

test('Gemini setup, audio, candidate context, and tool response use the Live WebSocket protocol', async t => {
    const { brain, events, connections } = await rig(t);
    await brain.start(ctx());
    const { socket, requests } = connections[0];
    assert.deepEqual(requests[0].setup, {
        model: 'models/test-model', generationConfig: { responseModalities: ['AUDIO'] },
        systemInstruction: { parts: [{ text: 'Decide after speech.' }] },
        realtimeInputConfig: { automaticActivityDetection: { disabled: false } },
        inputAudioTranscription: {}, sessionResumption: {}, contextWindowCompression: { slidingWindow: {} },
        tools: [{ functionDeclarations: [{ name: 'decide_turn', description: 'Decide what the candidate needs after an interviewer turn.', parametersJsonSchema: requests[0].setup.tools[0].functionDeclarations[0].parametersJsonSchema }] }],
    });
    assert.deepEqual(requests[0].setup.tools[0].functionDeclarations[0].parametersJsonSchema.required, ['action']);
    brain.pushInterviewerAudio(new Int16Array([100, -200]), 16_000);
    brain.addCandidateText('   I would cache reads.   ', Date.now());
    const audio = await until(() => requests.find(message => message.realtimeInput)?.realtimeInput.audio);
    assert.equal(audio.mimeType, 'audio/pcm;rate=16000');
    assert.deepEqual(Buffer.from(audio.data, 'base64'), Buffer.from([100, 0, 56, 255]));
    assert.deepEqual(await until(() => requests.find(message => message.clientContent)?.clientContent), {
        turns: [{ role: 'user', parts: [{ text: 'Candidate said: I would cache reads.' }] }], turnComplete: false,
    });
    send(socket, speech('What about invalidation?'));
    send(socket, call('answer', { action: 'answer', question: 'What about invalidation?', kind: 'follow_up' }));
    assert.deepEqual(await until(() => requests.find(message => message.toolResponse)?.toolResponse.functionResponses), [
        { id: 'answer', name: 'decide_turn', response: { ok: true } },
    ]);
    assert.equal(events.find(event => event.type === 'decision').question, 'What about invalidation?');
    assert.equal(events.find(event => event.type === 'interviewer_transcript').final, true);
    send(socket, { serverContent: { modelTurn: { parts: [{ inlineData: { data: 'AAAA' } }] }, interrupted: true } });
    await until(() => events.filter(event => event.type === 'interviewer_speech_started').length === 2);
    assert.equal(events.some(event => event.type === 'response_delta'), false);
});

test('invalid and duplicate tool calls receive responses, but only new interviewer speech permits a decision', async t => {
    const { brain, events, connections } = await rig(t);
    await brain.start(ctx());
    const { socket, requests } = connections[0];
    send(socket, call('unsolicited', { action: 'wait' }));
    send(socket, speech('Design a catalog.'));
    send(socket, call('invalid', { action: 'answer' }));
    send(socket, call('answer', { action: 'answer', question: 'Design a catalog.' }));
    brain.addCandidateText('Here is my answer.', Date.now());
    for (let i = 0; i < 4; i++) send(socket, call(`duplicate-${i}`, { action: 'wait' }));
    send(socket, { serverContent: { interrupted: true } });
    send(socket, call('interrupt', { action: 'wait' }));
    send(socket, speech('Use MongoDB.'));
    send(socket, call('correction', { action: 'answer', question: 'Design a catalog using MongoDB.', kind: 'correction' }));
    const replies = await until(() => {
        const responses = requests.flatMap(message => message.toolResponse?.functionResponses ?? []);
        return responses.length === 9 && responses;
    });
    assert.deepEqual(replies[1].response, { error: 'Invalid decision' });
    assert.equal(replies.filter(reply => reply.response.ok).length, 8);
    assert.deepEqual(events.filter(event => event.type === 'decision').map(event => [event.action, event.question]), [
        ['answer', 'Design a catalog.'], ['wait', undefined], ['answer', 'Design a catalog using MongoDB.'],
    ]);
});

test('goAway emits the deadline and reconnects with the resumable handle', async t => {
    const { brain, events, connections } = await rig(t);
    await brain.start(ctx());
    send(connections[0].socket, { sessionResumptionUpdate: { resumable: true, newHandle: 'fake-handle' } });
    send(connections[0].socket, { goAway: { timeLeft: '30.250s' } });
    assert.deepEqual((await until(() => connections[1]?.requests[0]?.setup)).sessionResumption, { handle: 'fake-handle' });
    assert.deepEqual(events.find(event => event.type === 'session_expiring'), { type: 'session_expiring', inMs: 30_250 });
});

test('candidate context waits for Gemini to finish the interviewer turn', async t => {
    const { brain, events, connections } = await rig(t);
    await brain.start(ctx());
    const { socket, requests } = connections[0];
    send(socket, speech('How would you handle retries?'));
    await until(() => events.find(event => event.type === 'interviewer_transcript'));
    brain.addCandidateText('I use a retry budget.', Date.now());
    send(socket, call('answer', { action: 'answer', question: 'How would you handle retries?' }));
    await until(() => requests.find(message => message.toolResponse));
    assert.equal(requests.some(message => message.clientContent), false);
    send(socket, { serverContent: { turnComplete: true, interactionStatus: 'IDLE' } });
    const clientContent = await until(() => requests.find(message => message.clientContent)?.clientContent);
    assert.equal(clientContent.turnComplete, false);
    assert.equal(clientContent.turns[0].parts[0].text, 'Candidate said: I use a retry budget.');
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
