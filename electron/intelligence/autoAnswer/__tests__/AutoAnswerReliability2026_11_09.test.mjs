import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { FakeClock } from './fakeClock.mjs';

const require = createRequire(import.meta.url);
const { SimpleAutoAnswerEngine, ANSWER_FLOOR } = require('../../../../dist-electron/electron/intelligence/autoAnswer/SimpleAutoAnswer.js');
const { resolveAutoAnswerThresholds } = require('../../../../dist-electron/electron/context-intelligence/policies/mode-policy-registry.js');
const verdict = (answerability = .95, isAsk = true) => JSON.stringify({ is_ask: isAsk, directed_at_user: isAsk, complete: true, act: isAsk ? 'question' : 'statement', answerability, question_text: null });
const QUESTION = 'How would you design a resilient event pipeline?';
const SECOND = 'How would you monitor the database replication delay?';
const THIRD = 'How would you validate the backup restoration procedure?';

function rig(judge = async () => verdict(), thresholds = resolveAutoAnswerThresholds('technical-interview')) {
  const clock = new FakeClock();
  const s = { active: true, enabled: true, generation: 1, accepting: true, answers: [], notices: [], events: [], calls: 0 };
  const engine = new SimpleAutoAnswerEngine({
    isEnabled: () => s.enabled, isMeetingActive: () => s.active, meetingGeneration: () => s.generation,
    engineAccepting: () => s.accepting, recentTurns: () => [],
    dispatch: (q) => { s.answers.push(q); s.accepting = false; },
    judgeCandidate: (req, signal) => { s.calls++; return judge(req, s.calls, signal); },
    terminal: (notice) => s.notices.push(notice), telemetry: (event) => s.events.push(event),
  }, clock, thresholds);
  engine.onMeetingStart();
  const say = (text) => engine.ingest({ speaker: 'interviewer', text, final: true, timestamp: clock.now(), origin: 'stt' });
  const advance = async (ms) => { for (let elapsed = 0; elapsed < ms; elapsed += 50) { clock.advance(Math.min(50, ms - elapsed)); await new Promise(setImmediate); await new Promise(setImmediate); } };
  const idle = () => { s.accepting = true; engine.onEngineIdle(); };
  return { s, engine, clock, say, advance, idle };
}

test('clean question dispatches once, without a missed notice', async () => {
  const h = rig(); h.say(QUESTION); await h.advance(1500);
  assert.equal(h.s.answers.length, 1); assert.equal(h.s.notices.length, 0);
});

test('failed dispatches produce one missed notice and leave the queue available', async () => {
  for (const fail of [
    () => { throw new Error('provider failed'); },
    async () => { throw new Error('provider failed'); },
    async () => 'failed',
  ]) {
    const h = rig();
    h.engine.host.dispatch = fail;
    h.say(QUESTION);
    await h.advance(1500);
    assert.deepEqual(h.s.notices.map(({ text, reason }) => ({ text, reason })), [
      { text: QUESTION, reason: 'dispatch_failed' },
    ]);

    h.engine.host.dispatch = async q => { h.s.answers.push(q.text); return 'success'; };
    h.say(SECOND);
    await h.advance(1500);
    assert.deepEqual(h.s.answers, [SECOND]);
  }
});

test('a second question waits for the first dispatch even while the host reports idle', async () => {
  const h = rig();
  let finish;
  const first = new Promise(resolve => { finish = resolve; });
  h.engine.host.dispatch = q => {
    h.s.answers.push(q.text);
    return q.text === QUESTION ? first : Promise.resolve('success');
  };
  h.say(QUESTION);
  await h.advance(2000);
  h.say(SECOND);
  await h.advance(1500);
  h.idle();
  assert.deepEqual(h.s.answers, [QUESTION]);
  finish('cancelled');
  await h.advance(100);
  assert.deepEqual(h.s.answers, [QUESTION, SECOND]);
  assert.deepEqual(h.s.notices, []);
});

