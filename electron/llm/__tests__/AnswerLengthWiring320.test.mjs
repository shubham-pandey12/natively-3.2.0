// The answer-length provider is wired where 3.2.0 wires it: in IPC setup,
// inside a try/catch that logs and keeps answers Smart, not in the AppState
// constructor (where a load failure would abort boot).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('answer length provider is registered in ipcHandlers with a guarded fallback', () => {
  const ipc = src('../../ipcHandlers.ts');
  const at = ipc.indexOf('registerAnswerLengthProvider(() => effectiveAnswerLength(');
  assert.ok(at > 0, 'registration present in ipcHandlers.ts');
  const tryAt = ipc.lastIndexOf('try {', at);
  const catchAt = ipc.indexOf("console.warn('[IPC] Answer length not wired, answers stay Smart:'", at);
  assert.ok(tryAt > 0 && at - tryAt < 300, 'registration is inside a try block');
  assert.ok(catchAt > at && catchAt - at < 300, 'failure logs the 3.2.0 warning');
  assert.ok(ipc.indexOf('setModesProAccessCheck(isProOrTrialActive)') < at, 'follows the modes Pro check, as in 3.2.0');
});

test('main.ts no longer registers the answer length provider', () => {
  assert.equal(src('../../main.ts').includes('registerAnswerLengthProvider'), false);
});
