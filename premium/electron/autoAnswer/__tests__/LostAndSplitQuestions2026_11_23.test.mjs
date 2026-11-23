import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FakeClock } from './fakeClock.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const dist = (...parts) => require(path.join(root, 'dist-electron', ...parts));
const { SimpleAutoAnswerEngine, ENDPOINT_CONFIRM_MS, STABILITY_MS, TRANSCRIPT_CATCHUP_MAX_MS, LATE_TAIL_JOIN_MS } =
  dist('premium', 'electron', 'autoAnswer', 'SimpleAutoAnswer.js');
const Q1 = 'How would you design a rate limiter for this system?';
const Q2 = 'What database would you use to store session data?';
const OPENING = 'Could you explain how you would implement request throttling';
const TAIL = 'for tenants that share the same database';
const YES = JSON.stringify({ is_ask: true, directed_at_user: true, complete: true, act: 'question', answerability: 0.95 });
const completed = { status: 'completed' };
const cancelled = { status: 'cancelled' };
const flush = () => new Promise(resolve => setImmediate(resolve));

function rig(results = [], judge = () => YES) {
  const clock = new FakeClock();
  const judgments = [];
  const attempts = [];
  const cancels = [];
  const events = [];
  const state = { accepting: true };
  const engine = new SimpleAutoAnswerEngine({
    isEnabled: () => true,
    isMeetingActive: () => true,
    meetingGeneration: () => 1,
    engineAccepting: () => state.accepting,
    recentTurns: () => [],
    dispatch(question) {
      const result = results[attempts.length] ?? completed;
      attempts.push({ text: question.text, at: clock.now() });
      return result;
    },
    cancelAutomaticAnswer: reason => { cancels.push(reason); return true; },
    judgeCandidate: async ({ candidateText }) => { judgments.push(candidateText); return judge(candidateText); },
    telemetry: event => events.push(event),
  }, clock);
  engine.onMeetingStart();
  const say = (text, { final = true, speaker = 'interviewer' } = {}) =>
    engine.ingest({ speaker, text, final, timestamp: clock.now(), origin: 'stt', punctuationSource: 'provider' });
  async function advance(ms) {
    while (ms > 0) {
      const step = Math.min(20, ms);
      clock.advance(step);
      ms -= step;
      await flush();
    }
  }
  async function ask(text) {
    say(text);
    await advance(STABILITY_MS);
  }
  return { engine, clock, state, attempts, judgments, cancels, events, say, ask, advance, texts: () => attempts.map(a => a.text) };
}

test('a screenshot interrupts the automatic stream and its question dispatches once after the screenshot settles', async () => {
  const automatic = Promise.withResolvers();
  const h = rig([automatic.promise]);
  await h.ask(Q1);
  const pressId = h.engine.onManualAnswerStarted();
  h.engine.onEngineIdle(); // cancellation can publish idle before the manual generation starts
  automatic.resolve(cancelled);
  await h.advance(STABILITY_MS * 2);
  assert.deepEqual(h.texts(), [Q1]);
  h.engine.onManualAnswerSettled({ answered: true, pressId });
  await flush();
  assert.deepEqual(h.texts(), [Q1, Q1], 'the screenshot did not own the spoken words');
  await h.advance(STABILITY_MS * 2);
  assert.deepEqual(h.texts(), [Q1, Q1]);
  assert.deepEqual(h.judgments, [Q1], 'an unchanged question keeps its original verdict');
});

test('a successful spoken press takes ownership and prevents automatic re-dispatch', async () => {
  const automatic = Promise.withResolvers();
  const h = rig([automatic.promise]);
  await h.ask(Q1);
  const pressId = h.engine.onManualAnswerStarted();
  h.engine.onManualSpokenAnswer();
  automatic.resolve(cancelled);
  h.engine.onManualAnswerSettled({ answered: true, answeredQuestion: Q1, pressId });
  await h.ask(Q1);
  assert.deepEqual(h.texts(), [Q1]);
});

test('a screenshot superseding an unfinished spoken press cannot complete its handover', async () => {
  const h = rig();
  h.say(Q1);
  const spokenPressId = h.engine.onManualAnswerStarted();
  h.engine.onManualSpokenAnswer();
  const screenshotPressId = h.engine.onManualAnswerStarted();
  h.engine.onManualAnswerSettled({ answered: false, pressId: spokenPressId });
  h.engine.onManualAnswerSettled({ answered: true, pressId: screenshotPressId });
  await h.advance(STABILITY_MS);
  assert.deepEqual(h.texts(), [Q1]);
});

