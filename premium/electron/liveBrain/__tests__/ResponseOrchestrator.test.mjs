import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { FakeClock } from '../../autoAnswer/__tests__/fakeClock.mjs';

const require = createRequire(import.meta.url);
const dist = '../../../../dist-electron/premium/electron/liveBrain/';
const { ResponseOrchestrator } = require(`${dist}ResponseOrchestrator.js`);
const { createLiveBrainOverlayPort } = require(`${dist}overlayPort.js`);
const { FakeLiveBrain } = require(`${dist}__tests__/FakeLiveBrain.js`);
const question = 'Design a product catalog.';
const clarification = 'How many writes per second?';
const flush = () => new Promise(resolve => setImmediate(resolve));

async function rig() {
    const brain = new FakeLiveBrain();
    const clock = new FakeClock();
    const calls = [];
    const completions = [];
    const orchestrator = new ResponseOrchestrator({
        clock,
        answerWriter: {
            write(request) {
                calls.push(['write', request]);
                const completion = Promise.withResolvers();
                completions.push(completion);
                return { generationId: completions.length, done: completion.promise };
            },
            cancel: reason => calls.push(['cancel', reason]),
        },
        overlay: {
            showAsk: payload => calls.push(['ask', payload]),
            setOutdated: (...args) => calls.push(['outdated', ...args]),
            setInterviewerSpeaking: (...args) => calls.push(['speaking', ...args]),
            showText: payload => calls.push(['text', payload]),
        },
    });
    brain.onEvent(event => orchestrator.handleEvent(event));
    await brain.start({
        sessionId: 'test', instructions: '', recentTurns: [], signal: new AbortController().signal,
        notebook: { topics: [], currentTopic: null, requirements: [], constraints: [], clarifications: [], decisions: [], answered: [], summary: '', updatedAt: 0 },
    });
    let sequence = 0;
    const decision = (action, data = {}) => brain.emit({ type: 'decision', decisionId: `d${++sequence}`, action, at: clock.now(), ...data });
    return { brain, clock, calls, completions, orchestrator, decision };
}

test('an answer decision writes once; a second decision folds and cancels the streaming draft', async () => {
    const h = await rig();
    h.decision('answer', { question });
    assert.deepEqual(h.calls, [['write', { question, replacesAutomaticAnswer: false }]]);
    h.decision('answer', { question: 'Use MongoDB for the catalog.' });
    assert.deepEqual(h.calls.slice(1), [
        ['outdated', 1, true],
        ['cancel', 'answer_corrected'],
        ['write', { question: 'Use MongoDB for the catalog.', replacesAutomaticAnswer: true }],
    ]);
    h.completions[0].resolve('cancelled');
    await flush();
    h.brain.emit({ type: 'interviewer_speech_started', at: h.clock.now() });
    assert.deepEqual(h.calls.at(-1), ['speaking', 2, true]);
});

for (const [elapsed, replaces] of [[10_000, true], [25_000, false]]) {
    test(`a completed answer ${elapsed / 1000}s ago is ${replaces ? 'eligible' : 'too old'} for replacement`, async () => {
        const h = await rig();
        h.decision('answer', { question });
        h.completions[0].resolve('completed');
        await flush();
        h.clock.advance(elapsed);
        h.decision('answer', { question: 'Add a replica.' });
        assert.deepEqual(h.calls.slice(1), [
            ...(replaces ? [['outdated', 1, true]] : []),
            ['write', { question: 'Add a replica.', replacesAutomaticAnswer: replaces }],
        ]);
    });
}

test('ask folds the prior answer and writes the asked question with an assumption after ten seconds', async () => {
    const h = await rig();
    h.decision('answer', { question });
    h.completions[0].resolve('completed');
    await flush();
    h.decision('ask', { question, clarification });
    assert.deepEqual(h.calls.slice(1), [['outdated', 1, true], ['ask', { askId: 'd2', clarification }]]);
    h.clock.advance(9999);
    assert.equal(h.completions.length, 1);
    h.clock.advance(1);
    assert.deepEqual(h.calls.at(-1), ['write', {
        question: `${question}\n\nThe interviewer did not clarify; state a reasonable assumption first, then answer.`,
        replacesAutomaticAnswer: false,
    }]);
});

