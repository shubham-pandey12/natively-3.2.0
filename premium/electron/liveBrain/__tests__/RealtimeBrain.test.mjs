import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer } from 'ws';
import { FakeClock } from '../../autoAnswer/__tests__/fakeClock.mjs';

const require = createRequire(import.meta.url);
const load = name => require(`../../../../dist-electron/premium/electron/liveBrain/${name}.js`);
const { createLiveBrain } = load('index');
const { testConnection, createMeeting } = load('meeting');
const { BrainSupervisor } = load('BrainSupervisor');
const { InterviewNotebook } = load('InterviewNotebook');
const apiKey = 'fake-realtime-key-for-tests';
const testContext = () => ({ sessionId: 'mock', instructions: 'Answer as the candidate.', signal: new AbortController().signal });
const send = (socket, type, fields) => socket.send(JSON.stringify({ type, ...fields }));
const created = (socket, id) => send(socket, 'response.created', { response: { id } });
const done = (socket, id, status = 'completed') => send(socket, 'response.done', { response: { id, status } });

const providers = {
    'openai-realtime': {
        modality: 'text', model: 'gpt-realtime-2.1', deltaType: 'response.output_text.delta',
        header: 'authorization', credential: `Bearer ${apiKey}`,
    },
    'elevenlabs-realtime': {
        modality: 'audio', model: 'eleven_realtime_v1_mini', deltaType: 'response.output_audio_transcript.delta',
        header: 'xi-api-key', credential: apiKey,
    },
};

async function until(read) {
    for (let i = 0; i < 300; i++) {
        const result = read();
        if (result) return result;
        await delay(5);
    }
    assert.fail('Expected a Realtime event');
}

async function rig(t, id, { reply, backoffMs = [], model, reasoningEffort } = {}) {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    const { header, credential } = providers[id];
    const connections = [];
    server.on('connection', (socket, request) => {
        const entry = { socket, url: new URL(request.url, 'http://localhost'), messages: [] };
        connections.push(entry);
        assert.equal(request.headers[header], credential);
        if (id === 'openai-realtime') send(socket, 'session.created');
        socket.on('message', data => {
            const message = JSON.parse(data);
            entry.messages.push(message);
            if (message.type !== 'session.update') return;
            if (reply) reply(socket, connections.length);
            else send(socket, 'session.updated', { session: { output_modalities: message.session.output_modalities } });
        });
    });
    const endpoint = `ws://127.0.0.1:${server.address().port}`;
    const brain = createLiveBrain(id, { apiKey, endpoint, backoffMs, ...(model ? { model } : {}), ...(reasoningEffort ? { reasoningEffort } : {}) });
    const events = [];
    brain.onEvent(event => events.push(event));
    t.after(async () => {
        await brain.stop();
        for (const socket of server.clients) socket.terminate();
        await new Promise(resolve => server.close(resolve));
    });
    return { brain, connections, events, endpoint };
}

