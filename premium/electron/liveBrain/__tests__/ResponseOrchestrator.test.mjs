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
    // The first answer has shown text, so its replacement folds it.
    firstTextCallbacks[0]?.(clock.now());
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
    const latest = id => shown.filter(payload => payload.questionId === id || payload.questionId.endsWith(`:${id}`)).at(-1);
    const firstAnswer = () => order.find(([kind]) => kind === 'answer')[1];
    return { clock, shown, order, orchestrator, send, latest, firstAnswer };
}

test('D14: the provider transcript streams into one bubble that closes when its answer starts', () => {
    const h = chatRig();
    h.send({ type: 'interviewer_speech_started' });
    h.send({ type: 'interviewer_transcript', text: 'How would', final: false });
    h.send({ type: 'interviewer_transcript', text: 'How would you design a cache?', final: false });
    assert.equal(h.latest('q1').text, 'How would you design a cache?');
    assert.equal(h.latest('q1').done, false);
    h.send({ type: 'interviewer_transcript', text: 'How would you design a cache?', final: true });
    h.send({ type: 'response_started', responseId: 'r1' });
    h.send({ type: 'response_delta', responseId: 'r1', text: 'I would use Redis.' });
    const generationId = h.firstAnswer();
    assert.equal(h.latest('q1').text, 'How would you design a cache?');
    assert.equal(h.latest('q1').done, true);
    assert.equal(h.latest('q1').generationId, generationId);
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
    assert.equal(h.latest('q1').text, 'How do you scale writes?');
    assert.equal(h.latest('q1').done, true);
    assert.equal(h.latest('q1').generationId, generationId);
});

