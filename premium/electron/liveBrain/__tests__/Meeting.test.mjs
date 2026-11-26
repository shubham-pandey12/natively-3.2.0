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
    const questions = [];
    const outdated = [];
    const create = onFailure => createMeeting({
        sessionId: 'fixture', apiKey: 'fake', onFailure,
        modeName: 'Mock interview', profileContext: 'Candidate built a queue',
        emitQuestion: question => questions.push(question),
        engine: {
            runLiveBrainAnswer() { assert.fail('Gemini writes its own answer'); },
            setAutomaticAnswerOutdated: (...args) => outdated.push(args),
        },
    }, brain);
    const start = responseId => brain.emit({ type: 'response_started', responseId, at: Date.now() });
    const delta = (responseId, text) => brain.emit({ type: 'response_delta', responseId, text });
    const done = (responseId, status = 'completed') => brain.emit({ type: 'response_done', responseId, status });
    return { brain, questions, outdated, create, start, delta, done };
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

test('incremental Gemini answers replace a cancelled answer and drop late chunks', () => {
    const { create, brain, start, delta, done, questions, outdated } = rig();
    const session = create(() => assert.fail('Unexpected fallback'));
    session.start();
    start('first');
    delta('first', 'I would');
    assert.deepEqual(questions.at(-1).responseText, { text: 'I would', done: false });
    delta('first', ' start here.');
    const oldGeneration = questions.at(-1).generationId;
    done('first', 'cancelled');
    brain.emit({ type: 'interviewer_speech_started', at: Date.now() });
    assert.deepEqual(questions.at(-1), { generationId: oldGeneration, interviewerSpeaking: true });

    start('replacement');
    delta('first', 'late old output');
    delta('replacement', 'Use MongoDB.');
    assert.deepEqual(outdated, [[oldGeneration, true]]);
    assert.notEqual(questions.at(-1).generationId, oldGeneration);
    assert.deepEqual(questions.at(-1).responseText, { text: 'Use MongoDB.', done: false });
    assert.equal(questions.at(-1).updated, true);
    done('replacement');
    assert.deepEqual(questions.at(-1).responseText, { text: 'Use MongoDB.', done: true });
    session.stop();
});

test('spoken filler and silent model turns keep the current answer', () => {
    const { create, brain, start, delta, done, questions, outdated } = rig();
    const session = create(() => assert.fail('Unexpected fallback'));
    session.start();
    start('answer');
    delta('answer', 'Use MongoDB.');
    done('answer');
    const generationId = questions.at(-1).generationId;
    brain.emit({ type: 'interviewer_speech_started', at: Date.now() });
    start('filler');
    delta('filler', 'No act');
    delta('filler', 'ion.');
    done('filler');
    brain.emit({ type: 'interviewer_speech_started', at: Date.now() });
    brain.emit({ type: 'response_silent' });
    assert.deepEqual(questions.slice(2), [true, false, true, false].map(interviewerSpeaking => ({ generationId, interviewerSpeaking })));
    assert.deepEqual(outdated, []);
    session.stop();
});

test('a split spoken ask streams in one row and the timer asks Gemini to continue', t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
    const { create, brain, start, delta, done, questions } = rig();
    const session = create(() => assert.fail('Unexpected fallback'));
    session.start();
    start('ask');
    delta('ask', 'A');
    delta('ask', 'sK: How many');
    assert.deepEqual(questions.at(-1), { askId: 'ask', clarification: 'How many', askStreaming: true });
    delta('ask', ' users?');
    done('ask');
    assert.deepEqual(questions.at(-1), { askId: 'ask', clarification: 'How many users?', askStreaming: false });
    t.mock.timers.tick(9999);
    assert.equal(brain.clarificationRequests, 0);
    t.mock.timers.tick(1);
    assert.equal(brain.clarificationRequests, 1);

    start('second-ask');
    delta('second-ask', 'Ask: What scale?');
    done('second-ask');
    brain.emit({ type: 'interviewer_speech_started', at: Date.now() });
    t.mock.timers.tick(10_000);
    assert.equal(brain.clarificationRequests, 1);
    start('third-ask');
    delta('third-ask', 'Ask: What is the read volume?');
    done('third-ask');
    session.cancelAnswer('manual_answer');
    t.mock.timers.tick(10_000);
    assert.equal(brain.clarificationRequests, 1);
    session.stop();
});

test('routing keeps the legacy switch off-path, suppresses it for Gemini and re-enables it on fatal failure', () => {
    const { brain, create, start, delta } = rig();
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
    start('answer');
    delta('answer', 'Use the existing pipeline.');
    brain.emit({ type: 'error', code: 'rate_limited', fatal: false });
    assert.equal(canDispatch(true), false);
    brain.emit({ type: 'error', code: 'quota', fatal: true });
    assert.deepEqual(failures, ['quota']);
    assert.equal(brain.stopCalls, 1);
    assert.equal(canDispatch(false), true);
    assert.equal(canDispatch(true, false), false);
    routing.stop();
    assert.equal(canDispatch(false), false);
    routing.start(() => undefined, () => {}); // Explicit pipeline or no usable Gemini key.
    assert.equal(canDispatch(false), true);
    routing.stop();
});

test('switching off stops Gemini and manual cancellation reaches the brain', () => {
    const { brain, create, start, delta } = rig();
    const routing = new LiveBrainRouting();
    routing.start(create, () => assert.fail('Unexpected fallback'));
    start('answer');
    delta('answer', 'Design a catalog.');
    routing.activeSession.cancelAnswer('manual_answer');
    assert.deepEqual(brain.cancellations, ['manual_answer']);
    routing.stop();
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

test('Prompt Debugger captures spoken instructions and timestamps the first displayed text', t => {
    const before = process.env.NATIVELY_PROMPT_DEBUG;
    t.after(() => {
        if (before === undefined) delete process.env.NATIVELY_PROMPT_DEBUG;
        else process.env.NATIVELY_PROMPT_DEBUG = before;
        clearPromptDebugState();
    });
    process.env.NATIVELY_PROMPT_DEBUG = '1';
    t.mock.timers.enable({ apis: ['Date'], now: 2_000 });
    const { create, start, delta, done } = rig();
    const session = create(() => assert.fail('Unexpected fallback'));
    session.start();
    session.noteSpeechStop(1_000);
    start('timed');
    delta('timed', 'A');
    t.mock.timers.setTime(2_250);
    delta('timed', ' good choice.');
    t.mock.timers.setTime(2_500);
    done('timed');
    const { notes, answerTimings } = getPromptDebugState();
    const note = notes.find(note => note.promptSource === 'answer');
    assert.match(note.system, /say exactly "No action\."/);
    assert.match(note.system, /Candidate built a queue/);
    assert.match(note.system, /Mock interview/);
    assert.deepEqual(answerTimings, [{
        source: 'live-brain', brainId: 'gemini-live', responseId: 'timed', model: 'gemini-3.1-flash-live-preview',
        promptVariant: 'full', speechStoppedAt: 1_000, responseStartedAt: 2_000, firstTextAt: 2_250,
        doneAt: 2_500, status: 'completed',
    }]);
    session.stop();
});