test('speech stops the clarification timer and a questionless ask has no assumption fallback', async () => {
    const h = await rig();
    h.decision('ask', { question, clarification });
    h.clock.advance(9999);
    h.brain.emit({ type: 'interviewer_speech_started', at: h.clock.now() });
    h.clock.advance(20_000);
    h.decision('ask', { clarification });
    h.clock.advance(20_000);
    assert.deepEqual(h.calls, [['ask', { askId: 'd1', clarification }], ['ask', { askId: 'd2', clarification }]]);
});

test('speech marks immediately and wait clears the marker without cancelling the answer', async () => {
    const h = await rig();
    h.decision('answer', { question });
    h.brain.emit({ type: 'interviewer_speech_started', at: h.clock.now() });
    assert.deepEqual(h.calls.at(-1), ['speaking', 1, true]);
    assert.equal(h.clock.pendingCount(), 0);
    h.decision('wait');
    assert.deepEqual(h.calls.slice(1), [['speaking', 1, true], ['speaking', 1, false]]);
    h.brain.emit({ type: 'interviewer_speech_started', at: h.clock.now() });
    assert.deepEqual(h.calls.at(-1), ['speaking', 1, true]);
});

test('text before its response starts is ignored and NO_ACTION keeps the prior answer', async () => {
    const h = await rig();
    const emit = event => h.brain.emit({ responseId: 'r1', ...event });
    h.decision('answer', { question });
    emit({ type: 'response_delta', text: 'Premature.' });
    emit({ type: 'response_done', status: 'completed' });
    assert.equal(h.calls.length, 1);
    h.brain.emit({ type: 'interviewer_speech_started', at: h.clock.now() });
    emit({ type: 'response_started', at: h.clock.now() });
    emit({ type: 'response_delta', text: '[[NO_' });
    emit({ type: 'response_delta', text: 'ACTION]]' });
    emit({ type: 'response_done', status: 'completed' });
    assert.deepEqual(h.calls.slice(1), [['speaking', 1, true], ['speaking', 1, false]]);
    h.brain.emit({ type: 'interviewer_speech_started', at: h.clock.now() });
    assert.deepEqual(h.calls.at(-1), ['speaking', 1, true]);
});

test('a split bracket ASK updates the same clarification row without leaking it as answer text', async () => {
    const h = await rig();
    h.decision('answer', { question });
    const emit = event => h.brain.emit({ responseId: 'r1', ...event });
    emit({ type: 'response_started', at: h.clock.now() });
    emit({ type: 'response_delta', text: '**[[AS' });
    emit({ type: 'response_delta', text: 'K]]** How many ' });
    emit({ type: 'response_delta', text: 'writes per second?' });
    assert.deepEqual(h.calls.at(-1), ['ask', { askId: 'r1', clarification, askStreaming: true }]);
    emit({ type: 'response_done', status: 'completed' });
    emit({ type: 'response_done', status: 'completed' });
    h.clock.advance(20_000);
    assert.deepEqual(h.calls.slice(1), [
        ['outdated', 1, true],
        ['ask', { askId: 'r1', clarification: 'How many ', askStreaming: true }],
        ['ask', { askId: 'r1', clarification, askStreaming: true }],
        ['ask', { askId: 'r1', clarification, askStreaming: false }],
    ]);
});

test('text uses the same replacement state and ignores older, cancelled and duplicate events', async () => {
    const h = await rig();
    const start = responseId => h.brain.emit({ type: 'response_started', responseId, at: h.clock.now() });
    const delta = (responseId, text) => h.brain.emit({ type: 'response_delta', responseId, text });
    const done = (responseId, status = 'completed') => h.brain.emit({ type: 'response_done', responseId, status });
    start('r1');
    delta('r1', 'Old answer');
    // D14: the interviewer cuts r1 off mid-stream, so its replacement marks it outdated.
    h.brain.emit({ type: 'interviewer_speech_started', at: h.clock.now() });
    start('r2');
    delta('r1', 'late');
    start('r1'); // A duplicate start cannot revive a closed response.
    delta('r2', 'New ');
    delta('r2', 'answer');
    done('r2', 'cancelled');
    delta('r2', 'late');
    done('r2');
    assert.deepEqual(h.calls.filter(([event]) => event !== 'speaking').map(([event, payload]) => [event, typeof payload === 'object' ? payload.text : payload]), [
        ['text', 'Old answer'], ['text', 'Old answer'], ['outdated', h.calls[0][1].generationId],
        ['text', 'New '], ['text', 'New answer'], ['text', 'New answer'],
    ]);
    assert.equal(h.calls.at(-1)[1].done, true);
    assert.equal(h.calls.at(-1)[1].updated, true);
    assert.notEqual(h.calls[0][1].generationId, h.calls.at(-1)[1].generationId);
});

