import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dist = (...parts) => require(path.join(root, 'dist-electron', 'electron', ...parts));
const { IntelligenceEngine } = dist('IntelligenceEngine.js');
const { SessionTracker } = dist('SessionTracker.js');
const { DISPATCH_MAX_MS, DISPATCH_STALL_MS } = dist('llm', 'automaticAnswerTiming.js');
const QUESTION = 'How would you design a rate limiter for this system?';
const flush = () => new Promise(resolve => setImmediate(resolve));

function rig(t) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const engine = new IntelligenceEngine({ setNegotiationCoachingHandler() {} }, new SessionTracker());
  engine.planSuggestionTrigger = async () => ({ kind: 'answer', reason: 'answerable_question', confidence: 0.9 });
  // Control the provider/verifier completion directly. Keep the real run
  // wrapper so generation tracking is exercised even for an interim prefetch.
  engine.runWhatShouldISayInner = async (_question, _confidence, _images, { turnOut }) => {
    const draft = engine.nextDraft;
    const generationId = ++engine.currentGenerationId;
    engine.speculativeGenerationId = generationId;
    engine.speculativeText = QUESTION;
    engine.speculativeTextExpiry = Infinity;
    engine.whatToAnswerCancellationToken = new AbortController();
    engine.setMode('what_to_say');
    const text = await draft.promise;
    if (text && generationId === engine.currentGenerationId) {
      engine.completeSpeculativeRun(generationId, QUESTION, 0.9, text);
    } else if (generationId === engine.currentGenerationId) {
      engine.setMode('idle');
    }
    turnOut.question = QUESTION;
    return text;
  };
  const draft = () => {
    const gate = Promise.withResolvers();
    engine.nextDraft = gate;
    const run = engine.runWhatShouldISay(QUESTION, 0.9, undefined, { speculative: true });
    void run.catch(() => {});
    return { ...gate, run, generation: engine.currentGenerationId, transport: engine.whatToAnswerCancellationToken };
  };
  const dispatch = () => engine.handleSuggestionTrigger({
    context: '', lastQuestion: QUESTION, confidence: 0.9, automatic: true, reuseSpeculative: true,
  });
  return { engine, draft, dispatch };
}

for (const mode of ['throws', 'returns empty']) {
  test(`an adopted draft that ${mode} is retryable`, async t => {
    const { engine, draft, dispatch } = rig(t);
    const adopted = draft();
    const answer = dispatch();
    await flush();
    if (mode === 'throws') adopted.reject(new Error('provider failed'));
    else adopted.resolve('');
    assert.deepEqual(await answer, { status: 'failed', retryable: true, reason: 'adopted_draft_failed' });
    assert.equal(engine.canAutoAnswer(true), true);
  });
}

test('deliberate cancellation settles the dispatch even when the adopted provider ignores abort', async t => {
  const { engine, draft, dispatch } = rig(t);
  const adopted = draft();
  const answer = dispatch();
  await flush();
  assert.equal(engine.isAutomaticAnswerGeneration(adopted.generation), true);
  assert.equal(engine.cancelAutomaticAnswer('interviewer_resumed'), true);
  assert.deepEqual(await answer, { status: 'cancelled' });
  assert.equal(adopted.transport.signal.reason, 'interviewer_resumed');
  assert.equal(engine.isAutomaticAnswerGeneration(adopted.generation), false);
  assert.equal(engine.canAutoAnswer(), true);
});

test('a hung adopted wait releases its generation and single-flight guard at the stall limit', async t => {
  const { engine, draft, dispatch } = rig(t);
  const adopted = draft();
  const answer = dispatch();
  await flush();
  t.mock.timers.tick(DISPATCH_STALL_MS - 1);
  assert.equal(engine.isAutomaticAnswerGeneration(adopted.generation), true);
  t.mock.timers.tick(1);
  assert.deepEqual(await answer, { status: 'failed', retryable: true, reason: 'dispatch_timeout' });
  assert.equal(adopted.transport.signal.reason, 'dispatch_timeout');
  assert.equal(engine.canAutoAnswer(), true);
  const finals = [];
  engine.on('suggested_answer', (...args) => finals.push(args));
  adopted.resolve('An answer from the timed-out provider.');
  await adopted.run;
  assert.deepEqual(finals, []);
});

test('automatic tokens renew the adopted wait up to its hard cap', async t => {
  const { engine, draft, dispatch } = rig(t);
  const adopted = draft();
  const answer = dispatch();
  await flush();
  for (let elapsed = 0; elapsed < DISPATCH_MAX_MS - 10_000; elapsed += 10_000) {
    t.mock.timers.tick(10_000);
    engine.emit('suggested_answer_token', 'progress', QUESTION, 0.9, adopted.generation);
  }
  t.mock.timers.tick(9_999);
  assert.equal(engine.isAutomaticAnswerGeneration(adopted.generation), true);
  t.mock.timers.tick(1);
  assert.deepEqual(await answer, { status: 'failed', retryable: true, reason: 'dispatch_timeout' });
});

test('an older speculative run cannot hold a different adopted generation open', async t => {
  const { engine, draft, dispatch } = rig(t);
  const older = draft();
  const adopted = draft();
  assert.equal(engine.isAutomaticAnswerGeneration(adopted.generation), false, 'unadopted drafts are not automatic progress');
  const answer = dispatch();
  await flush();
  adopted.resolve('');
  assert.deepEqual(await answer, { status: 'failed', retryable: true, reason: 'adopted_draft_failed' });
  assert.equal(older.transport.signal.aborted, false);
});

for (const tracked of [true, false]) {
  test(`an adopted draft whose reveal opens a new row completes ${tracked ? 'with' : 'without'} a tracked promise`, async t => {
    const { engine, draft, dispatch } = rig(t);
    const adopted = draft();
    if (!tracked) engine.speculativeRun = null;
    const answer = dispatch();
    await flush();
    adopted.resolve('A rate limiter can track tokens per user.');
    assert.deepEqual(await answer, { status: 'completed' });
    assert.ok(engine.currentGenerationId > adopted.generation, 'the adopted draft opened a new visible generation');
  });
}

test('only visible output from a newer generation cancels a superseded adoption', async t => {
  const { engine, draft, dispatch } = rig(t);
  const adopted = draft();
  const answer = dispatch();
  let result;
  void answer.then(value => { result = value; });
  await flush();
  const newer = draft();
  engine.emit('suggested_answer_token', '', QUESTION, 0.9, newer.generation);
  await flush();
  assert.equal(result, undefined, 'starting a different generation is not a deliberate cancel');
  engine.emit('suggested_answer_token', 'A newer visible answer', QUESTION, 0.9, newer.generation);
  assert.deepEqual(await answer, { status: 'cancelled' });
  assert.equal(newer.transport.signal.aborted, false);
  adopted.resolve('An older answer that must never be re-adopted.');
  await adopted.run;
});

test('the controller timeout releases an unresponsive planner and ignores its late verdict', async t => {
  const { engine, dispatch } = rig(t);
  const planner = Promise.withResolvers();
  engine.planSuggestionTrigger = () => planner.promise;
  const answer = dispatch();
  await flush();
  const generation = engine.currentGenerationId;
  assert.equal(engine.cancelAutomaticAnswer('dispatch_timeout'), true);
  assert.deepEqual(await answer, { status: 'failed', retryable: true, reason: 'dispatch_timeout' });
  assert.equal(engine.canAutoAnswer(), true);
  planner.resolve({ kind: 'answer', reason: 'answerable_question', confidence: 0.9 });
  await flush();
  assert.equal(engine.currentGenerationId, generation);
});
