import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const dist = '../../../../dist-electron/';
const { IntelligenceEngine } = require(`${dist}electron/IntelligenceEngine.js`);
const { LiveBrainRouting } = require(`${dist}electron/premium/liveBrain.js`);
const { clearPromptDebugState, getPromptDebugState } = require(`${dist}electron/llm/promptDebug.js`);
const { createMeeting } = require(`${dist}premium/electron/liveBrain/meeting.js`);
const { AnswerWriter } = require(`${dist}premium/electron/liveBrain/AnswerWriter.js`);
const { FakeLiveBrain } = require(`${dist}premium/electron/liveBrain/__tests__/FakeLiveBrain.js`);
const flush = () => new Promise(resolve => setImmediate(resolve));

function rig() {
    const brain = new FakeLiveBrain();
    const writes = [];
    const questions = [];
    const outdated = [];
    const create = onFailure => createMeeting({
        sessionId: 'fixture', apiKey: 'fake', onFailure,
        emitQuestion: question => questions.push(question),
        engine: {
            runLiveBrainAnswer(request) {
                const pending = Promise.withResolvers();
                const generationId = writes.length + 1;
                writes.push({ ...request, generationId, resolve: pending.resolve });
                request.signal.addEventListener('abort', () => pending.resolve({ status: 'cancelled' }), { once: true });
                return { generationId, done: pending.promise };
            },
            setAutomaticAnswerOutdated: (...args) => outdated.push(args),
        },
    }, brain);
    const decide = (action, props = {}) => brain.emit({ type: 'decision', decisionId: `${action}-${writes.length}`, at: Date.now(), action, ...props });
    return { brain, writes, questions, outdated, create, decide };
}

test('an answer uses the existing automatic What to Answer path and replacement waits for cancellation', async () => {
    const engine = Object.create(IntelligenceEngine.prototype);
    engine.currentGenerationId = engine.nextGenerationId = 0;
    engine.llmHelper = {};
    engine.isManualAnswerActive = () => false;
    engine.skipOwnedAutomaticTrigger = () => false;
    engine.planSuggestionTrigger = () => assert.fail('Live Brain already decided to answer');
    const runs = [];
    engine.runWhatShouldISay = (question, confidence, images, options) => {
        const result = Promise.withResolvers();
        assert.equal(engine.nextRunIsAutomatic, true);
        engine.currentGenerationId = options.liveBrain.generationId;
        runs.push({ question, generationId: engine.currentGenerationId, options, resolve: result.resolve });
        return result.promise;
    };
    const existingCancel = engine.cancelAutomaticAnswer.bind(engine);
    const cancellations = [];
    engine.cancelAutomaticAnswer = reason => { cancellations.push(reason); return existingCancel(reason); };
    const writer = new AnswerWriter({ runLiveBrainAnswer: request => engine.runLiveBrainAnswer(request, 'Transcript context') });
    const first = writer.write({ question: 'Use PostgreSQL for the catalog.', replacesAutomaticAnswer: false });
    const second = writer.write({ question: 'Model the catalog using MongoDB.', replacesAutomaticAnswer: true });
    assert.equal(await first.done, 'cancelled');
    await flush();
    assert.deepEqual(cancellations, ['answer_corrected']);
    assert.deepEqual(runs.map(run => run.question), ['Use PostgreSQL for the catalog.', 'Model the catalog using MongoDB.']);
    assert.equal(runs[1].generationId, second.generationId);
    assert.equal(runs[1].options.replacesAutomaticAnswer, true);
    assert.equal(runs[1].options.skipCooldown, true);
    runs[0].resolve(null);
    runs[1].options.outcomeOut.value = { status: 'success' };
    runs[1].resolve('Answer');
    assert.equal(await second.done, 'completed');
});

test('wait keeps a streaming writer, and ask displays a clarification without invoking a writer', () => {
    const { create, decide, writes, questions } = rig();
    const session = create(() => assert.fail('Unexpected fallback'));
    session.start();
    decide('answer', { question: 'Design a catalog.' });
    decide('wait');
    decide('ask', { clarification: 'How many products?' });
    assert.equal(writes.length, 1);
    assert.equal(writes[0].signal.aborted, false);
    assert.ok(questions.some(question => question.clarification === 'How many products?'));
    session.stop();
    assert.equal(writes[0].signal.reason, 'auto_disabled_or_meeting_ended');
});

