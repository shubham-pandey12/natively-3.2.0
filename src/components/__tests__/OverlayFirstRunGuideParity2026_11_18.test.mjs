import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const guide = readFileSync(new URL('../overlay/useOverlayFirstRunGuide.tsx', import.meta.url), 'utf8');
const overlay = readFileSync(new URL('../NativelyInterface.tsx', import.meta.url), 'utf8');
const shortcutKeys = readFileSync(new URL('../../lib/onboarding/shortcutKeys.mjs', import.meta.url), 'utf8');

test('recovered overlay guide renders its four steps in the banner slot', () => {
  for (const step of ['overlay', 'answer', 'screenshot', 'stop']) assert.match(guide, new RegExp(`isGuideStep\\(state, '${step}'\\)`));
  assert.match(overlay, /guide: guide\.wants/);
  assert.match(overlay, /testId="fold-guide"/);
  assert.match(guide, /data-guide-strip=\{id\}/);
});

test('recovered overlay guide advances from speech and answers', () => {
  assert.match(guide, /firstSpeechAt \+ GUIDE_AUTO_ANSWER_DELAY_MS/);
  assert.match(guide, /noSoundAt \+ GUIDE_SILENT_DEMO_DELAY_MS/);
  assert.match(guide, /onIntelligenceSuggestedAnswer/);
  assert.match(guide, /onIntelligenceManualResult/);
  assert.match(guide, /dispatch\(\{ type: 'answer_shown' \}\)/);
  assert.match(guide, /useGuideShortcuts/);
  assert.match(shortcutKeys, /CommandOrControl\+Shift\+H/);
  assert.match(shortcutKeys, /command: 'Win'/);
  assert.match(shortcutKeys, /command: '⌘'/);
});
