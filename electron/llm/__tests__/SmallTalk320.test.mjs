import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isOnlySmallTalk } = require('../../../dist-electron/electron/llm/smallTalk.js');

test('small talk does not prefetch a substantive question', () => {
  assert.equal(isOnlySmallTalk('Can you hear me?'), true);
  assert.equal(isOnlySmallTalk('How are you today?'), true);
  assert.equal(isOnlySmallTalk('Can you hear me? How would you design a cache?'), false);
});
