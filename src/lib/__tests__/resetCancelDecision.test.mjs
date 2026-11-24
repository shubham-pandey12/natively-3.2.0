import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideResetCancel } from '../chatStreamGuard.mjs';

const cases = [
  [false, false, false, 'reset'],
  [false, false, true, 'cancel'],
  [false, true, false, 'cancel'],
  [false, true, true, 'cancel'],
  [true, false, false, 'cancel'],
  [true, false, true, 'cancel'],
  [true, true, false, 'cancel'],
  [true, true, true, 'cancel'],
];

for (const [isProcessing, hasLiveStream, hasDirectAssist, expected] of cases) {
  test(`Reset/Cancel chooses ${expected} with processing=${isProcessing}, stream=${hasLiveStream}, direct assist=${hasDirectAssist}`, () => {
    assert.equal(decideResetCancel({ isProcessing, hasLiveStream, hasDirectAssist }), expected);
  });
}