test('a dispatch that fails after a mode reset cannot show a missed notice', async () => {
  const h = rig();
  let finish;
  h.engine.host.dispatch = () => new Promise(resolve => { finish = resolve; });
  h.say(QUESTION);
  await h.advance(1500);
  h.engine.setThresholds(resolveAutoAnswerThresholds('technical-interview'));
  finish('failed');
  await h.advance(100);
  assert.deepEqual(h.s.notices, []);
});
for (const busyMs of [5000, 12000]) test(`a question survives ${busyMs}ms busy and wakes immediately on idle`, async () => {
  const h = rig(); h.s.accepting = false; h.say(QUESTION); await h.advance(busyMs);
  assert.equal(h.s.answers.length, 0); h.idle();
  assert.equal(h.s.answers.length, 1); assert.equal(h.s.notices.length, 0);
});
test('two positive questions survive newer speech and drain newest first on successive idle events', async () => {
  const h = rig(); h.s.accepting = false; h.say(QUESTION); await h.advance(1500);
  h.say(SECOND); await h.advance(1500); h.idle();
  assert.equal(h.s.answers[0]?.text, SECOND); h.idle();
  assert.deepEqual(h.s.answers.map(q => q.text), [SECOND, QUESTION]); assert.equal(h.s.notices.length, 0);
});
test('queue bounds evict the oldest question visibly; fresh remaining questions still dispatch', async () => {
  const h = rig(); h.s.accepting = false;
  for (const q of [QUESTION, SECOND, THIRD]) { h.say(q); await h.advance(1500); }
  assert.equal(h.s.notices.length, 1); assert.equal(h.s.notices[0].reason, 'superseded');
  assert.equal(h.s.notices[0].text, QUESTION); h.idle(); h.idle();
  assert.deepEqual(h.s.answers.map(q => q.text), [THIRD, SECOND]);
});
test('freshness is thirty seconds from arrival, with one terminal notice and no late idle dispatch', async () => {
  const h = rig(); h.s.accepting = false; h.say(QUESTION); await h.advance(31000); h.idle();
  assert.equal(h.s.answers.length, 0); assert.equal(h.s.notices.length, 1);
  assert.equal(h.s.notices[0].reason, 'stale'); assert.equal(h.s.notices[0].text, QUESTION);
  assert.equal(h.s.events.filter(e => e.name === 'auto_answer_terminal').length, 1);
  assert.ok(h.s.events.every(e => !('text' in e)));
});
test('judge failure retries twice on a declarative task, then produces one missed notice without guessing', async () => {
  const h = rig(async () => { throw new Error('simulated provider unavailable'); });
  h.say('Your task is to implement a bounded cache with eviction.'); await h.advance(12000);
  assert.equal(h.s.calls, 3); assert.equal(h.s.answers.length, 0); assert.equal(h.s.notices.length, 1);
  assert.equal(h.s.notices[0].reason, 'judge_failed');
  assert.equal(h.s.events.filter(e => e.name === 'auto_answer_terminal').length, 1);
});
test('a judge recovering on its third attempt dispatches the declarative task once', async () => {
  const h = rig(async (_req, n) => { if (n < 3) throw new Error('simulated outage'); return verdict(); });
  h.say('Your task is to implement a bounded cache with eviction.'); await h.advance(4000);
  assert.equal(h.s.calls, 3); assert.equal(h.s.answers.length, 1); assert.equal(h.s.notices.length, 0);
});
test('small talk deliberately skipped by the judge produces no missed notice', async () => {
  const h = rig(async () => verdict(0, false)); h.say('The weather is pleasant outside today.'); await h.advance(4000);
  assert.equal(h.s.answers.length, 0); assert.equal(h.s.notices.length, 0);
});
test('ending the meeting drops queued work with telemetry only, never an answer or notice', async () => {
  const h = rig(); h.s.accepting = false; h.say(QUESTION); await h.advance(1500);
  h.s.active = false; h.engine.onMeetingStop(); h.idle(); await h.advance(35000);
  assert.equal(h.s.answers.length, 0); assert.equal(h.s.notices.length, 0);
  assert.ok(h.s.events.some(e => e.name === 'auto_answer_terminal' && e.terminalReason === 'meeting_ended'));
});
test('changing modes flushes old-mode queued answers even when the new mode has the same threshold', async () => {
  const h = rig(); h.s.accepting = false; h.say(QUESTION); await h.advance(1500);
  h.engine.setThresholds(resolveAutoAnswerThresholds('technical-interview')); h.idle();
  assert.equal(h.s.answers.length, 0); assert.equal(h.s.notices.length, 0);
});
test('same verdict passes interview threshold but fails the strict listening mode', async () => {
  for (const [mode, expected] of [['technical-interview', 1], ['lecture', 0]]) {
    const h = rig(async () => verdict(.90), resolveAutoAnswerThresholds(mode)); h.say(QUESTION); await h.advance(1500);
    assert.equal(h.s.answers.length, expected, mode); assert.equal(h.s.notices.length, 0);
  }
});
test('resolved threshold is inclusive but the global safety floor is never bypassed', async () => {
  const threshold = resolveAutoAnswerThresholds('technical-interview').autoThreshold;
  for (const [score, expected] of [[threshold - .001, 0], [threshold, 1]]) {
    const h = rig(async () => verdict(score)); h.say(QUESTION); await h.advance(1500); assert.equal(h.s.answers.length, expected);
  }
  for (const score of [ANSWER_FLOOR - .01, ANSWER_FLOOR]) {
    const h = rig(async () => verdict(score), { autoThreshold: 0, offerThreshold: 0, speculationThreshold: 0 });
    h.say(QUESTION); await h.advance(1500); assert.equal(h.s.answers.length, 0);
  }
});

test('explicit judge-off fallback still obeys the resolved strict mode threshold', async () => {
  const h = rig(undefined, resolveAutoAnswerThresholds('lecture'));
  delete h.engine.host.judgeCandidate;
  h.say(QUESTION); await h.advance(1500);
  assert.equal(h.s.answers.length, 0); assert.equal(h.s.notices.length, 0);
});
test('mode switch aborts scheduled judge retries and cannot publish the prior mode notice', async () => {
  const h = rig(async () => { throw new Error('simulated outage'); });
  h.say(QUESTION); await h.advance(300);
  h.engine.setThresholds(resolveAutoAnswerThresholds('lecture'));
  await h.advance(35000);
  assert.equal(h.s.calls, 1); assert.equal(h.s.answers.length, 0); assert.equal(h.s.notices.length, 0);
});
test('an old meeting generation cannot dispatch or notify a queued question', async () => {
  const h = rig(); h.s.accepting = false; h.say(QUESTION); await h.advance(1500);
  h.s.generation++; h.idle(); await h.advance(1000);
  assert.equal(h.s.answers.length, 0); assert.equal(h.s.notices.length, 0);
});
test('a late pre-reset positive verdict cannot resurrect after a mode switch and newer speech', async () => {
  let resolveOld;
  const h = rig((_req, n) => n === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(verdict(0, false)));
  h.say(QUESTION); await h.advance(200);
  h.engine.setThresholds(resolveAutoAnswerThresholds('technical-interview'));
  h.say(QUESTION); await h.advance(200);
  resolveOld(verdict()); await h.advance(2000);
  assert.equal(h.s.answers.length, 0); assert.equal(h.s.notices.length, 0);
});
