import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { SessionTracker } = require('../../../dist-electron/electron/SessionTracker.js');

test('spoken coding problem is retained as the active problem', () => {
  const tracker = new SessionTracker();
  const statement = 'Implement an LRU cache with get and put.';
  tracker.handleTranscript({ speaker: 'interviewer', text: statement, timestamp: Date.now(), final: true });
  assert.equal(tracker.getActiveCodingProblem(60_000)?.question, statement);
  tracker.handleTranscript({ speaker: 'interviewer', text: 'Have you used Kafka before?', timestamp: Date.now(), final: true });
  assert.equal(tracker.getActiveCodingProblem(60_000)?.question, statement);
  tracker.handleTranscript({ speaker: 'interviewer', text: 'Here is the next problem: write a parser for JSON strings', timestamp: Date.now(), final: true });
  assert.equal(tracker.getActiveCodingProblem(60_000)?.question, 'Here is the next problem: write a parser for JSON strings');
  tracker.clearCodingQuestion();
  assert.equal(tracker.getActiveCodingProblem(60_000), null);
});
