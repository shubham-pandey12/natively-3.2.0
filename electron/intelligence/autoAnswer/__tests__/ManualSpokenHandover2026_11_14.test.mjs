/**
 * Manual press takes the question over from Auto Answer (2026-11-14).
 *
 * Reported: interviewer asks, user presses "What should I say", two answers.
 * One route was here: the automatic verdict for that same question was parked
 * behind the busy engine (or still being judged) when the press started, and
 * dispatched as soon as the manual answer finished. onManualSpokenAnswer hands
 * the question over: nothing held for it dispatches afterwards, and the next
 * question is answered as usual. Fake clock, fake judge, zero sleeps.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FakeClock } from './fakeClock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { SimpleAutoAnswerEngine, STABILITY_MS, RETRY_MS, EARLY_JUDGE_MS } = require(path.resolve(__dirname, '../../../../dist-electron/electron/intelligence/autoAnswer/SimpleAutoAnswer.js'));

const flush = () => new Promise((r) => setImmediate(r));
const YES = JSON.stringify({ is_ask: true, directed_at_user: true, complete: true, act: 'question', answerability: 0.95, question_text: null });

function makeSimple(judgeImpl, overrides = {}) {
    const clock = new FakeClock();
    const state = { accepting: true, turns: [], dispatched: [], skips: [], judgeCalls: [], ...overrides };
    const host = {
        isEnabled: () => true,
        isMeetingActive: () => true,
        meetingGeneration: () => 1,
        engineAccepting: () => state.accepting,
        recentTurns: () => state.turns,
        dispatch: (q) => { state.dispatched.push(q.text); },
        telemetry: (e) => { if (e.name === 'auto_answer_ignored') state.skips.push(e.skipReason); },
        log: () => {},
        judgeCandidate: (req, signal) => { state.judgeCalls.push({ req, signal }); return judgeImpl(req); },
    };
    const engine = new SimpleAutoAnswerEngine(host, clock);
    engine.onMeetingStart();
    const interviewer = (text) => {
        state.turns.push({ role: 'interviewer', text, timestamp: clock.now() });
        engine.ingest({ speaker: 'interviewer', text, final: true, timestamp: clock.now(), origin: 'stt' });
    };
    const advance = async (ms) => { let left = ms; while (left > 0) { const s = Math.min(100, left); clock.advance(s); left -= s; await flush(); await flush(); } };
    return { engine, state, interviewer, advance };
}

test('a dispatch parked behind the manual answer never fires after it', async () => {
    const h = makeSimple(async () => YES, { accepting: false });
    h.interviewer('Why did you choose PostgreSQL over the alternatives here?');
    await h.advance(STABILITY_MS + 200);
    assert.deepEqual(h.state.dispatched, [], 'parked: the engine is busy with the manual answer');

    h.engine.onManualSpokenAnswer();
    h.state.accepting = true;
    h.engine.onEngineIdle();
    await h.advance(RETRY_MS * 4);
    assert.deepEqual(h.state.dispatched, [], 'the parked dispatch was handed over, not delivered late');
    assert.ok(!h.state.skips.includes('superseded_while_parked'), 'a handover is not a supersede: no misleading drop telemetry');
});

test('a verdict still being judged when the press starts is aborted and never dispatched', async () => {
    let resolveJudge;
    const h = makeSimple(() => new Promise((r) => { resolveJudge = r; }));
    h.interviewer('Why did you choose PostgreSQL over the alternatives here?');
    await h.advance(EARLY_JUDGE_MS + 60);
    assert.equal(h.state.judgeCalls.length, 1, 'the judge is out');

    h.engine.onManualSpokenAnswer();
    assert.equal(h.state.judgeCalls[0].signal.aborted, true, 'the judge call is cancelled — it would be discarded anyway');
    resolveJudge(YES);
    await h.advance(STABILITY_MS + 500);
    assert.deepEqual(h.state.dispatched, []);
    assert.equal(h.state.judgeCalls.length, 1, 'and the same words are not judged again');
});

test('the next question after the handover is answered automatically as usual', async () => {
    const h = makeSimple(async () => YES);
    h.interviewer('Why did you choose PostgreSQL over the alternatives here?');
    h.engine.onManualSpokenAnswer();
    await h.advance(STABILITY_MS + 200);
    assert.deepEqual(h.state.dispatched, []);

    h.interviewer('How would you shard the orders table once it outgrows one node?');
    await h.advance(STABILITY_MS + 300);
    assert.deepEqual(h.state.dispatched, ['How would you shard the orders table once it outgrows one node?']);
    assert.equal(h.state.judgeCalls.at(-1).req.lastAnsweredText, 'Why did you choose PostgreSQL over the alternatives here?',
        'the judge is told the handed-over question was answered, so a restatement scores low');
});

test('a handover with nothing pending is inert', async () => {
    const h = makeSimple(async () => YES);
    h.engine.onManualSpokenAnswer();
    h.interviewer('Why did you choose PostgreSQL over the alternatives here?');
    await h.advance(STABILITY_MS + 300);
    assert.deepEqual(h.state.dispatched, ['Why did you choose PostgreSQL over the alternatives here?']);
});
