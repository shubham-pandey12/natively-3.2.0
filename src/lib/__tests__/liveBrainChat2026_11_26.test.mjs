import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeLiveBrainQuestion } from '../liveBrainChat.mjs';

test('a new question bubble is appended, then updated in place while it streams', () => {
  let rows = placeLiveBrainQuestion([], { questionId: 'q1', text: 'How would', done: false });
  assert.deepEqual(rows, [{ id: 'live-brain-q-q1', role: 'interviewer', text: 'How would', isStreaming: true }]);
  rows = placeLiveBrainQuestion(rows, { questionId: 'q1', text: 'How would you design a cache?', done: true });
  assert.deepEqual(rows, [{ id: 'live-brain-q-q1', role: 'interviewer', text: 'How would you design a cache?', isStreaming: false }]);
  assert.equal(placeLiveBrainQuestion(rows, { questionId: 'q1', text: 'How would you design a cache?', done: true }), rows);
});

test('a late question is moved directly above its answer', () => {
  const rows = [
    { id: 'older', role: 'system', text: 'Earlier answer' },
    { id: 'live-brain-text--3', role: 'system', text: 'I would shard by user.' },
  ];
  const next = placeLiveBrainQuestion(rows, { questionId: 'q2', text: 'How do you scale writes?', done: true, generationId: -3 });
  assert.deepEqual(next.map((row) => row.id), ['older', 'live-brain-q-q2', 'live-brain-text--3']);
});

test('a question already above its answer stays where it is', () => {
  const rows = [
    { id: 'live-brain-q-q1', role: 'interviewer', text: 'Q', isStreaming: false },
    { id: 'live-brain-text--1', role: 'system', text: 'A' },
  ];
  const next = placeLiveBrainQuestion(rows, { questionId: 'q1', text: 'Q', done: true, generationId: -1 });
  assert.deepEqual(next.map((row) => row.id), ['live-brain-q-q1', 'live-brain-text--1']);
});

test('a late Flux question is placed above the existing answer writer row', () => {
  const rows = [
    { id: 'older', role: 'system', text: 'Earlier answer' },
    { id: 'answer-writer-row', role: 'system', text: 'Use shards.', whatToAnswerGeneration: 42 },
  ];
  const next = placeLiveBrainQuestion(rows, { questionId: 'q2', text: 'How do you scale writes?', done: true, generationId: 42 });
  assert.deepEqual(next.map((row) => row.id), ['older', 'live-brain-q-q2', 'answer-writer-row']);
});
