import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { FakeClock } from '../../autoAnswer/__tests__/fakeClock.mjs';

const require = createRequire(import.meta.url);
const dist = '../../../../dist-electron/';
const load = name => require(`${dist}premium/electron/liveBrain/${name}.js`);
const { BrainSupervisor } = load('BrainSupervisor');
const { InterviewNotebook } = load('InterviewNotebook');
const { SessionTracker } = require('../../../../dist-electron/electron/SessionTracker.js');
const { ResponseOrchestrator } = load('ResponseOrchestrator');
const { PipelineBrain } = load('brains/PipelineBrain');
const { FakeLiveBrain } = load('__tests__/FakeLiveBrain');
const flush = () => new Promise(resolve => setImmediate(resolve));
const MIN = 60_000;

function rig(preferred = 'gemini-live', standbyStartupMs = 0, available = ['gemini-live'], disposition, useOrchestrator = false) {
    const clock = new FakeClock();
    const notebook = new InterviewNotebook({ now: () => clock.now() });
    const realtime = [];
    const attempted = [];
    const seen = [];
    const switches = [];
    const rollovers = [];
    const questions = [];
    const orchestrator = useOrchestrator ? new ResponseOrchestrator({
        clock,
        recordSttQuestion: (text, at) => supervisor.recordInterviewerTurn(text, at),
        overlay: { showText() {}, showQuestion(question) { questions.push(question); }, showAsk() {}, setOutdated() {}, setInterviewerSpeaking() {} },
    }) : undefined;
    const supervisor = new BrainSupervisor({
        sessionId: 'meeting', preferred,
        instructions: (id, notebookText) => [`Answer instructions for ${id}`, notebookText].filter(Boolean).join('\n\n'),
        notebook, clock,
        create(id) {
            attempted.push(id);
            if (id === 'pipeline') return { brain: new PipelineBrain(() => {}), model: 'pipeline' };
            if (!available.includes(id)) return undefined;
            const brain = new FakeLiveBrain(id);
            brain.history = [];
            brain.addHistoryContext = history => brain.history.push(history);
            if (realtime.length && standbyStartupMs) {
                const start = brain.start.bind(brain);
                brain.start = async context => {
                    await start(context);
                    await new Promise(resolve => clock.setTimeout(resolve, standbyStartupMs));
                };
            }
            realtime.push(brain);
            return { brain, model: 'gemini-model' };
        },
        onEvent: (event, id) => {
            seen.push([id, event]);
            if (id !== 'pipeline' && orchestrator) return orchestrator.handleEvent(event);
            if (event.type === 'response_done') return disposition;
        },
        onSwitch: data => switches.push(data),
        onRollover: data => rollovers.push(data),
    });
    return { clock, notebook, supervisor, realtime, attempted, seen, switches, rollovers, orchestrator, questions };
}

test('completed ready-to-display text is stored in the notebook', async () => {
    const h = rig('gemini-live', 0, ['gemini-live'], { kind: 'answer', text: 'I found useful takeaways.' });
    h.supervisor.start();
    await flush();
    const brain = h.realtime[0];
    brain.emit({ type: 'response_started', responseId: 'r1', at: h.clock.now() });
    brain.emit({ type: 'response_delta', responseId: 'r1', text: 'I found actionable insights.' });
    brain.emit({ type: 'response_done', responseId: 'r1', status: 'completed' });
    assert.equal(h.notebook.recentTurns().at(-1).text, 'I found useful takeaways.');
});

