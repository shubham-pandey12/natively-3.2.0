// electron/services/__tests__/CmdEnterLatestQuestion2026_11_16.test.mjs
//
// Cmd/Ctrl+Enter (legacy "What should I say?", Direct Assist OFF) must make a
// FRESH answer to the newest question every time, whether the last attempt at
// it failed or succeeded — never the previous question n−1, never a reused
// failed draft. Engine + real SessionTracker + the screenshot-retry module the
// renderer uses; the model is stubbed. Platform-independent: no OS branch is
// involved in any of this code.
//
//  1. spoken n fails / succeeds  -> the press answers n
//  2. screenshot n fails, "umm" / "take your time" follow -> same image
//  3. screenshot n succeeds, nothing new -> same image again
//  4. screenshot n, interviewer starts n+1 (usable partial) -> n+1
//  5. newest speech unclear -> 'unidentified' (renderer shows a notice)
//  +  empty-stream fallback is a failure, never history
//
// Run: npm run build:electron && node --test electron/services/__tests__/CmdEnterLatestQuestion2026_11_16.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createScreenshotRetry } from '../../../src/lib/screenshotRetry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const load = (rel) => import(pathToFileURL(path.resolve(__dirname, '../../../dist-electron/electron', rel)).href);

class StubLLMHelper {
  getActiveModel() { return { provider: 'gemini', model: 'gemini-2.0-flash' }; }
  isStreamingSupported() { return true; }
  setNegotiationCoachingHandler(_fn) { }
  getGeminiClient() { return null; }
  getOpenAIClient() { return null; }
  getClaudeClient() { return null; }
  getGroqClient() { return null; }
  getOllamaClient() { return null; }
  getModesManager() { return { getActiveMode: () => null, getActiveModeSystemPromptSuffix: () => '' }; }
  getSettingsManager() { return { get: () => null, set: () => {} }; }
}

async function setup() {
  const { IntelligenceEngine } = await load('IntelligenceEngine.js');
  const { SessionTracker } = await load('SessionTracker.js');
  const session = new SessionTracker();
  const engine = new IntelligenceEngine(new StubLLMHelper(), session);
  engine.on('error', () => {});
  const calls = [];
  const bubbles = [];
  const records = [];
  engine.recordLiveTurn = (...args) => records.push(args);
  engine.on('what_to_answer_question', (d) => bubbles.push(d));
  let mode = 'ok';
  engine.whatToAnswerLLM = {
    async *generateStream(_t, _tc, _i, images, _sc, _pi, ...rest) {
      calls.push({ images, question: rest[3]?.question });
      if (mode === 'throw') throw Object.assign(new Error('Rate limit exceeded'), { status: 429 });
      if (mode === 'empty') return;
      yield 'Here is a complete, specific answer to the question that was just asked.';
    },
  };
  return { engine, session, calls, bubbles, records, setMode: (m) => { mode = m; } };
}

const say = (session, text, agoMs, speaker = 'interviewer') =>
  session.addTranscript({ speaker, final: true, text, timestamp: Date.now() - agoMs });
const partial = (session, text, agoMs) =>
  session.handleTranscript({ speaker: 'interviewer', final: false, text, timestamp: Date.now() - agoMs });

const press = async (engine, card, images, question, extra = {}) => {
  const outcomeOut = {};
  const answer = await engine.runWhatShouldISay(question, 0.8, images, { forceFresh: true, skipCooldown: true, overlayQuestionId: card, outcomeOut, ...extra });
  return { answer, outcome: outcomeOut.value };
};
const cardQuestion = (bubbles, card) => bubbles.find((b) => b.overlayQuestionId === card)?.question ?? '';