test('reset clears the timer, cancels a writer once, and ignores its late completion', async () => {
    const h = await rig();
    h.decision('answer', { question });
    h.decision('ask', { question, clarification });
    h.orchestrator.reset();
    h.orchestrator.reset();
    h.clock.advance(20_000);
    h.completions[0].resolve('completed');
    await flush();
    assert.deepEqual(h.calls.at(-1), ['cancel', 'auto_disabled_or_meeting_ended']);
    assert.equal(h.calls.filter(([event]) => event === 'cancel').length, 1);
    assert.equal(h.completions.length, 1);
    h.decision('answer', { question });
    assert.equal(h.calls.at(-1)[1].replacesAutomaticAnswer, false);
});

test('the overlay port uses the existing question channel and delegates Phase 1 outdated state', () => {
    const calls = [];
    const port = createLiveBrainOverlayPort({
        emitQuestion: event => calls.push(event),
        setAutomaticAnswerOutdated: (...args) => calls.push(args),
    });
    port.showAsk({ askId: 'ask', clarification });
    port.setOutdated(7, true);
    port.setInterviewerSpeaking(7, false);
    port.showText({ responseId: 'r1', generationId: -1, text: 'Answer', done: true, updated: true });
    assert.deepEqual(calls, [
        { askId: 'ask', clarification }, [7, true], { generationId: 7, interviewerSpeaking: false },
        { generationId: -1, responseText: { text: 'Answer', done: true }, updated: true },
    ]);
});

// D14: chat-style question -> answer bubbles.
function chatRig() {
    const clock = new FakeClock();
    const shown = [];
    const order = [];
    const orchestrator = new ResponseOrchestrator({
        clock,
        overlay: {
            showAsk: () => {},
            setOutdated: () => {},
            setInterviewerSpeaking: () => {},
            showQuestion: payload => { shown.push(payload); order.push(['question', payload.questionId]); },
            showText: payload => order.push(['answer', payload.generationId]),
        },
    });
    const send = event => orchestrator.handleEvent({ at: clock.now(), ...event });
    const latest = id => shown.filter(payload => payload.questionId === id).at(-1);
    const firstAnswer = () => order.find(([kind]) => kind === 'answer')[1];
    return { clock, shown, order, orchestrator, send, latest, firstAnswer };
}

test('D14: the provider transcript streams into one bubble that closes when its answer starts', () => {
    const h = chatRig();
    h.send({ type: 'interviewer_speech_started' });
    h.send({ type: 'interviewer_transcript', text: 'How would', final: false });
    h.send({ type: 'interviewer_transcript', text: 'How would you design a cache?', final: false });
    assert.deepEqual(h.latest('q1'), { questionId: 'q1', text: 'How would you design a cache?', done: false });
    h.send({ type: 'interviewer_transcript', text: 'How would you design a cache?', final: true });
    h.send({ type: 'response_started', responseId: 'r1' });
    h.send({ type: 'response_delta', responseId: 'r1', text: 'I would use Redis.' });
    const generationId = h.firstAnswer();
    assert.deepEqual(h.latest('q1'), { questionId: 'q1', text: 'How would you design a cache?', done: true, generationId });
    const kinds = h.order.map(([kind]) => kind);
    assert.ok(kinds.indexOf('question') < kinds.indexOf('answer'));
    assert.equal(new Set(h.shown.map(payload => payload.questionId)).size, 1);
});

test('D14: the next question starts a new bubble, and a filler-only turn gets no bubble (D15)', () => {
    const h = chatRig();
    h.send({ type: 'interviewer_transcript', text: 'First question?', final: true });
    h.send({ type: 'response_started', responseId: 'r1' });
    h.send({ type: 'response_delta', responseId: 'r1', text: 'Answer one.' });
    h.send({ type: 'response_done', responseId: 'r1', status: 'completed' });
    h.send({ type: 'interviewer_speech_started' });
    h.send({ type: 'interviewer_transcript', text: 'Okay.', final: true });
    h.send({ type: 'response_silent' });
    assert.equal(h.latest('q2'), undefined);
    h.send({ type: 'interviewer_transcript', text: 'Second question?', final: true });
    assert.equal(h.latest('q3').text, 'Second question?');
});