test('syncs one screenshot answer delta to the already-open brain before the spoken follow-up', async () => {
    const h = rig('gemini-live', 0, ['gemini-live']);
    const ledger = new SessionTracker();
    h.supervisor.start();
    await flush();
    const brain = h.realtime[0];
    const protocolOrder = [];
    const addContext = brain.addHistoryContext;
    brain.addHistoryContext = history => { protocolOrder.push('context_update'); addContext(history); };
    const screenshot = ledger.beginMeetingTurn('Please solve the screenshot question.', 'request', 1, 'captured');
    ledger.enrichMeetingTurn(screenshot, {
        hasVisualInput: true,
        resolvedQuestion: 'Find the k largest values from the input array.',
        capture: { origin: 'capture', text: 'Constraints: 1 <= n <= 100000; k <= n.' },
    });
    ledger.recordMeetingAnswer(screenshot, 'Use a min-heap of size k. The heap keeps the best candidates in O(n log k).', { surface: 'screenshot' });
    const [turn] = ledger.getMeetingTurns();
    h.supervisor.syncExternalHistory(turn, ledger.getMeetingHistoryRevision());
    h.supervisor.syncExternalHistory(turn, ledger.getMeetingHistoryRevision());
    assert.equal(brain.history.length, 1);
    assert.match(brain.history[0], /Find the k largest values/);
    assert.match(brain.history[0], /1 <= n <= 100000/);
    assert.match(brain.history[0], /Use a min-heap of size k/);
    assert.equal(h.seen.some(([, event]) => ['response_started', 'response_delta', 'response_done'].includes(event.type)), false);
    assert.deepEqual(protocolOrder, ['context_update']);

    protocolOrder.push('spoken_followup');
    brain.emit({ type: 'interviewer_transcript', text: 'Why did you use a heap?', final: true, at: h.clock.now() });
    assert.equal(protocolOrder.indexOf('context_update') < protocolOrder.indexOf('spoken_followup'), true);
    assert.equal(brain.history.length, 1, 'a repeated ledger revision is not replayed');

    const heardQuestion = ledger.beginMeetingTurn('How would you cache the lookup?', 'interviewer', 5_000, 'speech');
    ledger.recordMeetingAnswer(heardQuestion, 'Use an LRU cache with O(1) lookup.', { surface: 'meeting_auto_answer' });
    const second = ledger.getMeetingTurns().at(-1);
    h.supervisor.syncExternalHistory(second, ledger.getMeetingHistoryRevision());
    assert.match(brain.history[1], /AI suggestion: Use an LRU cache/);
    assert.doesNotMatch(brain.history[1], /How would you cache the lookup/);
    h.supervisor.stop();
});

test('handled suppressed answers and cancelled filler stay out of the notebook while Ask is recorded', async () => {
    const h = rig('gemini-live', 0, ['gemini-live'], undefined, true);
    h.supervisor.start();
    await flush();
    const brain = h.realtime[0];
    const respond = (responseId, text, status, interviewerText = 'Mm-hmm.') => {
        brain.emit({ type: 'interviewer_transcript', final: true, text: interviewerText, at: h.clock.now() });
        brain.emit({ type: 'response_started', responseId, at: h.clock.now() });
        brain.emit({ type: 'response_delta', responseId, text });
        brain.emit({ type: 'response_done', responseId, status });
    };
    respond('hidden', 'Hidden answer.', 'completed');
    respond('interrupted', 'Hidden partial.', 'cancelled');
    assert.deepEqual(h.notebook.recentTurns().filter(turn => turn.role === 'assistant'), []);
    respond('ask', 'Ask: Which region?', 'completed', 'Which region should we deploy to?');
    assert.deepEqual(h.notebook.snapshot().clarifications, [{ asked: 'Which region?', answer: null }]);
    assert.deepEqual(h.notebook.recentTurns().filter(turn => turn.role === 'assistant').map(turn => turn.text),
        ['Which region?']);
    h.orchestrator.reset();
    h.supervisor.stop();
});

