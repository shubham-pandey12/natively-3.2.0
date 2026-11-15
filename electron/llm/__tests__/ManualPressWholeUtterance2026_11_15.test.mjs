// electron/llm/__tests__/ManualPressWholeUtterance2026_11_15.test.mjs
//
// A manual What-to-Answer press showed only the last speech-to-text segment of
// the interviewer's question (live interview 2026-11-15):
//   "If the CTO asks you why should we trust this won't happen again," +
//   "What's your confident simple answer?"  → bubble + prompt got only the tail,
//   and the model answered "I don't have enough context".
// The press now joins the whole current utterance, the same rule Auto Answer
// uses for its candidate: consecutive interviewer finals since the last user or
// assistant turn, within 90 s. Without the option the extractor is unchanged.
//
// Run: npm run build:electron && node --test electron/llm/__tests__/ManualPressWholeUtterance2026_11_15.test.mjs

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modPath = path.resolve(__dirname, '../../../dist-electron/electron/llm/transcriptQuestionExtractor.js');
const { extractLatestQuestion, UTTERANCE_JOIN_MAX_AGE_MS, UTTERANCE_JOIN_MAX_CHARS, ANSWER_START_TAIL_GRACE_MS, ANSWERED_TAIL_MAX_LAG_MS } = await import(pathToFileURL(modPath).href);

const T0 = 5_000_000;
const turns = (rows) => rows.map(([role, text, at]) => ({ role, text, timestamp: T0 + at }));
const JOIN = { joinUtterance: true };