for (const [id, { modality, model, deltaType }] of Object.entries(providers)) {
    const delta = (socket, responseId, text) => send(socket, deltaType, { response_id: responseId, delta: text });

    test(`${id} streams its answer in order, batches PCM and sends candidate speech as context`, async t => {
        const { brain, connections, events } = await rig(t, id);
        await brain.start(testContext());
        const { socket, url, messages } = connections[0];
        assert.equal(url.searchParams.get('model'), model);
        const { session } = messages[0];
        assert.equal(session.type, 'realtime');
        assert.equal(session.model, id === 'elevenlabs-realtime' ? model : undefined);
        assert.equal(session.instructions, 'Answer as the candidate.');
        assert.deepEqual(session.output_modalities, [modality]);
        assert.deepEqual(session.audio.input.format, { type: 'audio/pcm', rate: 24000 });
        assert.deepEqual(session.audio.input.turn_detection, {
            type: 'semantic_vad', eagerness: 'low', create_response: true, interrupt_response: true,
        });
        assert.equal(session.audio.output?.voice, modality === 'audio' ? 'brian' : undefined);

        brain.pushInterviewerAudio(new Int16Array(800).fill(1234), 16000);
        brain.addCandidateText(' I already chose Redis. ');
        const item = await until(() => messages.find(message => message.type === 'conversation.item.create'));
        assert.deepEqual(item.item, {
            type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Candidate said: I already chose Redis.' }],
        });
        assert.ok(!messages.some(message => message.type === 'input_audio_buffer.append' || message.type === 'response.create'));
        brain.pushInterviewerAudio(new Int16Array(800).fill(-4321), 16000);
        const append = await until(() => messages.find(message => message.type === 'input_audio_buffer.append'));
        const pcm = Buffer.from(append.audio, 'base64');
        assert.equal(pcm.length, 4800);
        assert.equal(pcm.readInt16LE(2398), 1234);
        assert.equal(pcm.readInt16LE(2400), -4321);

        send(socket, 'input_audio_buffer.speech_started');
        send(socket, 'input_audio_buffer.speech_stopped');
        send(socket, 'conversation.item.input_audio_transcription.completed', { transcript: 'How do you invalidate cached entries?' });
        created(socket, 'original');
        send(socket, 'response.output_audio.delta', { response_id: 'original', delta: 'AAAA' });
        delta(socket, 'original', 'I would');
        await until(() => events.some(event => event.type === 'response_delta'));
        assert.deepEqual(events.filter(event => event.type.startsWith('response_')).map(event => event.type), [
            'response_started', 'response_delta',
        ]);
        delta(socket, 'original', ' use a TTL.');
        done(socket, 'original');
        await until(() => events.find(event => event.type === 'response_done'));
        const responses = events.filter(event => event.type === 'response_delta');
        assert.deepEqual(responses.map(({ responseId, text }) => [responseId, text]), [
            ['mock:1', 'I would'], ['mock:1', ' use a TTL.'],
        ]);
        assert.deepEqual(events.filter(event => event.type === 'interviewer_transcript').map(event => event.text), [
            'How do you invalidate cached entries?',
        ]);
    });

    test(`${id} interrupts immediately and discards deltas from the cancelled provider ID`, async t => {
        const { brain, connections, events } = await rig(t, id);
        await brain.start(testContext());
        const { socket, messages } = connections[0];
        created(socket, 'old');
        delta(socket, 'old', 'First');
        await until(() => events.some(event => event.type === 'response_delta'));
        send(socket, 'input_audio_buffer.speech_started');
        delta(socket, 'old', 'before provider completion');
        done(socket, 'old', 'cancelled');
        send(socket, 'input_audio_buffer.speech_stopped');
        created(socket, 'new');
        created(socket, 'old');
        delta(socket, 'old', 'after replacement starts');
        delta(socket, 'new', 'Replacement');
        done(socket, 'new');
        assert.deepEqual(await until(() => messages.find(message => message.type === 'response.cancel')), {
            type: 'response.cancel', response_id: 'old',
        });
        await until(() => events.filter(event => event.type === 'response_done').length >= 2);
        assert.deepEqual(events.filter(event => event.type === 'response_delta').map(event => event.text), ['First', 'Replacement']);
        assert.deepEqual(events.filter(event => event.type === 'response_done').map(event => [event.responseId, event.status]), [
            ['mock:1', 'cancelled'], ['mock:2', 'completed'],
        ]);
    });

    test(`${id} maps provider cancellation and ignores deltas after manual cancel before first text`, async t => {
        const { brain, connections, events } = await rig(t, id);
        await brain.start(testContext());
        const { socket, messages } = connections[0];
        created(socket, 'provider-cancel');
        delta(socket, 'provider-cancel', 'First');
        done(socket, 'provider-cancel', 'cancelled');
        await until(() => events.find(event => event.type === 'response_done'));
        created(socket, 'manual');
        send(socket, 'input_audio_buffer.speech_stopped');
        await until(() => events.some(event => event.type === 'interviewer_speech_stopped'));
        brain.cancelResponse('manual_answer');
        brain.cancelResponse('manual_answer');
        delta(socket, 'manual', 'late');
        done(socket, 'manual', 'cancelled');
        created(socket, 'next');
        done(socket, 'next');
        await until(() => events.some(event => event.type === 'response_silent'));
        assert.equal(messages.filter(message => message.type === 'response.cancel').length, 1);
        assert.deepEqual(events.filter(event => event.type === 'response_delta').map(event => event.text), ['First']);
        assert.equal(events.find(event => event.type === 'response_done').status, 'cancelled');
    });

    test(`${id} settings performs a real session setup without audio or reflected credentials`, async t => {
        const { connections, endpoint } = await rig(t, id);
        const result = await testConnection({ apiKey, endpoint, provider: id });
        assert.equal(result.success, true);
        assert.ok(!JSON.stringify(result).includes(apiKey));
        assert.deepEqual(connections[0].messages.map(message => message.type), ['session.update']);
        await until(() => connections[0].socket.readyState === 3);
    });
}