test('STT fallback is recorded when used and a late provider final for that bubble is not added', async () => {
    for (const sttBeforeAnswer of [true, false]) {
        const h = rig('gemini-live', 0, ['gemini-live'], undefined, true);
        h.supervisor.start();
        await flush();
        const brain = h.realtime[0];
        const at = h.clock.now();
        const useStt = () => h.orchestrator.noteSttTranscript('How should it scale?', at);
        if (sttBeforeAnswer) {
            useStt();
            assert.deepEqual(h.notebook.recentTurns(), []);
        }
        brain.emit({ type: 'response_started', responseId: 'stt', at });
        if (!sttBeforeAnswer) useStt();
        assert.deepEqual(h.notebook.recentTurns(), [{ role: 'interviewer', text: 'How should it scale?', at }]);
        brain.emit({ type: 'response_delta', responseId: 'stt', text: 'Add replicas.' });
        brain.emit({ type: 'response_done', responseId: 'stt', status: 'completed' });
        brain.emit({ type: 'interviewer_transcript', final: true, text: 'How should we scale it?', at: at + 1 });
        assert.deepEqual(h.notebook.recentTurns().filter(turn => turn.role === 'interviewer'),
            [{ role: 'interviewer', text: 'How should it scale?', at }]);
        h.orchestrator.reset();
        h.supervisor.stop();
    }
});

test('Amazon Sonic reconnects with notebook context and rolls over before the eight-minute limit', async () => {
    const h = rig('amazon-sonic', 0, ['amazon-sonic']);
    h.supervisor.start();
    await flush();
    const first = h.realtime[0];
    first.emit({ type: 'interviewer_transcript', text: 'Use streaming and a single database.', final: true, at: h.clock.now() });
    first.emit({ type: 'error', code: 'network', fatal: true });
    await flush();
    const second = h.realtime[1];
    assert.equal(h.supervisor.current, second);
    assert.match(second.starts[0].instructions, /single database/);
    h.clock.advance(7.5 * MIN);
    await flush();
    assert.equal(h.supervisor.current, h.realtime[2]);
    assert.match(h.realtime[2].starts[0].instructions, /single database/);
    h.supervisor.stop();
});

test('70 minutes of simulated rollovers preserve context and wait for the active answer', async () => {
    const h = rig('gemini-live', 550);
    const start = h.clock.now();
    h.supervisor.start();
    await flush();
    h.realtime[0].emit({
        type: 'interviewer_transcript', text: 'Notifications must use email only.', final: true, at: h.clock.now(),
    });
    for (let cycle = 0; cycle < 5; cycle++) {
        const active = h.realtime.at(-1);
        h.clock.advance(12 * MIN);
        const at = h.clock.now();
        active.emit({ type: 'interviewer_transcript', text: `What should we do for outage ${cycle}?`, final: true, at });
        active.emit({ type: 'response_started', responseId: `r${cycle}`, at });
        active.emit({ type: 'response_delta', responseId: `r${cycle}`, text: 'I would use a durable email queue.' });
        h.clock.advance(1.5 * MIN);
        await flush();
        h.clock.advance(550);
        await flush();
        const prepared = h.realtime.at(-1);
        assert.notEqual(prepared, active);
        assert.equal(active.stopCalls, 0);
        assert.equal(h.supervisor.current, active);
        assert.match(prepared.starts[0].instructions, /must use email only/);
        assert.match(prepared.starts[0].notebook.constraints.at(-1), /email only/);
        assert.equal(prepared.starts[0].recentTurns.at(-1).role, 'interviewer');
        h.supervisor.pushAudio(new Int16Array([1, 2, 3]));
        active.emit({ type: 'response_done', responseId: `r${cycle}`, status: 'completed' });
        assert.equal(h.supervisor.current, prepared);
        assert.match(prepared.history[0], /durable email queue/);
        assert.deepEqual([...prepared.audio[0].pcm], [1, 2, 3]);
        assert.equal(active.stopCalls, 1);
    }
    h.clock.advance(70 * MIN - (h.clock.now() - start));
    assert.equal(h.rollovers.length, 5);
    assert.ok(h.rollovers.every(rollover => rollover.elapsedMs === 550));
    assert.ok(!h.seen.some(([, event]) => event.type === 'response_done' && event.status === 'cancelled'));
    h.supervisor.stop();
    assert.equal(h.clock.pendingCount(), 0);
    assert.deepEqual(h.notebook.recentTurns(), []);
});

