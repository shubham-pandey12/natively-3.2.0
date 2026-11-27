import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const dist = '../../../../dist-electron/';
const { IntelligenceEngine } = require(`${dist}electron/IntelligenceEngine.js`);
const { LiveBrainRouting } = require(`${dist}electron/premium/liveBrain.js`);
const { clearPromptDebugState, getPromptDebugState } = require(`${dist}electron/llm/promptDebug.js`);
const { createMeeting } = require(`${dist}premium/electron/liveBrain/meeting.js`);
const { AnswerWriter } = require(`${dist}premium/electron/liveBrain/AnswerWriter.js`);
const { FakeLiveBrain } = require(`${dist}premium/electron/liveBrain/__tests__/FakeLiveBrain.js`);
const { buildFluxTurnContext, isCorrectionTurn, isUnrelatedNewTopicForClarification } =
    require(`${dist}premium/electron/liveBrain/fluxTurnContext.js`);
const flush = () => new Promise(resolve => setImmediate(resolve));

function rig() {
    const brain = new FakeLiveBrain();
    const startBrain = brain.start.bind(brain);
    brain.start = context => {
        const started = startBrain(context);
        brain.emit({ type: 'status', status: 'ready' });
        return started;
    };
    const questions = [];
    const outdated = [];
    const create = onFailure => createMeeting({
        sessionId: 'fixture', apiKey: 'fake', onFailure,
        modeName: 'Mock interview', profileContext: 'Candidate built a queue',
        emitQuestion: question => { if (question.liveBrainStatus === undefined) questions.push(question); },
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

test('supervised fallback forwards the notebook through the existing Auto Answer dispatch', async () => {
    const { brain } = rig();
    const overlay = [];
    const engine = Object.create(IntelligenceEngine.prototype);
    engine.setAutomaticAnswerOutdated = () => {};
    engine.handleSuggestionTrigger = async trigger => {
        assert.equal(trigger.automatic, true);
        assert.equal(trigger.replacesAutomaticAnswer, true);
        assert.match(trigger.liveBrainNotebook, /email only/);
        return { status: 'completed' };
    };
    const routing = new LiveBrainRouting();
    routing.start(onFailure => createMeeting({
        sessionId: 'supervised-fixture', apiKey: 'fake', engine, onFailure,
        pipeline: { activate() {}, cancel() {} }, emitQuestion: event => overlay.push(event),
    }, brain), () => assert.fail('The supervisor owns fallback'));
    assert.equal(routing.pipelineOverride(true), false);
    brain.emit({ type: 'interviewer_transcript', text: 'Notifications must use email only.', final: true, at: Date.now() });
    brain.emit({ type: 'error', fatal: true, code: 'auth' });
    assert.equal(routing.pipelineOverride(true), true);
    const session = routing.activeSession;
    const followUp = 'What would you use during an outage?';
    session.observePipelineTranscript(followUp, true, Date.now());
    await engine.runAutoAnswer({ text: followUp, replacesAutomaticAnswer: true }, {
        context: 'Existing transcript', liveBrainNotebook: session.pipelineContext(), reuseSpeculative: false,
    });
    session.observePipelineOutput({ type: 'answer', generationId: 1, text: 'Keep retrying email from the queue.' });
    assert.equal(overlay.some(event => event.responseText), false); // legacy events already paint these rows
    assert.ok(overlay.some(event => event.liveBrainStatus === 'Backup brain'));
    routing.stop();
    assert.equal(routing.pipelineOverride(true), undefined);
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
    assert.match(note.system, /output exactly No action\. and nothing else/);
    assert.match(note.system, /Candidate built a queue/);
    assert.match(note.system, /Mock interview/);
    assert.deepEqual(answerTimings, [{
        source: 'live-brain', brainId: 'gemini-live', responseId: 'timed', model: 'gemini-3.1-flash-live-preview',
        promptVariant: 'full', speechStoppedAt: 1_000, responseStartedAt: 2_000, firstTextAt: 2_250,
        doneAt: 2_500, status: 'completed',
    }]);
    session.stop();
});

test('D17: Deepgram Flux streams answers through IntelligenceEngine, cancels on correction, and hands off on fallback', async () => {
    const engine = Object.create(IntelligenceEngine.prototype);
    engine.currentGenerationId = engine.nextGenerationId = 0;
    engine.llmHelper = {};
    engine.isManualAnswerActive = () => false;
    engine.skipOwnedAutomaticTrigger = () => false;
    engine.planSuggestionTrigger = () => assert.fail('Flux already decided EndOfTurn');
    const runs = [];
    const cancellations = [];
    const outdated = [];
    engine.setAutomaticAnswerOutdated = (...args) => outdated.push(args);
    engine.runWhatShouldISay = (question, _conf, _images, options) => {
        const result = Promise.withResolvers();
        engine.currentGenerationId = options.liveBrain.generationId;
        runs.push({ question, options, resolve: result.resolve });
        return result.promise;
    };
    const origCancel = engine.cancelAutomaticAnswer.bind(engine);
    engine.cancelAutomaticAnswer = reason => { cancellations.push(reason); return origCancel(reason); };

    const flux = new FakeLiveBrain();
    flux.id = 'deepgram-flux';
    const startFlux = flux.start.bind(flux);
    flux.start = ctx => {
        const p = startFlux(ctx);
        flux.emit({ type: 'status', status: 'ready' });
        return p;
    };

    const overlay = [];
    const routing = new LiveBrainRouting();
    routing.start(onFailure => createMeeting({
        sessionId: 'flux-meeting', apiKey: 'fake', provider: 'deepgram-flux', engine,
        pipeline: { activate() {}, cancel() {} },
        emitQuestion: ev => overlay.push(ev),
        onFailure,
    }, flux), () => {});

    assert.equal(routing.pipelineOverride(true), false);
    flux.emit({ type: 'interviewer_transcript', text: 'How do you scale reads?', final: false, at: 10 });
    flux.emit({ type: 'interviewer_transcript', text: 'How do you scale reads?', final: true, at: 20 });
    flux.emit({ type: 'interviewer_speech_stopped', at: 20 });
    flux.emit({ type: 'decision', decisionId: 'f1', action: 'answer', question: 'How do you scale reads?', at: 21 });
    await flush();
    assert.equal(runs.length, 1);
    assert.equal(runs[0].options.liveBrain.suppressQuestionRow, true);
    assert.ok(overlay.some(e => e.liveBrainQuestion?.text === 'How do you scale reads?' && e.liveBrainQuestion.generationId === runs[0].options.liveBrain.generationId));

    // Correction cancels generation 1 and feeds generation 2; outdated folds on replacement first text.
    flux.emit({ type: 'interviewer_transcript', text: 'Actually, assume write-heavy.', final: true, at: 30 });
    flux.emit({ type: 'decision', decisionId: 'f2', action: 'answer', question: 'Actually, assume write-heavy.', at: 31 });
    assert.deepEqual(cancellations, ['answer_corrected']);
    assert.equal(outdated.length, 0);
    runs[0].resolve(null);
    await flush();
    assert.equal(runs.length, 2);
    assert.equal(overlay.filter(event => event.liveBrainStatus).at(-1)?.liveBrainStatus, 'Thinking');
    runs[1].options.outcomeOut.value = { status: 'success' };
    runs[1].options.liveBrain.onFirstText?.(35);
    assert.equal(outdated.length, 1);
    runs[1].options.liveBrain.onComplete?.('Use sharded write logs.');
    runs[1].resolve('Use sharded write logs.');
    await flush();

    // The writer itself opens a clarification. A short reply is then meaningful.
    flux.emit({ type: 'interviewer_transcript', text: 'Can the cache serve from disk?', final: true, at: 40 });
    flux.emit({ type: 'decision', decisionId: 'f3', action: 'answer', question: 'Can the cache serve from disk?', at: 41 });
    await flush();
    assert.equal(runs.length, 3);
    runs[2].options.liveBrain.onComplete?.('Ask: Is disk latency acceptable?');
    runs[2].options.outcomeOut.value = { status: 'success' };
    runs[2].resolve('Ask: Is disk latency acceptable?');
    await flush();
    flux.emit({ type: 'interviewer_speech_started', at: 50 });
    flux.emit({ type: 'interviewer_transcript', text: 'Yes.', final: true, at: 55 });
    flux.emit({ type: 'decision', decisionId: 'f4', action: 'answer', question: 'Yes.', at: 55 });
    await flush();
    assert.equal(runs.length, 4);
    assert.equal(runs[3].question, 'Yes.');
    assert.match(runs[3].options.liveBrainNotebook, /Is disk latency acceptable/);

    // A fallback must abort even when the writer already started the replacement.
    flux.emit({ type: 'error', code: 'auth', fatal: true });
    assert.equal(cancellations.at(-1), 'answer_corrected');
    runs[3].options.liveBrain.onComplete?.('This stale answer must stay out of the notebook.');
    runs[3].resolve(null);
    await flush();
    assert.doesNotMatch(routing.activeSession.pipelineContext(), /This stale answer/);
    assert.equal(routing.pipelineOverride(true), true);
    assert.match(routing.activeSession.pipelineContext(), /Use sharded write logs/);
    routing.stop();
});

function fluxEngineRig(t, options = {}) {
    const { SessionTracker } = require(`${dist}electron/SessionTracker.js`);
    const session = new SessionTracker();
    let route = options.initialRoute ?? { provider: 'openai', model: 'gpt-4o-mini' };
    const engine = new IntelligenceEngine({
        setNegotiationCoachingHandler() {},
        getDirectAssistSelection: () => ({ ...route }),
        getCurrentProvider: () => route.provider,
        getCurrentModelId: () => route.model,
        getCurrentModel: () => route.model,
    }, session);
    const streamCalls = [];
    const tokens = [];
    const answers = [];
    const questions = [];
    const discards = [];
    const errors = [];
    const sessionAssistantWrites = [];
    const usageWrites = [];
    const origAddAssistant = session.addAssistantMessage.bind(session);
    session.addAssistantMessage = (...args) => {
        sessionAssistantWrites.push(args[0]);
        return origAddAssistant(...args);
    };
    const origPushUsage = session.pushUsage.bind(session);
    session.pushUsage = item => {
        usageWrites.push(item);
        return origPushUsage(item);
    };
    engine.on('suggested_answer_token', (chunk, q, _conf, genId) => tokens.push({ chunk, q, genId }));
    engine.on('suggested_answer', (ans, q, _conf, genId, _lbl, _stop, outcome) => answers.push({ ans, q, genId, outcome }));
    engine.on('what_to_answer_question', ev => questions.push(ev));
    engine.on('suggested_answer_discard', (reason, genId) => discards.push({ reason, genId }));
    engine.on('error', (err) => errors.push(err));

    const queuedStreams = [];
    engine.whatToAnswerLLM = {
        async *generateStream(transcript, _temp, _intent, _imgs, _sc, _pi, _sk, _dom, _prof, plan, _mc, _rs, signal) {
            const call = {
                id: streamCalls.length + 1,
                question: plan?.question || transcript,
                transcript,
                signal,
                route: { ...route },
            };
            streamCalls.push(call);
            if (options.onStream) {
                yield* options.onStream(call, signal);
                return;
            }
            const next = queuedStreams.shift();
            assert.ok(next, `Unexpected generateStream call #${call.id}`);
            yield* next(call, signal);
        },
    };

    const flux = new FakeLiveBrain();
    flux.id = 'deepgram-flux';
    const startFlux = flux.start.bind(flux);
    flux.start = ctx => {
        const p = startFlux(ctx);
        flux.emit({ type: 'status', status: 'ready' });
        return p;
    };

    const overlay = [];
    const routing = new LiveBrainRouting();
    routing.start(onFailure => createMeeting({
        sessionId: 'flux-p2',
        apiKey: 'fake',
        provider: 'deepgram-flux',
        engine: {
            setAutomaticAnswerOutdated: (genId, outdated) => engine.setAutomaticAnswerOutdated(genId, outdated),
            runLiveBrainAnswer: req => engine.runLiveBrainAnswer(req, session.getFormattedContext(120)),
            startLiveBrainDraft: req => engine.startLiveBrainDraft(req, session.getFormattedContext(120)),
            getLiveBrainAiRouteKey: () => engine.getLiveBrainAiRouteKey(),
        },
        pipeline: { activate() {}, cancel() {} },
        emitQuestion: ev => overlay.push(ev),
        onFailure,
    }, flux), () => {});
    t.after(() => {
        routing.stop();
        engine.reset();
    });

    return {
        engine, session, flux, routing, overlay, streamCalls, queuedStreams,
        tokens, answers, questions, discards, errors, sessionAssistantWrites, usageWrites,
        setRoute(nextRoute) { route = nextRoute; },
    };
}

test('Phase 2: confirmation before first token promotes in-flight draft into one answer with zero duplication', async (t) => {
    const h = fluxEngineRig(t);
    const tokenGate = Promise.withResolvers();
    h.queuedStreams.push(async function* (_call, signal) {
        await tokenGate.promise;
        if (signal.aborted) return;
        yield 'Horizontal scaling adds machines to handle higher traffic. ';
        yield 'Vertical scaling upgrades one machine with more CPU and RAM.';
    });

    h.flux.emit({ type: 'interviewer_transcript', text: 'What is horizontal vs vertical scaling?', final: false, at: 10 });
    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p2:c1:t0', question: 'What is horizontal vs vertical scaling?', at: 15 });
    await untilCondition(() => h.streamCalls.length === 1);
    // Unconfirmed draft must produce zero UI, overlay, notebook, or session side effects.
    assert.equal(h.tokens.length, 0);
    assert.equal(h.answers.length, 0);
    assert.equal(h.questions.length, 0);
    assert.equal(h.sessionAssistantWrites.length, 0);
    assert.equal(h.usageWrites.length, 0);

    // EndOfTurn confirms BEFORE the first token arrives.
    h.flux.emit({ type: 'interviewer_transcript', text: 'What is horizontal vs vertical scaling?', final: true, at: 20 });
    h.flux.emit({ type: 'interviewer_speech_stopped', at: 20 });
    h.flux.emit({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'What is horizontal vs vertical scaling?', turnKey: 'flux-p2:c1:t0', at: 20 });

    tokenGate.resolve();
    await untilCondition(() => h.answers.length === 1);
    assert.equal(h.streamCalls.length, 1, 'confirmed turn must reuse the in-flight draft stream');
    assert.equal(h.answers.length, 1);
    assert.match(h.answers[0].ans, /Horizontal scaling adds machines/);
    assert.match(h.answers[0].ans, /Vertical scaling upgrades/);
    assert.equal(h.sessionAssistantWrites.length, 1);
    assert.equal(h.usageWrites.length, 1);
    assert.match(h.sessionAssistantWrites[0], /Horizontal scaling adds machines/);
    // Verify notebook recorded the confirmed answer (surfaced in pipelineContext upon fallback).
    h.flux.emit({ type: 'error', code: 'auth', fatal: true });
    assert.match(h.routing.activeSession.pipelineContext(), /Horizontal scaling adds machines/);
});

test('Phase 2: completed private draft leaks zero state until EndOfTurn, then releases buffered text cleanly once', async (t) => {
    const h = fluxEngineRig(t);
    h.queuedStreams.push(async function* () {
        yield 'I would shard the database by tenant ID cleanly and quickly.';
    });

    h.flux.emit({ type: 'interviewer_transcript', text: 'How would you scale writes?', final: false, at: 10 });
    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p2:c1:t0', question: 'How would you scale writes?', at: 15 });
    await untilCondition(() => h.streamCalls.length === 1);
    await flush();
    await flush();
    // Even after the stream completes privately, nothing may leak yet.
    assert.equal(h.tokens.length, 0);
    assert.equal(h.answers.length, 0);
    assert.equal(h.questions.length, 0);
    assert.equal(h.sessionAssistantWrites.length, 0);
    assert.equal(h.usageWrites.length, 0);
    assert.equal(h.routing.activeSession.pipelineContext(), '');

    // Now confirm: first text paints from buffered chunks immediately and produces one answer.
    h.flux.emit({ type: 'interviewer_transcript', text: 'How would you scale writes?', final: true, at: 30 });
    h.flux.emit({ type: 'interviewer_speech_stopped', at: 30 });
    h.flux.emit({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'How would you scale writes?', turnKey: 'flux-p2:c1:t0', at: 30 });
    // Duplicate EndOfTurn/decision must not start anything else.
    assert.equal(h.tokens.length >= 1, true, 'completed private draft paints synchronously on EndOfTurn confirmation');
    await untilCondition(() => h.answers.length === 1);
    assert.equal(h.streamCalls.length, 1);
    assert.equal(h.answers[0].ans, 'I would shard the database by tenant ID cleanly and quickly.');
    assert.equal(h.sessionAssistantWrites.length, 1);
    assert.equal(h.usageWrites.length, 1);
});

test('Phase 2: buffered-to-live handoff preserves chunk order with zero loss or duplication', async (t) => {
    const h = fluxEngineRig(t);
    const midGate = Promise.withResolvers();
    h.queuedStreams.push(async function* () {
        yield 'Chunk-one introduces the caching tier architecture, ';
        yield 'chunk-two describes TTL expiry, ';
        await midGate.promise;
        yield 'and chunk-three explains write-through invalidation.';
    });

    h.flux.emit({ type: 'interviewer_transcript', text: 'Explain your caching tier.', final: false, at: 10 });
    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p2:c1:t0', question: 'Explain your caching tier.', at: 15 });
    await flush();
    await flush();
    assert.equal(h.tokens.length, 0);

    // Confirm mid-stream while chunk-one and chunk-two are buffered and chunk-three is pending.
    h.flux.emit({ type: 'interviewer_transcript', text: 'Explain your caching tier.', final: true, at: 20 });
    h.flux.emit({ type: 'interviewer_speech_stopped', at: 20 });
    h.flux.emit({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'Explain your caching tier.', turnKey: 'flux-p2:c1:t0', at: 20 });
    assert.equal(h.tokens.map(t => t.chunk).join(''), 'Chunk-one introduces the caching tier architecture, chunk-two describes TTL expiry, ');

    midGate.resolve();
    await untilCondition(() => h.answers.length === 1);
    assert.equal(
        h.tokens.map(t => t.chunk).join(''),
        'Chunk-one introduces the caching tier architecture, chunk-two describes TTL expiry, and chunk-three explains write-through invalidation.',
    );
    assert.equal(
        h.answers[0].ans,
        'Chunk-one introduces the caching tier architecture, chunk-two describes TTL expiry, and chunk-three explains write-through invalidation.',
    );
    h.routing.stop();
});

test('Phase 2: TurnResumed discards draft without leaking late output, allows fresh eager draft, and skips changed final transcript', async (t) => {
    const h = fluxEngineRig(t);
    const staleGate = Promise.withResolvers();
    h.queuedStreams.push(
        async function* () {
            yield 'Stale mid-pause answer that must never leak to overlay or history.';
            await staleGate.promise;
            yield ' Late chunk after TurnResumed cancel.';
        },
        async function* () {
            yield 'Complete answer covering millions of concurrent users across regions.';
        },
        async function* () {
            yield 'Draft for original wording before transcript changed.';
        },
        async function* () {
            yield 'Fresh confirmed answer matching the final changed wording.';
        },
    );

    // 1. Mid-pause EagerEndOfTurn -> TurnResumed -> late stale output ignored -> fresh EagerEndOfTurn -> EndOfTurn.
    h.flux.emit({ type: 'interviewer_transcript', text: 'How would you design a system that can handle?', final: false, at: 10 });
    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p2:c1:t0', question: 'How would you design a system that can handle?', at: 15 });
    await flush();
    h.flux.emit({ type: 'turn_resumed', turnKey: 'flux-p2:c1:t0', at: 20 });
    staleGate.resolve();
    await flush();
    assert.equal(h.tokens.length, 0);
    assert.equal(h.answers.length, 0);
    assert.equal(h.sessionAssistantWrites.length, 0);

    // Fresh eager event for the resumed question.
    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p2:c1:t0', question: 'How would you design a system that can handle millions of concurrent users?', at: 25 });
    await flush();
    h.flux.emit({ type: 'interviewer_transcript', text: 'How would you design a system that can handle millions of concurrent users?', final: true, at: 30 });
    h.flux.emit({ type: 'interviewer_speech_stopped', at: 30 });
    h.flux.emit({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'How would you design a system that can handle millions of concurrent users?', turnKey: 'flux-p2:c1:t0', at: 30 });
    await untilCondition(() => h.answers.length === 1);
    assert.match(h.answers[0].ans, /millions of concurrent users across regions/);

    // 2. Changed final transcript: draft must be discarded and confirmed answer runs fresh.
    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p2:c1:t1', question: 'Use Redis or Postgres?', at: 40 });
    await flush();
    h.flux.emit({ type: 'interviewer_transcript', text: 'Use DynamoDB or Postgres?', final: true, at: 50 });
    h.flux.emit({ type: 'interviewer_speech_stopped', at: 50 });
    h.flux.emit({ type: 'decision', decisionId: 'd2', action: 'answer', question: 'Use DynamoDB or Postgres?', turnKey: 'flux-p2:c1:t1', at: 50 });
    await untilCondition(() => h.answers.length === 2);
    assert.equal(h.streamCalls.length, 4);
    assert.match(h.answers[1].ans, /Fresh confirmed answer/);
});

test('Phase 2: early AI failures fall back before visible text, while post-text failures never start a second answer', async (t) => {
    const h = fluxEngineRig(t);
    const preTextFailGate = Promise.withResolvers();
    const postTextFailGate = Promise.withResolvers();
    h.queuedStreams.push(
        // Turn 1: draft throws BEFORE EndOfTurn -> falls back cleanly on confirmed turn.
        async function* () {
            throw new Error('upstream 503 during eager draft');
        },
        async function* () {
            yield 'Confirmed fallback succeeds cleanly after pre-confirm failure.';
        },
        // Turn 2: draft confirmed BEFORE first token, then throws BEFORE any text shown -> falls back once.
        async function* () {
            await preTextFailGate.promise;
            throw new Error('early stream disconnect before first token');
        },
        async function* () {
            yield 'Confirmed single retry answer after early pre-text failure.';
        },
        // Turn 3: draft shows visible text first, THEN fails mid-stream -> must NOT run a second answer.
        async function* () {
            yield 'Initial visible part already rendered on the overlay cleanly ';
            await postTextFailGate.promise;
            throw new Error('mid-stream socket reset');
        },
    );

    // Turn 1
    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p2:c1:t0', question: 'Question one?', at: 10 });
    await flush();
    assert.equal(h.errors.length, 0, 'unconfirmed draft failure must not surface UI error');
    h.flux.emit({ type: 'interviewer_transcript', text: 'Question one?', final: true, at: 20 });
    h.flux.emit({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'Question one?', turnKey: 'flux-p2:c1:t0', at: 20 });
    await untilCondition(() => h.answers.length === 1);
    assert.match(h.answers[0].ans, /Confirmed fallback succeeds cleanly/);

    // Turn 2
    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p2:c1:t1', question: 'Question two?', at: 30 });
    await flush();
    h.flux.emit({ type: 'interviewer_transcript', text: 'Question two?', final: true, at: 35 });
    h.flux.emit({ type: 'decision', decisionId: 'd2', action: 'answer', question: 'Question two?', turnKey: 'flux-p2:c1:t1', at: 35 });
    preTextFailGate.resolve();
    await untilCondition(() => h.answers.length === 2);
    assert.match(h.answers[1].ans, /Confirmed single retry answer/);

    // Turn 3
    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p2:c1:t2', question: 'Question three?', at: 40 });
    await untilCondition(() => h.streamCalls.length === 5);
    await flush();
    const tokensBeforeTurn3 = h.tokens.length;
    h.flux.emit({ type: 'interviewer_transcript', text: 'Question three?', final: true, at: 50 });
    h.flux.emit({ type: 'decision', decisionId: 'd3', action: 'answer', question: 'Question three?', turnKey: 'flux-p2:c1:t2', at: 50 });
    await untilCondition(() => h.tokens.length > tokensBeforeTurn3);
    postTextFailGate.resolve();
    await untilCondition(() => h.discards.length >= 1 && h.errors.length >= 1);
    await flush();
    assert.equal(h.streamCalls.length, 5, 'must not append or launch a second run once visible text was already emitted');
});

test('Phase 2: provider/route change, reconnect, and meeting end cancel active private drafts with zero leakage', async (t) => {
    const h = fluxEngineRig(t);
    const slowGate1 = Promise.withResolvers();
    const slowGate2 = Promise.withResolvers();
    h.queuedStreams.push(
        async function* () {
            yield 'Draft started under OpenAI route.';
            await slowGate1.promise;
        },
        async function* () {
            yield 'Confirmed answer under new Codex CLI route.';
        },
        async function* () {
            yield 'Draft before reconnect.';
            await slowGate2.promise;
        },
        async function* () {
            yield 'Confirmed answer after reconnect.';
        },
        async function* () {
            yield 'Draft active when meeting ends.';
            await new Promise(resolve => setTimeout(resolve, 200));
        },
    );

    // 1. AI provider/model route switch invalidates old draft cleanly.
    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p2:c1:t0', question: 'Explain Raft consensus.', at: 10 });
    await untilCondition(() => h.streamCalls.length === 1);
    h.setRoute({ provider: 'codex-cli', model: 'gpt-5.3-codex' });
    h.flux.emit({ type: 'interviewer_transcript', text: 'Explain Raft consensus.', final: true, at: 20 });
    h.flux.emit({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'Explain Raft consensus.', turnKey: 'flux-p2:c1:t0', at: 20 });
    slowGate1.resolve();
    await untilCondition(() => h.answers.length === 1);
    assert.deepEqual(h.streamCalls[1].route, { provider: 'codex-cli', model: 'gpt-5.3-codex' });
    assert.match(h.answers[0].ans, /new Codex CLI route/);

    // 2. Reconnecting / degraded status cancels draft and fresh connection uses new turnKey.
    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p2:c1:t1', question: 'How does Paxos differ?', at: 30 });
    await untilCondition(() => h.streamCalls.length === 3);
    h.flux.emit({ type: 'status', status: 'connecting' });
    h.flux.emit({ type: 'status', status: 'ready' });
    slowGate2.resolve();
    h.flux.emit({ type: 'interviewer_transcript', text: 'How does Paxos differ?', final: true, at: 40 });
    h.flux.emit({ type: 'decision', decisionId: 'd2', action: 'answer', question: 'How does Paxos differ?', turnKey: 'flux-p2:c2:t0', at: 40 });
    await untilCondition(() => h.answers.length === 2);
    assert.match(h.answers[1].ans, /Confirmed answer after reconnect/);

    // 3. Meeting stop cancels pending private draft with zero leakage.
    const priorAnswerCount = h.answers.length;
    const priorSessionWrites = h.sessionAssistantWrites.length;
    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p2:c2:t1', question: 'Anything else?', at: 50 });
    await untilCondition(() => h.streamCalls.length === 5);
    assert.equal(h.streamCalls[4].signal.aborted, false);
    h.routing.stop();
    assert.equal(h.streamCalls[4].signal.aborted, true);
    await flush();
    assert.equal(h.answers.length, priorAnswerCount);
    assert.equal(h.sessionAssistantWrites.length, priorSessionWrites);
});

test('Phase 3: Flux filler mid-stream, correction before first token, stale drops, and fallback mid-replacement', async t => {
    const h = fluxEngineRig(t);
    const q1Gate = Promise.withResolvers();
    const q2Gate = Promise.withResolvers();
    const q3Gate = Promise.withResolvers();

    h.queuedStreams.push(
        async function* () {
            yield 'First useful chunk for Redis.';
            await q1Gate.promise;
            yield ' Late stale chunk that must be dropped.';
        },
        async function* () {
            await q2Gate.promise;
            yield 'Replacement without cache.';
        },
        async function* () {
            await q3Gate.promise;
            yield 'Third attempt.';
        },
    );

    // 1. Start streaming Q1 and verify filler ("M" partial -> "MM.") does NOT cancel Q1 or create a bubble.
    h.flux.emit({ type: 'interviewer_transcript', text: 'How should we cache products?', final: true, at: 10 });
    h.flux.emit({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'How should we cache products?', turnKey: 'flux-p2:c1:t0', at: 11 });
    await untilCondition(() => h.streamCalls.length === 1);
    await untilCondition(() => h.overlay.some(e => e.liveBrainQuestion?.text === 'How should we cache products?'));

    h.flux.emit({ type: 'interviewer_speech_started', at: 15 });
    h.flux.emit({ type: 'interviewer_transcript', text: 'M', final: false, at: 16 });
    h.flux.emit({ type: 'interviewer_transcript', text: 'MM.', final: true, at: 17 });
    h.flux.emit({ type: 'decision', decisionId: 'd2', action: 'answer', question: 'MM.', turnKey: 'flux-p2:c1:t1', at: 18 });
    await flush();
    assert.equal(h.streamCalls[0].signal.aborted, false);
    assert.equal(h.overlay.some(e => e.liveBrainQuestion?.text === 'M' || e.liveBrainQuestion?.text === 'MM.'), false);

    // 2. Confirmed correction mid-stream cancels Q1 and drops late Q1 text/completion.
    h.flux.emit({ type: 'interviewer_speech_started', at: 20 });
    h.flux.emit({ type: 'interviewer_transcript', text: 'Actually, no caching allowed.', final: true, at: 25 });
    h.flux.emit({ type: 'decision', decisionId: 'd3', action: 'answer', question: 'Actually, no caching allowed.', turnKey: 'flux-p2:c1:t2', at: 26 });
    await untilCondition(() => h.streamCalls[0].signal.aborted);
    q1Gate.resolve();
    await untilCondition(() => h.streamCalls.length === 2);
    assert.equal(h.answers.length, 0);

    // 3. Before Q2 emits its first token, Q3 (correction) supersedes Q2.
    h.flux.emit({ type: 'interviewer_transcript', text: 'Use an index instead.', final: true, at: 30 });
    h.flux.emit({ type: 'decision', decisionId: 'd4', action: 'answer', question: 'Use an index instead.', turnKey: 'flux-p2:c1:t3', at: 31 });
    await untilCondition(() => h.streamCalls[1].signal.aborted);
    q2Gate.resolve();
    await untilCondition(() => h.streamCalls.length === 3);

    // 4. Fatal error mid-replacement triggers fallback to pipeline without leaking Q3.
    h.flux.emit({ type: 'error', code: 'network', fatal: true, at: 35 });
    await untilCondition(() => h.streamCalls[2].signal.aborted);
    q3Gate.resolve();
    await flush();
    assert.equal(h.answers.length, 0);
});

test('Flux distinguishes standalone questions with constraints from corrections', () => {
    const question = 'Explain how a mutex works without busy waiting';
    const context = { question, replacesAutomaticAnswer: false, lastConfirmedTurn: { question: 'Design a payments API' } };
    assert.equal(isCorrectionTurn(question), false);
    assert.equal(buildFluxTurnContext(context), '');
    assert.equal(isCorrectionTurn('Actually, use MongoDB instead'), true);
    assert.equal(isCorrectionTurn('Do it without Redis'), true);
    assert.equal(isUnrelatedNewTopicForClarification(question), true);
    assert.equal(buildFluxTurnContext({
        ...context,
        pendingClarification: { originalQuestion: 'Design a payments API', clarification: 'Which payment methods?' },
    }), '');
});

test('Phase 4: AI-boundary context for follow-ups, corrections, clarification replies, unrelated topics, and stale draft rejection', async t => {
    const h = fluxEngineRig(t);
    const interruptedGate = Promise.withResolvers();

    h.queuedStreams.push(
        // 0: Base answer for follow-up test
        async function* () {
            yield 'Use CRDTs with WebSocket delta sync across devices.';
        },
        // 1: Early-draft follow-up ("What if it needs to work offline?")
        async function* () {
            yield 'Queue edits locally in IndexedDB and merge CRDT state on reconnect.';
        },
        // 2: Unrelated new topic ("What is the difference between horizontal and vertical scaling?")
        async function* () {
            yield 'Horizontal scaling adds more machines; vertical scaling upgrades one machine.';
        },
        // 3: Original product lookup answer (will be interrupted mid-stream after painting >160 chars)
        async function* () {
            yield 'Use a Redis cache-aside read path with a 60-second TTL, write-through invalidation on catalog updates, and a fallback to the primary database on cache miss so p99 stays low.';
            await interruptedGate.promise;
            yield ' Unfinished tail that must stay out of history.';
        },
        // 4: Early-draft correction ("Actually, caching is not allowed.")
        async function* () {
            yield 'Without caching, partition the catalog by product ID with read replicas.';
        },
        // 5: Clarification question ("Can the cache serve from disk?") -> Ask:
        async function* () {
            yield 'Ask: Is disk latency acceptable?';
        },
        // 6: Early-draft clarification reply ("Yes.")
        async function* () {
            yield 'Yes, serve warm reads from NVMe SSDs with an in-memory index.';
        },
        // 7: Confirmed-turn follow-up after meeting restart (no prior meeting context)
        async function* () {
            yield 'Start fresh without stale context.';
        },
    );

    // 1. Base Q&A followed by early-draft follow-up ("What if it needs to work offline?")
    h.flux.emit({ type: 'interviewer_transcript', text: 'How would you design a collaborative note-taking app that syncs across devices?', final: true, at: 10 });
    h.flux.emit({ type: 'decision', decisionId: 'd1', action: 'answer', question: 'How would you design a collaborative note-taking app that syncs across devices?', turnKey: 'flux-p4:c1:t0', at: 11 });
    await untilCondition(() => h.answers.length === 1);

    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p4:c1:t1', question: 'What if it needs to work offline?', at: 20 });
    await untilCondition(() => h.streamCalls.length === 2);
    assert.match(h.streamCalls[1].transcript, /<turn_context kind="follow_up">/);
    assert.match(h.streamCalls[1].transcript, /collaborative note-taking app/);
    assert.match(h.streamCalls[1].transcript, /CRDTs with WebSocket delta sync/);

    h.flux.emit({ type: 'interviewer_transcript', text: 'What if it needs to work offline?', final: true, at: 25 });
    h.flux.emit({ type: 'decision', decisionId: 'd2', action: 'answer', question: 'What if it needs to work offline?', turnKey: 'flux-p4:c1:t1', at: 26 });
    await untilCondition(() => h.answers.length === 2);
    assert.equal(h.streamCalls.length, 2, 'follow-up draft with matching context must be adopted');

    // 2. Unrelated new topic must NOT inherit old follow-up / note-taking topic context.
    h.flux.emit({ type: 'interviewer_transcript', text: 'What is the difference between horizontal and vertical scaling?', final: true, at: 30 });
    h.flux.emit({ type: 'decision', decisionId: 'd3', action: 'answer', question: 'What is the difference between horizontal and vertical scaling?', turnKey: 'flux-p4:c1:t2', at: 31 });
    await untilCondition(() => h.answers.length === 3);
    assert.doesNotMatch(h.streamCalls[2].transcript, /<turn_context/);
    assert.doesNotMatch(h.streamCalls[2].transcript, /collaborative note-taking app/);

    // 3. Interrupted answer followed by early-draft correction: unfinished draft stays out of history,
    //    and correction carries original confirmed goal.
    h.flux.emit({ type: 'interviewer_transcript', text: 'Design a low-latency product lookup service. You can use a cache.', final: true, at: 40 });
    h.flux.emit({ type: 'decision', decisionId: 'd4', action: 'answer', question: 'Design a low-latency product lookup service. You can use a cache.', turnKey: 'flux-p4:c1:t3', at: 41 });
    await untilCondition(() => h.streamCalls.length === 4);
    await untilCondition(() => h.tokens.some(tok => tok.genId === h.streamCalls[3].generationId || tok.chunk.includes('Redis')));

    h.flux.emit({ type: 'interviewer_speech_started', at: 45 });
    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p4:c1:t4', question: 'Actually, caching is not allowed.', at: 46 });
    await untilCondition(() => h.streamCalls.length === 5);
    assert.match(h.streamCalls[4].transcript, /<turn_context kind="correction">/);
    assert.match(h.streamCalls[4].transcript, /low-latency product lookup service/);
    assert.match(h.streamCalls[4].transcript, /Actually, caching is not allowed\./);

    h.flux.emit({ type: 'interviewer_transcript', text: 'Actually, caching is not allowed.', final: true, at: 50 });
    h.flux.emit({ type: 'decision', decisionId: 'd5', action: 'answer', question: 'Actually, caching is not allowed.', turnKey: 'flux-p4:c1:t4', at: 51 });
    interruptedGate.resolve();
    await untilCondition(() => h.answers.length === 4);
    assert.equal(h.sessionAssistantWrites.some(w => w.includes('Unfinished tail')), false);

    // 4. Pending clarification + early-draft "Yes." ties original question, Ask, and reply together,
    //    and consumes pending clarification once.
    h.flux.emit({ type: 'interviewer_transcript', text: 'Can the cache serve from disk?', final: true, at: 60 });
    h.flux.emit({ type: 'decision', decisionId: 'd6', action: 'answer', question: 'Can the cache serve from disk?', turnKey: 'flux-p4:c1:t5', at: 61 });
    await untilCondition(() => h.answers.length === 5);

    h.flux.emit({ type: 'eager_end_of_turn', turnKey: 'flux-p4:c1:t6', question: 'Yes.', at: 70 });
    await untilCondition(() => h.streamCalls.length === 7);
    assert.match(h.streamCalls[6].transcript, /<turn_context kind="clarification_reply">/);
    assert.match(h.streamCalls[6].transcript, /Can the cache serve from disk\?/);
    assert.match(h.streamCalls[6].transcript, /Is disk latency acceptable\?/);
    assert.match(h.streamCalls[6].transcript, /Interviewer reply: Yes\./);

    h.flux.emit({ type: 'interviewer_transcript', text: 'Yes.', final: true, at: 75 });
    h.flux.emit({ type: 'decision', decisionId: 'd7', action: 'answer', question: 'Yes.', turnKey: 'flux-p4:c1:t6', at: 76 });
    await untilCondition(() => h.answers.length === 6);

    // Second standalone "Yes." after clarification was consumed must be suppressed as filler.
    h.flux.emit({ type: 'interviewer_transcript', text: 'Yes.', final: true, at: 80 });
    h.flux.emit({ type: 'decision', decisionId: 'd8', action: 'answer', question: 'Yes.', turnKey: 'flux-p4:c1:t7', at: 81 });
    await flush();
    assert.equal(h.streamCalls.length, 7);

    // 5. Meeting stop resets context so a new meeting does not inherit stale turns.
    h.routing.stop();
    const h2 = fluxEngineRig(t);
    h2.queuedStreams.push(async function* () { yield 'Fresh meeting answer.'; });
    h2.flux.emit({ type: 'interviewer_transcript', text: 'What if it needs to work offline?', final: true, at: 100 });
    h2.flux.emit({ type: 'decision', decisionId: 'd9', action: 'answer', question: 'What if it needs to work offline?', turnKey: 'flux-p4b:c1:t0', at: 101 });
    await untilCondition(() => h2.answers.length === 1);
    assert.doesNotMatch(h2.streamCalls[0].transcript, /<turn_context/);
    assert.doesNotMatch(h2.streamCalls[0].transcript, /Can the cache serve from disk/);
});

async function untilCondition(pred, timeoutMs = 2_000) {
    const start = Date.now();
    while (!pred()) {
        if (Date.now() - start > timeoutMs) assert.fail('Timed out waiting for Phase 2 test condition');
        await delay(10);
    }
}

test('Flux clarification timeout answers through the writer and reconnect cancels it', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const h = fluxEngineRig(t);
    h.queuedStreams.push(
        async function* () { yield 'Ask: Is disk latency acceptable?'; },
        async function* () { yield 'Assuming it is acceptable, use NVMe.'; },
        async function* () { yield 'Ask: How many users?'; },
    );

    h.flux.emit({ type: 'decision', decisionId: 'ask-disk', action: 'answer', question: 'Can the cache serve from disk?', at: 10 });
    await untilCondition(() => h.answers.length === 1);
    t.mock.timers.tick(10_000);
    await untilCondition(() => h.answers.length === 2);
    assert.match(h.streamCalls[1].transcript, /Can the cache serve from disk/);
    assert.match(h.streamCalls[1].transcript, /state a reasonable assumption/);

    h.flux.emit({ type: 'decision', decisionId: 'ask-users', action: 'answer', question: 'Design the chat service.', at: 20 });
    await untilCondition(() => h.answers.length === 3);
    h.flux.emit({ type: 'status', status: 'connecting' });
    t.mock.timers.tick(10_000);
    await flush();
    assert.equal(h.streamCalls.length, 3);
});

test('U5e-1: unanswered STT final before fatal realtime failure hands off once to pipeline, dedupes within 5s, and skips >20s', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 100_000 });
    const { PipelineBrain } = require('../../../../dist-electron/premium/electron/liveBrain/brains/PipelineBrain.js');
    const engine = Object.create(IntelligenceEngine.prototype);
    engine.setAutomaticAnswerOutdated = () => {};

    // 1. Fresh pending STT final handed off to pipeline.activate and deduped within 5 s.
    const { brain: b1 } = rig();
    const activated1 = [];
    const routing1 = new LiveBrainRouting();
    routing1.start(onFailure => createMeeting({
        sessionId: 'u5e1-fresh', apiKey: 'fake', engine, onFailure,
        pipeline: { activate: pending => activated1.push(pending), cancel() {} },
        emitQuestion: () => {},
    }, b1), () => assert.fail('Supervisor owns fallback'));

    routing1.activeSession.observePipelineTranscript('What is a mutex?', true, 100_000);
    b1.emit({ type: 'error', code: 'auth', fatal: true });
    assert.equal(routing1.pipelineOverride(true), true);
    assert.deepEqual(activated1, [{ text: 'What is a mutex?', at: 100_000 }]);

    t.mock.timers.tick(2_000);
    const deduped = routing1.activeSession.observePipelineTranscript('  what is a mutex? ', true, 102_000);
    assert.equal(deduped, true);
    routing1.stop();

    // 2. Question older than 20 s at fallback is not submitted.
    const { brain: b2 } = rig();
    const activated2 = [];
    const routing2 = new LiveBrainRouting();
    routing2.start(onFailure => createMeeting({
        sessionId: 'u5e1-stale', apiKey: 'fake', engine, onFailure,
        pipeline: { activate: pending => activated2.push(pending), cancel() {} },
        emitQuestion: () => {},
    }, b2), () => assert.fail('Supervisor owns fallback'));
    routing2.activeSession.observePipelineTranscript('What is a mutex?', true, 102_000);
    t.mock.timers.tick(20_001);
    b2.emit({ type: 'error', code: 'auth', fatal: true });
    assert.deepEqual(activated2, [undefined]);
    routing2.stop();

    // 3. PipelineBrain stop() inside response_started emits no delta after response_done;
    //    failed before any token emits response_silent once.
    const p1 = new PipelineBrain(() => {});
    const events1 = [];
    p1.onEvent(e => {
        events1.push(e);
        if (e.type === 'response_started') void p1.stop();
    });
    await p1.start({ sessionId: 'p1', instructions: '', notebook: { topics: [], currentTopic: null, requirements: [], constraints: [], clarifications: [], decisions: [], answered: [], summary: '', updatedAt: 0 }, recentTurns: [], signal: new AbortController().signal });
    p1.observe({ type: 'token', generationId: 1, text: 'Hello' });
    assert.deepEqual(events1.map(e => e.type), ['status', 'response_started', 'response_done']);

    const p2 = new PipelineBrain(() => {});
    const events2 = [];
    p2.onEvent(e => events2.push(e));
    await p2.start({ sessionId: 'p2', instructions: '', notebook: { topics: [], currentTopic: null, requirements: [], constraints: [], clarifications: [], decisions: [], answered: [], summary: '', updatedAt: 0 }, recentTurns: [], signal: new AbortController().signal });
    p2.observe({ type: 'failed', generationId: 2 });
    assert.deepEqual(events2.filter(e => e.type === 'response_silent'), [{ type: 'response_silent' }]);
});

