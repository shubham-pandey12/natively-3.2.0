import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (file) => readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');

test('launcher guide anchors and reacts to plan and credential changes', () => {
  const card = src('components/onboarding/FirstRunGuideCard.tsx');
  const settings = src('components/SettingsOverlay.tsx');
  assert.match(settings, /data-guide="nav-plans"/);
  assert.match(settings, /data-guide="nav-ai-providers"/);
  assert.match(card, /createPortal\(card, document\.body\)/);
  assert.match(card, /onLicenseStatusChanged/);
  assert.match(card, /type: 'keys_done'|send\('keys_done'\)/);
  assert.match(card, /Speech-to-text/);
});

test('Help can restart the guide', () => {
  assert.match(src('components/settings/HelpSettings.tsx'), /dispatchGuideEvent\?\.\(\{ type: 'restart' \}\)/);
});
