import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { FakeClock } from '../../autoAnswer/__tests__/fakeClock.mjs';

const require = createRequire(import.meta.url);
const dist = '../../../../dist-electron/';
const load = name => require(`${dist}premium/electron/liveBrain/${name}.js`);
const { BrainSupervisor } = load('BrainSupervisor');
const { InterviewNotebook } = load('InterviewNotebook');
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
    const orchestrator = useOrchestrator ? new ResponseOrchestrator({
        clock,
        recordSttQuestion: (text, at) => supervisor.recordInterviewerTurn(text, at),
        overlay: { showText() {}, showQuestion() {}, showAsk() {}, setOutdated() {}, setInterviewerSpeaking() {} },
    }) : undefined;
    const supervisor = new BrainSupervisor({
        sessionId: 'meeting', preferred, instructions: id => `Answer instructions for ${id}`, notebook, clock,
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
    return { clock, notebook, supervisor, realtime, attempted, seen, switches, rollovers, orchestrator };
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

test('handled suppressed answers and cancelled filler stay out of the notebook while Ask is recorded', async () => {
    const h = rig('gemini-live', 0, ['gemini-live'], undefined, true);
    h.supervisor.start();
    await flush();
    const brain = h.realtime[0];
    const respond = (responseId, text, status) => {
        brain.emit({ type: 'interviewer_transcript', final: true, text: 'Mm-hmm.', at: h.clock.now() });
        brain.emit({ type: 'response_started', responseId, at: h.clock.now() });
        brain.emit({ type: 'response_delta', responseId, text });
        brain.emit({ type: 'response_done', responseId, status });
    };
    respond('hidden', 'Hidden answer.', 'completed');
    respond('interrupted', 'Hidden partial.', 'cancelled');
    assert.deepEqual(h.notebook.recentTurns().filter(turn => turn.role === 'assistant'), []);
    respond('ask', 'Ask: Which region?', 'completed');
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
        assert.deepEqual(h.attempted, ['gemini-live', 'openai-realtime', 'elevenlabs-realtime', 'deepgram-voice-agent', 'deepgram-flux', 'pipeline']);
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
    assert.deepEqual(h.attempted, ['elevenlabs-realtime', 'gemini-live', 'openai-realtime', 'deepgram-voice-agent', 'deepgram-flux', 'pipeline']);
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
