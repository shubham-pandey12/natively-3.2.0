import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keepsPartialOnDiscard, replaceLiveBrainAnswer, placeLiveBrainQuestion } from '../liveBrainChat.mjs';

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

test('a Flux partial revised to filler is removed without removing adjacent answers', () => {
    const answer = { id: 'live-brain-text-1', role: 'assistant', text: 'An answer.' };
    const rows = placeLiveBrainQuestion([answer], { questionId: 'q1', text: 'A partial', done: false });
    assert.deepEqual(placeLiveBrainQuestion(rows, { questionId: 'q1', text: '', done: true, discard: true }), [answer]);
});

test('D21 rebinds the existing answer ID and places the merged question above it', () => {
    const rows = [
      { id: 'live-brain-q-q1', role: 'interviewer', text: 'Design a store.' },
      { id: 'live-brain-text--1', role: 'system', text: 'Partial', whatToAnswerGeneration: -1 },
    ];
    const replacement = replaceLiveBrainAnswer(rows, -2, { previousGenerationId: -1 });
    const merged = placeLiveBrainQuestion(replacement, { questionId: 'q1', generationId: -2, text: 'Design a store. Use MongoDB.', done: true });
    assert.deepEqual(merged.map(row => row.id), rows.map(row => row.id));
    assert.equal(merged[0].text, 'Design a store. Use MongoDB.');
    assert.equal(merged[1].text, '');
    assert.equal(merged[1].whatToAnswerGeneration, -2);
});

test('D21 a withdrawn preview restores the old row under a fresh generation', () => {
    const rows = [{ id: 'stable', role: 'system', text: 'Original', whatToAnswerGeneration: -1 }];
    const preview = replaceLiveBrainAnswer(rows, -2, { previousGenerationId: -1 });
    const restored = replaceLiveBrainAnswer(preview, -3, { previousGenerationId: -2, restore: true });
    assert.equal(restored[0].id, 'stable');
    assert.equal(restored[0].text, 'Original');
    assert.equal(restored[0].whatToAnswerGeneration, -3);
});

test('a writer cut off by the interviewer keeps its partial row like a correction', () => {
  // D21: the replacement answer reuses that row; a turn with no answer leaves it visible.
  assert.equal(keepsPartialOnDiscard('answer_corrected'), true);
  assert.equal(keepsPartialOnDiscard('interviewer_interrupted'), true);
  for (const reason of ['superseded', 'no_answer', 'dispatch_timeout', 'user_barge_in', undefined]) {
    assert.equal(keepsPartialOnDiscard(reason), false, String(reason));
  }
});

test('the renderer keeps the partial on an interviewer interruption discard', async () => {
  const { readFileSync } = await import('node:fs');
  const ui = readFileSync(new URL('../../components/NativelyInterface.tsx', import.meta.url), 'utf8');
  assert.match(ui, /if \(keepsPartialOnDiscard\(data\.reason\) && data\.generationId !== undefined\)/);
  assert.doesNotMatch(ui, /if \(data\.reason === 'answer_corrected' && data\.generationId !== undefined\)/);
});
