import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FakeClock } from './fakeClock.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const { SimpleAutoAnswerEngine, STABILITY_MS, RETRY_MS, FEEDBACK_WINDOW_MS, DISPATCH_STALL_MS, DISPATCH_MAX_MS } =
  require(path.join(root, 'dist-electron', 'premium', 'electron', 'autoAnswer', 'SimpleAutoAnswer.js'));

const Q1 = 'How would you design a rate limiter for this system?';
const Q2 = 'What database would you use to store session data?';
const Q3 = 'Why does the cache need a separate eviction policy?';
const YES = JSON.stringify({ is_ask: true, directed_at_user: true, complete: true, act: 'question', answerability: 0.95 });
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => Promise.withResolvers();

function rig(results = []) {
  const clock = new FakeClock();
  const attempts = [];
  const judgments = [];
  const cancels = [];
  const events = [];
  const state = { enabled: true, active: true, accepting: true };
  const engine = new SimpleAutoAnswerEngine({
    isEnabled: () => state.enabled,
    isMeetingActive: () => state.active,
    meetingGeneration: () => 1,
    engineAccepting: () => state.accepting,
    recentTurns: () => [],
    dispatch(question) {
      const result = results[attempts.length] ?? true;
      attempts.push(question);
      return result;
    },
    cancelAutomaticAnswer: reason => { cancels.push(reason); return true; },
    judgeCandidate: async ({ candidateText }) => { judgments.push(candidateText); return YES; },
    telemetry: event => events.push(event),
  }, clock);
  engine.onMeetingStart();
  const say = text => engine.ingest({ speaker: 'interviewer', text, final: true, timestamp: clock.now(), origin: 'stt' });
  async function advance(ms) {
    while (ms > 0) {
      const step = Math.min(100, ms);
      clock.advance(step);
      ms -= step;
      await flush();
    }
  }
  async function ask(text) {
    say(text);
    await advance(STABILITY_MS);
  }
  return { engine, clock, state, attempts, judgments, cancels, events, say, ask, advance, texts: () => attempts.map(q => q.text) };
}

test('a hung dispatch times out, retries once, and a later question still dispatches', async () => {
  const h = rig([deferred().promise]);
  await h.ask(Q1);
  await h.advance(DISPATCH_STALL_MS - 1);
  assert.deepEqual(h.cancels, []);
  await h.advance(1);
  assert.deepEqual(h.cancels, ['dispatch_timeout']);
  assert.equal(h.events.filter(e => e.skipReason === 'dispatch_timeout').length, 1);
  await h.advance(RETRY_MS);
  assert.deepEqual(h.texts(), [Q1, Q1]);
  await h.ask(Q2);
  assert.deepEqual(h.texts(), [Q1, Q1, Q2]);
});

test('steady token progress keeps a 60-second dispatch alive', async () => {
  const live = deferred();
  const h = rig([live.promise]);
  await h.ask(Q1);
  for (let elapsed = 0; elapsed < 60_000; elapsed += 10_000) {
    await h.advance(10_000);
    h.engine.onAutomaticAnswerProgress();
  }
  live.resolve({ status: 'completed' });
  await flush();
  await h.advance(DISPATCH_STALL_MS);
  assert.deepEqual(h.cancels, []);
  assert.deepEqual(h.texts(), [Q1]);
});

test('the hard cap expires despite progress and the old question can still be retried', async () => {
  const h = rig([deferred().promise]);
  await h.ask(Q1);
  for (let elapsed = 0; elapsed < DISPATCH_MAX_MS - 10_000; elapsed += 10_000) {
    await h.advance(10_000);
    h.engine.onAutomaticAnswerProgress();
  }
  await h.advance(9_999);
  assert.deepEqual(h.cancels, []);
  await h.advance(1);
  assert.deepEqual(h.cancels, ['dispatch_timeout']);
  await h.advance(RETRY_MS);
  assert.deepEqual(h.texts(), [Q1, Q1]);
});

test('late success from a timed-out request cannot record feedback or dispatch twice', async () => {
  const late = deferred();
  const retry = deferred();
  const h = rig([late.promise, retry.promise]);
  await h.ask(Q1);
  await h.advance(DISPATCH_STALL_MS + RETRY_MS);
  assert.deepEqual(h.texts(), [Q1, Q1]);
  const before = [...h.events];
  late.resolve({ status: 'completed' });
  await flush();
  assert.deepEqual(h.events, before);
  retry.resolve({ status: 'completed' });
  await flush();
  await h.advance(FEEDBACK_WINDOW_MS);
  assert.deepEqual(h.events.filter(e => e.name === 'auto_answer_feedback').map(e => e.questionId), [h.attempts[1].id]);
  assert.deepEqual(h.texts(), [Q1, Q1]);
});