for (const id of Object.keys(providers)) {
    test(`${id} applies shared-history deltas on an open socket without requesting a response`, async t => {
        const { brain, connections, events } = await rig(t, id);
        await brain.start(testContext());
        const { messages } = connections[0];
        const before = messages.length;
        brain.addHistoryContext('<interview_conversation>Candidate typed or captured request: Find top k values.\nAI suggestion: Use a min-heap.</interview_conversation>');
        const update = await until(() => messages.slice(before).find(message => message.type === 'conversation.item.create'));
        assert.deepEqual(update.item, {
            type: 'message', role: 'user', content: [{
                type: 'input_text', text: '<interview_conversation>Candidate typed or captured request: Find top k values.\nAI suggestion: Use a min-heap.</interview_conversation>',
            }],
        });
        assert.equal(messages.slice(before).some(message => message.type === 'response.create'), false);
        assert.equal(events.some(event => event.type === 'response_started' || event.type === 'response_delta'), false);
    });
}

for (const [id, code, wireCode] of [
    ['openai-realtime', 'auth', 'invalid_api_key'],
    ['elevenlabs-realtime', 'quota', 'insufficient_quota'],
]) {
    test(`${id} ${code} fails terminally and activates the pipeline`, async t => {
        const { brain, connections, events } = await rig(t, id, {
            reply: socket => send(socket, 'error', { error: { code: wireCode, message: apiKey } }),
        });
        const clock = new FakeClock();
        const supervisor = new BrainSupervisor({
            preferred: id, sessionId: 'mock', instructions: () => 'Instructions', clock,
            notebook: new InterviewNotebook({ now: () => clock.now() }),
            onEvent() {},
            create: provider => provider === id ? { brain, model: 'mock' }
                : provider === 'pipeline' ? { brain: createLiveBrain('pipeline', {}), model: 'pipeline' } : undefined,
        });
        t.after(() => supervisor.stop());
        supervisor.start();
        await until(() => supervisor.current?.id === 'pipeline');
        assert.deepEqual(events.filter(event => event.type === 'error'), [{ type: 'error', code, fatal: true }]);
        assert.equal(connections.length, 1);
    });
}

test('rate limit retries with a budget and becomes fatal when exhausted', async t => {
    const { brain, connections, events } = await rig(t, 'openai-realtime', {
        backoffMs: [5, 5],
        reply: socket => send(socket, 'error', { error: { code: 'rate_limit_exceeded' } }),
    });
    await assert.rejects(brain.start(testContext()), { code: 'rate_limited' });
    assert.equal(connections.length, 3);
    assert.deepEqual(events.filter(event => event.type === 'error').map(event => event.fatal), [false, false, true]);
});

test('Test Connection reports an unavailable model without exposing the provider diagnostic', async t => {
    const id = 'openai-realtime';
    const { endpoint } = await rig(t, id, {
        reply: socket => send(socket, 'error', { error: { code: 'model_not_found', message: apiKey } }),
    });
    const result = await testConnection({ apiKey, endpoint, provider: id });
    assert.equal(result.success, false);
    assert.equal(result.error, 'unsupported');
    assert.ok(!JSON.stringify(result).includes(apiKey));
});