test('D14: the STT final fills a bubble only when the provider sent no transcript; provider text replaces it', () => {
    const h = chatRig();
    h.orchestrator.noteSttTranscript('How do you scale reads?', h.clock.now());
    h.send({ type: 'response_started', responseId: 'r1' });
    h.send({ type: 'response_delta', responseId: 'r1', text: 'Replicas.' });
    const generationId = h.firstAnswer();
    assert.equal(h.latest('q1').text, 'How do you scale reads?');
    assert.equal(h.latest('q1').done, true);
    assert.equal(h.latest('q1').generationId, generationId);
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

test('D15: every answer-generating realtime provider gets one filler directive', () => {
    const { buildProviderInstructions, FILLER_TURN_RULE } = require(`${dist}instructions.js`);
    const providers = [
        ['gemini-live'], ['openai-realtime'], ['elevenlabs-realtime'], ['amazon-sonic'],
        ['deepgram-voice-agent', 'managed'], ['deepgram-voice-agent', 'byo'],
    ];
    for (const variant of ['full', 'trimmed']) {
        for (const [id, thinkMode] of providers) {
            const prompt = buildProviderInstructions({}, variant, id, thinkMode);
            assert.ok(prompt.includes(FILLER_TURN_RULE), id);
            assert.equal(prompt.match(/MANDATORY FILLER RULE/g)?.length, 1, id);
            assert.equal(prompt.match(/No action\./g)?.length, 1, id);
            assert.ok(!prompt.includes('[[NO_ACTION]]'), id);
            assert.ok(prompt.includes('that reply is NOT filler — answer the original question using it.'), id);
        }
    }
    assert.match(FILLER_TURN_RULE, /never repeat, continue, or rephrase your previous answer/);
});

test('D15: a bubble that starts as filler appears once it becomes a real question', () => {
    const h = chatRig();
    h.send({ type: 'interviewer_speech_started' });
    h.send({ type: 'interviewer_transcript', text: 'Okay,', final: false });
    assert.equal(h.shown.length, 0);
    h.send({ type: 'interviewer_transcript', text: 'Okay, short one. If Redis goes down?', final: false });
    assert.equal(h.latest('q1').text, 'Okay, short one. If Redis goes down?');
    assert.equal(h.latest('q1').done, false);
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
    for (const filler of ['MM.', 'mm', 'M.M.', 'M.M', 'Mhmm.', 'M', 'M.', 'A', 'A.', 'Mmm...', 'Mm, okay.']) {
        assert.equal(isFillerOnly(filler), true, `expected filler: ${filler}`);
    }
    for (const real of ['MySQL?', 'MongoDB or Postgres?', 'M.I.T.?', 'Make it stateless.', 'Memory limit?', 'A?', 'A cache?', 'A B-tree?', 'Okay, how does caching work?', 'Yes, what about offline?']) {
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
    brain.emit({ type: 'decision', decisionId: 'd4', action: 'answer', question: 'How do you shard it?', at: 40 });
    firstTextCallbacks[3]?.(45);
    brain.emit({ type: 'decision', decisionId: 'd5', action: 'answer', question: 'How do you replicate it?', at: 50 });
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
    assert.doesNotMatch(unrelatedCall[2], /clarification_reply|Is disk latency acceptable/);
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

test('F-1: summary refinement landing between eager draft and final decision reuses draft snapshot and matches contextKey', () => {
    const clock = new FakeClock();
    const calls = [];
    let baseNotebook = 'Earlier context: initial summary v1';
    const orchestrator = new ResponseOrchestrator({
        clock,
        getContextSnapshot: () => ({ baseNotebook, constraints: [], groundingKey: 'g1' }),
        answerWriter: {
            prepareDraft: req => { calls.push(['prepareDraft', req]); return true; },
            write: (req, opts) => {
                calls.push(['write', req, opts]);
                return { generationId: 1, done: Promise.resolve('completed') };
            },
            cancel: () => {},
        },
        overlay: { showAsk: () => {}, setOutdated: () => {}, setInterviewerSpeaking: () => {}, showText: () => {} },
    });
    orchestrator.handleEvent({ type: 'eager_end_of_turn', turnKey: 'c1:t0', question: 'How does Raft elect a leader?', at: 10 });
    const draft = calls.find(([k]) => k === 'prepareDraft')[1];
    // Background summarizer updates baseNotebook before EndOfTurn.
    baseNotebook = 'Earlier context: refined summary v2';
    orchestrator.handleEvent({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'How does Raft elect a leader?', turnKey: 'c1:t0', at: 20 });
    const confirmed = calls.find(([k]) => k === 'write')[2];
    assert.equal(confirmed.contextKey, draft.contextKey);
    assert.equal(confirmed.liveBrainNotebook, draft.liveBrainNotebook);
});

test('U7-1: toggling off and on creates non-colliding namespaced question ids', () => {
    const clock = new FakeClock();
    const shownA = [];
    const shownB = [];
    const a = new ResponseOrchestrator({
        sessionId: 'same-meeting',
        clock,
        overlay: { showAsk: () => {}, setOutdated: () => {}, setInterviewerSpeaking: () => {}, showQuestion: q => shownA.push(q), showText: () => {} },
    });
    const b = new ResponseOrchestrator({
        sessionId: 'same-meeting',
        clock,
        overlay: { showAsk: () => {}, setOutdated: () => {}, setInterviewerSpeaking: () => {}, showQuestion: q => shownB.push(q), showText: () => {} },
    });
    a.handleEvent({ type: 'interviewer_transcript', text: 'First question?', final: true, at: 1 });
    b.handleEvent({ type: 'interviewer_transcript', text: 'Second question?', final: true, at: 2 });
    assert.notEqual(shownA[0].questionId, shownB[0].questionId);
});

test('U7-2: delta before transcript then filler retracts provisional card, and write() never reuses closed bubble', () => {
    const clock = new FakeClock();
    const discards = [];
    const shownQuestions = [];
    const writeOpts = [];
    const orchestrator = new ResponseOrchestrator({
        clock,
        answerWriter: {
            write: (_req, opts) => {
                writeOpts.push(opts);
                return { generationId: writeOpts.length, done: Promise.resolve('completed') };
            },
            cancel: () => {},
        },
        overlay: {
            showAsk: () => {},
            setOutdated: () => {},
            setInterviewerSpeaking: () => {},
            showQuestion: q => shownQuestions.push(q),
            showText: () => {},
            discard: (generationId, reason) => discards.push({ generationId, reason }),
        },
    });
    // Provisional text starts with no bubble, then filler final arrives within 1.5s -> retracted.
    orchestrator.handleEvent({ type: 'response_started', responseId: 'r1', at: 10 });
    orchestrator.handleEvent({ type: 'response_delta', responseId: 'r1', text: 'Sure, let me explain.' });
    clock.advance(500);
    orchestrator.handleEvent({ type: 'interviewer_transcript', text: 'Mm-hmm.', final: true, at: 510 });
    assert.equal(discards.length, 1);
    assert.equal(discards[0].reason, 'filler_turn');
    assert.equal(shownQuestions.length, 0);

    // Closed silent bubble must not be reused by a subsequent write().
    orchestrator.handleEvent({ type: 'interviewer_transcript', text: 'Ignored silent?', final: true, at: 600 });
    orchestrator.handleEvent({ type: 'response_silent' });
    orchestrator.handleEvent({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'Actual question?', at: 700 });
    assert.equal(writeOpts.at(-1)?.suppressQuestionRow, undefined);
});

test('U7-3: manual/rollover cancel is not marked outdated, cancelled is not recorded, and Sonic finalText updates disposition and final row', () => {
    const clock = new FakeClock();
    const outdated = [];
    const texts = [];
    const orchestrator = new ResponseOrchestrator({
        clock,
        overlay: {
            showAsk: () => {},
            setOutdated: (genId, flag) => outdated.push([genId, flag]),
            setInterviewerSpeaking: () => {},
            showText: p => texts.push(p),
        },
    });
    orchestrator.handleEvent({ type: 'response_started', responseId: 'r1', at: 10 });
    orchestrator.handleEvent({ type: 'response_delta', responseId: 'r1', text: 'Partial answer' });
    const cancelDisp = orchestrator.handleEvent({ type: 'response_done', responseId: 'r1', status: 'cancelled', cancelReason: 'manual' });
    assert.deepEqual(cancelDisp, { kind: 'suppressed' });
    orchestrator.handleEvent({ type: 'response_started', responseId: 'r2', at: 20 });
    orchestrator.handleEvent({ type: 'response_delta', responseId: 'r2', text: 'Streamed draft' });
    const sonicDisp = orchestrator.handleEvent({ type: 'response_done', responseId: 'r2', status: 'completed', finalText: 'Authoritative Sonic final.' });
    assert.deepEqual(sonicDisp, { kind: 'answer', text: 'Authoritative Sonic final.' });
    assert.equal(outdated.length, 0);
    assert.equal(texts.at(-1).text, 'Authoritative Sonic final.');
    assert.equal(texts.at(-1).done, true);
});

test('U7-4: Flux completed answer followed by a correction 10 s later marks previous answer outdated', async () => {
    const h = await rig();
    h.brain.emit({ type: 'interviewer_transcript', text: 'Design a cache.', final: true, at: h.clock.now() });
    h.decision('answer', { question: 'Design a cache.' });
    h.completions[0].resolve('completed');
    await flush();
    h.clock.advance(10_000);
    h.brain.emit({ type: 'interviewer_transcript', text: 'Actually, without Redis.', final: true, at: h.clock.now() });
    h.decision('answer', { question: 'Actually, without Redis.' });
    assert.ok(h.calls.some(([k, req]) => k === 'write' && req.question === 'Actually, without Redis.' && req.replacesAutomaticAnswer === true));
});

function interruptRig() {
    const clock = new FakeClock();
    const calls = [];
    const runs = [];
    const orchestrator = new ResponseOrchestrator({
        clock,
        answerWriter: {
            write(request, options) {
                calls.push(['write', request]);
                const completion = Promise.withResolvers();
                runs.push({ request, options, completion });
                return { generationId: runs.length, done: completion.promise };
            },
            cancel: reason => {
                calls.push(['cancel', reason]);
                runs.at(-1)?.completion.resolve('cancelled');
            },
        },
        overlay: {
            showAsk: () => {}, showText: () => {}, showQuestion: () => {},
            setInterviewerSpeaking: () => {},
            setOutdated: (...args) => calls.push(['outdated', ...args]),
        },
    });
    const send = event => orchestrator.handleEvent({ at: clock.now(), ...event });
    return { calls, runs, send };
}

test('Flux barge-in: a real interviewer partial stops the streaming answer; filler does not', async () => {
    const h = interruptRig();
    h.send({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'Tell me about a project you built.', turnKey: 'c1:t0' });
    h.runs[0].options.onFirstText(1);
    h.send({ type: 'interviewer_speech_started' });
    h.send({ type: 'interviewer_barge_in_candidate', text: 'Take your time.' });
    h.send({ type: 'interviewer_barge_in_candidate', text: 'Mm-hmm' });
    assert.equal(h.calls.filter(([k]) => k === 'cancel').length, 0);
    h.send({ type: 'interviewer_barge_in_candidate', text: 'Okay, what was the hardest' });
    assert.deepEqual(h.calls.filter(([k]) => k === 'cancel'), [['cancel', 'interviewer_interrupted']]);
    await flush();
    // The confirmed turn folds the interrupted answer (it showed text) and answers only the new question.
    h.send({ type: 'decision', decisionId: 'd2', action: 'answer', question: 'Okay, what was the hardest decision in that project?', turnKey: 'c1:t1' });
    assert.equal(h.runs.length, 2);
    assert.equal(h.runs[1].request.replacesAutomaticAnswer, true);
    h.runs[1].options.onFirstText(2);
    assert.deepEqual(h.calls.filter(([k]) => k === 'outdated'), [['outdated', 1, true]]);
});

test('Flux: an answer replaced before its first word is not marked outdated', async () => {
    const h = interruptRig();
    h.send({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'What is a project that handled user traffic?', turnKey: 'c1:t0' });
    h.send({ type: 'decision', decisionId: 'd2', action: 'answer', question: 'What was the hardest decision in that project?', turnKey: 'c1:t1' });
    h.runs[1].options.onFirstText(2);
    await flush();
    assert.equal(h.calls.filter(([k]) => k === 'outdated').length, 0);
});

test('Flux: single-word fragments and polite asides are filler', () => {
    const { isFillerOnly, isNonQuestionTurn } = require(`${dist}ResponseOrchestrator.js`);
    for (const filler of ['K.', 'Take your time.', 'Okay. Go ahead.', 'Sure, no problem.', 'That makes sense.']) {
        assert.equal(isFillerOnly(filler), true, filler);
    }
    for (const fragment of ['I', 'So.', 'K.', 'Take your time.']) {
        assert.equal(isNonQuestionTurn(fragment), true, fragment);
    }
    // A one-word clarification reply stays meaningful to the notebook.
    assert.equal(isFillerOnly('Tokyo.'), false);
    for (const real of ['Redis?', 'Why?', 'Take your time and explain caching.', 'I want to ask about caching.']) {
        assert.equal(isNonQuestionTurn(real), false, real);
    }
});

test('Flux barge-in: two real words stop the answer, a lone word does not', async () => {
    const h = interruptRig();
    h.send({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'Tell me about a project you built.', turnKey: 'c1:t0' });
    h.runs[0].options.onFirstText(1);
    h.send({ type: 'interviewer_barge_in_candidate', text: 'Nice' });
    assert.equal(h.calls.filter(([k]) => k === 'cancel').length, 0);
    // A lone word confirmed while the answer streams is dropped, so it cannot cancel it.
    h.send({ type: 'decision', decisionId: 'd2', action: 'answer', question: 'Nice.', turnKey: 'c1:t1' });
    assert.equal(h.runs.length, 1);
    h.send({ type: 'interviewer_barge_in_candidate', text: 'How did' });
    assert.deepEqual(h.calls.filter(([k]) => k === 'cancel'), [['cancel', 'interviewer_interrupted']]);
});

test('Flux: a lone word with no answer streaming goes to the model, which decides (No action or answer)', () => {
    const h = interruptRig();
    h.send({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'Kubernetes', turnKey: 'c1:t0' });
    assert.equal(h.runs.length, 1);
    // Clear filler never reaches the model.
    h.send({ type: 'decision', decisionId: 'd2', action: 'answer', question: 'Okay, got it.', turnKey: 'c1:t1' });
    assert.equal(h.runs.length, 1);
});

test('Flux history: the provider sees the last answered turns, oldest dropped first', async () => {
    const runs = [];
    const orchestrator = new ResponseOrchestrator({
        clock: new FakeClock(),
        getContextSnapshot: () => ({ baseNotebook: '', constraints: [] }),
        answerWriter: {
            write(request, options) {
                const completion = Promise.withResolvers();
                runs.push({ request, options, completion });
                return { generationId: runs.length, done: completion.promise };
            },
            cancel: () => {},
        },
        overlay: { showAsk() {}, showText() {}, showQuestion() {}, setInterviewerSpeaking() {}, setOutdated() {} },
    });
    for (let i = 1; i <= 6; i++) {
        orchestrator.handleEvent({ type: 'decision', decisionId: `d${i}`, action: 'answer', question: `Question number ${i}?`, turnKey: `c1:t${i}`, at: i * 100 });
        if (i < 6) {
            orchestrator.noteWriterAnswer(`Answer number ${i}.`);
            runs.at(-1).completion.resolve('completed');
            await flush();
        }
    }
    const context = runs.at(-1).options.liveBrainNotebook;
    assert.match(context, /<turn_context kind="conversation">/);
    assert.doesNotMatch(context, /Question number 1\?/);
    assert.match(context, /Q1: Question number 2\?\nA1: Answer number 2\./);
    assert.match(context, /Q4: Question number 5\?\nA4: Answer number 5\./);
    assert.match(context, /Current interviewer turn: Question number 6\?/);
});

function interruptionRig() {
    const clock = new FakeClock();
    const events = [];
    const orchestrator = new ResponseOrchestrator({
        clock, requestClarificationAnswer: () => events.push(['assumption']),
        overlay: {
            showAsk: value => events.push(['ask', value]),
            showQuestion: value => events.push(['question', value]),
            showText: value => events.push(['text', value]),
            discard: (...args) => events.push(['discard', ...args]),
            setOutdated: (...args) => events.push(['outdated', ...args]),
            setInterviewerSpeaking: (...args) => events.push(['speaking', ...args]),
        },
    });
    const send = (type, fields = {}) => orchestrator.handleEvent({ type, at: clock.now(), ...fields });
    const start = responseId => send('response_started', { responseId });
    const delta = (responseId, text) => send('response_delta', { responseId, text });
    const done = (responseId, status = 'completed', fields = {}) => send('response_done', { responseId, status, ...fields });
    const transcript = (text, fields = {}) => send('interviewer_transcript', { text, final: true, ...fields });
    return { clock, events, orchestrator, send, start, delta, done, transcript };
}

test('Sonic final control messages replace speculative prose with their real output kind', () => {
    for (const [finalText, expected] of [
        ['No action.', { kind: 'suppressed' }],
        ['Ask: Which database?', { kind: 'ask', text: 'Which database?' }],
    ]) {
        const h = interruptionRig();
        h.start('sonic');
        h.delta('sonic', 'A speculative answer.');
        assert.deepEqual(h.done('sonic', 'completed', { finalText }), expected);
        assert.equal(h.events.filter(([name]) => name === 'discard').length, 1);
        assert.equal(h.events.some(([name, value]) => name === 'text' && value.done), false);
        assert.equal(h.events.some(([name, value]) => name === 'ask' && value.askStreaming === false), expected.kind === 'ask');
    }
});

test('OpenAI late finals are put above their own answers by input item', () => {
    const h = interruptionRig();
    for (const id of ['a', 'b']) {
        h.send('interviewer_speech_started', { itemId: id });
        h.clock.advance(100);
        h.send('interviewer_speech_stopped', { itemId: id });
        h.start(id);
        h.delta(id, 'Answer text.');
        h.done(id);
        h.clock.advance(100);
    }
    h.transcript('Second question?', { itemId: 'b' });
    h.transcript('First question?', { itemId: 'a' });
    const generations = h.events.filter(([kind, value]) => kind === 'text' && value.done).map(([, value]) => value.generationId);
    const questions = h.events.filter(([kind]) => kind === 'question').map(([, value]) => [value.generationId, value.text]);
    assert.deepEqual(questions, [[generations[1], 'Second question?'], [generations[0], 'First question?']]);
});

test('Late system STT uses the captured interval of the earlier question', () => {
    const h = interruptionRig();
    h.send('interviewer_speech_started');
    h.clock.advance(100);
    const capturedAt = h.clock.now();
    h.send('interviewer_speech_stopped');
    h.start('a');
    h.delta('a', 'First answer.');
    h.done('a');
    h.clock.advance(500);
    h.send('interviewer_speech_started');
    h.clock.advance(100);
    h.send('interviewer_speech_stopped');
    h.start('b');
    h.delta('b', 'Second answer.');
    h.orchestrator.noteSttTranscript('First question?', h.clock.now(), capturedAt);
    const firstGeneration = h.events.find(([kind]) => kind === 'text')[1].generationId;
    assert.equal(h.events.findLast(([kind]) => kind === 'question')[1].generationId, firstGeneration);
});

function interruptWithBackchannel(h) {
    h.transcript('First question?');
    h.start('first');
    h.delta('first', 'A partial answer.');
    h.send('interviewer_speech_started');
    h.done('first', 'cancelled', { cancelReason: 'interviewer_barge_in' });
}

test('Late filler restores the previous answer and retracts the duplicate', () => {
    const h = interruptionRig();
    interruptWithBackchannel(h);
    h.start('duplicate');
    h.delta('duplicate', 'A duplicate answer.');
    h.transcript('Mm-hmm.');
    assert.deepEqual(h.events.filter(([kind]) => kind === 'outdated').map(([, , flag]) => flag), [true, false]);
    assert.equal(h.events.filter(([kind]) => kind === 'discard').length, 1);
    assert.deepEqual(h.done('duplicate'), { kind: 'suppressed' });
});

test('Filler after the provisional window cannot enter notebook history', () => {
    const h = interruptionRig();
    interruptWithBackchannel(h);
    h.start('duplicate');
    h.delta('duplicate', 'A duplicate answer.');
    h.clock.advance(2000);
    assert.deepEqual(h.done('duplicate'), { kind: 'suppressed' });
    h.transcript('Mm-hmm.');
    assert.equal(h.events.filter(([kind]) => kind === 'discard').length, 1);
});

test('Known filler clears the interviewer speaking marker for suppressed prose', () => {
    const h = interruptionRig();
    interruptWithBackchannel(h);
    h.transcript('Right.');
    h.start('duplicate');
    h.delta('duplicate', 'A duplicate answer.');
    h.done('duplicate');
    assert.equal(h.events.findLast(([kind]) => kind === 'speaking')[2], false);
});

test('Filler clears the cutoff before a later real question', () => {
    const h = interruptionRig();
    interruptWithBackchannel(h);
    h.transcript('Right.');
    h.start('filler');
    h.delta('filler', 'No action.');
    h.done('filler');
    h.clock.advance(2000);
    h.send('interviewer_speech_started');
    h.transcript('A different question?');
    h.start('new');
    h.delta('new', 'A new answer.');
    assert.equal(h.events.some(([kind]) => kind === 'outdated'), false);
});

test('Cancelled streaming Ask does not turn a later backchannel into a reply', () => {
    const h = interruptionRig();
    h.start('ask'); h.delta('ask', 'Ask: Which database');
    h.send('interviewer_speech_started');
    h.done('ask', 'cancelled');
    h.transcript('Mm-hmm.');
    h.start('filler'); h.delta('filler', 'A duplicate answer.'); h.done('filler');
    assert.equal(h.events.some(([kind]) => kind === 'text' || kind === 'question'), false);
});

test('Silent filler keeps a completed Ask available for a short reply and its assumption timer', () => {
    for (const receiveReply of [true, false]) {
        const h = interruptionRig();
        h.start('ask'); h.delta('ask', 'Ask: Which database?'); h.done('ask');
        h.clock.advance(500);
        h.send('interviewer_speech_started'); h.transcript('Mm-hmm.');
        h.send('interviewer_speech_stopped'); h.send('response_silent');
        if (receiveReply) {
            h.send('interviewer_speech_started'); h.transcript('Yes.');
            h.send('interviewer_speech_stopped');
            h.start('reply'); h.delta('reply', 'Use the existing database.'); h.done('reply');
            assert.ok(h.events.some(([kind, value]) => kind === 'question' && value.text === 'Yes.'));
        }
        h.clock.advance(10_000);
        assert.equal(h.events.some(([kind]) => kind === 'assumption'), !receiveReply);
    }
});

test('Flux counts substantive words in an Update without waiting for the bubble', () => {
    const h = interruptRig();
    h.send({ type: 'decision', action: 'answer', question: 'Old question?' });
    h.send({ type: 'interviewer_barge_in_candidate', text: 'Okay, Postgres' });
    assert.equal(h.calls.some(([kind]) => kind === 'cancel'), false);
    h.send({ type: 'interviewer_barge_in_candidate', text: 'Use Redis' });
    assert.deepEqual(h.calls.filter(([kind]) => kind === 'cancel'), [['cancel', 'interviewer_interrupted']]);
});

test('Flux final filler removes an interviewer bubble shown for its earlier partial', () => {
    const h = interruptionRig();
    h.transcript('Okay, tell me', { final: false });
    h.transcript('Okay.');
    const questions = h.events.filter(([kind]) => kind === 'question').map(([, value]) => value);
    assert.equal(questions[0].discard, undefined);
    assert.deepEqual(questions.at(-1), { questionId: questions[0].questionId, text: '', done: true, discard: true });
});

test('A discarded filler bubble comes back under a new id when the interviewer keeps talking', () => {
    const h = interruptionRig();
    h.transcript('Okay, tell me', { final: false });
    h.transcript('Okay.');
    h.transcript('So how would you scale Redis?');
    const questions = h.events.filter(([kind]) => kind === 'question').map(([, value]) => value);
    const discarded = questions.find(question => question.discard);
    assert.ok(discarded, 'the filler bubble was discarded');
    const last = questions.at(-1);
    assert.equal(last.discard, undefined);
    assert.match(last.text, /scale Redis/);
    // The overlay closes a discarded id for good, so the real question needs a new one.
    assert.notEqual(last.questionId, discarded.questionId);
});

test('Rollover cancellation clears speaking on the last answer', () => {
    const h = interruptionRig();
    h.start('old'); h.delta('old', 'Partial answer.');
    h.send('interviewer_speech_started');
    h.done('old', 'cancelled', { cancelReason: 'rollover' });
    assert.equal(h.events.findLast(([kind]) => kind === 'speaking')[2], false);
});

test('Lease reset closes a keyed interviewer partial even if its answer never started', () => {
    const h = interruptionRig();
    h.send('interviewer_speech_started', { itemId: 'a' });
    h.transcript('An open question', { itemId: 'a', final: false });
    assert.equal(h.events.findLast(([kind]) => kind === 'question')[1].done, false);
    h.orchestrator.resetTurnState();
    assert.equal(h.events.findLast(([kind]) => kind === 'question')[1].done, true);
});
