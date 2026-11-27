import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { AmazonSonicBrain } = require('../../../../dist-electron/premium/electron/liveBrain/brains/AmazonSonicBrain.js');
const { testConnection } = require('../../../../dist-electron/premium/electron/liveBrain/meeting.js');
const context = { sessionId: 'meeting', responseNamespace: 'generation', instructions: 'Answer as the candidate. Keep the database.', signal: new AbortController().signal };

function rig() {
    const sent = [];
    const output = new PassThrough({ objectMode: true });
    const emit = (event, fields) => output.write({ chunk: { bytes: Buffer.from(JSON.stringify({ event: { [event]: fields } })) } });
    let request;
    let readInput;
    const transport = async (region, model, input) => {
        request = { region, model };
        readInput = (async () => {
            for await (const part of input) sent.push(JSON.parse(part.chunk.bytes.toString()).event);
        })();
        return output;
    };
    return { sent, output, emit, transport, request: () => request, inputDone: () => readInput };
}

const startText = (t, completionId, contentId, role, stage) => t.emit('contentStart', {
    completionId, contentId, role, type: 'TEXT', additionalModelFields: JSON.stringify({ generationStage: stage }),
});
const text = (t, completionId, contentId, content) => t.emit('textOutput', { completionId, contentId, content });
const endText = (t, completionId, contentId) => t.emit('contentEnd', { completionId, contentId, type: 'TEXT', stopReason: 'END_TURN' });

test('Sonic sends PCM and instructions, streams answers, drops audio and consumes an interruption exactly once', async () => {
    const t = rig();
    const brain = new AmazonSonicBrain({ sonicRegion: 'eu-north-1', model: 'amazon.nova-2-5-sonic', transport: t.transport });
    const seen = [];
    brain.onEvent(event => seen.push(event));
    try {
        await brain.start(context);
        assert.deepEqual(t.request(), { region: 'eu-north-1', model: 'amazon.nova-2-5-sonic' });
        brain.pushInterviewerAudio(new Int16Array(512).fill(1234), 16_000);
        await delay(55);
        assert.equal(t.sent[0].sessionStart.turnDetectionConfiguration.endpointingSensitivity, 'MEDIUM');
        assert.equal(t.sent[1].promptStart.audioOutputConfiguration.sampleRateHertz, 24_000);
        assert.match(t.sent.find(event => event.textInput).textInput.content, /Keep the database/);
        assert.equal(t.sent.find(event => event.contentStart?.type === 'AUDIO').contentStart.audioInputConfiguration.sampleRateHertz, 16_000);
        const audio = t.sent.filter(event => event.audioInput).map(event => Buffer.from(event.audioInput.content, 'base64'));
        assert.ok(audio.some(frame => frame.length === 1024 && frame.readInt16LE() === 1234));
        t.emit('completionStart', { completionId: 'one' });
        startText(t, 'one', 'question', 'USER', 'FINAL');
        text(t, 'one', 'question', 'How would you design it?');
        endText(t, 'one', 'question');
        startText(t, 'one', 'answer', 'ASSISTANT', 'SPECULATIVE');
        text(t, 'one', 'answer', 'I would ');
        t.emit('audioOutput', { completionId: 'one', content: 'YXVkZGlv' });
        text(t, 'one', 'answer', '{ "interrupted" : true }');
        text(t, 'one', 'answer', 'stale');
        t.emit('completionEnd', { completionId: 'one', stopReason: 'INTERRUPTED' });
        t.emit('completionStart', { completionId: 'two' });
        startText(t, 'two', 'new', 'ASSISTANT', 'SPECULATIVE');
        text(t, 'two', 'new', 'Use a queue.');
        endText(t, 'two', 'new');
        startText(t, 'two', 'final', 'ASSISTANT', 'FINAL');
        text(t, 'two', 'final', 'Use a queue.');
        endText(t, 'two', 'final');
        t.emit('completionEnd', { completionId: 'two', stopReason: 'END_TURN' });
        await delay(0);
        assert.deepEqual(seen.filter(event => event.type === 'response_delta').map(event => event.text), ['I would ', 'Use a queue.']);
        assert.deepEqual(seen.filter(event => event.type === 'response_done').map(event => [event.responseId, event.status]), [
            ['generation:one', 'cancelled'], ['generation:two', 'completed'],
        ]);
        assert.equal(seen.find(event => event.type === 'interviewer_transcript').text, 'How would you design it?');
    } finally {
        await brain.stop();
        t.output.end();
        await t.inputDone();
    }
    assert.deepEqual(t.sent.slice(-3).map(event => Object.keys(event)[0]), ['contentEnd', 'promptEnd', 'sessionEnd']);
    await brain.stop();
    assert.equal(seen.filter(event => event.type === 'status' && event.status === 'closed').length, 1);
});