for (const code of ['auth', 'quota']) {
    test(`${code} hands the next turn to the pipeline with earlier constraints and drops old events`, async () => {
        const h = rig();
        h.supervisor.start();
        await flush();
        const gemini = h.realtime[0];
        const at = h.clock.now();
        gemini.emit({ type: 'interviewer_transcript', text: 'The service must be email only.', final: true, at });
        h.supervisor.addCandidateText('I would use a durable queue.', at);
        gemini.emit({ type: 'response_started', responseId: 'gemini:1', at });
        gemini.emit({ type: 'response_delta', responseId: 'gemini:1', text: 'Start with' });
        gemini.emit({ type: 'error', code, fatal: true });
        assert.equal(h.supervisor.current.id, 'pipeline');
        assert.deepEqual(h.attempted, ['gemini-live', 'elevenlabs-realtime', 'deepgram-flux', 'deepgram-voice-agent', 'openai-realtime', 'amazon-sonic', 'pipeline']);
        assert.match(h.supervisor.pipelineContext, /must be email only/);
        assert.match(h.supervisor.pipelineContext, /durable queue/);
        gemini.emit({ type: 'response_delta', responseId: 'gemini:1', text: 'stale' });
        assert.ok(!h.seen.some(([, event]) => event.text === 'stale'));
        const pipeline = h.supervisor.current;
        pipeline.interviewerTranscript('What happens during a provider outage?', true, at + 1);
        pipeline.observe({ type: 'token', generationId: 7, text: 'Queue email' });
        pipeline.observe({ type: 'answer', generationId: 7, text: 'Queue email until the provider recovers.' });
        pipeline.observe({ type: 'token', generationId: 7, text: 'late' });
        assert.equal(h.seen.filter(([id, event]) => id === 'pipeline' && event.type === 'response_started').length, 1);
        assert.match(h.supervisor.pipelineContext, /Queue email until the provider recovers/);
        h.supervisor.stop();
    });
}

test('resumption failure opens a fresh seeded session and replays buffered PCM', async () => {
    const h = rig();
    h.supervisor.start();
    await flush();
    const old = h.realtime[0];
    old.emit({ type: 'interviewer_transcript', text: 'No caching is allowed.', final: true, at: h.clock.now() });
    old.emit({ type: 'status', status: 'degraded' });
    h.supervisor.pushAudio(new Int16Array([321]));
    old.emit({ type: 'error', code: 'protocol', fatal: true, detail: 'session_resumption_failed' });
    await flush();
    assert.equal(h.supervisor.current, h.realtime[1]);
    assert.match(h.realtime[1].starts[0].instructions, /No caching is allowed/);
    assert.deepEqual([...h.realtime[1].audio[0].pcm], [321]);
    h.supervisor.stop();
});

test('providers without usable keys skip to Gemini and unknown ids throw', async () => {
    const h = rig('elevenlabs-realtime');
    h.supervisor.start();
    await flush();
    assert.deepEqual(h.attempted, ['elevenlabs-realtime', 'gemini-live']);
    h.supervisor.stop();
    assert.throws(() => rig('unknown').supervisor.start(), /Unsupported live brain/);
});

test('the selected realtime provider comes first, followed by Gemini, remaining realtime and pipeline', async () => {
    const providerIds = ['gemini-live', 'openai-realtime', 'elevenlabs-realtime'];
    const h = rig('elevenlabs-realtime', 0, providerIds);
    h.supervisor.start();
    for (const id of ['elevenlabs-realtime', 'gemini-live', 'openai-realtime']) {
        await flush();
        const brain = h.supervisor.current;
        assert.equal(brain.id, id);
        assert.match(brain.starts[0].instructions, new RegExp(id));
        brain.emit({ type: 'error', code: 'quota', fatal: true });
    }
    assert.equal(h.supervisor.current.id, 'pipeline');
    assert.deepEqual(h.attempted, ['elevenlabs-realtime', 'gemini-live', 'deepgram-flux', 'deepgram-voice-agent', 'openai-realtime', 'amazon-sonic', 'pipeline']);
    h.supervisor.stop();
});

