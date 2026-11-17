import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const llm = fs.readFileSync('electron/LLMHelper.ts', 'utf8');
const ipc = fs.readFileSync('electron/ipcHandlers.ts', 'utf8');

test('Auto Answer model status reports whether the judge uses Natively', () => {
  assert.match(llm, /judgeRunsOnNatively\(\): boolean/);
  assert.match(ipc, /judgeViaNatively: llm\?\.getCurrentModelId\?\.\(\) === 'natively' \|\| llm\?\.judgeRunsOnNatively\?\.\(\) === true/);
});

test('deletion returns a failure result if the recovered uploader has no deletion method', () => {
  assert.match(ipc, /typeof deleteShared === 'function'/);
  assert.match(ipc, /success: false, error: 'Deletion is unavailable in this build\.'/);
  assert.match(ipc, /catch \(error\) \{\s*return \{ success: false/);
});
