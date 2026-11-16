// Cmd/Ctrl+Enter latest-question fix (2026-11-16): the legacy answer keeps its
// screenshot as the standing question after success as well as failure, with
// its lease, until it is replaced or cleared. Direct Assist / typed chat
// attempts (no keepOnSuccess) keep the old release-on-success behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreenshotRetry } from '../screenshotRetry.mjs';

const snap = (path = 'n.png', audioRevision = 1) => ({ audioRevision, askedAt: 1000, question: 'What should I say about this?', attachments: [{ path, preview: 'p' }] });

test('success keeps the screenshot question and its lease; a reuse carries the same image and lease', () => {
  const released = [];
  const state = createScreenshotRetry((lease) => released.push(lease));
  const first = state.begin(snap(), false, { keepOnSuccess: true });
  state.attachLease(first.id, 'lease-n');
  state.settle(first.id, 'success');
  assert.deepEqual(released, []);
  const held = state.latest();
  assert.equal(held.status, 'succeeded');
  assert.equal(held.snapshot.attachments[0].path, 'n.png');
  assert.equal(held.snapshot.askedAt, 1000);
  assert.equal(state.pending(1, true), null, 'the "Retry screenshot" banner is for failures only');
  const again = state.begin({ ...held.snapshot, audioRevision: 9 }, true, { keepOnSuccess: true });
  assert.equal(again.lease, 'lease-n');
  assert.deepEqual(released, []);
});

test('a failed screenshot stays the question after any amount of new audio', () => {
  const state = createScreenshotRetry();
  const first = state.begin(snap('n.png', 4), false, { keepOnSuccess: true });
  state.settle(first.id, 'failed');
  assert.equal(state.pending(7), null, 'Direct Assist same-audio rule unchanged');
  assert.equal(state.latest().status, 'failed');
  assert.equal(state.latest().snapshot.attachments[0].path, 'n.png');
});

test('replacement, cancellation and reset release the kept lease', () => {
  const released = [];
  const state = createScreenshotRetry((lease) => released.push(lease));
  const a = state.begin(snap('a.png'), false, { keepOnSuccess: true });
  state.attachLease(a.id, 'lease-a');
  state.settle(a.id, 'success');
  // A spoken/typed press replaces it.
  state.begin(null);
  assert.deepEqual(released, ['lease-a']);
  assert.equal(state.latest(), null);

  const b = state.begin(snap('b.png'), false, { keepOnSuccess: true });
  state.attachLease(b.id, 'lease-b');
  state.settle(b.id, 'cancelled');
  assert.deepEqual(released, ['lease-a', 'lease-b'], 'an unavailable attachment is not kept');

  const c = state.begin(snap('c.png'), false, { keepOnSuccess: true });
  state.attachLease(c.id, 'lease-c');
  state.settle(c.id, 'success');
  state.clear();
  assert.deepEqual(released, ['lease-a', 'lease-b', 'lease-c']);
});

test('without keepOnSuccess (Direct Assist, typed chat) success still releases', () => {
  const released = [];
  const state = createScreenshotRetry((lease) => released.push(lease));
  const a = state.begin(snap());
  state.attachLease(a.id, 'lease');
  state.settle(a.id, 'success');
  assert.deepEqual(released, ['lease']);
  assert.equal(state.latest(), null);
});