test('a cancelled answer that already showed text is kept in the notebook; an empty one is not', async () => {
    const h = rig();
    h.supervisor.start();
    await flush();
    const brain = h.realtime[0];
    const at = h.clock.now();
    brain.emit({ type: 'interviewer_transcript', text: 'How would you handle a slow query?', final: true, at });
    brain.emit({ type: 'response_started', responseId: 'shown', at });
    brain.emit({ type: 'response_delta', responseId: 'shown', text: 'I would add an index and a timeout.' });
    brain.emit({ type: 'response_done', responseId: 'shown', status: 'cancelled' });
    brain.emit({ type: 'response_started', responseId: 'empty', at });
    brain.emit({ type: 'response_done', responseId: 'empty', status: 'cancelled' });
    const assistant = h.notebook.recentTurns().filter(turn => turn.role === 'assistant');
    assert.deepEqual(assistant.map(turn => turn.text), ['I would add an index and a timeout.']);
    h.supervisor.stop();
});

test('Sonic fresh-start allowance resets after 30 s ready, while two quick failures fall back', async () => {
    const h1 = rig('amazon-sonic', 0, ['amazon-sonic']);
    h1.supervisor.start();
    await flush();
    h1.realtime[0].emit({ type: 'error', code: 'network', fatal: true });
    await flush();
    assert.equal(h1.supervisor.current, h1.realtime[1]);
    h1.clock.advance(30_000);
    h1.realtime[1].emit({ type: 'error', code: 'network', fatal: true });
    await flush();
    assert.equal(h1.supervisor.current, h1.realtime[2]);
    h1.supervisor.stop();

    const h2 = rig('amazon-sonic', 0, ['amazon-sonic']);
    h2.supervisor.start();
    await flush();
    h2.realtime[0].emit({ type: 'error', code: 'network', fatal: true });
    await flush();
    assert.equal(h2.supervisor.current, h2.realtime[1]);
    h2.clock.advance(5_000);
    h2.realtime[1].emit({ type: 'error', code: 'network', fatal: true });
    await flush();
    assert.equal(h2.supervisor.current.id, 'pipeline');
    h2.supervisor.stop();
});