test('routing keeps the legacy switch off-path, suppresses it for Gemini and re-enables it on fatal failure', () => {
    const { brain, create, decide, writes } = rig();
    const routing = new LiveBrainRouting();
    function canDispatch(legacy = true, available = true) { return routing.pipelineOverride(available) ?? legacy; }
    assert.equal(canDispatch(true), true);
    assert.equal(canDispatch(false), false);
    const failures = [];
    routing.start(create, code => failures.push(code));
    assert.equal(canDispatch(true), false);
    const pcm = Buffer.from([5, 0, 6, 0]);
    routing.activeSession.acceptAudio('system', pcm, 16_000);
    routing.activeSession.acceptAudio('mic', pcm, 16_000);
    routing.activeSession.addCandidateText('Candidate context.', 10);
    assert.equal(brain.audio.length, 1);
    assert.deepEqual(brain.candidateTurns.map(({ text }) => text), ['Candidate context.']);
    decide('answer', { question: 'Use the current pipeline?' });
    brain.emit({ type: 'error', code: 'rate_limited', fatal: false });
    assert.equal(canDispatch(true), false);
    brain.emit({ type: 'error', code: 'quota', fatal: true });
    assert.deepEqual(failures, ['quota']);
    assert.equal(writes[0].signal.aborted, true);
    assert.equal(canDispatch(false), true);
    assert.equal(canDispatch(true, false), false);
    routing.stop();
    assert.equal(canDispatch(false), false);
    routing.start(() => undefined, () => {}); // Explicit pipeline or no usable Gemini key.
    assert.equal(canDispatch(false), true);
    routing.stop();
});

test('switching off and manual cancellation abort only the Live Brain writer', () => {
    const { brain, create, decide, writes } = rig();
    const routing = new LiveBrainRouting();
    routing.start(create, () => assert.fail('Unexpected fallback'));
    decide('answer', { question: 'Design a catalog.' });
    routing.activeSession.cancelAnswer('manual_answer');
    assert.equal(writes[0].signal.reason, 'manual_answer');
    decide('answer', { question: 'What if we use MongoDB?' });
    routing.stop();
    assert.equal(writes[1].signal.reason, 'auto_disabled_or_meeting_ended');
    assert.equal(brain.stopCalls, 1);
    assert.equal(routing.activeSession, undefined);
});

test('capture tap downmixes 48 kHz stereo and resamples non-canonical mono formats', () => {
    const { brain, create } = rig();
    const session = create(() => assert.fail('Unexpected fallback'));
    session.start();
    const stereo = Buffer.alloc(6 * 4);
    for (let frame = 0; frame < 6; frame++) {
        stereo.writeInt16LE(frame * 100, frame * 4);
        stereo.writeInt16LE(frame * 100 + 20, frame * 4 + 2);
    }
    session.acceptAudio('system', stereo, 48_000, 2);
    session.acceptAudio('system', Buffer.from([0, 0, 100, 0]), 8_000);
    assert.deepEqual(brain.audio.map(({ pcm, sampleRate }) => [Array.from(pcm), sampleRate]), [
        [[10, 310], 16_000], [[0, 50, 100, 100], 16_000],
    ]);
    session.stop();
});

test('Prompt Debugger carries decider instructions and the speech-to-done timestamps', async t => {
    const before = process.env.NATIVELY_PROMPT_DEBUG;
    t.after(() => {
        if (before === undefined) delete process.env.NATIVELY_PROMPT_DEBUG;
        else process.env.NATIVELY_PROMPT_DEBUG = before;
        clearPromptDebugState();
    });
    process.env.NATIVELY_PROMPT_DEBUG = '1';
    t.mock.timers.enable({ apis: ['Date'], now: 2_000 });
    const { create, decide, writes } = rig();
    const session = create(() => assert.fail('Unexpected fallback'));
    session.start();
    session.noteSpeechStop(1_000);
    decide('answer', { question: 'Design a catalog.' });
    writes[0].onFirstText(2_250);
    t.mock.timers.setTime(2_500);
    writes[0].resolve({ status: 'completed' });
    await flush();
    const { notes, answerTimings } = getPromptDebugState();
    assert.ok(notes.some(note => note.promptSource === 'decider' && note.system.includes('decide_turn')));
    assert.ok(notes.some(note => note.promptSource === 'decide_turn' && note.user === 'Design a catalog.'));
    assert.deepEqual(answerTimings, [{
        source: 'live-brain', decisionId: 'answer-0', generationId: 1, speechStoppedAt: 1_000, decisionAt: 2_000,
        firstVisibleTextAt: 2_250, doneAt: 2_500, status: 'completed',
    }]);
    session.stop();
});