describe('example 1 — spoken question n', () => {
  test('n fails, the next press answers n (not the answered n−1)', async () => {
    const { engine, session, bubbles, records, setMode } = await setup();
    say(session, 'What is a mutex?', 40_000);
    await press(engine, 'n-1', undefined);
    say(session, 'How would you shard a Postgres table that has outgrown one machine?', 3_000);

    setMode('throw');
    const first = await press(engine, 'n-a', undefined);
    assert.equal(first.outcome.status, 'failed');
    const recordedBefore = records.length;

    setMode('ok');
    const second = await press(engine, 'n-b', undefined);
    assert.equal(second.outcome.status, 'success');
    assert.match(cardQuestion(bubbles, 'n-b'), /shard a Postgres table/);
    assert.doesNotMatch(cardQuestion(bubbles, 'n-b'), /mutex/);
    assert.equal(records.length, recordedBefore + 1, 'only the successful answer is recorded');
  });

  test('n succeeded, the next press makes a fresh answer to n again', async () => {
    const { engine, session, bubbles, calls } = await setup();
    say(session, 'What is a mutex?', 40_000);
    await press(engine, 'n-1', undefined);
    say(session, 'Why did you choose Kafka over RabbitMQ for the event pipeline?', 3_000);
    await press(engine, 'n-a', undefined);
    const before = calls.length;
    const again = await press(engine, 'n-b', undefined);
    assert.equal(again.outcome.status, 'success');
    assert.equal(calls.length, before + 1, 'a new generation ran, nothing was reused');
    assert.match(cardQuestion(bubbles, 'n-b'), /Kafka over RabbitMQ/);
  });

  test('n heard only as a partial the provider never finalized (> 30 s) is still the question', async () => {
    const { engine, session, bubbles } = await setup();
    say(session, 'What is a mutex?', 90_000);
    await press(engine, 'n-1', undefined);
    partial(session, 'How would you design rate limiting for a public API?', 45_000);
    await press(engine, 'n', undefined);
    assert.match(cardQuestion(bubbles, 'n'), /rate limiting for a public API/);
  });

  test('n heard only as a stale partial and answered once is answered again by the next press', async () => {
    const { engine, session, bubbles } = await setup();
    say(session, 'What is a mutex?', 90_000);
    await press(engine, 'n-1', undefined);
    partial(session, 'How would you design rate limiting for a public API?', 45_000);
    await press(engine, 'n-a', undefined);
    await press(engine, 'n-b', undefined);
    assert.match(cardQuestion(bubbles, 'n-b'), /rate limiting for a public API/);
  });

  test('a partial older than the context window is not revived', async () => {
    const { engine, session, bubbles } = await setup();
    partial(session, 'How would you design rate limiting for a public API?', 200_000);
    say(session, 'What is a mutex?', 5_000, 'user'); // keeps the transcript non-empty
    await press(engine, 'n', undefined);
    assert.doesNotMatch(cardQuestion(bubbles, 'n'), /rate limiting/);
  });
});