test('Sonic connection test invokes the chosen model and waits for an actual text reply', async () => {
    const t = rig();
    const pending = testConnection({ apiKey: '', provider: 'amazon-sonic', model: 'amazon.nova-2-sonic-v1:0', sonicRegion: 'us-west-2', transport: t.transport });
    try {
        await delay(0);
        assert.deepEqual(t.request(), { region: 'us-west-2', model: 'amazon.nova-2-sonic-v1:0' });
        assert.ok(t.sent.some(event => event.textInput?.content === 'Reply with OK.'));
        t.emit('completionStart', { completionId: 'test' });
        startText(t, 'test', 'reply', 'ASSISTANT', 'SPECULATIVE');
        text(t, 'test', 'reply', 'OK');
        assert.deepEqual(await pending, { success: true, message: 'Amazon Sonic connected and replied.' });
    } finally {
        t.output.end();
    }
});

test('Sonic classifies stream failures for the supervisor without logging AWS error bodies', async () => {
    const t = rig();
    const brain = new AmazonSonicBrain({ sonicRegion: 'us-east-1', transport: t.transport });
    const seen = [];
    brain.onEvent(event => seen.push(event));
    await brain.start(context);
    t.output.write({ throttlingException: { message: 'secret AWS details' } });
    await delay(0);
    assert.deepEqual(seen.find(event => event.type === 'error'), { type: 'error', code: 'rate_limited', fatal: true });
    await brain.stop();
    t.output.end();
    await t.inputDone();
});

test('start() transport rejecting AccessDenied emits error{auth,fatal:true} before status closed with nothing after', async () => {
    const brain = new AmazonSonicBrain({
        sonicRegion: 'us-east-1',
        transport: async () => { throw Object.assign(new Error('Access denied'), { name: 'AccessDeniedException' }); },
    });
    const seen = [];
    brain.onEvent(event => seen.push(event));
    await assert.rejects(() => brain.start(context), { code: 'auth' });
    assert.deepEqual(seen, [
        { type: 'status', status: 'connecting' },
        { type: 'error', code: 'auth', fatal: true },
        { type: 'status', status: 'closed' },
    ]);
});

test('stop() inside connecting listener never invokes transport and leaves no interval', async () => {
    let transportCalls = 0;
    const brain = new AmazonSonicBrain({
        sonicRegion: 'us-east-1',
        transport: async () => { transportCalls++; return new PassThrough({ objectMode: true }); },
    });
    const seen = [];
    brain.onEvent(event => {
        seen.push(event);
        if (event.type === 'status' && event.status === 'connecting') void brain.stop();
    });
    await assert.rejects(() => brain.start(context), { code: 'network' });
    assert.equal(transportCalls, 0);
    assert.equal(brain.timer, undefined);
    assert.deepEqual(seen, [
        { type: 'status', status: 'connecting' },
        { type: 'status', status: 'closed' },
    ]);
});

test('stop() inside response_started listener emits no delta afterwards', async () => {
    const t = rig();
    const brain = new AmazonSonicBrain({ sonicRegion: 'us-east-1', transport: t.transport });
    const seen = [];
    brain.onEvent(event => {
        seen.push(event);
        if (event.type === 'response_started') void brain.stop();
    });
    await brain.start(context);
    t.emit('completionStart', { completionId: 'c1' });
    startText(t, 'c1', 'a1', 'ASSISTANT', 'SPECULATIVE');
    text(t, 'c1', 'a1', 'Should not emit');
    await delay(0);
    assert.equal(seen.some(e => e.type === 'response_delta'), false);
    assert.equal(seen.at(-1)?.status, 'closed');
    t.output.end();
    await t.inputDone();
});

