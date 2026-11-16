/**
 * Auto Answer after a manual press (2026-11-16, Codex review findings 1 and 2).
 *
 * 1. A question asked while a long MANUAL answer streams was parked for only
 *    RETRY_TTL_MS (8 s) and then dropped (engine_busy_or_cooling). Behind a
 *    manual answer it now waits until the engine is idle (up to
 *    MANUAL_PARK_MAX_MS).
 * 2. A spoken press marked its question answered the moment it STARTED. A
 *    press that then failed left the question unanswered and Auto Answer
 *    refusing to answer it. Now the press settles: failed → the question goes
 *    back to Auto Answer; answered while the interviewer was still talking and
 *    they went on → the whole question is judged again.
 * Fake clock, fake judge, zero sleeps.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FakeClock } from './fakeClock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { SimpleAutoAnswerEngine, STABILITY_MS, RETRY_MS, RETRY_TTL_MS, MANUAL_PARK_MAX_MS, MANUAL_SETTLE_WAIT_MS } = require(path.resolve(__dirname, '../../../../dist-electron/electron/intelligence/autoAnswer/SimpleAutoAnswer.js'));

const flush = () => new Promise((r) => setImmediate(r));
const YES = JSON.stringify({ is_ask: true, directed_at_user: true, complete: true, act: 'question', answerability: 0.95, question_text: null });

function makeSimple(judgeImpl, overrides = {}) {
    const clock = new FakeClock();
    const state = { accepting: true, turns: [], dispatched: [], skips: [], judgeCalls: [], meetingGen: 1, ...overrides };
    const host = {
        isEnabled: () => true,
        isMeetingActive: () => true,
        meetingGeneration: () => state.meetingGen,
        engineAccepting: () => state.accepting,
        recentTurns: () => state.turns,
        dispatch: (q) => { state.dispatched.push(q.text); return true; },
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
    const interim = (text) => engine.ingest({ speaker: 'interviewer', text, final: false, timestamp: clock.now(), origin: 'stt' });
    const advance = async (ms) => { let left = ms; while (left > 0) { const s = Math.min(100, left); clock.advance(s); left -= s; await flush(); await flush(); } };
    return { engine, state, interviewer, interim, advance, clock };
}

const Q1 = 'Why did you choose PostgreSQL over the alternatives here?';
const Q2 = 'How would you shard the orders table once it outgrows one node?';

test('finding 1: a question asked during a long manual answer is answered when it ends, not dropped at 8 s', async () => {
    const h = makeSimple(async () => YES);
    h.engine.onManualAnswerStarted();      // a manual answer to something earlier is streaming
    h.state.accepting = false;
    h.interviewer(Q2);
    await h.advance(STABILITY_MS + RETRY_TTL_MS + 12_000);   // 20 s+ of streaming
    assert.deepEqual(h.state.dispatched, []);
    assert.ok(!h.state.skips.includes('engine_busy_or_cooling'), 'not dropped while the manual answer streams');

    h.state.accepting = true;
    h.engine.onEngineIdle();
    await h.advance(RETRY_MS * 3);
    assert.deepEqual(h.state.dispatched, [Q2]);
});

test('finding 1: without a manual answer the 8 s park still applies (unchanged)', async () => {
    const h = makeSimple(async () => YES, { accepting: false });
    h.interviewer(Q2);
    await h.advance(STABILITY_MS + RETRY_TTL_MS + 2_000);
    assert.ok(h.state.skips.includes('engine_busy_or_cooling'));
});

test('finding 1: the manual park is bounded by MANUAL_PARK_MAX_MS', async () => {
    const h = makeSimple(async () => YES);
    h.engine.onManualAnswerStarted();
    h.state.accepting = false;
    h.interviewer(Q2);
    await h.advance(MANUAL_PARK_MAX_MS + 2_000);
    assert.ok(h.state.skips.includes('engine_busy_or_cooling'), 'a stuck engine does not park forever');
    h.state.accepting = true;
    h.engine.onEngineIdle();
    await h.advance(RETRY_MS * 3);
    assert.deepEqual(h.state.dispatched, []);
});

test('finding 1: a newer question still supersedes the one parked behind the manual answer', async () => {
    const h = makeSimple(async () => YES);
    h.engine.onManualAnswerStarted();
    h.state.accepting = false;
    h.interviewer(Q1);
    await h.advance(STABILITY_MS + 500);
    h.interviewer(Q2);
    await h.advance(STABILITY_MS + 12_000);
    h.state.accepting = true;
    h.engine.onEngineIdle();
    await h.advance(RETRY_MS * 3);
    assert.equal(h.state.dispatched.length, 1);
    assert.match(h.state.dispatched[0], /shard the orders table/);
});

test('finding 2: a manual press that FAILS gives the question back to Auto Answer', async () => {
    const h = makeSimple(async () => YES);
    h.interviewer(Q1);
    h.engine.onManualAnswerStarted();
    h.engine.onManualSpokenAnswer();
    await h.advance(STABILITY_MS + 300);
    assert.deepEqual(h.state.dispatched, [], 'handed over while the press runs');

    h.engine.onManualAnswerSettled({ answered: false });
    await h.advance(STABILITY_MS + 300);
    assert.deepEqual(h.state.dispatched, [Q1], 'the unanswered question is answered automatically');
    assert.notEqual(h.state.judgeCalls.at(-1).req.lastAnsweredText, Q1, 'and the judge is not told it was answered');
});

test('finding 2: a manual press that succeeds keeps the question answered', async () => {
    const h = makeSimple(async () => YES);
    h.interviewer(Q1);
    h.engine.onManualAnswerStarted();
    h.engine.onManualSpokenAnswer();
    h.engine.onManualAnswerSettled({ answered: true, answeredQuestion: Q1 });
    await h.advance(STABILITY_MS + 500);
    assert.deepEqual(h.state.dispatched, []);

    h.interviewer(Q2);
    await h.advance(STABILITY_MS + 300);
    assert.deepEqual(h.state.dispatched, [Q2]);
    assert.equal(h.state.judgeCalls.at(-1).req.lastAnsweredText, Q1);
});

test('finding 2: pressed mid-question, the interviewer goes on: the whole question is judged again', async () => {
    const h = makeSimple(async () => YES);
    h.interviewer('So walk me through your caching layer,');
    h.interim('and how you would invalidate');
    h.engine.onManualAnswerStarted();
    h.engine.onManualSpokenAnswer();
    h.interviewer('and how you would invalidate entries when the source of truth changes?');
    h.engine.onManualAnswerSettled({ answered: true, answeredQuestion: 'So walk me through your caching layer,' });
    await h.advance(STABILITY_MS + 500);
    assert.equal(h.state.dispatched.length, 1);
    assert.match(h.state.dispatched[0], /caching layer.*invalidate entries/, 'one answer for the whole question');
});

test('finding 2: pressed mid-question, but the rest was a repeat of what was answered: no second answer', async () => {
    const h = makeSimple(async () => YES);
    h.interviewer(Q1);
    h.interim('why did you choose');
    h.engine.onManualAnswerStarted();
    h.engine.onManualSpokenAnswer();
    h.interviewer('Why did you choose PostgreSQL over the alternatives?');
    h.engine.onManualAnswerSettled({ answered: true, answeredQuestion: Q1 });
    await h.advance(STABILITY_MS + 500);
    assert.deepEqual(h.state.dispatched, []);
});

test('finding 2: a settle from an earlier meeting is ignored', async () => {
    const h = makeSimple(async () => YES);
    h.interviewer(Q1);
    h.engine.onManualAnswerStarted();
    h.engine.onManualSpokenAnswer();
    h.state.meetingGen = 2;
    h.engine.onManualAnswerSettled({ answered: false });
    await h.advance(STABILITY_MS + 500);
    assert.deepEqual(h.state.dispatched, []);
});

test('finding 2: a settle with no spoken handover is inert', async () => {
    const h = makeSimple(async () => YES);
    h.engine.onManualAnswerStarted();
    h.engine.onManualAnswerSettled({ answered: false });
    h.interviewer(Q2);
    await h.advance(STABILITY_MS + 300);
    assert.deepEqual(h.state.dispatched, [Q2]);
});

test('wiring: the engine reports how a press ended and main forwards it to Auto Answer', async () => {
    const fs = await import('node:fs');
    const root = path.resolve(__dirname, '../../../..');
    const eng = fs.readFileSync(path.join(root, 'electron/IntelligenceEngine.ts'), 'utf8');
    const ipc = fs.readFileSync(path.join(root, 'electron/ipcHandlers.ts'), 'utf8');
    const main = fs.readFileSync(path.join(root, 'electron/main.ts'), 'utf8');
    assert.match(eng, /finally \{[\s\S]{0,400}options\?\.onSettled\?\.\(/);
    assert.match(ipc, /onStart: \(press\) => \{\s*try \{ manualPressId = appState\.onManualWhatToAnswer\?\.\(press\)/);
    assert.match(ipc, /onSettled: \(result\) => \{\s*if \(manualPressId === undefined\) return;\s*try \{ appState\.onManualWhatToAnswerSettled\?\.\(\{ \.\.\.result, pressId: manualPressId \}\)/);
    assert.match(main, /onManualWhatToAnswerSettled\([^)]*\): void \{\s*this\.simpleAutoAnswer\.onManualAnswerSettled\(/);
});

// Codex review round 2 (2026-11-16).
test('an older press settling late cannot clear the newer press\'s handover', async () => {
    const h = makeSimple(async () => YES);
    h.interviewer(Q1);
    const first = h.engine.onManualAnswerStarted();
    h.engine.onManualSpokenAnswer();
    await h.advance(1_000);
    h.interviewer(Q2);
    const second = h.engine.onManualAnswerStarted();
    h.engine.onManualSpokenAnswer();
    assert.notEqual(first, second);

    h.engine.onManualAnswerSettled({ answered: true, answeredQuestion: Q1, pressId: first });   // the old run ends late
    h.engine.onManualAnswerSettled({ answered: false, pressId: second });                       // the new one fails
    await h.advance(STABILITY_MS + 500);
    assert.deepEqual(h.state.dispatched, [Q2], 'the newer, failed question is still given back');
});

test('a settle from the previous meeting does not touch the new meeting', async () => {
    const h = makeSimple(async () => YES);
    h.interviewer(Q1);
    const oldPress = h.engine.onManualAnswerStarted();
    h.engine.onManualSpokenAnswer();
    h.engine.onMeetingStop();
    h.engine.onMeetingStart();
    h.state.turns = [];
    h.interviewer(Q2);
    const newPress = h.engine.onManualAnswerStarted();
    h.engine.onManualSpokenAnswer();
    h.engine.onManualAnswerSettled({ answered: true, answeredQuestion: Q1, pressId: oldPress });
    h.engine.onManualAnswerSettled({ answered: false, pressId: newPress });
    await h.advance(STABILITY_MS + 500);
    assert.deepEqual(h.state.dispatched, [Q2]);
});

test('idle before settle: a failed manual Q1 is settled before the parked Q2 is woken (one answer, Q1 included)', async () => {
    const h = makeSimple(async () => YES);
    h.interviewer(Q1);
    const press = h.engine.onManualAnswerStarted();
    h.engine.onManualSpokenAnswer();
    h.state.accepting = false;
    await h.advance(2_000);
    h.interviewer(Q2);
    await h.advance(STABILITY_MS + 500);
    assert.deepEqual(h.state.dispatched, [], 'parked behind the manual answer');

    h.state.accepting = true;
    h.engine.onEngineIdle();                 // the engine goes idle first...
    await h.advance(300);
    assert.deepEqual(h.state.dispatched, [], 'the parked question waits for the press to report');
    h.engine.onManualAnswerSettled({ answered: false, pressId: press });   // ...then the press reports
    await h.advance(STABILITY_MS + 500);
    assert.equal(h.state.dispatched.length, 1, 'one answer, not a tail answer plus a lost Q1');
    assert.match(h.state.dispatched[0], /PostgreSQL/);
});

test('idle before settle: a successful manual Q1 releases the parked Q2 at once', async () => {
    const h = makeSimple(async () => YES);
    h.interviewer(Q1);
    const press = h.engine.onManualAnswerStarted();
    h.engine.onManualSpokenAnswer();
    h.state.accepting = false;
    await h.advance(2_000);
    h.interviewer(Q2);
    await h.advance(STABILITY_MS + 500);
    h.state.accepting = true;
    h.engine.onEngineIdle();
    h.engine.onManualAnswerSettled({ answered: true, answeredQuestion: Q1, pressId: press });
    await h.advance(RETRY_MS * 2);
    assert.deepEqual(h.state.dispatched, [Q2]);
});

test('idle with no settle report: the parked question still goes after MANUAL_SETTLE_WAIT_MS', async () => {
    const h = makeSimple(async () => YES);
    h.interviewer(Q1);
    h.engine.onManualAnswerStarted();
    h.engine.onManualSpokenAnswer();
    h.state.accepting = false;
    await h.advance(2_000);
    h.interviewer(Q2);
    await h.advance(STABILITY_MS + 500);
    h.state.accepting = true;
    h.engine.onEngineIdle();
    await h.advance(MANUAL_SETTLE_WAIT_MS - 200);
    assert.deepEqual(h.state.dispatched, []);
    await h.advance(400);
    assert.deepEqual(h.state.dispatched, [Q2]);
});
