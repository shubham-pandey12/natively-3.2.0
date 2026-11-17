// 3.2.0 parity fixes (2026-11-16 audit): renderer mapping of the missing-key
// STT error, the demo-film open options on both platforms, and the wiring of
// the first-run guide start and facts, checked against the recovered build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { categorizeSttError } from '../sttErrorMapper.ts';
import { demoFilmOpenOptions, DEMO_VIDEO_URL } from '../demoVideoUrl.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const src = (p) => readFileSync(join(root, p), 'utf8');

test('a missing STT key shows "Key Missing" with the provider message as written', () => {
  const msg = 'No Deepgram API key is saved, so nothing is being transcribed. Add it in Settings → Audio, or choose another speech provider there.';
  assert.deepEqual(categorizeSttError(msg), { title: 'Key Missing', body: msg, category: 'auth' });
  // The Google service-account case keeps its own wording.
  assert.equal(categorizeSttError('Google needs a Service Account JSON').title, 'Google Key Missing');
});

test('demo film: the browser stays behind on macOS, default on Windows', () => {
  assert.deepEqual(demoFilmOpenOptions('darwin'), { activate: false });
  assert.deepEqual(demoFilmOpenOptions('win32'), {});
  assert.equal(DEMO_VIDEO_URL, 'https://youtu.be/Ha_ZiwG5Kwc');
});

test('guide facts: the seeded demo meeting is not the user\'s own, and the film opens on the first meeting', () => {
  const ipc = src('electron/ipcHandlers.ts');
  assert.match(ipc, /hasMeetings: DatabaseManager\.getInstance\(\)\.hasOwnMeeting\(\)/);
  assert.doesNotMatch(ipc, /hasMeetings: DatabaseManager\.getInstance\(\)\.getRecentMeetings/);
  assert.match(ipc, /onFirstMeetingStarted: \(\) => \{\s*shell\.openExternal\(DEMO_VIDEO_URL, demoFilmOpenOptions\(process\.platform\)\)/);
  const db = src('electron/db/DatabaseManager.ts');
  assert.match(db, /SELECT 1 FROM meetings WHERE id != 'demo-meeting' LIMIT 1/);
});

test('closing the Plans card (not a forced one) starts the guide with its facts', () => {
  const host = src('src/components/onboarding/OrchestratedToasterHost.tsx');
  assert.match(host, /onDismiss=\{closePlans\}/);
  assert.match(host, /if \(forced\) return;[\s\S]{0,200}type: 'plans_closed'/);
  assert.match(host, /launchCount: user\.cardLedger\?\.launchCount \?\? 1/);
});

test('greetings never start an Auto Answer prefetch', () => {
  const eng = src('electron/IntelligenceEngine.ts');
  assert.match(eng, /prefetchAutoAnswer\(questionId: string, text: string\): void \{\s*const trimmed = \(text \?\? ''\)\.trim\(\);\s*if \(trimmed\.length < 12\) return;[\s\S]{0,120}if \(IntelligenceEngine\.onlySmallTalk\(trimmed\)\) return;/);
});

test('the guide stop lock is shown, not a silent refusal', () => {
  const card = src('src/components/onboarding/FirstRunGuideCard.tsx');
  assert.match(card, /Stop unlocks in \{Math\.ceil\(\(guide\.stopLockUntil - now\) \/ 1000\)\} s/);
});
