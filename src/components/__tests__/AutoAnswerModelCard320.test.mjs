import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const card = readFileSync(new URL('../../../premium/src/AutoAnswerModelCard.tsx', import.meta.url), 'utf8');

test('Auto Answer model card uses real status, progress, and judge billing basis', () => {
  for (const name of ['getAutoAnswerModelStatus', 'onAutoAnswerModelProgress', 'installAutoAnswerModel', 'removeAutoAnswerModel', 'judgeViaNatively']) {
    assert.ok(card.includes(name), `${name} is wired`);
  }
  assert.match(card, /install\.state === 'not_entitled'/);
  assert.match(card, /Math\.max\(1, install\.total\)/);
});