test('U8-3: grounding change after standby launch prevents stale promotion; Sonic with missed turn creates fresh lease', async () => {
    let groundingKey = 'g1';
    const clock = new FakeClock();
    const notebook = new InterviewNotebook({ now: () => clock.now() });
    const realtime = [];
    const detached = [];
    const supervisor = new BrainSupervisor({
        sessionId: 'u8-3',
        preferred: 'gemini-live',
        instructions: id => `inst:${id}`,
        groundingKey: () => groundingKey,
        notebook,
        clock,
        create(id) {
            if (id !== 'gemini-live') return undefined;
            const brain = new FakeLiveBrain(id);
            brain.addHistoryContext = () => { };
            if (realtime.length === 1) {
                const start = brain.start.bind(brain);
                brain.start = async ctx => {
                    await start(ctx);
                    await new Promise(resolve => clock.setTimeout(resolve, 500));
                };
            }
            realtime.push(brain);
            return { brain, model: 'gemini' };
        },
        onEvent: () => { },
        onLeaseDetached: (lease, reason, role) => detached.push([lease.brain.id, reason, role]),
    });
    supervisor.start();
    await flush();
    clock.advance(13.5 * MIN);
    await flush();
    const staleStandby = realtime[1];
    groundingKey = 'g2';
    clock.advance(500);
    await flush();
    assert.notEqual(supervisor.current, staleStandby);
    assert.ok(detached.some(([, r, role]) => r === 'context_changed' && role === 'standby'));
    supervisor.stop();

    // Sonic without addHistoryContext: a missed turn during first standby connect discards once;
    // a missed turn during the second standby connect promotes anyway, and the counter resets after promotion.
    const sonicClock = new FakeClock();
    const sonicNotebook = new InterviewNotebook({ now: () => sonicClock.now() });
    const sonicBrains = [];
    const sonicDetached = [];
    const sonicSup = new BrainSupervisor({
        sessionId: 'u8-3-sonic',
        preferred: 'amazon-sonic',
        instructions: () => 'inst',
        groundingKey: () => 'g1',
        notebook: sonicNotebook,
        clock: sonicClock,
        create(id) {
            if (id !== 'amazon-sonic') return undefined;
            const brain = new FakeLiveBrain(id);
            if (sonicBrains.length >= 1) {
                const start = brain.start.bind(brain);
                brain.start = async ctx => {
                    await start(ctx);
                    await new Promise(resolve => sonicClock.setTimeout(resolve, 500));
                };
            }
            sonicBrains.push(brain);
            return { brain, model: 'sonic' };
        },
        onEvent: () => { },
        onLeaseDetached: (_l, reason, role) => sonicDetached.push([reason, role]),
    });
    sonicSup.start();
    await flush();
    // Rollover 1: missed turn during standby 1 -> discarded once; missed turn during standby 2 -> promoted anyway.
    sonicClock.advance(7.5 * MIN);
    await flush();
    sonicBrains[0].emit({ type: 'interviewer_transcript', text: 'Missed turn 1.', final: true, at: sonicClock.now() });
    sonicClock.advance(500);
    await flush();
    assert.deepEqual(sonicDetached.filter(([r]) => r === 'missed_turns'), [['missed_turns', 'standby']]);
    assert.equal(sonicSup.current, sonicBrains[0]);
    sonicBrains[0].emit({ type: 'interviewer_transcript', text: 'Missed turn 2.', final: true, at: sonicClock.now() });
    sonicClock.advance(500);
    await flush();
    assert.equal(sonicSup.current, sonicBrains[2]);
    assert.ok(sonicDetached.some(([r, role]) => r === 'rollover' && role === 'active'));
    // Rollover 2: counter reset after promotion -> missed turn discards once again.
    sonicClock.advance(7.5 * MIN);
    await flush();
    sonicBrains[2].emit({ type: 'interviewer_transcript', text: 'Missed turn 3.', final: true, at: sonicClock.now() });
    sonicClock.advance(500);
    await flush();
    assert.equal(sonicDetached.filter(([r]) => r === 'missed_turns').length, 2);
    sonicSup.stop();
});

test('Gemini cancel before speech keeps the interrupting question on the active lease', async () => {
    const h = rig('gemini-live', 0, ['gemini-live'], undefined, true);
    h.supervisor.start();
    await flush();
    const first = h.realtime[0];
    const emit = (type, fields = {}) => first.emit({ type, at: h.clock.now(), ...fields });
    emit('status', { status: 'ready' });
    emit('response_started', { responseId: 'a' });
    emit('response_delta', { responseId: 'a', text: 'An answer.' });
    emit('session_expiring', { inMs: 30_000, resumable: false });
    await flush();
    h.realtime[1].emit({ type: 'status', status: 'ready' });
    emit('response_done', { responseId: 'a', status: 'cancelled', cancelReason: 'interviewer_barge_in' });
    emit('interviewer_speech_started');
    emit('interviewer_transcript', { text: 'How do queues work?', final: true });
    assert.equal(h.supervisor.current, first);
    assert.ok(h.notebook.recentTurns().some(turn => turn.text === 'How do queues work?'));
    emit('interviewer_speech_stopped');
    emit('response_started', { responseId: 'b' });
    emit('response_delta', { responseId: 'b', text: 'A queue answer.' });
    assert.equal(h.questions.at(-1)?.text, 'How do queues work?');
    assert.ok(h.questions.at(-1)?.generationId !== undefined);
    emit('response_done', { responseId: 'b', status: 'completed' });
    assert.equal(h.supervisor.current, h.realtime[1]);
    h.supervisor.stop();
});