describe('screenshot question n — main chooses screenshot vs speech at the press', () => {
  const shot = 'shot-n.png';

  async function screenshotTurn(outcomeMode) {
    const ctx = await setup();
    const retries = createScreenshotRetry();
    const askedAt = Date.now() - 10_000;
    say(ctx.session, 'What is a mutex?', 60_000);
    const snapshot = { audioRevision: 1, askedAt, question: 'What should I say about this?', attachments: [{ path: shot }] };
    const attempt = retries.begin(snapshot, false, { keepOnSuccess: true });
    ctx.setMode(outcomeMode);
    const first = await press(ctx.engine, 'shot-a', [shot], snapshot.question);
    retries.settle(attempt.id, first.outcome.status);
    ctx.setMode('ok');
    return { ...ctx, retries, askedAt, first };
  }

  async function pressAgain(ctx) {
    const held = ctx.retries.latest();
    const start = ctx.engine.beginWhatToSayPress(held?.snapshot.askedAt);
    if (start.source?.source !== 'screenshot') return { start };
    const reused = ctx.retries.begin({ ...held.snapshot, audioRevision: 2 }, true, { keepOnSuccess: true });
    const before = ctx.calls.length;
    const result = await press(ctx.engine, 'shot-b', held.snapshot.attachments.map((a) => a.path), held.snapshot.question);
    ctx.retries.settle(reused.id, result.outcome.status);
    return { start, result, call: ctx.calls[before] };
  }

  test('example 2: screenshot n failed; "umm" and "take your time" follow; the press re-sends the same image', async () => {
    const ctx = await screenshotTurn('throw');
    assert.equal(ctx.first.outcome.status, 'failed');
    say(ctx.session, 'Umm', 4_000, 'user');
    say(ctx.session, 'Take your time.', 2_000);
    const { start, result, call } = await pressAgain(ctx);
    assert.deepEqual(start.source, { source: 'screenshot', reason: 'newer_speech_not_a_question' });
    assert.equal(result.outcome.status, 'success');
    assert.deepEqual(call.images, [shot]);
    assert.equal(call.question, 'What should I say about this?');
  });

  test('example 3: screenshot n succeeded; nothing new; the press answers the same image afresh', async () => {
    const ctx = await screenshotTurn('ok');
    assert.equal(ctx.first.outcome.status, 'success');
    assert.equal(ctx.retries.latest()?.status, 'succeeded', 'success keeps the screenshot as the standing question');
    const { start, result, call } = await pressAgain(ctx);
    assert.deepEqual(start.source, { source: 'screenshot', reason: 'no_newer_speech' });
    assert.equal(result.outcome.status, 'success');
    assert.deepEqual(call.images, [shot]);
  });

  for (const outcome of ['ok', 'throw']) {
    test(`example 4: screenshot n ${outcome === 'ok' ? 'succeeded' : 'failed'}; a usable partial n+1 wins`, async () => {
      const ctx = await screenshotTurn(outcome);
      partial(ctx.session, 'Can you walk me through how you would test this service', 500);
      const { start } = await pressAgain(ctx);
      assert.equal(start.source.source, 'speech');
      assert.equal(start.source.partial, true);
      // The renderer then releases the screenshot and runs a transcript press
      // locked to the question main chose.
      ctx.retries.clear();
      await press(ctx.engine, 'n+1', undefined, undefined, { spokenQuestion: start.source.question });
      assert.match(cardQuestion(ctx.bubbles, 'n+1'), /test this service/);
      assert.deepEqual(ctx.calls.at(-1).images ?? [], []);
    });
  }

  test('example 4 (final): a finalized interviewer question after the screenshot wins too', async () => {
    const ctx = await screenshotTurn('ok');
    say(ctx.session, 'Tell me about a time you disagreed with your manager.', 1_000);
    const { start } = await pressAgain(ctx);
    assert.deepEqual(start.source, { source: 'speech', question: 'Tell me about a time you disagreed with your manager.', partial: false });
  });

  test('a real question followed by filler still wins over the screenshot', async () => {
    const ctx = await screenshotTurn('ok');
    say(ctx.session, 'How would you scale the websocket layer?', 3_000);
    say(ctx.session, 'Take your time.', 1_000);
    const { start } = await pressAgain(ctx);
    assert.equal(start.source.source, 'speech');
  });

  test('the chosen spoken question is the one generated: whole utterance, not the filler after it', async () => {
    const ctx = await screenshotTurn('ok');
    say(ctx.session, 'How would you scale', 4_000);
    say(ctx.session, 'the websocket layer?', 3_000);
    say(ctx.session, 'Take your time.', 1_000);
    const { start } = await pressAgain(ctx);
    assert.deepEqual(start.source, { source: 'speech', question: 'How would you scale the websocket layer?', partial: false });
    ctx.retries.clear();
    await press(ctx.engine, 'n+1', undefined, undefined, { spokenQuestion: start.source.question });
    assert.equal(cardQuestion(ctx.bubbles, 'n+1'), 'How would you scale the websocket layer?');
    assert.equal(ctx.calls.at(-1).question, 'How would you scale the websocket layer?');
    assert.deepEqual(ctx.calls.at(-1).images ?? [], []);
  });

  test('the transcript moving between selection and generation does not change the question', async () => {
    const ctx = await screenshotTurn('throw');
    say(ctx.session, 'How do you keep a websocket fleet balanced during a deploy?', 2_000);
    const { start } = await pressAgain(ctx);
    assert.equal(start.source.source, 'speech');
    // Between the two IPC calls: the candidate asks something of their own
    // (normally preferred by a bare press) and more filler lands.
    say(ctx.session, 'How many rounds are there after this one?', 200, 'user');
    say(ctx.session, 'Sure, no rush.', 100);
    ctx.retries.clear();
    await press(ctx.engine, 'locked', undefined, undefined, { spokenQuestion: start.source.question });
    assert.equal(cardQuestion(ctx.bubbles, 'locked'), 'How do you keep a websocket fleet balanced during a deploy?');
    // Control: without the lock the same transcript re-extracts something else.
    await press(ctx.engine, 'unlocked', undefined);
    assert.notEqual(cardQuestion(ctx.bubbles, 'unlocked'), 'How do you keep a websocket fleet balanced during a deploy?');
  });

  test('example 5: an unclear partial still being spoken yields "unidentified", not n−1 or a guess', async () => {
    const ctx = await screenshotTurn('ok');
    partial(ctx.session, 'So the next part is about the cache layer and', 300);
    const { start } = await pressAgain(ctx);
    assert.deepEqual(start.source, { source: 'unidentified', reason: 'partial_speech_unclear' });
    assert.ok(ctx.retries.latest(), 'the screenshot is kept for the next press');
  });

  test('short asides and plain statements while the interviewer talks do not block the screenshot', async () => {
    for (const aside of ['take your time', 'okay that sounds good to me', 'give me a sec to pull it up']) {
      const ctx = await screenshotTurn('ok');
      partial(ctx.session, aside, 300);
      const { start } = await pressAgain(ctx);
      assert.equal(start.source.source, 'screenshot', aside);
    }
  });

  test('speech from before the screenshot was asked never replaces it', async () => {
    const ctx = await screenshotTurn('throw');
    const { start } = await pressAgain(ctx);
    assert.deepEqual(start.source, { source: 'screenshot', reason: 'no_newer_speech' });
  });

  test('the press reports the newest generation already minted (the renderer\'s late-event floor)', async () => {
    const ctx = await screenshotTurn('ok');
    const floor = ctx.engine.beginWhatToSayPress().generationFloor;
    assert.equal(typeof floor, 'number');
    assert.ok(floor >= 1, 'the fixture\'s screenshot press minted a generation');
    await press(ctx.engine, 'later', undefined);
    assert.ok(ctx.engine.beginWhatToSayPress().generationFloor > floor);
  });
});

