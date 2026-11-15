/**
 * Auto Answer waits for the interviewer to finish (2026-11-15).
 *
 * Reported: with no audible pause, the local build answered a long question
 * in parts while the interviewer was still talking. The quiet window measured
 * gaps between TRANSCRIPT ARRIVALS, so a slow transcriber looked like a pause.
 * The shipped engine also listens to the voice detector: between a speech
 * start and its stop nothing is judged or dispatched, and speech resuming
 * cancels an answer already in flight. These tests drive the real engine with
 * a fake clock and a fake judge; the speech edges stand in for the native
 * `speech_edge` / `speech_ended` events, which both the macOS and the Windows
 * capture pipelines emit to main.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FakeClock } from './fakeClock.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { SimpleAutoAnswerEngine, STABILITY_MS, ENDPOINT_CONFIRM_MS, RETRY_MS } = require(path.resolve(__dirname, '../../../../dist-electron/electron/intelligence/autoAnswer/SimpleAutoAnswer.js'));

const flush = () => new Promise((r) => setImmediate(r));
const YES = JSON.stringify({ is_ask: true, directed_at_user: true, complete: true, act: 'question', answerability: 0.95, question_text: null });

const PART_1 = 'So walk me through how you would design the ingestion pipeline for the events service,';
const PART_2 = 'and how you would handle back pressure when the downstream store slows down?';

/** `results` decides each dispatch's reply in order; a Promise holds it open. */
function rig({ judge = async () => YES, results = [] } = {}) {
  const clock = new FakeClock();
  const state = { dispatched: [], cancelled: [], skips: [], events: [], judgeCalls: [] };
  const host = {
    isEnabled: () => true,
    isMeetingActive: () => true,
    meetingGeneration: () => 1,
    engineAccepting: () => true,
    recentTurns: () => [],
    dispatch: (q) => {
      const r = results[state.dispatched.length] ?? true;
      state.dispatched.push(q.text);
      return r;
    },
    cancelAutomaticAnswer: (reason) => { state.cancelled.push(reason); },
    judgeCandidate: (req, signal) => { state.judgeCalls.push(req.candidateText); return judge(req, signal); },
    telemetry: (e) => { state.events.push(e); if (e.name === 'auto_answer_ignored') state.skips.push(e.skipReason); },
    log: () => {},
  };
  const engine = new SimpleAutoAnswerEngine(host, clock);
  engine.onMeetingStart();
  const say = (text) => engine.ingest({ speaker: 'interviewer', text, final: true, timestamp: clock.now(), origin: 'stt', punctuationSource: 'provider' });
  const advance = async (ms) => { let left = ms; while (left > 0) { const s = Math.min(50, left); clock.advance(s); left -= s; await flush(); await flush(); } };
  return { engine, state, say, advance };
}

test('no pause, slow transcriber: nothing is judged or answered until the voice detector hears the stop', async () => {
  const h = rig();
  h.engine.onLocalSpeechStart();
  h.say(PART_1);
  await h.advance(STABILITY_MS * 3);             // the transcript went quiet; the interviewer did not
  assert.deepEqual(h.state.judgeCalls, [], 'no judge call while the interviewer is speaking');
  assert.deepEqual(h.state.dispatched, [], 'and no answer in parts');

  h.say(PART_2);
  h.engine.onLocalSpeechEnd();
  await h.advance(ENDPOINT_CONFIRM_MS + STABILITY_MS);
  assert.equal(h.state.dispatched.length, 1, 'ONE answer');
  assert.ok(h.state.dispatched[0].includes('ingestion pipeline') && h.state.dispatched[0].includes('back pressure'), 'for the whole question');
});

test('speech resuming cancels the answer in flight and re-judges the grown question', async () => {
  let release;
  const held = new Promise((r) => { release = r; });
  const h = rig({ results: [held] });
  h.say(PART_1);
  h.engine.onLocalSpeechEnd();
  await h.advance(ENDPOINT_CONFIRM_MS + 200);
  assert.equal(h.state.dispatched.length, 1, 'the first half looked finished and was dispatched');

  h.engine.onLocalSpeechStart();                 // …but the interviewer carries on
  assert.deepEqual(h.state.cancelled, ['interviewer_resumed'], 'the streaming answer is cancelled');
  release({ status: 'cancelled' });
  await h.advance(100);

  h.say(PART_2);
  h.engine.onLocalSpeechEnd();
  await h.advance(ENDPOINT_CONFIRM_MS + STABILITY_MS);
  assert.equal(h.state.dispatched.length, 2);
  assert.ok(h.state.dispatched[1].includes('ingestion pipeline') && h.state.dispatched[1].includes('back pressure'),
    'the cancelled half is kept and answered together with the rest');
});