test('D14: a transcript that arrives after its answer started is placed above that answer', () => {
    const h = chatRig();
    h.send({ type: 'interviewer_speech_started' });
    h.send({ type: 'response_started', responseId: 'r1' });
    h.send({ type: 'response_delta', responseId: 'r1', text: 'I would shard by user.' });
    const generationId = h.firstAnswer();
    h.send({ type: 'interviewer_transcript', text: 'How do you scale writes?', final: true });
    assert.deepEqual(h.latest('q1'), { questionId: 'q1', text: 'How do you scale writes?', done: true, generationId });
});

test('D14: the STT final fills a bubble only when the provider sent no transcript; provider text replaces it', () => {
    const h = chatRig();
    h.orchestrator.noteSttTranscript('How do you scale reads?', h.clock.now());
    h.send({ type: 'response_started', responseId: 'r1' });
    h.send({ type: 'response_delta', responseId: 'r1', text: 'Replicas.' });
    const generationId = h.firstAnswer();
    assert.deepEqual(h.latest('q1'), { questionId: 'q1', text: 'How do you scale reads?', done: true, generationId });
    h.send({ type: 'interviewer_transcript', text: 'How would you scale reads?', final: true });
    assert.equal(h.latest('q1').text, 'How would you scale reads?');
    assert.equal(new Set(h.shown.map(payload => payload.questionId)).size, 1);

    // With a provider bubble, the STT final for the same turn is ignored.
    h.send({ type: 'interviewer_speech_started' });
    h.send({ type: 'interviewer_transcript', text: 'What about writes?', final: false });
    h.orchestrator.noteSttTranscript('What about rights?', h.clock.now());
    h.send({ type: 'response_started', responseId: 'r2' });
    assert.equal(h.latest('q2').text, 'What about writes?');
    assert.equal(h.shown.some(payload => payload.text === 'What about rights?'), false);
});

test('D14: a stale STT final is not used as the next question', () => {
    const h = chatRig();
    h.orchestrator.noteSttTranscript('Old remark.', h.clock.now());
    h.clock.advance(9_000);
    h.send({ type: 'response_started', responseId: 'r1' });
    assert.equal(h.shown.length, 0);
});

test('D14: a new question after a finished answer keeps that answer visible (not outdated)', () => {
    const h = chatRig();
    const outdated = [];
    const orchestrator = new ResponseOrchestrator({
        clock: h.clock,
        overlay: {
            showAsk: () => {}, setInterviewerSpeaking: () => {}, showQuestion: () => {},
            setOutdated: (...args) => outdated.push(args),
            showText: payload => h.order.push(['answer', payload.generationId, payload.updated]),
        },
    });
    const send = event => orchestrator.handleEvent({ at: h.clock.now(), ...event });
    send({ type: 'response_started', responseId: 'r1' });
    send({ type: 'response_delta', responseId: 'r1', text: 'Answer one.' });
    h.clock.advance(3_000); // the text has finished; the audio turn is still open
    send({ type: 'interviewer_speech_started' });
    send({ type: 'response_done', responseId: 'r1', status: 'cancelled' });
    send({ type: 'response_started', responseId: 'r2' });
    send({ type: 'response_delta', responseId: 'r2', text: 'Answer two.' });
    assert.deepEqual(outdated, []);
    assert.equal(h.order.at(-1)[2], false);
});

test('D14: an answer cut off while its text was streaming is marked outdated by its replacement', () => {
    const h = chatRig();
    const outdated = [];
    const orchestrator = new ResponseOrchestrator({
        clock: h.clock,
        overlay: {
            showAsk: () => {}, setInterviewerSpeaking: () => {}, showQuestion: () => {},
            setOutdated: (...args) => outdated.push(args),
            showText: payload => h.order.push(['answer', payload.generationId, payload.updated]),
        },
    });
    const send = event => orchestrator.handleEvent({ at: h.clock.now(), ...event });
    send({ type: 'response_started', responseId: 'r1' });
    send({ type: 'response_delta', responseId: 'r1', text: 'Use PostgreSQL because' });
    h.clock.advance(300);
    send({ type: 'response_done', responseId: 'r1', status: 'cancelled' }); // Gemini barge-in order
    send({ type: 'interviewer_speech_started' });
    send({ type: 'response_started', responseId: 'r2' });
    send({ type: 'response_delta', responseId: 'r2', text: 'Use MongoDB.' });
    assert.equal(outdated.length, 1);
    assert.equal(h.order.at(-1)[2], true);
});

