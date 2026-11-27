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
    await brain.start({
        sessionId: 'test', instructions: '', recentTurns: [], signal: new AbortController().signal,
        notebook: { topics: [], currentTopic: null, requirements: [], constraints: [], clarifications: [], decisions: [], answered: [], summary: '', updatedAt: 0 },
    });
    let sequence = 0;
    const decision = (action, data = {}) => brain.emit({ type: 'decision', decisionId: `d${++sequence}`, action, at: clock.now(), ...data });
    return { brain, clock, calls, completions, orchestrator, decision };
}

test('an answer decision writes once; a second decision cancels the streaming draft and folds after replacement first text', async () => {
    const brain = new FakeLiveBrain();
    const clock = new FakeClock();
    const calls = [];
    const completions = [];
    const firstTextCallbacks = [];
    const orchestrator = new ResponseOrchestrator({
        clock,
        answerWriter: {
            write(req, opts) {
                calls.push(['write', req]);
                firstTextCallbacks.push(opts?.onFirstText);
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
    const decision = (action, data = {}) => brain.emit({ type: 'decision', decisionId: `d${calls.length + 1}`, action, at: clock.now(), ...data });

    decision('answer', { question });
    assert.deepEqual(calls, [['write', { question, replacesAutomaticAnswer: false }]]);
    decision('answer', { question: 'Use MongoDB for the catalog.' });
    // Old answer stays visible (not outdated) until replacement emits first text.
    assert.deepEqual(calls.slice(1), [
        ['cancel', 'answer_corrected'],
        ['write', { question: 'Use MongoDB for the catalog.', replacesAutomaticAnswer: true }],
    ]);
    firstTextCallbacks[1]?.(clock.now());
    assert.deepEqual(calls.at(-1), ['outdated', 1, true]);
    completions[0].resolve('cancelled');
    await flush();
    brain.emit({ type: 'interviewer_speech_started', at: clock.now() });
    assert.deepEqual(calls.at(-1), ['speaking', 2, true]);
});

for (const elapsed of [1_000, 10_000, 25_000]) {
    test(`Phase 3: a completed writer answer ${elapsed / 1000}s ago stays visible on an ordinary follow-up`, async () => {
        const h = await rig();
        h.decision('answer', { question });
        h.completions[0].resolve('completed');
        await flush();
        h.clock.advance(elapsed);
        h.decision('answer', { question: 'Add a replica.' });
        assert.deepEqual(h.calls.slice(1), [
            ['write', { question: 'Add a replica.', replacesAutomaticAnswer: false }],
        ]);
    });
}

test('ask folds an in-flight streaming answer and writes the asked question with an assumption after ten seconds', async () => {
    const h = await rig();
    h.decision('answer', { question });
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
            showAsk: () => { },
            setOutdated: () => { },
            setInterviewerSpeaking: () => { },
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
            showAsk: () => { }, setInterviewerSpeaking: () => { }, showQuestion: () => { },
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
            showAsk: () => { }, setInterviewerSpeaking: () => { }, showQuestion: () => { },
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
            showAsk: payload => asks.push(payload), setOutdated: () => { }, setInterviewerSpeaking: () => { }, showQuestion: () => { },
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

test('D17: AnswerWriter path suppresses filler while keeping answers, allows Yes on Ask, and pairs one question bubble on correction', async () => {
    const h = await rig();
    h.brain.emit({ type: 'interviewer_transcript', text: 'Design a cache.', final: true, at: h.clock.now() });
    h.decision('answer', { question: 'Design a cache.' });
    assert.deepEqual(h.calls.filter(([k]) => k === 'write'), [['write', { question: 'Design a cache.', replacesAutomaticAnswer: false }]]);

    // Filler during active answer clears speaking without cancelling or writing again.
    h.brain.emit({ type: 'interviewer_speech_started', at: h.clock.now() });
    h.decision('answer', { question: 'Mm-hmm.' });
    assert.equal(h.calls.filter(([k]) => k === 'write').length, 1);
    assert.equal(h.calls.filter(([k]) => k === 'cancel').length, 0);
    assert.deepEqual(h.calls.at(-1), ['speaking', 1, false]);

    // Correction supersedes and cancels generation 1.
    h.brain.emit({ type: 'interviewer_transcript', text: 'Actually, no Redis.', final: true, at: h.clock.now() });
    h.decision('answer', { question: 'Actually, no Redis.' });
    assert.ok(h.calls.some(([k, r]) => k === 'cancel' && r === 'answer_corrected'));
    assert.equal(h.calls.filter(([k]) => k === 'write').length, 2);

    // Pending Ask allows short "Yes." reply through to AnswerWriter.
    h.completions[1].resolve('completed');
    await flush();
    h.decision('ask', { question: 'Design a cache.', clarification: 'Read heavy?' });
    h.decision('answer', { question: 'Yes.' });
    assert.equal(h.calls.filter(([k]) => k === 'write').length, 3);
    assert.equal(h.calls.filter(([k]) => k === 'write').at(-1)[1].question, 'Yes.');
});

test('Phase 2: ResponseOrchestrator skips empty/filler eager turns, allows Yes on Ask, and cancels drafts on TurnResumed/reset', async () => {
    const brain = new FakeLiveBrain();
    const clock = new FakeClock();
    const calls = [];
    const completions = [];
    const orchestrator = new ResponseOrchestrator({
        clock,
        answerWriter: {
            prepareDraft: req => { calls.push(['prepareDraft', req]); return true; },
            cancelDraft: (reason, turnKey) => { calls.push(['cancelDraft', reason, turnKey]); return true; },
            write(req) {
                calls.push(['write', req]);
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
            showQuestion: payload => calls.push(['question', payload]),
            showText: payload => calls.push(['text', payload]),
        },
    });
    brain.onEvent(event => orchestrator.handleEvent(event));
    await brain.start({
        sessionId: 'test', instructions: '', recentTurns: [], signal: new AbortController().signal,
        notebook: { topics: [], currentTopic: null, requirements: [], constraints: [], clarifications: [], decisions: [], answered: [], summary: '', updatedAt: 0 },
    });

    // Empty and filler eager turns must not start drafts or touch active state.
    brain.emit({ type: 'eager_end_of_turn', turnKey: 'c1:t0', question: '   ', at: clock.now() });
    brain.emit({ type: 'eager_end_of_turn', turnKey: 'c1:t0', question: 'Mm-hmm.', at: clock.now() });
    assert.equal(calls.filter(([k]) => k === 'prepareDraft').length, 0);

    // Meaningful eager turn prepares draft, TurnResumed cancels it, fresh eager prepares again, decision writes with turnKey.
    brain.emit({ type: 'eager_end_of_turn', turnKey: 'c1:t1', question: 'How does', at: clock.now() });
    brain.emit({ type: 'turn_resumed', turnKey: 'c1:t1', at: clock.now() });
    brain.emit({ type: 'eager_end_of_turn', turnKey: 'c1:t1', question: 'How does caching work?', at: clock.now() });
    brain.emit({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'How does caching work?', turnKey: 'c1:t1', at: clock.now() });
    assert.deepEqual(calls.filter(([k]) => k === 'prepareDraft' || k === 'cancelDraft' || k === 'write'), [
        ['prepareDraft', { turnKey: 'c1:t1', question: 'How does' }],
        ['cancelDraft', 'turn_resumed', 'c1:t1'],
        ['prepareDraft', { turnKey: 'c1:t1', question: 'How does caching work?' }],
        ['write', { question: 'How does caching work?', replacesAutomaticAnswer: false, turnKey: 'c1:t1' }],
    ]);

    // Pending Ask exception: "Yes." IS eligible for early drafting.
    completions[0].resolve('completed');
    await flush();
    brain.emit({ type: 'decision', decisionId: 'd2', action: 'ask', question: 'Use Redis?', clarification: 'In-memory?', at: clock.now() });
    brain.emit({ type: 'eager_end_of_turn', turnKey: 'c1:t2', question: 'Yes.', at: clock.now() });
    assert.deepEqual(calls.filter(([k]) => k === 'prepareDraft').at(-1), ['prepareDraft', { turnKey: 'c1:t2', question: 'Yes.' }]);

    // Meeting end / reset cancels any active draft cleanly.
    orchestrator.reset();
    assert.ok(calls.some(([k, reason]) => k === 'cancelDraft' && reason === 'auto_disabled_or_meeting_ended'));
});

test('Phase 3: Flux/Gemini filler variants and initial M partial are suppressed, while filler-like real questions pass', () => {
    const { isFillerOnly } = require(`${dist}ResponseOrchestrator.js`);
    for (const filler of ['MM.', 'mm', 'M.M.', 'M.M', 'Mhmm.', 'M', 'M.', 'Mmm...', 'Mm, okay.']) {
        assert.equal(isFillerOnly(filler), true, `expected filler: ${filler}`);
    }
    for (const real of ['MySQL?', 'MongoDB or Postgres?', 'M.I.T.?', 'Make it stateless.', 'Memory limit?', 'Okay, how does caching work?', 'Yes, what about offline?']) {
        assert.equal(isFillerOnly(real), false, `expected real question: ${real}`);
    }
});

test('Phase 3: initial M partial growing into a real question shows normally, while M -> MM. stays hidden', async () => {
    const h = await rig();
    const shownQuestions = [];
    const clock = new FakeClock();
    const brain = new FakeLiveBrain();
    const completions = [];
    const orchestrator = new ResponseOrchestrator({
        clock,
        answerWriter: {
            write(req) {
                const completion = Promise.withResolvers();
                completions.push(completion);
                return { generationId: completions.length, done: completion.promise };
            },
            cancel: () => { },
        },
        overlay: {
            showAsk: () => { },
            setOutdated: () => { },
            setInterviewerSpeaking: () => { },
            showQuestion: q => shownQuestions.push(q),
            showText: () => { },
        },
    });
    brain.onEvent(e => orchestrator.handleEvent(e));
    await brain.start({
        sessionId: 'test', instructions: '', recentTurns: [], signal: new AbortController().signal,
        notebook: { topics: [], currentTopic: null, requirements: [], constraints: [], clarifications: [], decisions: [], answered: [], summary: '', updatedAt: 0 },
    });

    // 1. "M" -> "MM." stays completely hidden
    brain.emit({ type: 'interviewer_transcript', text: 'M', final: false, at: 10 });
    brain.emit({ type: 'interviewer_transcript', text: 'MM.', final: true, at: 20 });
    brain.emit({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'MM.', at: 21 });
    assert.equal(shownQuestions.length, 0);
    assert.equal(completions.length, 0);

    // 2. "M" -> "Make it stateless." shows once it grows past filler
    brain.emit({ type: 'interviewer_transcript', text: 'M', final: false, at: 30 });
    assert.equal(shownQuestions.length, 0);
    brain.emit({ type: 'interviewer_transcript', text: 'Make it stateless.', final: true, at: 40 });
    assert.equal(shownQuestions.length, 1);
    assert.equal(shownQuestions[0].text, 'Make it stateless.');
    brain.emit({ type: 'decision', decisionId: 'd2', action: 'answer', question: 'Make it stateless.', at: 41 });
    assert.equal(completions.length, 1);
});

test('Phase 3: replacement failure before showing text restores outdated flag; repeated corrections preserve original until text arrives', async () => {
    const brain = new FakeLiveBrain();
    const clock = new FakeClock();
    const calls = [];
    const completions = [];
    const firstTextCallbacks = [];
    const orchestrator = new ResponseOrchestrator({
        clock,
        answerWriter: {
            write(req, opts) {
                calls.push(['write', req]);
                firstTextCallbacks.push(opts?.onFirstText);
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
    brain.onEvent(e => orchestrator.handleEvent(e));
    await brain.start({
        sessionId: 'test', instructions: '', recentTurns: [], signal: new AbortController().signal,
        notebook: { topics: [], currentTopic: null, requirements: [], constraints: [], clarifications: [], decisions: [], answered: [], summary: '', updatedAt: 0 },
    });

    // Answer 1 starts and is superseded by Correction 1, then Correction 2 before text arrives.
    brain.emit({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'Use Redis?', at: 10 });
    brain.emit({ type: 'decision', decisionId: 'd2', action: 'answer', question: 'Actually no cache.', at: 20 });
    brain.emit({ type: 'decision', decisionId: 'd3', action: 'answer', question: 'Actually use SQLite.', at: 30 });
    completions[0].resolve('cancelled');
    completions[1].resolve('cancelled');
    await flush();

    // Generation 3 fails BEFORE showing any text -> Generation 1 was never marked outdated!
    completions[2].resolve('failed');
    await flush();
    assert.deepEqual(calls.filter(([k]) => k === 'outdated'), []);

    // Once a replacement DOES show text, outdated is set on the superseded answer.
    brain.emit({ type: 'decision', decisionId: 'd4', action: 'answer', question: 'Q1', at: 40 });
    brain.emit({ type: 'decision', decisionId: 'd5', action: 'answer', question: 'Q2', at: 50 });
    completions[3].resolve('cancelled');
    assert.deepEqual(calls.filter(([k]) => k === 'outdated'), []);
    firstTextCallbacks[4]?.(55);
    completions[4].resolve('failed');
    await flush();
    assert.deepEqual(calls.filter(([k]) => k === 'outdated'), [
        ['outdated', 4, true],
    ]);
});

test('Phase 4: clarification expiry, unrelated question consumption, reconnect reset, and stale-context draft discard', async () => {
    const brain = new FakeLiveBrain();
    const clock = new FakeClock();
    const calls = [];
    const completions = [];
    let baseNotebook = 'nb1';
    let constraints = ['use Redis'];
    const orchestrator = new ResponseOrchestrator({
        clock,
        getContextSnapshot: () => ({ baseNotebook, constraints }),
        answerWriter: {
            prepareDraft: req => { calls.push(['prepareDraft', req]); return true; },
            cancelDraft: (reason, turnKey) => { calls.push(['cancelDraft', reason, turnKey]); return true; },
            write(req, opts) {
                calls.push(['write', req, opts?.liveBrainNotebook, opts?.contextKey]);
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
            showQuestion: () => {},
            showText: () => {},
        },
    });
    brain.onEvent(e => orchestrator.handleEvent(e));
    await brain.start({
        sessionId: 'test', instructions: '', recentTurns: [], signal: new AbortController().signal,
        notebook: { topics: [], currentTopic: null, requirements: [], constraints: [], clarifications: [], decisions: [], answered: [], summary: '', updatedAt: 0 },
    });

    // 1. Clarification expires after 10s -> subsequent "Yes." is suppressed as standalone filler.
    brain.emit({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'Can the cache serve from disk?', turnKey: 'c1:t0', at: 10 });
    completions[0].resolve('completed');
    await flush();
    orchestrator.noteWriterClarification('Can the cache serve from disk?', 'Is disk latency acceptable?');
    clock.advance(10_000); // fires timeout fallback (write #2) and clears pendingClarification
    completions[1].resolve('completed');
    await flush();
    const writesBeforeYes = completions.length;
    brain.emit({ type: 'decision', decisionId: 'd2', action: 'answer', question: 'Yes.', turnKey: 'c1:t1', at: 10_010 });
    assert.equal(completions.length, writesBeforeYes, 'expired clarification must not accept standalone Yes.');

    // 2. Unrelated question consumes pending clarification without attaching it.
    orchestrator.noteWriterClarification('Can the cache serve from disk?', 'Is disk latency acceptable?');
    brain.emit({ type: 'decision', decisionId: 'd3', action: 'answer', question: 'How does consistent hashing work?', turnKey: 'c1:t2', at: 10_020 });
    const unrelatedCall = calls.filter(([k]) => k === 'write').at(-1);
    assert.equal(unrelatedCall[2], '');
    completions[2].resolve('completed');
    await flush();

    // 3. Reconnect (endProviderTurn) clears pending clarification.
    orchestrator.noteWriterClarification('Can the cache serve from disk?', 'Is disk latency acceptable?');
    orchestrator.endProviderTurn();
    const writesBeforeReconnectYes = completions.length;
    brain.emit({ type: 'decision', decisionId: 'd4', action: 'answer', question: 'Yes.', turnKey: 'c2:t0', at: 10_030 });
    assert.equal(completions.length, writesBeforeReconnectYes, 'endProviderTurn must clear pending clarification');

    // 4. Context change (clarification expiry) between EagerEndOfTurn and EndOfTurn updates contextKey.
    brain.emit({ type: 'decision', decisionId: 'd5', action: 'answer', question: 'Can the cache serve from disk?', turnKey: 'c2:t1', at: 10_040 });
    completions[3].resolve('completed');
    await flush();
    orchestrator.noteWriterClarification('Can the cache serve from disk?', 'Is disk latency acceptable?');
    brain.emit({ type: 'eager_end_of_turn', turnKey: 'c2:t2', question: 'Yes, disk is fine.', at: 10_050 });
    const draftCall = calls.filter(([k]) => k === 'prepareDraft').at(-1);
    assert.match(draftCall[1].contextKey, /clarification_reply/);
    clock.advance(10_000); // clarification expires before EndOfTurn
    completions[4].resolve('completed');
    await flush();
    brain.emit({ type: 'decision', decisionId: 'd6', action: 'answer', question: 'Yes, disk is fine.', turnKey: 'c2:t2', at: 20_060 });
    const confirmedCall = calls.filter(([k]) => k === 'write').at(-1);
    assert.doesNotMatch(confirmedCall[3], /clarification_reply/);
    assert.notEqual(draftCall[1].contextKey, confirmedCall[3]);
});
