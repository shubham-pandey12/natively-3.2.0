// Wiring guard for the Cmd/Ctrl+Enter latest-question fix (2026-11-16). The
// decision logic is covered behaviourally in
// electron/services/__tests__/CmdEnterLatestQuestion2026_11_16.test.mjs and
// src/lib/__tests__/{ScreenshotQuestionKept,LateAnswerAfterPress}2026_11_16;
// this pins the renderer and IPC seams that connect them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ui = fs.readFileSync(new URL('../NativelyInterface.tsx', import.meta.url), 'utf8');
const ipc = fs.readFileSync(new URL('../../../electron/ipcHandlers.ts', import.meta.url), 'utf8');
const preload = fs.readFileSync(new URL('../../../electron/preload.ts', import.meta.url), 'utf8');
const press = ui.slice(ui.indexOf('const handleWhatToSay = async'), ui.indexOf('const handleFollowUp = async'));

test('a legacy press asks main for the floor and, with a held screenshot, the source', () => {
  assert.match(press, /const heldScreenshot = !directAssistEnabled && !retryExplicitly && barePress\s*\? screenshotRetryRef\.current\.latest\(\)/);
  assert.match(press, /window\.electronAPI\.beginWhatToSayPress\(/);
  assert.match(press, /liveAnswerFloorRef\.current = Math\.max\(/);
  assert.match(press, /decision\?\.source === 'unidentified'/);
  assert.match(press, /if \(decision\?\.source === 'speech'\) \{\s*clearScreenshotRetry\(\);[\s\S]*?lockedSpokenQuestion = decision\.question;/);
  assert.match(press, /spokenQuestion: lockedSpokenQuestion/);
  assert.match(press, /begin\(retrySnapshot, Boolean\(retry\), \{ keepOnSuccess: !directAssistEnabled \}\)/);
  assert.match(press, /askedAt: retry\?\.snapshot\.askedAt \?\? Date\.now\(\)/);
});

test('when main cannot choose (call failed), the held screenshot is kept, never swapped for older speech', () => {
  const held = press.slice(press.indexOf('} else if (heldScreenshot &&'), press.indexOf('if (retryExplicitly && !retry)'));
  assert.ok(held.length > 0);
  assert.match(held, /\} else \{[\s\S]*?retry = heldScreenshot;\s*\}/);
  assert.doesNotMatch(held, /pending\(audioInputRevisionRef/, 'no fallback to the audio-revision rule for a held screenshot');
  assert.match(press, /catch \{ pressStart = null; \}/);
});

test('generate-what-to-say forwards the locked question to the engine', () => {
  const handler = ipc.slice(ipc.indexOf("'generate-what-to-say',"), ipc.indexOf("'generate-what-to-say',") + 20000);
  assert.match(handler, /spokenQuestion: options\.spokenQuestion\.trim\(\)\.slice\(0, 4000\)/);
});

test('Direct Assist keeps its same-audio retry rule', () => {
  assert.match(press, /barePress && directAssistEnabled\) \{\s*retry = screenshotRetryRef\.current\.pending\(audioInputRevisionRef\.current, false\)/);
});

test('every legacy live-answer guard call passes the press floor', () => {
  // Each call statement, from the call to its terminating semicolon.
  const calls = ui.split('resolveLiveAnswerBatch(').slice(1).map((rest) => rest.slice(0, rest.indexOf(';')));
  assert.ok(calls.length >= 4);
  for (const call of calls) assert.match(call, /liveAnswerFloorRef\.current/, call);
});

test('the IPC is overlay-only and exposed through preload', () => {
  const handler = ipc.slice(ipc.indexOf("safeHandle('begin-what-to-say-press'"), ipc.indexOf("safeHandle('delete-screenshot'"));
  assert.match(handler, /getOverlayWindow\(\)\?\.webContents\.id/);
  assert.match(handler, /intelligenceManager\.beginWhatToSayPress\(/);
  assert.match(preload, /beginWhatToSayPress: \(screenshotAskedAt\?: number\) => ipcRenderer\.invoke\('begin-what-to-say-press', screenshotAskedAt\)/);
});