test('retryable failure gets one retry, then records a give-up', async () => {
  const failure = { status: 'failed', retryable: true };
  const h = rig([failure, failure]);
  await h.ask(Q1);
  await h.advance(RETRY_MS + STABILITY_MS * 2);
  assert.deepEqual(h.texts(), [Q1, Q1]);
  assert.equal(h.events.filter(e => e.name === 'auto_answer_retrying').length, 1);
  assert.equal(h.events.filter(e => e.skipReason === 'dispatch_failed').length, 1);
  await h.ask(Q2);
  assert.deepEqual(h.texts(), [Q1, Q1, Q2]);
});

test('a quiet cancellation re-judges the same pending question', async () => {
  const h = rig([{ status: 'cancelled' }]);
  await h.ask(Q1);
  await h.advance(STABILITY_MS);
  assert.deepEqual(h.judgments, [Q1, Q1]);
  assert.deepEqual(h.texts(), [Q1, Q1]);
});

for (const transition of ['meeting stops', 'Auto Answer is disabled']) {
  test(`cancellation cannot re-arm after ${transition}`, async () => {
    const live = deferred();
    const h = rig([live.promise]);
    await h.ask(Q1);
    if (transition === 'meeting stops') h.state.active = false;
    else h.state.enabled = false;
    h.engine.onMeetingStop();
    live.resolve({ status: 'cancelled' });
    await flush();
    await h.advance(DISPATCH_MAX_MS);
    assert.deepEqual(h.judgments, [Q1]);
    assert.deepEqual(h.texts(), [Q1]);
    assert.deepEqual(h.cancels, []);
    assert.equal(h.clock.pendingCount(), 0);
  });
}

test('Q2 is judged while Q1 streams and dispatches as soon as Q1 settles', async () => {
  const first = deferred();
  const h = rig([first.promise]);
  await h.ask(Q1);
  await h.ask(Q2);
  for (let elapsed = 0; elapsed < 50_000; elapsed += 10_000) {
    await h.advance(10_000);
    h.engine.onAutomaticAnswerProgress();
  }
  assert.match(h.judgments.at(-1), /What database/);
  assert.deepEqual(h.texts(), [Q1]);
  first.resolve({ status: 'completed' });
  await flush();
  assert.deepEqual(h.texts(), [Q1, Q2]);
  assert.deepEqual(h.cancels, []);
});

test('an engine busy result parks until idle without spending the failure retry', async () => {
  const first = deferred();
  const h = rig([first.promise]);
  await h.ask(Q2);
  h.state.accepting = false;
  first.resolve({ status: 'skipped', reason: 'busy' });
  await flush();
  await h.advance(RETRY_MS * 5);
  assert.deepEqual(h.texts(), [Q2]);
  h.state.accepting = true;
  h.engine.onEngineIdle();
  await flush();
  assert.deepEqual(h.texts(), [Q2, Q2]);
  assert.ok(!h.events.some(e => e.name === 'auto_answer_retrying' || e.skipReason === 'engine_busy_or_cooling'));
});

test('a wordless voice start (cough) drops the park but not the question: Q2 is answered after Q1', async () => {
  const first = deferred();
  const h = rig([first.promise]);
  await h.ask(Q1);
  await h.ask(Q2);
  h.engine.onLocalSpeechStart();
  assert.equal(h.events.filter(e => e.skipReason === 'superseded_while_parked').length, 1);
  first.resolve({ status: 'completed' });
  h.engine.onLocalSpeechEnd();
  await h.advance(STABILITY_MS * 3);
  assert.deepEqual(h.texts(), [Q1, Q2], 'the cough did not lose Q2');
  assert.deepEqual(h.cancels, [], 'the live answer was never interrupted');
});

test('a voice start that continues Q2 answers the whole continued question once', async () => {
  const first = deferred();
  const h = rig([first.promise]);
  await h.ask(Q1);
  await h.ask(Q2);
  h.engine.onLocalSpeechStart();
  h.say('And how would you back it up?');
  h.engine.onLocalSpeechEnd();
  first.resolve({ status: 'completed' });
  await h.advance(STABILITY_MS * 3);
  assert.equal(h.texts().length, 2);
  assert.ok(h.texts()[1].includes('What database') && h.texts()[1].includes('back it up'), h.texts()[1]);
});

test('a newer judged Q3 replaces Q2 instead of queuing behind it', async () => {
  const first = deferred();
  const h = rig([first.promise]);
  await h.ask(Q1);
  await h.ask(Q2);
  await h.ask(Q3);
  assert.match(h.judgments.at(-1), /Why does the cache/);
  first.resolve({ status: 'completed' });
  await flush();
  assert.deepEqual(h.texts(), [Q1, Q3]);
  assert.equal(h.events.filter(e => e.skipReason === 'superseded_while_parked').length, 1);
});

test('meeting stop drops the parked question and clears its retry timer', async () => {
  const first = deferred();
  const h = rig([first.promise]);
  await h.ask(Q1);
  await h.ask(Q2);
  h.state.active = false;
  h.engine.onMeetingStop();
  first.resolve({ status: 'completed' });
  await h.advance(DISPATCH_MAX_MS);
  assert.deepEqual(h.texts(), [Q1]);
  assert.equal(h.events.filter(e => e.skipReason === 'meeting_inactive').length, 1);
  assert.equal(h.clock.pendingCount(), 0);
});