test('a new ask replaces the cancelled question during a screenshot press', async () => {
  const automatic = Promise.withResolvers();
  const h = rig([automatic.promise]);
  await h.ask(Q1);
  const pressId = h.engine.onManualAnswerStarted();
  automatic.resolve(cancelled);
  await h.advance(STABILITY_MS);
  await h.ask(Q2);
  assert.deepEqual(h.texts(), [Q1]);
  h.engine.onManualAnswerSettled({ answered: true, pressId });
  await flush();
  assert.deepEqual(h.texts(), [Q1, Q2]);
});

test('a newer question that the judge rejects does not replace the paused ask', async () => {
  const automatic = Promise.withResolvers();
  const silent = JSON.stringify({ is_ask: true, directed_at_user: false, complete: true, act: 'question', action: 'silent', answerability: 0.1 });
  const h = rig([automatic.promise], text => text === Q2 ? silent : YES);
  await h.ask(Q1);
  const pressId = h.engine.onManualAnswerStarted();
  automatic.resolve(cancelled);
  await h.advance(STABILITY_MS);
  await h.ask(Q2);
  assert.deepEqual(h.texts(), [Q1]);
  h.engine.onManualAnswerSettled({ answered: true, pressId });
  await h.advance(STABILITY_MS * 2);
  assert.deepEqual(h.texts(), [Q1, Q1]);
});

test('dropping a park and receiving a duplicate final still answers the question once', async () => {
  const h = rig();
  h.state.accepting = false;
  await h.ask(Q1);
  assert.deepEqual(h.texts(), []);
  const pressId = h.engine.onManualAnswerStarted();
  h.say(Q1);
  h.state.accepting = true;
  h.engine.onManualAnswerSettled({ answered: false, pressId });
  await h.advance(STABILITY_MS * 2);
  assert.deepEqual(h.texts(), [Q1]);
  assert.deepEqual(h.judgments, [Q1, Q1]);
});

test('a repeated final is harmless both in flight and after a multi-final answer already settled', async () => {
  const automatic = Promise.withResolvers();
  const h = rig([automatic.promise]);
  const end = 'for two users on the same network?';
  h.say(OPENING);
  await h.ask(end);
  h.say(end);
  await h.advance(STABILITY_MS);
  automatic.resolve(completed);
  await flush();
  h.say(end);
  await h.advance(STABILITY_MS);
  assert.deepEqual(h.texts(), [`${OPENING} ${end}`]);
  assert.deepEqual(h.cancels, []);
});

test('a delayed tail arrives 600 ms after voice stop and the complete question dispatches once', async () => {
  const h = rig();
  h.engine.onLocalSpeechStart();
  h.say(OPENING);
  h.engine.onLocalSpeechEnd();
  await h.advance(600);
  assert.deepEqual(h.judgments, []);
  h.say(TAIL);
  await h.advance(ENDPOINT_CONFIRM_MS);
  assert.deepEqual(h.texts(), [`${OPENING} ${TAIL}`]);
});

test('the first final after voice stop uses the 350 ms endpoint window', async () => {
  const h = rig();
  h.engine.onLocalSpeechStart();
  h.engine.onLocalSpeechEnd();
  await h.advance(100);
  h.say(Q1);
  await h.advance(ENDPOINT_CONFIRM_MS - 1);
  assert.deepEqual(h.texts(), []);
  await h.advance(1);
  assert.deepEqual(h.texts(), [Q1]);
});

test('a provider end-of-turn ends the catch-up wait: no 1200 ms delay on endpointing providers', async () => {
  const h = rig();
  h.engine.onLocalSpeechStart();
  h.say(Q1);
  h.engine.onLocalSpeechEnd();
  h.engine.onProviderEndpoint();
  await h.advance(ENDPOINT_CONFIRM_MS + 100);
  assert.deepEqual(h.texts(), [Q1], 'dispatched on the endpoint window, well before the catch-up cap');
});

test('a provider end-of-turn with an interim still in flight keeps waiting for that final', async () => {
  const h = rig();
  h.engine.onLocalSpeechStart();
  h.say('How would you design a rate limiter');
  h.say('for a public', { final: false });
  h.engine.onLocalSpeechEnd();
  h.engine.onProviderEndpoint();
  await h.advance(ENDPOINT_CONFIRM_MS + 100);
  assert.deepEqual(h.texts(), [], 'the half question is not answered');
  h.say('for a public API with many tenants?');
  await h.advance(ENDPOINT_CONFIRM_MS + 200);
  assert.equal(h.texts().length, 1);
  assert.match(h.texts()[0], /rate limiter.*many tenants/);
});

