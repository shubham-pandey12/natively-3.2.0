// electron/services/__tests__/ManualPressWholeUtteranceEngine2026_11_15.test.mjs
//
// End-to-end (engine + real SessionTracker, stubbed model) for the manual
// press whole-utterance join: the bubble and the prompt get the WHOLE spoken
// question, the answer is recorded with its start and the question it
// answered, and typed/speculative runs keep their old behaviour.
//
// Run: npm run build:electron && node --test electron/services/__tests__/ManualPressWholeUtteranceEngine2026_11_15.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

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
  const calls = [];
  const bubbles = [];
  engine.on('what_to_answer_question', (d) => bubbles.push(d));
  engine.whatToAnswerLLM = {
    async *generateStream(_t, _tc, _i, _img, _sc, _pi, ...rest) {
      calls.push({ question: rest[3]?.question });
      yield 'I would key the CDN cache by host and keep personalised pages private, then test it on staging.';
    },
  };
  return { engine, session, calls, bubbles };
}

const say = (session, text, agoMs, speaker = 'interviewer') =>
  session.addTranscript({ speaker, final: true, text, timestamp: Date.now() - agoMs });

describe('manual press — whole utterance, end to end', () => {
  test('bubble and prompt get the whole question; the candidate\'s "hmm" does not cut it', async () => {
    const { engine, session, calls, bubbles } = await setup();
    say(session, 'The CDN gives the same cached HTML to brand1, brand2 and logged-in users.', 9_000);
    say(session, 'How would you fix the caching?', 7_000);
    say(session, 'Hmm, okay, let me think about that one.', 5_000, 'user');
    say(session, 'Take your time. Just walk me through it like on a whiteboard.', 2_000);

    await engine.runWhatShouldISay(undefined, 0.8, undefined, { forceFresh: true, skipCooldown: true, overlayQuestionId: 'card-1' });

    assert.equal(calls.length, 1);
    assert.match(calls[0].question, /^The CDN gives the same cached HTML/);
    assert.match(calls[0].question, /How would you fix the caching\?/);
    assert.match(calls[0].question, /like on a whiteboard\.$/);
    assert.doesNotMatch(calls[0].question, /let me think/);
    const card = bubbles.find((b) => b.overlayQuestionId === 'card-1');
    assert.ok(card, 'the press card gets its question');
    assert.equal(card.question, calls[0].question);
  });

  test('the recorded answer carries its start and the question it answered', async () => {
    const { engine, session } = await setup();
    say(session, 'How do you stop the Redis key collision', 3_000);
    say(session, 'from happening again?', 1_500);
    const before = Date.now();
    await engine.runWhatShouldISay(undefined, 0.8, undefined, { forceFresh: true, skipCooldown: true });
    const answer = session.getContext(180).filter((i) => i.role === 'assistant').at(-1);
    assert.ok(answer, 'the answer is recorded');
    assert.equal(typeof answer.startedAt, 'number');
    assert.ok(answer.startedAt >= before - 5 && answer.startedAt <= answer.timestamp);
    assert.equal(answer.answeredQuestion, 'How do you stop the Redis key collision from happening again?');
  });

  test('the next press after an answer does not reach back into the answered question', async () => {
    const { engine, session, calls } = await setup();
    say(session, 'How do you stop the Redis key collision from happening again?', 3_000);
    await engine.runWhatShouldISay(undefined, 0.8, undefined, { forceFresh: true, skipCooldown: true });
    // The answered question's final lands late (stamped after the start).
    say(session, 'from happening again?', 0);
    session.addTranscript({ speaker: 'interviewer', final: true, text: 'Now ten brands spike at once.', timestamp: Date.now() + 5 });
    session.addTranscript({ speaker: 'interviewer', final: true, text: 'What is your Redis strategy?', timestamp: Date.now() + 10 });
    await engine.runWhatShouldISay(undefined, 0.8, undefined, { forceFresh: true, skipCooldown: true });
    assert.equal(calls.length, 2);
    assert.doesNotMatch(calls[1].question, /collision|happening again/);
    assert.match(calls[1].question, /ten brands spike/);
    assert.match(calls[1].question, /Redis strategy\?$/);
  });

  test('a typed question is used as typed (no join)', async () => {
    const { engine, session, calls } = await setup();
    say(session, 'Tell me about the outage,', 4_000);
    say(session, 'and what you changed after.', 2_000);
    await engine.runWhatShouldISay('What is a bloom filter?', 0.8, undefined, { forceFresh: true, skipCooldown: true });
    assert.equal(calls[0].question, 'What is a bloom filter?');
  });

  test('legacy recording without a start still works (addAssistantMessage 4-arg call)', async () => {
    const { session } = await setup();
    assert.equal(session.addAssistantMessage('A long enough legacy answer here.', undefined, 'what_to_answer'), true);
    const item = session.getContext(180).at(-1);
    assert.equal(item.startedAt, undefined);
    assert.equal(item.answeredQuestion, undefined);
  });

  test('a start in the future or not a number is not stored', async () => {
    const { session } = await setup();
    session.addAssistantMessage('First answer with a future start.', undefined, 'what_to_answer', undefined, { startedAt: Date.now() + 60_000, question: 'q' });
    session.addAssistantMessage('Second answer with a NaN start.', undefined, 'what_to_answer', undefined, { startedAt: Number.NaN, question: 'q' });
    for (const item of session.getContext(180).filter((i) => i.role === 'assistant')) {
      assert.equal(item.startedAt, undefined);
      assert.equal(item.answeredQuestion, undefined);
    }
  });
});
