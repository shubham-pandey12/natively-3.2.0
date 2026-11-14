// Answers go to the overlay in every window mode (2026-11-06). They followed
// getMainWindow(), the LAUNCHER whenever the window mode was 'launcher'; only
// the overlay listens on these channels, so What to answer pressed then (from
// the phone, whose actions reach the overlay's key handler in any mode)
// showed "Thinking" and its answer was dropped. Shared code: no platform branch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const main = read('electron/main.ts');
const block = main.slice(main.indexOf('private setupIntelligenceEvents(): void {'), main.indexOf('Adopt a Google service-account key file'));

test('the answer window is the overlay, whatever the mode; the mode-dependent window only when there is no overlay', () => {
  assert.match(block, /const answerWindow = \(\): BrowserWindow \| null => \{\s*const overlay = this\.windowHelper\.getOverlayWindow\(\);\s*return overlay && !overlay\.isDestroyed\(\) \? overlay : this\.getMainWindow\(\);\s*\}/);
  assert.doesNotMatch(block, /\bmainWindow\(\)/, 'no answer event follows the window mode');
});

test('every answer channel sent there is one only the overlay\'s interface listens on', () => {
  const channels = [...new Set([...block.matchAll(/sendToWindow\((?:win|answerWindow\(\)), '([a-z-]+)'/g)].map((m) => m[1]))];
  assert.ok(channels.length >= 12, channels.join(','));
  const preload = read('electron/preload.ts');
  const listeners = (dir) => fs.readdirSync(path.join(root, dir), { recursive: true })
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('__tests__'))
    .map((f) => path.join(dir, f));
  const files = listeners('src').map((f) => [f, read(f)]);
  for (const channel of channels) {
    const at = preload.indexOf(`ipcRenderer.on('${channel}'`);
    if (at < 0) continue; // sent, never listened to (a no-op either way)
    const fn = [...preload.slice(Math.max(0, at - 600), at).matchAll(/\n\s+(on[A-Z][A-Za-z]+):/g)].pop()?.[1];
    assert.ok(fn, `listener name for ${channel}`);
    const users = files.filter(([f, src]) => new RegExp(`\\b${fn}\\b`).test(src) && !f.endsWith('electron.d.ts')).map(([f]) => f);
    // None at all is fine (intelligence-mode-changed has no listener today).
    assert.ok(users.every((f) => f === 'src/components/NativelyInterface.tsx'), `${channel} (${fn}) listened on by: ${users.join(', ')}`);
  }
});

test('submitted interviewer questions reach the overlay before automatic answer tokens', () => {
  const engine = read('electron/IntelligenceEngine.ts');
  const manager = read('electron/IntelligenceManager.ts');
  const preload = read('electron/preload.ts');
  const adoption = engine.slice(engine.indexOf('if (stillStreaming) {'), engine.indexOf('// Accepted, but the stream neither runs'));
  assert.match(adoption, /what_to_answer_question[\s\S]*?speculativeAdoptHook/);
  assert.match(adoption, /what_to_answer_question[\s\S]*?revealSpeculativeAnswer/);
  assert.match(engine, /if \(automaticQuestion\) \{\s*this\.emit\('what_to_answer_question'/);
  assert.match(engine, /if \(automaticQuestion \|\| isSpeculative\) \{\s*this\.emit\('what_to_answer_question', \{\s*generationId, pending: false/);
  assert.match(manager, /'what_to_answer_question'/);
  assert.match(block, /on\('what_to_answer_question'[\s\S]*?sendToWindow\(answerWindow\(\), 'intelligence-what-to-answer-question', data\)/);
  assert.match(preload, /onWhatToAnswerQuestion:[\s\S]*?ipcRenderer\.on\('intelligence-what-to-answer-question'/);
});

test('manual speech replaces its own question card in both answer paths', () => {
  const overlay = read('src/components/NativelyInterface.tsx');
  const engine = read('electron/IntelligenceEngine.ts');
  const ipc = read('electron/ipcHandlers.ts');
  const handler = overlay.slice(overlay.indexOf('const handleWhatToSay ='), overlay.indexOf('const handleFollowUp ='));
  assert.match(handler, /source === 'stt'[\s\S]*?message.id === questionCardId[\s\S]*?role: 'interviewer', text: interviewerRequest[\s\S]*?await beginDirectAssist/);
  assert.match(handler, /generateWhatToSay\([\s\S]*?overlayQuestionId: questionCardId/);
  assert.match(ipc, /overlayQuestionId: typeof options\?\.overlayQuestionId === 'string'/);
  assert.match(engine, /!isSpeculative && !question && options\?\.overlayQuestionId && !questionSpokenByUser[\s\S]*?question: submitted, overlayQuestionId: options\.overlayQuestionId/);
  assert.match(overlay, /onWhatToAnswerQuestion\?\.\([\s\S]*?overlayQuestionId \?\?[\s\S]*?if \(overlayQuestionId\)[\s\S]*?message\.id === id[\s\S]*?role: 'interviewer', text: question/);
});