test('ElevenLabs audio transcripts use the shared overlay path and spoken sentinels', async t => {
    const id = 'elevenlabs-realtime';
    const { brain, connections } = await rig(t, id);
    const overlay = [];
    const meeting = createMeeting({
        sessionId: 'realtime-meeting', provider: id,
        modeTemplate: 'technical-interview',
        engine: { setAutomaticAnswerOutdated() {} },
        emitQuestion: event => overlay.push(event),
        onFailure: error => assert.fail(error),
    }, brain);
    t.after(() => meeting.stop());
    meeting.start();
    await until(() => overlay.some(event => event.liveBrainStatus === 'Listening'));
    const { socket, messages } = connections[0];
    assert.match(messages[0].session.instructions, /MANDATORY TURN OUTPUT/);
    const speak = (responseId, ...chunks) => {
        created(socket, responseId);
        for (const chunk of chunks) send(socket, providers[id].deltaType, { response_id: responseId, delta: chunk });
        done(socket, responseId);
    };
    speak('filler', 'No ', 'action.');
    speak('ask', 'Ask:', ' Who are the users?');
    await until(() => overlay.some(event => event.clarification?.includes('Who are the users?')));
    assert.ok(!overlay.some(event => event.responseText?.text.includes('No action.')));
});

test('3 drops after 30 s ready each reset failures so 4th drop still retries', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 10_000 });
    const { brain, connections, events } = await rig(t, 'openai-realtime', { backoffMs: [5, 5, 5] });
    await brain.start(testContext());
    for (let i = 0; i < 4; i++) {
        await until(() => events.filter(e => e.type === 'status' && e.status === 'ready').length === i + 1);
        t.mock.timers.tick(30_000);
        connections[i].socket.terminate();
    }
    await until(() => events.filter(e => e.type === 'status' && e.status === 'ready').length === 5);
    assert.equal(events.some(e => e.type === 'error' && e.fatal), false);
    assert.equal(events.filter(e => e.type === 'error' && !e.fatal).length, 4);
});

test('bare close 1008 is protocol fatal without retry while 1006 is network retry', async t => {
    const r1 = await rig(t, 'openai-realtime', { backoffMs: [5, 5] });
    await r1.brain.start(testContext());
    r1.connections[0].socket.close(1008);
    await until(() => r1.events.some(e => e.type === 'error'));
    await delay(30);
    assert.deepEqual(r1.events.filter(e => e.type === 'error'), [{ type: 'error', code: 'protocol', fatal: true }]);
    assert.equal(r1.connections.length, 1);

    const r2 = await rig(t, 'openai-realtime', { backoffMs: [5, 5] });
    await r2.brain.start(testContext());
    r2.connections[0].socket.terminate();
    await until(() => r2.events.filter(e => e.type === 'status' && e.status === 'ready').length === 2);
    assert.deepEqual(r2.events.filter(e => e.type === 'error'), [{ type: 'error', code: 'network', fatal: false }]);
});

test('response.done failed with no delta and no error emits response_silent to clear Thinking', async t => {
    const { brain, connections, events } = await rig(t, 'openai-realtime');
    await brain.start(testContext());
    const { socket } = connections[0];
    created(socket, 'empty-fail');
    done(socket, 'empty-fail', 'failed');
    await until(() => events.some(e => e.type === 'response_silent'));
    assert.equal(events.some(e => e.type === 'error'), false);
});