test('a speech start drops a verdict still being judged', async () => {
  let resolveJudge;
  const h = rig({ judge: (_req, signal) => new Promise((r) => { resolveJudge = r; signal?.addEventListener?.('abort', () => r(null)); }) });
  h.say(PART_1);
  h.engine.onLocalSpeechEnd();
  await h.advance(ENDPOINT_CONFIRM_MS + 50);
  assert.equal(h.state.judgeCalls.length, 1);
  h.engine.onLocalSpeechStart();
  resolveJudge(YES);
  await h.advance(STABILITY_MS * 2);
  assert.deepEqual(h.state.dispatched, [], 'a verdict on half a question never dispatches once speech resumed');
});

test('a failed dispatch is retried once; a non-retryable failure is not', async () => {
  const h = rig({ results: [{ status: 'failed' }, true] });
  h.say(PART_1 + ' ' + PART_2);
  h.engine.onLocalSpeechEnd();
  await h.advance(ENDPOINT_CONFIRM_MS + RETRY_MS + 1500);
  assert.equal(h.state.dispatched.length, 2, 'retried once');
  assert.ok(h.state.events.some((e) => e.name === 'auto_answer_retrying'));

  const g = rig({ results: [{ status: 'failed', retryable: false }] });
  g.say(PART_1 + ' ' + PART_2);
  g.engine.onLocalSpeechEnd();
  await g.advance(ENDPOINT_CONFIRM_MS + RETRY_MS + 3000);
  assert.equal(g.state.dispatched.length, 1, 'the user already saw the provider error: no retry');
  assert.ok(g.state.skips.includes('dispatch_failed'));
});

test('a dispatch that keeps failing gives up after one retry', async () => {
  const h = rig({ results: [{ status: 'failed' }, { status: 'failed' }, { status: 'failed' }] });
  h.say(PART_1 + ' ' + PART_2);
  h.engine.onLocalSpeechEnd();
  await h.advance(ENDPOINT_CONFIRM_MS + STABILITY_MS * 6);
  assert.equal(h.state.dispatched.length, 2);
  assert.ok(h.state.skips.includes('dispatch_failed'));
});

test('a completed answer is not answered again at the next stoppage', async () => {
  const h = rig();
  h.say(PART_1 + ' ' + PART_2);
  h.engine.onLocalSpeechEnd();
  await h.advance(ENDPOINT_CONFIRM_MS + 200);
  assert.equal(h.state.dispatched.length, 1);
  h.engine.onLocalSpeechStart();
  h.engine.onLocalSpeechEnd();                   // a cough: a start and a stop with no words
  await h.advance(STABILITY_MS * 3);
  assert.equal(h.state.dispatched.length, 1, 'its parts left pending when the answer completed');
});

test('an untrusted stop (onLocalSpeechEnd(false)) only restarts the quiet window', async () => {
  const h = rig();
  h.engine.onLocalSpeechStart();
  h.say(PART_1 + ' ' + PART_2);
  h.engine.onLocalSpeechEnd(false);
  await h.advance(ENDPOINT_CONFIRM_MS + 100);
  assert.deepEqual(h.state.dispatched, [], 'not committed at the endpoint delay (an early verdict may be out, but it is held)');
  await h.advance(STABILITY_MS + 300);
  assert.equal(h.state.dispatched.length, 1, 'answered when the full quiet window passes');
});

test('Auto Answer off: speech edges are inert', async () => {
  const h = rig();
  h.engine.host.isEnabled = () => false;
  h.engine.onLocalSpeechStart();
  assert.deepEqual(h.state.cancelled, [], 'no cancel when Auto Answer is off — a manual answer keeps streaming');
});