test('U5e-1 follow-up: answered turn + late STT backup does not re-answer; filler/silent skipped; STT-before-brain answered once', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: 200_000 });
    const engine = Object.create(IntelligenceEngine.prototype);
    engine.setAutomaticAnswerOutdated = () => {};

    // 1. interviewer_speech_started -> final -> response_started -> late STT backup final -> fatal failure: NO pipeline answer.
    const { brain: b1 } = rig();
    const activated1 = [];
    const routing1 = new LiveBrainRouting();
    routing1.start(onFailure => createMeeting({
        sessionId: 'u5e1-bug-a', apiKey: 'fake', engine, onFailure,
        pipeline: { activate: pending => activated1.push(pending), cancel() {} },
        emitQuestion: () => {},
    }, b1), () => assert.fail('Supervisor owns fallback'));

    b1.emit({ type: 'interviewer_speech_started', at: 200_000 });
    b1.emit({ type: 'interviewer_transcript', text: 'What is a mutex?', final: true, at: 200_100 });
    b1.emit({ type: 'response_started', responseId: 'r1', at: 200_200 });
    routing1.activeSession.observePipelineTranscript('What is a mutex?', true, 200_300);
    b1.emit({ type: 'error', code: 'auth', fatal: true });
    assert.deepEqual(activated1, [undefined]);
    routing1.stop();

    // 2. final "Okay." -> response_silent -> fatal failure within 20 s -> NO pipeline answer.
    const { brain: b2 } = rig();
    const activated2 = [];
    const routing2 = new LiveBrainRouting();
    routing2.start(onFailure => createMeeting({
        sessionId: 'u5e1-bug-b', apiKey: 'fake', engine, onFailure,
        pipeline: { activate: pending => activated2.push(pending), cancel() {} },
        emitQuestion: () => {},
    }, b2), () => assert.fail('Supervisor owns fallback'));

    b2.emit({ type: 'interviewer_speech_started', at: 200_000 });
    b2.emit({ type: 'interviewer_transcript', text: 'Okay.', final: true, at: 200_100 });
    b2.emit({ type: 'response_silent' });
    b2.emit({ type: 'error', code: 'auth', fatal: true });
    assert.deepEqual(activated2, [undefined]);
    routing2.stop();

    // 3. STT backup final arrives before brain final, no response yet, then failure -> exactly one pipeline answer.
    const { brain: b3 } = rig();
    const activated3 = [];
    const routing3 = new LiveBrainRouting();
    routing3.start(onFailure => createMeeting({
        sessionId: 'u5e1-stt-first', apiKey: 'fake', engine, onFailure,
        pipeline: { activate: pending => activated3.push(pending), cancel() {} },
        emitQuestion: () => {},
    }, b3), () => assert.fail('Supervisor owns fallback'));

    routing3.activeSession.observePipelineTranscript('What is a mutex?', true, 200_000);
    b3.emit({ type: 'interviewer_transcript', text: 'What is a mutex?', final: true, at: 200_100 });
    b3.emit({ type: 'error', code: 'auth', fatal: true });
    assert.deepEqual(activated3, [{ text: 'What is a mutex?', at: 200_100 }]);
    routing3.stop();
});
