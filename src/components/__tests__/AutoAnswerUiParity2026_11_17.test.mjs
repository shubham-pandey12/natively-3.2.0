// Auto Answer UI matches recovered Natively 3.2.0 (dialogs, intro flag,
// Intelligence section, model card). Source-level checks; the strings were
// compared against the 3.2.0 renderer with scripts/parity/compare-renderer-strings.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const access = read('premium/src/AutoAnswerAccessDialog.tsx');
const stop = read('premium/src/AutoAnswerStopSharingDialog.tsx');
const card = read('premium/src/AutoAnswerModelCard.tsx');
const settings = read('src/components/SettingsOverlay.tsx');
const intel = read('src/components/settings/IntelligenceSettings.tsx');
const loader = read('src/premium/index.tsx');

test('access dialog carries the 3.2.0 titles, aria ids and privacy link', () => {
  for (const s of ['Auto Answer · Natively Pro', 'Auto Answer · optional', 'Auto Answer · Beta', 'Free, if you share.',
    'Share transcripts', 'Turn on Auto Answer', 'See Pro plans', 'auto-answer-access-title', 'auto-answer-access-desc',
    'https://heynatively.com/privacy#3-7-auto-answer-training']) assert.ok(access.includes(s), s);
});

test('stop-sharing dialog carries the 3.2.0 texts and is an alertdialog', () => {
  for (const s of ['Keep Auto Answer free?', 'Keep sharing', 'Stop sharing', 'Auto Answer · sharing', "role: 'alertdialog'",
    'auto-answer-stop-title', 'auto-answer-stop-desc']) assert.ok(stop.includes(s), s);
});

test('both dialogs load through the premium glob like 3.2.0', () => {
  assert.match(loader, /premium\/src\/AutoAnswerAccessDialog\.tsx/);
  assert.match(loader, /premium\/src\/AutoAnswerStopSharingDialog\.tsx/);
  assert.equal(fs.existsSync('src/components/AutoAnswerAccessDialog.tsx'), false);
});

test('first turn-on shows the intro once, keyed by natively.autoAnswer.introSeen.v1', () => {
  assert.ok(settings.includes("'natively.autoAnswer.introSeen.v1'"));
  assert.match(settings, /if \(newState && !autoAnswerIntroSeen\(\)\) \{ setAutoAnswerDialog\('intro'\); return; \}/);
});

test('stopping sharing goes through the dialog and calls setAutoAnswerTrainingConsent(false)', () => {
  assert.match(settings, /setStopSharingOpen\(true\)/);
  assert.match(settings, /setAutoAnswerTrainingConsent\?\.\(false\)/);
  assert.ok(!settings.includes("t('Stop sharing?')"), 'the old confirm is gone');
  assert.ok(!settings.includes('auto-answer-subrows'), 'the old General sub-rows are gone');
});

test('Intelligence hosts the Auto Answer section', () => {
  assert.ok(intel.includes('The on-device model and transcript sharing. Turn Auto Answer on or off in General.'));
  assert.ok(settings.includes("t('Share transcripts to improve Auto Answer')"));
});

test('model card exports and empty-state lines match 3.2.0', async () => {
  for (const s of ['export function formatTokens', 'export function formatUsd', 'export default AutoAnswerModelCard',
    'No Auto Answer meetings in the last 7 days yet.', 'No Auto Answer meetings since the download yet.']) assert.ok(card.includes(s), s);
});
