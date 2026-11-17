import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('recovered guide uses separate launcher, overlay and notepad surfaces', () => {
  const app = read('src/App.tsx');
  const notes = read('src/components/NotesWindow.tsx');
  const overlay = read('src/components/NativelyInterface.tsx');
  assert.match(app, /<LauncherGuide /);
  assert.match(overlay, /useOverlayFirstRunGuide/);
  assert.match(notes, /Write while you talk\./);
  assert.match(notes, /Ask about the meeting\./);
  assert.match(notes, /Try a recipe\./);
  assert.match(notes, /Stop the meeting when you’re ready\./);
  assert.doesNotMatch(app + notes + overlay, /FirstRunGuideCard/);
});

test('Help restarts the guide and closes Settings as in 3.2.0', () => {
  const settings = read('src/components/SettingsOverlay.tsx');
  const help = read('src/components/settings/HelpSettings.tsx');
  assert.match(settings, /onShowGuide=\{\(\) => \{ void window\.electronAPI\?\.guideDispatch\?\.\(\{ type: 'restart' \}\); onClose\(\); \}\}/);
  assert.match(help, /\{onShowGuide && <SettingsRow/);
  assert.match(help, /onClick=\{onShowGuide\}/);
});

test('Phone Mirror chat uses the recovered placeholder and shared stream arbitration', () => {
  const overlay = read('src/components/NativelyInterface.tsx');
  assert.match(overlay, /onPhoneMirrorIncomingChat\(\(\{ message \}\) =>/);
  assert.match(overlay, /const placeholderId = `\$\{userId\}-reply`/);
  assert.doesNotMatch(overlay, /phone-\$\{(?:meta|data|streamId)/);
});