test('Provider progress keeps slow turns alive while real silence still triggers fallback', async () => {
    const h = rig('deepgram-voice-agent', 0, ['deepgram-voice-agent']);
    h.supervisor.start();
    await flush();
    const brain = h.realtime[0];
    brain.emit({ type: 'status', status: 'ready' });
    const endSpeech = () => {
        brain.emit({ type: 'interviewer_speech_started', at: h.clock.now() });
        brain.emit({ type: 'interviewer_speech_stopped', at: h.clock.now() });
    };
    for (let index = 0; index < 2; index++) {
        endSpeech();
        h.clock.advance(5000);
        brain.emit({ type: 'provider_response_progress' });
        h.clock.advance(2000);
    }
    assert.equal(h.supervisor.current, brain);
    brain.emit({ type: 'response_silent' });
    for (let index = 0; index < 2; index++) {
        endSpeech();
        h.clock.advance(6001);
    }
    assert.equal(h.supervisor.current?.id, 'pipeline');
    h.supervisor.stop();
});

test('D21 notebook keeps the merged question and one final answer', async () => {
    const clock = new FakeClock();
    const notebook = new InterviewNotebook({ now: () => clock.now() });
    const brain = new FakeLiveBrain('gemini-live');
    const orchestrator = new ResponseOrchestrator({
        clock,
        recordMergedQuestion: (previous, next, at) => notebook.mergeInterviewerTurn(previous, next, at),
        overlay: { showText() {}, showAsk() {}, setOutdated() {}, setInterviewerSpeaking() {} },
    });
    const supervisor = new BrainSupervisor({
        sessionId: 'test', preferred: 'gemini-live', clock, notebook, instructions: () => '',
        create: () => ({ brain, model: 'test' }),
        onEvent: event => orchestrator.handleEvent(event),
    });
    supervisor.start();
    await flush();
    const emit = (type, fields = {}) => brain.emit({ type, at: clock.now(), ...fields });
    emit('interviewer_speech_started');
    emit('interviewer_transcript', { text: 'Design a store.', final: true });
    emit('response_started', { responseId: 'old' });
    emit('response_delta', { responseId: 'old', text: 'Discard this partial.' });
    clock.advance(100);
    emit('interviewer_speech_started');
    emit('response_done', { responseId: 'old', status: 'cancelled', cancelReason: 'interviewer_barge_in' });
    emit('interviewer_transcript', { text: 'Use MongoDB.', final: true });
    emit('response_started', { responseId: 'new' });
    emit('response_delta', { responseId: 'new', text: 'Use indexes.' });
    emit('response_done', { responseId: 'new', status: 'completed' });
    assert.deepEqual(notebook.recentTurns().map(({ role, text }) => [role, text]), [
        ['interviewer', 'Design a store. Use MongoDB.'], ['assistant', 'Use indexes.'],
    ]);
    supervisor.stop();
});

test('D21 pipeline reuses a slot only after a streaming correction', async () => {
    const replacements = [];
    const brain = new PipelineBrain(() => {}, (...args) => replacements.push(args));
    await brain.start({ signal: new AbortController().signal });
    brain.observe({ generationId: 1, type: 'token', text: 'A partial.', question: 'Design a store.' });
    brain.interviewerTranscript('Use MongoDB.', true, Date.now());
    brain.observe({ generationId: 1, type: 'discard', cancelReason: 'answer_corrected' });
    brain.observe({ generationId: 2, type: 'answer', text: 'Use indexes.', question: 'Design a store. Use MongoDB.' });
    brain.interviewerTranscript('Add a queue.', true, Date.now());
    brain.observe({ generationId: 3, type: 'answer', text: 'Use a queue.', question: 'Add a queue.' });
    assert.deepEqual(replacements, [[2, 1, 'Design a store.', 'Use MongoDB.']]);
    await brain.stop();
});
