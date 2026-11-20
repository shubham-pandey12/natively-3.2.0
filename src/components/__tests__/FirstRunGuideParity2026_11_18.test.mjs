import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('guide uses separate launcher, overlay and notepad surfaces', () => {
  const app = read('src/App.tsx');
  const notes = read('src/components/NotesWindow.tsx');
  const overlay = read('src/components/NativelyInterface.tsx');
  assert.match(app, /<LauncherGuide\b/);
  assert.match(overlay, /useOverlayGuide\(/);
  assert.match(notes, /useNotesGuide\(/);
  assert.doesNotMatch(app + notes + overlay, /FirstRunGuideCard/);
});

test('Help restarts the guide and closes Settings', () => {
  const settings = read('src/components/SettingsOverlay.tsx');
  const help = read('src/components/settings/HelpSettings.tsx');
  assert.match(settings, /onShowGuide=\{\(\) => \{ dispatchGuide\(\{ type: 'restart' \}\); onClose\(\); \}\}/);
  assert.match(help, /\{onShowGuide && \(\s*<SettingsRow/);
  assert.match(help, /onClick=\{onShowGuide\}/);
});

test('Phone Mirror chat uses the recovered placeholder and shared stream arbitration', () => {
  const overlay = read('src/components/NativelyInterface.tsx');
  assert.match(overlay, /onPhoneMirrorIncomingChat\(\(\{ message \}\) =>/);
  assert.match(overlay, /const placeholderId = `\$\{userId\}-reply`/);
  assert.doesNotMatch(overlay, /phone-\$\{(?:meta|data|streamId)/);
});