test('malformed additionalModelFields does not fail and is treated as final', async () => {
    const t = rig();
    const brain = new AmazonSonicBrain({ sonicRegion: 'us-east-1', transport: t.transport });
    const seen = [];
    brain.onEvent(event => seen.push(event));
    await brain.start(context);
    t.emit('completionStart', { completionId: 'c1' });
    t.emit('contentStart', {
        completionId: 'c1', contentId: 'b1', role: 'ASSISTANT', type: 'TEXT',
        additionalModelFields: '{not-valid-json',
    });
    text(t, 'c1', 'b1', 'Final fallback.');
    endText(t, 'c1', 'b1');
    t.emit('completionEnd', { completionId: 'c1', stopReason: 'END_TURN' });
    await delay(0);
    assert.equal(seen.some(e => e.type === 'error'), false);
    assert.deepEqual(seen.filter(e => e.type === 'response_delta').map(e => e.text), ['Final fallback.']);
    await brain.stop();
    t.output.end();
    await t.inputDone();
});

test('queue stuck > 64 for > 5 s fails with network and drained queue resets timer', async tMock => {
    tMock.mock.timers.enable({ apis: ['Date'], now: 10_000 });
    const t = rig();
    const brain = new AmazonSonicBrain({ sonicRegion: 'us-east-1', transport: t.transport });
    const seen = [];
    brain.onEvent(event => seen.push(event));
    await brain.start(context);

    // Fill queue > 64 and advance 4 s -> no failure yet.
    brain.queue = new Array(65).fill({ chunk: { bytes: Buffer.alloc(0) } });
    brain.flushAudio();
    tMock.mock.timers.tick(4_000);
    brain.flushAudio();
    assert.equal(seen.some(e => e.type === 'error'), false);

    // Drain queue -> resets backpressure timer.
    brain.queue = [];
    brain.flushAudio();

    // Refill > 64 and advance 4 s -> still no failure because timer reset.
    brain.queue = new Array(65).fill({ chunk: { bytes: Buffer.alloc(0) } });
    brain.flushAudio();
    tMock.mock.timers.tick(4_000);
    brain.flushAudio();
    assert.equal(seen.some(e => e.type === 'error'), false);

    // Exceed 5 s sustained -> fails with network before closed.
    tMock.mock.timers.tick(1_001);
    brain.flushAudio();
    assert.deepEqual(seen.filter(e => e.type === 'error'), [{ type: 'error', code: 'network', fatal: true }]);
    t.output.end();
    await t.inputDone();
});

test('speculative preview streams one delta and differing FINAL overrides response_done finalText', async () => {
    const t = rig();
    const brain = new AmazonSonicBrain({ sonicRegion: 'us-east-1', transport: t.transport });
    const seen = [];
    brain.onEvent(event => seen.push(event));
    await brain.start(context);
    t.emit('completionStart', { completionId: 'c1' });
    startText(t, 'c1', 's1', 'ASSISTANT', 'SPECULATIVE');
    text(t, 'c1', 's1', 'Use Redis.');
    endText(t, 'c1', 's1');
    startText(t, 'c1', 'f1', 'ASSISTANT', 'FINAL');
    text(t, 'c1', 'f1', 'Use Postgres.');
    endText(t, 'c1', 'f1');
    t.emit('completionEnd', { completionId: 'c1', stopReason: 'END_TURN' });
    await delay(0);
    assert.deepEqual(seen.filter(e => e.type === 'response_delta').map(e => e.text), ['Use Redis.']);
    const done = seen.find(e => e.type === 'response_done');
    assert.deepEqual(done, { type: 'response_done', responseId: 'generation:c1', status: 'completed', finalText: 'Use Postgres.' });
    await brain.stop();
    t.output.end();
    await t.inputDone();
});