test('with no later final the pending opening dispatches at the 1200 ms catch-up cap', async () => {
  const h = rig();
  h.engine.onLocalSpeechStart();
  h.say(Q1);
  h.engine.onLocalSpeechEnd();
  await h.advance(TRANSCRIPT_CATCHUP_MAX_MS - 1);
  assert.deepEqual(h.judgments, []);
  await h.advance(1);
  assert.deepEqual(h.texts(), [Q1]);
});

test('a continuation 800 ms after dispatch cancels the draft once and rejoins its words', async () => {
  const automatic = Promise.withResolvers();
  const h = rig([automatic.promise]);
  await h.ask(OPENING);
  await h.advance(800);
  h.say(TAIL);
  assert.deepEqual(h.cancels, ['transcript_revised']);
  automatic.resolve(completed); // a superseded result must not consume the joined candidate
  await h.advance(STABILITY_MS);
  assert.deepEqual(h.texts(), [OPENING, `${OPENING} ${TAIL}`]);
});

test('user speech or a manual handover cannot revise an automatic draft as a late tail', async () => {
  const automatic = Promise.withResolvers();
  const h = rig([automatic.promise]);
  await h.ask(OPENING);
  await h.advance(800);
  h.say(TAIL, { speaker: 'user' });
  h.engine.onManualAnswerStarted();
  h.engine.onManualSpokenAnswer();
  h.say(TAIL);
  assert.deepEqual(h.cancels, []);
});

test('a fresh question 800 ms after dispatch waits as a separate question', async () => {
  const automatic = Promise.withResolvers();
  const h = rig([automatic.promise]);
  await h.ask(Q1);
  await h.advance(800);
  await h.ask(Q2);
  assert.deepEqual(h.cancels, []);
  automatic.resolve(completed);
  await flush();
  assert.deepEqual(h.texts(), [Q1, Q2]);
});

test('a continuation after the join window keeps the separate-question behavior', async () => {
  const automatic = Promise.withResolvers();
  const h = rig([automatic.promise]);
  await h.ask(OPENING);
  await h.advance(LATE_TAIL_JOIN_MS + 1);
  await h.ask(TAIL);
  assert.deepEqual(h.cancels, []);
  automatic.resolve(completed);
  await flush();
  assert.deepEqual(h.texts(), [OPENING, TAIL]);
});

test('manual chat has its own start/settle pair and cannot invalidate a spoken WTA press', async () => {
  const { IntelligenceEngine } = dist('electron', 'IntelligenceEngine.js');
  const { SessionTracker } = dist('electron', 'SessionTracker.js');
  const engine = new IntelligenceEngine({ setNegotiationCoachingHandler() {} }, new SessionTracker());
  const h = rig();
  const chat = Promise.withResolvers();
  engine.runManualAnswerInner = () => chat.promise;
  engine.on('manual_answer_started', id => h.engine.onManualChatStarted(id));
  engine.on('manual_answer_settled', id => h.engine.onManualChatSettled(id));
  const main = fs.readFileSync(path.join(root, 'electron', 'main.ts'), 'utf8');
  assert.match(main, /on\('manual_answer_started', \(id: symbol\) => \{\s*this\.simpleAutoAnswer\.onManualChatStarted\(id\)/);
  assert.match(main, /on\('manual_answer_settled', \(id: symbol\) => \{\s*this\.simpleAutoAnswer\.onManualChatSettled\(id\)/);

  h.say(Q1);
  const pressId = h.engine.onManualAnswerStarted();
  h.engine.onManualSpokenAnswer();
  const answer = engine.runManualAnswer('Write an unrelated example.');
  h.engine.onManualAnswerSettled({ answered: false, pressId });
  await h.advance(STABILITY_MS);
  assert.deepEqual(h.texts(), [], 'chat still owns its own pause');
  chat.resolve(null);
  await answer;
  await flush();
  assert.deepEqual(h.texts(), [Q1], 'the original press settlement restored its words and chat released its own pause');
  assert.equal(h.engine.manualActive, false);
  assert.equal(h.engine.manualChats.size, 0);
});