describe('empty-stream fallback is a failure, never history', () => {
  test('"couldn\'t generate, press again" reports failed and is not stored', async () => {
    const { engine, session, records, setMode } = await setup();
    say(session, 'How would you shard a Postgres table that has outgrown one machine?', 2_000);
    engine.regenerateUsableAnswer = async () => null;
    setMode('empty');
    const settled = [];
    const outcomeOut = {};
    const answer = await engine.runWhatShouldISay(undefined, 0.8, undefined, {
      forceFresh: true, skipCooldown: true, outcomeOut, onSettled: (r) => settled.push(r),
    });
    assert.match(answer, /press again/i, 'the rotating "press again" failure notice is shown');
    assert.equal(outcomeOut.value.status, 'failed');
    assert.equal(session.getAssistantResponseHistory().length, 0);
    assert.equal(session.getContext(180).filter((i) => i.role === 'assistant').length, 0);
    assert.equal(records.length, 0);
    assert.equal(settled.at(-1)?.answered, false, 'Auto Answer is told the question is still unanswered');
  });

  test('a successful regeneration after an empty stream is still a normal answer', async () => {
    const { engine, session, records, setMode } = await setup();
    say(session, 'How would you shard a Postgres table that has outgrown one machine?', 2_000);
    engine.regenerateUsableAnswer = async () => 'Split by tenant id with a lookup service, then move hot tenants first.';
    setMode('empty');
    const outcomeOut = {};
    await engine.runWhatShouldISay(undefined, 0.8, undefined, { forceFresh: true, skipCooldown: true, outcomeOut });
    assert.equal(outcomeOut.value.status, 'success');
    assert.equal(records.length, 1);
  });
});
