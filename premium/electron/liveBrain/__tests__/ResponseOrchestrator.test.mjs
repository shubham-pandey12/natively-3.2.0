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
    start('r2');
    delta('r1', 'late');
    start('r1'); // A duplicate start cannot revive a closed response.
    delta('r2', 'New ');
    delta('r2', 'answer');
    done('r2', 'cancelled');
    delta('r2', 'late');
    done('r2');
    assert.deepEqual(h.calls.map(([event, payload]) => [event, typeof payload === 'object' ? payload.text : payload]), [
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