describe('manual press — whole interviewer utterance', () => {
  test('CTO question split at a pause is returned whole', () => {
    const t = turns([
      ['interviewer', 'If the CTO asks you why should we trust this won\'t happen again,', 0],
      ['interviewer', 'What\'s your confident simple answer?', 1_500],
    ]);
    assert.equal(
      extractLatestQuestion(t, undefined, JOIN).latestQuestion,
      'If the CTO asks you why should we trust this won\'t happen again, What\'s your confident simple answer?',
    );
    // Without the option: unchanged legacy behaviour (newest segment only).
    assert.equal(extractLatestQuestion(t).latestQuestion, 'What\'s your confident simple answer?');
  });

  test('rate-limiter question with a trailing instruction is returned whole', () => {
    const t = turns([
      ['interviewer', 'Design a rate limiter for each tenant of the API.', 0],
      ['interviewer', 'You can pick the algorithm. Just explain it simply.', 2_000],
    ]);
    const q = extractLatestQuestion(t, undefined, JOIN).latestQuestion;
    assert.match(q, /^Design a rate limiter for each tenant/);
    assert.match(q, /Just explain it simply\.$/);
  });

  test('an earlier, already-answered question is not joined (assistant turn is a boundary)', () => {
    const t = turns([
      ['interviewer', 'How do you stop the Redis key collision from happening again?', 0],
      ['assistant', 'I would make the key format tenant-aware and build it in one shared function.', 4_000],
      ['interviewer', 'Next question. Say there is a sudden traffic spike from ten brands.', 9_000],
      ['interviewer', 'What is your Redis strategy?', 10_500],
    ]);
    const q = extractLatestQuestion(t, undefined, JOIN).latestQuestion;
    assert.doesNotMatch(q, /collision/);
    assert.match(q, /traffic spike/);
    assert.match(q, /Redis strategy\?$/);
  });

  test('the candidate thinking aloud mid-question does not cut the question (same as Auto Answer)', () => {
    const t = turns([
      ['interviewer', 'The CDN serves the same cached HTML to brand1, brand2 and logged-in users.', 0],
      ['interviewer', 'How would you fix the caching so tenants never see each other\'s pages?', 4_000],
      ['user', 'Hmm, okay, let me think about that for a second.', 7_000],
      ['interviewer', 'Take your time. Just walk me through it like on a real whiteboard.', 9_000],
    ]);
    const q = extractLatestQuestion(t, undefined, JOIN).latestQuestion;
    assert.match(q, /^The CDN serves the same cached HTML/);
    assert.match(q, /How would you fix the caching/);
    assert.match(q, /real whiteboard\.$/);
    assert.doesNotMatch(q, /let me think/);
  });

  test('an answered question is still cut off even when the candidate also spoke', () => {
    const t = turns([
      ['interviewer', 'Tell me about the slow admin page.', 0],
      ['assistant', 'I would first check which action is slow and how many users are affected.', 3_000],
      ['user', 'I first check which action is slow and how many users are affected.', 5_000],
      ['interviewer', 'And what would you try first?', 12_000],
    ]);
    assert.equal(extractLatestQuestion(t, undefined, JOIN).latestQuestion, 'And what would you try first?');
  });

  test('segments older than the Auto Answer age bound are not joined', () => {
    const t = turns([
      ['interviewer', 'Walk me through your caching layer design in detail.', 0],
      ['interviewer', 'How would you index the tenant table?', UTTERANCE_JOIN_MAX_AGE_MS + 1_000],
    ]);
    assert.equal(extractLatestQuestion(t, undefined, JOIN).latestQuestion, 'How would you index the tenant table?');
  });

  test('a leading greeting is not part of the question', () => {
    const t = turns([
      ['interviewer', 'Hello', 0],
      ['interviewer', 'Tell me about a production incident you owned,', 1_000],
      ['interviewer', 'and what you changed afterwards.', 2_000],
    ]);
    assert.equal(
      extractLatestQuestion(t, undefined, JOIN).latestQuestion,
      'Tell me about a production incident you owned, and what you changed afterwards.',
    );
  });

  test('the split-constraint join is covered, not repeated', () => {
    const t = turns([
      ['interviewer', 'Implement an LRU cache with get and put.', 0],
      ['interviewer', 'You can assume capacity is positive.', 3_000],
    ]);
    assert.equal(
      extractLatestQuestion(t, undefined, JOIN).latestQuestion,
      'Implement an LRU cache with get and put. You can assume capacity is positive.',
    );
  });

  test('confidence and type are scored exactly as without the join', () => {
    const t = turns([
      ['interviewer', 'If the CTO asks you why should we trust this won\'t happen again,', 0],
      ['interviewer', 'What\'s your confident simple answer?', 1_500],
    ]);
    const a = extractLatestQuestion(t, undefined, JOIN);
    const b = extractLatestQuestion(t);
    assert.equal(a.confidence, b.confidence);
    assert.equal(a.questionType, b.questionType);
    assert.equal(a.isFollowUp, b.isFollowUp);
  });

  test('two whole questions in a row are not joined (the newer one is answered)', () => {
    const t = turns([
      ['interviewer', 'What is a B-Tree?', 0],
      ['interviewer', 'What is an LSM Tree?', 4_500],
    ]);
    assert.equal(extractLatestQuestion(t, undefined, JOIN).latestQuestion, 'What is an LSM Tree?');
  });

  test('a follow-on that continues a finished question is joined', () => {
    const t = turns([
      ['interviewer', 'What is the trade-off of adding more indexes?', 0],
      ['interviewer', 'And how would you measure it?', 1_500],
    ]);
    assert.equal(
      extractLatestQuestion(t, undefined, JOIN).latestQuestion,
      'What is the trade-off of adding more indexes? And how would you measure it?',
    );
  });

  test('a single segment is unchanged', () => {
    const t = turns([['interviewer', 'How would you design per-tenant rate limiting?', 0]]);
    assert.equal(extractLatestQuestion(t, undefined, JOIN).latestQuestion, 'How would you design per-tenant rate limiting?');
  });
  test('a question begun while the previous answer was still streaming is returned whole', () => {
    // Live 2026-11-15: the JSONB answer finished AFTER the interviewer had
    // started the caching question, so the bubble showed only its tail.
    const t = [
      { role: 'interviewer', text: 'How would you index the custom JSONB fields?', timestamp: T0 },
      { role: 'interviewer', text: 'How would you cache tenant pages safely, while', timestamp: T0 + 6_000 },
      { role: 'assistant', text: 'I would first check the query plan and data size, then add a GIN index.', timestamp: T0 + 9_000, startedAt: T0 + 1_000 },
      { role: 'interviewer', text: 'still keeping performance decent.', timestamp: T0 + 10_000 },
    ];
    assert.equal(
      extractLatestQuestion(t, undefined, JOIN).latestQuestion,
      'How would you cache tenant pages safely, while still keeping performance decent.',
    );
  });

  test('without a recorded start the answer stays a hard boundary (legacy)', () => {
    const t = turns([
      ['interviewer', 'How would you cache tenant pages safely, while', 6_000],
      ['assistant', 'I would first check the query plan and data size, then add a GIN index.', 9_000],
      ['interviewer', 'still keeping performance decent.', 10_000],
    ]);
    assert.equal(extractLatestQuestion(t, undefined, JOIN).latestQuestion, 'still keeping performance decent.');
  });
  test('the answered question\'s own tail arriving after the answer started is not joined', () => {
    // Press while the interviewer is finishing: the answer used the interim,
    // and the final for those words arrives (is stamped) after the start.
    const t = [
      { role: 'interviewer', text: 'How do you stop the Redis key collision', timestamp: T0 },
      { role: 'interviewer', text: 'from happening again?', timestamp: T0 + 1_800 },
      { role: 'assistant', text: 'I would make the key format tenant-aware in one shared function.', timestamp: T0 + 6_000, startedAt: T0 + 1_000, answeredQuestion: 'How do you stop the Redis key collision from happening again' },
      { role: 'interviewer', text: 'Okay. Now say ten brands spike at once.', timestamp: T0 + 12_000 },
      { role: 'interviewer', text: 'What is your Redis strategy?', timestamp: T0 + 13_500 },
    ];
    const q = extractLatestQuestion(t, undefined, JOIN).latestQuestion;
    assert.doesNotMatch(q, /happening again/);
    assert.match(q, /ten brands spike/);
    assert.match(q, /Redis strategy\?$/);
  });

  test('new speech during the answer is joined even when the answered question is on record', () => {
    const t = [
      { role: 'interviewer', text: 'How would you index the custom JSONB fields?', timestamp: T0 },
      { role: 'interviewer', text: 'Now, for the CDN, how would you cache tenant pages safely, while', timestamp: T0 + 6_000 },
      { role: 'assistant', text: 'I would first check the query plan and data size, then add a GIN index.', timestamp: T0 + 9_000, startedAt: T0 + 1_000, answeredQuestion: 'How would you index the custom JSONB fields?' },
      { role: 'interviewer', text: 'still keeping performance decent.', timestamp: T0 + 10_000 },
    ];
    assert.equal(
      extractLatestQuestion(t, undefined, JOIN).latestQuestion,
      'Now, for the CDN, how would you cache tenant pages safely, while still keeping performance decent.',
    );
  });

  test('without the answered question, finals inside the grace window count as its tail', () => {
    const base = (tailAt) => [
      { role: 'interviewer', text: 'Explain your retry policy for the payment webhook,', timestamp: T0 },
      { role: 'interviewer', text: 'including backoff.', timestamp: T0 + tailAt },
      { role: 'assistant', text: 'I retry with exponential backoff and jitter, capped at five tries.', timestamp: T0 + 9_000, startedAt: T0 + 1_000 },
      { role: 'interviewer', text: 'And what about idempotency?', timestamp: T0 + 12_000 },
    ];
    assert.equal(extractLatestQuestion(base(1_000 + ANSWER_START_TAIL_GRACE_MS), undefined, JOIN).latestQuestion, 'And what about idempotency?');
    assert.equal(
      extractLatestQuestion(base(1_000 + ANSWER_START_TAIL_GRACE_MS + 2_000), undefined, JOIN).latestQuestion,
      'including backoff. And what about idempotency?',
    );
  });

  test('two answers in a row: only speech after the newest answer started is joined', () => {
    const t = [
      { role: 'interviewer', text: 'Question one about sharding the tenant table?', timestamp: T0 },
      { role: 'assistant', text: 'Shard by tenant id with a lookup table for the big tenants.', timestamp: T0 + 5_000, startedAt: T0 + 1_000 },
      { role: 'interviewer', text: 'Question two about caching the lookup table?', timestamp: T0 + 8_000 },
      { role: 'assistant', text: 'Cache the lookup in memory with a short TTL and pub/sub invalidation.', timestamp: T0 + 14_000, startedAt: T0 + 9_000 },
      { role: 'interviewer', text: 'Finally, how do you migrate', timestamp: T0 + 13_500 },
      { role: 'interviewer', text: 'a tenant between shards without downtime?', timestamp: T0 + 16_000 },
    ];
    // Turn order as stored: finals sorted by arrival, the answer appended at completion.
    t.sort((a, b) => a.timestamp - b.timestamp);
    assert.equal(
      extractLatestQuestion(t, undefined, JOIN).latestQuestion,
      'Finally, how do you migrate a tenant between shards without downtime?',
    );
  });

  test('an answer with a start time later than its record is ignored as a boundary marker (legacy boundary)', () => {
    const t = [
      { role: 'interviewer', text: 'Tell me about the outage,', timestamp: T0 },
      { role: 'assistant', text: 'The outage came from a bad cache key in the deploy.', timestamp: T0 + 5_000, startedAt: T0 + 9_000 },
      { role: 'interviewer', text: 'what did you change after?', timestamp: T0 + 10_000 },
    ];
    assert.equal(extractLatestQuestion(t, undefined, JOIN).latestQuestion, 'what did you change after?');
  });

  test('several candidate interjections are all skipped', () => {
    const t = turns([
      ['interviewer', 'Design a notification service for all brands', 0],
      ['user', 'Okay, sure, that sounds good to me.', 2_000],
      ['interviewer', 'that sends email, SMS and push', 4_000],
      ['user', 'Right, right, got it, okay then.', 5_000],
      ['interviewer', 'with per-tenant rate limits.', 6_000],
    ]);
    assert.equal(
      extractLatestQuestion(t, undefined, JOIN).latestQuestion,
      'Design a notification service for all brands that sends email, SMS and push with per-tenant rate limits.',
    );
  });

  test('the character cap keeps the newest parts', () => {
    const long = 'word '.repeat(260).trim(); // ~1,300 chars, over the cap
    const t = turns([
      ['interviewer', `Background one ${long}`, 0],
      ['interviewer', 'Context two about the billing system.', 2_000],
      ['interviewer', 'How would you redesign it?', 4_000],
    ]);
    const q = extractLatestQuestion(t, undefined, JOIN).latestQuestion;
    assert.equal(q, 'Context two about the billing system. How would you redesign it?');
    assert.ok(q.length <= UTTERANCE_JOIN_MAX_CHARS);
  });

  test('a "?" in an earlier part does not change the scored confidence of the chosen turn', () => {
    const t = turns([
      ['interviewer', 'What is your caching strategy?', 0],
      ['interviewer', 'consider the CDN layer too', 1_500],
    ]);
    const a = extractLatestQuestion(t, undefined, JOIN);
    const b = extractLatestQuestion(t);
    assert.equal(a.latestQuestion, 'What is your caching strategy? consider the CDN layer too');
    assert.equal(a.confidence, b.confidence);
    assert.equal(a.questionType, b.questionType);
  });

  test('no interviewer speech at all: nothing is invented', () => {
    const t = turns([['user', 'I am just testing my microphone here.', 0]]);
    assert.equal(extractLatestQuestion(t, undefined, JOIN).latestQuestion, '');
  });

  test('a trailing greeting after the question does not hide the question', () => {
    const t = turns([
      ['interviewer', 'How would you shard the orders table?', 0],
      ['interviewer', 'Hello', 1_000],
    ]);
    assert.equal(extractLatestQuestion(t, undefined, JOIN).latestQuestion, 'How would you shard the orders table?');
  });
  test('a fast answer recorded before the answered question\'s late tail: the tail is still cut', () => {
    const t = [
      { role: 'interviewer', text: 'How do you stop the Redis key collision', timestamp: T0 },
      { role: 'assistant', text: 'I would make the key format tenant-aware in one shared function.', timestamp: T0 + 1_500, startedAt: T0 + 1_000, answeredQuestion: 'How do you stop the Redis key collision from happening again' },
      { role: 'interviewer', text: 'from happening again?', timestamp: T0 + 2_200 },
      { role: 'interviewer', text: 'Now ten brands spike at once.', timestamp: T0 + 15_000 },
      { role: 'interviewer', text: 'What is your Redis strategy?', timestamp: T0 + 16_500 },
    ];
    assert.equal(extractLatestQuestion(t, undefined, JOIN).latestQuestion, 'Now ten brands spike at once. What is your Redis strategy?');
  });

  test('a later follow-up that reuses the answered question\'s words is still joined', () => {
    const t = [
      { role: 'interviewer', text: 'How would you cache tenant pages?', timestamp: T0 },
      { role: 'assistant', text: 'Key the CDN cache by host and keep personalised pages private.', timestamp: T0 + 20_000, startedAt: T0 + 1_000, answeredQuestion: 'How would you cache tenant pages?' },
      { role: 'interviewer', text: 'And how would you cache tenant pages', timestamp: T0 + 1_000 + ANSWERED_TAIL_MAX_LAG_MS + 4_000 },
      { role: 'interviewer', text: 'for logged-in users?', timestamp: T0 + 1_000 + ANSWERED_TAIL_MAX_LAG_MS + 6_000 },
    ];
    t.sort((a, b) => a.timestamp - b.timestamp);
    assert.equal(extractLatestQuestion(t, undefined, JOIN).latestQuestion, 'And how would you cache tenant pages for logged-in users?');
  });
});
