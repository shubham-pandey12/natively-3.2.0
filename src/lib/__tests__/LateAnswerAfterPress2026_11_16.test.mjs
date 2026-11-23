// Example 6 (Cmd/Ctrl+Enter latest-question fix, 2026-11-16): a late token or
// final from an OLDER request must never fill the row a new press just opened.
//
// The press resets the renderer's adopted generation to null before main mints
// the press's own generation (main mints it only after its screenshot/vision
// awaits). With a null adopted id, the guard accepted ANY id — so an older
// generation's batch arriving in that window was adopted as the new answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLiveAnswerBatch } from '../chatStreamGuard.mjs';

test('repro: after a press, an older generation arriving before the new one is rejected', () => {
  // Auto Answer's generation 5 was streaming and adopted.
  let active = 5;
  // Cmd+Enter: the renderer opens a fresh row; main reports 5 as the newest minted id.
  const floor = 5;
  active = null;
  const late = resolveLiveAnswerBatch(active, 5, floor);
  assert.equal(late.accept, false, 'generation 5 belongs to the earlier request');
  active = late.activeId;
  const fresh = resolveLiveAnswerBatch(active, 6, floor);
  assert.deepEqual(fresh, { accept: true, activeId: 6 });
});

test('the floor covers an older generation the renderer never saw before the press', () => {
  // Generation 7 was minted but had not sent anything when the user pressed.
  assert.equal(resolveLiveAnswerBatch(null, 7, 7).accept, false);
  assert.equal(resolveLiveAnswerBatch(null, 8, 7).accept, true);
});

test('without a floor the guard keeps its existing behaviour', () => {
  assert.deepEqual(resolveLiveAnswerBatch(null, 3), { accept: true, activeId: 3 });
  assert.deepEqual(resolveLiveAnswerBatch(null, 3, null), { accept: true, activeId: 3 });
  assert.deepEqual(resolveLiveAnswerBatch(null, undefined, 9), { accept: true, activeId: null });
  assert.deepEqual(resolveLiveAnswerBatch(4, 3, 1), { accept: false, activeId: 4 });
});