// D15: no answer under a filler-only interviewer bubble.
test('D15: filler-only text is recognised, real questions are not', () => {
    const { isFillerOnly } = require(`${dist}ResponseOrchestrator.js`);
    for (const text of ['Mm-hmm.', 'mmhmm', 'Uh-huh.', 'Okay.', 'Okay, right.', 'Yeah, sure.', 'Got it.', 'Thank you.', 'Hmm.']) {
        assert.equal(isFillerOnly(text), true, text);
    }
    for (const text of ['Okay, short one. If Redis goes down?', 'Sure. Quick round. First, how would you scale?', 'Right, but why Redis?', 'Design a URL shortener.']) {
        assert.equal(isFillerOnly(text), false, text);
    }
});

function fillerRig() {
    const clock = new FakeClock();
    const texts = [];
    const asks = [];
    const orchestrator = new ResponseOrchestrator({
        clock,
        overlay: {
            showAsk: payload => asks.push(payload), setOutdated: () => {}, setInterviewerSpeaking: () => {}, showQuestion: () => {},
            showText: payload => texts.push(payload),
        },
    });
    const send = event => orchestrator.handleEvent({ at: clock.now(), ...event });
    const turn = (question, responseId, answer) => {
        send({ type: 'interviewer_speech_started' });
        send({ type: 'interviewer_transcript', text: question, final: true });
        send({ type: 'response_started', responseId });
        send({ type: 'response_delta', responseId, text: answer });
        send({ type: 'response_done', responseId, status: 'completed' });
        clock.advance(5_000);
    };
    return { texts, asks, turn };
}

test('D15: an answer under a filler-only bubble is not shown; the previous answer stays current', () => {
    const h = fillerRig();
    h.turn('How would you debug a memory leak?', 'r1', 'Take heap snapshots.');
    h.turn('Mm-hmm.', 'r2', 'I would take a heap snapshot again.');
    assert.deepEqual(h.texts.map(payload => payload.text).filter((text, i, all) => all.indexOf(text) === i), ['Take heap snapshots.']);
    h.turn('Next one. Design a URL shortener.', 'r3', 'Use base62 IDs.');
    assert.equal(h.texts.at(-1).text, 'Use base62 IDs.');
    assert.equal(h.texts.at(-1).updated, false);
});

test('D15: a short "Yes" that answers an Ask is still answered', () => {
    const h = fillerRig();
    h.turn('Design a cache.', 'r1', 'Ask: Is it read heavy?');
    assert.equal(h.asks.at(-1).clarification, 'Is it read heavy?');
    h.turn('Yes.', 'r2', 'Then I would use a read-through cache.');
    assert.equal(h.texts.at(-1).text, 'Then I would use a read-through cache.');
});

test('D15: every realtime provider gets the mandatory filler rule', () => {
    const { buildProviderInstructions, FILLER_TURN_RULE } = require(`${dist}instructions.js`);
    for (const id of ['gemini-live', 'openai-realtime', 'elevenlabs-realtime']) {
        assert.ok(buildProviderInstructions({}, 'full', id).includes(FILLER_TURN_RULE), id);
    }
    assert.match(FILLER_TURN_RULE, /never repeat, continue, or rephrase your previous answer/);
});

test('D15: a bubble that starts as filler appears once it becomes a real question', () => {
    const h = chatRig();
    h.send({ type: 'interviewer_speech_started' });
    h.send({ type: 'interviewer_transcript', text: 'Okay,', final: false });
    assert.equal(h.shown.length, 0);
    h.send({ type: 'interviewer_transcript', text: 'Okay, short one. If Redis goes down?', final: false });
    assert.deepEqual(h.latest('q1'), { questionId: 'q1', text: 'Okay, short one. If Redis goes down?', done: false });
});

test('D15: a short reply to a waiting Ask is shown in the chat', () => {
    const h = chatRig();
    h.send({ type: 'interviewer_transcript', text: 'Design a cache.', final: true });
    h.send({ type: 'response_started', responseId: 'r1' });
    h.send({ type: 'response_delta', responseId: 'r1', text: 'Ask: Is it read heavy?' });
    h.send({ type: 'response_done', responseId: 'r1', status: 'completed' });
    h.send({ type: 'interviewer_speech_started' });
    h.send({ type: 'interviewer_transcript', text: 'Yes.', final: true });
    assert.equal(h.latest('q2').text, 'Yes.');
});