test('bufferedAmount above 1 MiB drops audio and sustained backpressure triggers network retry', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 10_000 });
    const { brain, connections, events } = await rig(t, 'openai-realtime', { backoffMs: [5, 5] });
    await brain.start(testContext());
    const { messages } = connections[0];
    Object.defineProperty(brain.socket, 'bufferedAmount', { get: () => 2 * 1024 * 1024, configurable: true });
    brain.pushInterviewerAudio(new Int16Array(2400).fill(100), 24000);
    await delay(20);
    assert.equal(messages.some(m => m.type === 'input_audio_buffer.append'), false);
    assert.equal(events.some(e => e.type === 'error'), false);
    t.mock.timers.tick(5_001);
    brain.pushInterviewerAudio(new Int16Array(2400).fill(100), 24000);
    await until(() => events.some(e => e.type === 'error' && e.code === 'network' && !e.fatal));
    await until(() => events.filter(e => e.type === 'status' && e.status === 'ready').length === 2);
});

test('stop() inside degraded listener emits no further events and schedules no retry', async t => {
    const { brain, connections, events } = await rig(t, 'openai-realtime', { backoffMs: [5, 5] });
    await brain.start(testContext());
    brain.onEvent(event => {
        if (event.type === 'status' && event.status === 'degraded') void brain.stop();
    });
    connections[0].socket.terminate();
    await until(() => events.some(e => e.type === 'status' && e.status === 'closed'));
    await delay(30);
    const closedIndex = events.findIndex(e => e.type === 'status' && e.status === 'closed');
    assert.equal(events.length, closedIndex + 1);
    assert.equal(events.some(e => e.type === 'error'), false);
    assert.equal(connections.length, 1);
});

test('response.done cancelled with no visible delta does not emit response_silent', async t => {
    const { brain, connections, events } = await rig(t, 'openai-realtime');
    await brain.start(testContext());
    const { socket } = connections[0];
    created(socket, 'cancelled-empty');
    done(socket, 'cancelled-empty', 'cancelled');
    created(socket, 'follow-up');
    send(socket, 'response.output_text.delta', { response_id: 'follow-up', delta: 'Answer' });
    done(socket, 'follow-up', 'completed');
    await until(() => events.some(e => e.type === 'response_done' && e.status === 'completed'));
    assert.equal(events.some(e => e.type === 'response_silent'), false);
});

test('OpenAIRealtimeBrain omits reasoning by default and wires session.reasoning.effort when set', async t => {
    const defaultRig = await rig(t, 'openai-realtime');
    await defaultRig.brain.start(testContext());
    assert.equal(defaultRig.connections[0].messages[0].session.reasoning, undefined);

    const highRig = await rig(t, 'openai-realtime', { model: 'gpt-realtime-2.1', reasoningEffort: 'high' });
    await highRig.brain.start(testContext());
    assert.deepEqual(highRig.connections[0].messages[0].session.reasoning, { effort: 'high' });

    const elevenRig = await rig(t, 'elevenlabs-realtime', { reasoningEffort: 'high' });
    await elevenRig.brain.start(testContext());
    assert.equal(elevenRig.connections[0].messages[0].session.reasoning, undefined);
});

test('OpenAI connects speech boundaries and transcript deltas/finals by input item ID', async t => {
    const { brain, connections, events } = await rig(t, 'openai-realtime');
    await brain.start(testContext());
    const { socket } = connections[0];
    send(socket, 'input_audio_buffer.speech_started', { item_id: 'item-a' });
    send(socket, 'input_audio_buffer.speech_stopped', { item_id: 'item-a' });
    send(socket, 'conversation.item.input_audio_transcription.delta', { item_id: 'item-a', delta: 'First' });
    send(socket, 'conversation.item.input_audio_transcription.delta', { item_id: 'item-a', delta: ' question?' });
    send(socket, 'conversation.item.input_audio_transcription.completed', { item_id: 'item-a', transcript: 'First question?' });
    const final = await until(() => events.find(event => event.type === 'interviewer_transcript' && event.final));
    assert.ok(final.itemId?.endsWith(':item-a'));
    assert.deepEqual(events.filter(event => event.type.startsWith('interviewer_')).map(event => event.itemId), Array(5).fill(final.itemId));
    assert.deepEqual(events.filter(event => event.type === 'interviewer_transcript').map(event => event.text),
        ['First', 'First question?', 'First question?']);
});
