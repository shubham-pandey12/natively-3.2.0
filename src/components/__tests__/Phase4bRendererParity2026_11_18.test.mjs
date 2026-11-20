// Renderer parity checks carried forward from Phase 4b.
// Exercises pure helper branches on both macOS ('darwin') and Windows ('win32')
// plus source-level parity invariants across Settings, Overlay, Notes, App,
// MeetingDetails, ProfileIntelligence, AIProviders, Help, and ModesSettings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GUIDE_STEP_NUMBER,
  GUIDE_STEP_COUNT,
  GUIDE_DONE_HOLD_MS,
  GUIDE_STOP_LOCK_MS,
} from '../../lib/onboarding/firstRunGuide.mjs';
import { guideKeys } from '../../lib/onboarding/guideKeys.mjs';
import { shouldApplyLiveAnswerDiscard } from '../../lib/chatStreamGuard.mjs';

const read = (rel) => readFileSync(new URL(`../../../${rel}`, import.meta.url), 'utf8');

test('guideKeys maps guide defaults and custom overrides across macOS and Windows', () => {
  assert.deepEqual(guideKeys(null, 'chat:whatToAnswer', 'darwin'), ['⌘', '1']);
  assert.deepEqual(guideKeys(null, 'chat:whatToAnswer', 'win32'), ['Ctrl', '1']);
  assert.deepEqual(guideKeys(null, 'general:take-screenshot', 'darwin'), ['⌘', 'H']);
  assert.deepEqual(guideKeys(null, 'general:take-screenshot', 'win32'), ['Ctrl', 'H']);
  assert.deepEqual(guideKeys(null, 'general:selective-screenshot', 'darwin'), ['⌘', '⇧', 'H']);
  assert.deepEqual(guideKeys(null, 'general:selective-screenshot', 'win32'), ['Ctrl', 'Shift', 'H']);

  const custom = [{ id: 'chat:whatToAnswer', accelerator: 'CommandOrControl+Alt+K' }];
  assert.deepEqual(guideKeys(custom, 'chat:whatToAnswer', 'darwin'), ['⌘', '⌥', 'K']);
  assert.deepEqual(guideKeys(custom, 'chat:whatToAnswer', 'win32'), ['Ctrl', 'Alt', 'K']);
  assert.deepEqual(guideKeys(custom, 'unknown:id', 'darwin'), []);
  assert.deepEqual(guideKeys(custom, 'unknown:id', 'win32'), []);
});

test('firstRunGuide exports step numbers and timing constants', () => {
  assert.equal(GUIDE_STEP_COUNT, 14);
  assert.equal(GUIDE_DONE_HOLD_MS, 1000);
  assert.equal(GUIDE_STOP_LOCK_MS, 30_000);
  assert.equal(GUIDE_STEP_NUMBER.overlay, 2);
  assert.equal(GUIDE_STEP_NUMBER.stop, 5);
  assert.equal(GUIDE_STEP_NUMBER.notepad, 9);
  assert.equal(GUIDE_STEP_NUMBER.stop2, 12);
  assert.equal(GUIDE_STEP_NUMBER.plans, 14);
  assert.equal(GUIDE_STEP_NUMBER.keys, 14);
});

test('shouldApplyLiveAnswerDiscard guards stale generation discards while staying backward-compatible', () => {
  assert.equal(shouldApplyLiveAnswerDiscard(null, undefined), true);
  assert.equal(shouldApplyLiveAnswerDiscard(5, undefined), true);
  assert.equal(shouldApplyLiveAnswerDiscard(null, 5), true);
  assert.equal(shouldApplyLiveAnswerDiscard(5, 5), true);
  assert.equal(shouldApplyLiveAnswerDiscard(5, 6), true);
  assert.equal(shouldApplyLiveAnswerDiscard(5, 4), false);
});

test('AnswerLengthRow lives in OverlaySettings on both meeting surfaces and not in SettingsOverlay', () => {
  const overlaySettings = read('src/components/settings/OverlaySettings.tsx');
  const settingsOverlay = read('src/components/SettingsOverlay.tsx');
  assert.match(overlaySettings, /const AnswerLengthRow: React\.FC = \(\) =>/);
  assert.match(overlaySettings, /role="radiogroup"/);
  assert.match(overlaySettings, /aria-label=\{t\('Answer length'\)\}/);
  assert.match(overlaySettings, /<AlignLeft size=\{20\} \/>/);
  assert.match(overlaySettings, /descriptionKey=\{note \? 'note' : value\}/);
  assert.equal((overlaySettings.match(/<AnswerLengthRow \/>/g) || []).length, 2);
  assert.doesNotMatch(settingsOverlay, /answerLengthError|setAnswerLengthError|Answer length/);
});

test('SettingsOverlay, SettingsRow, PhoneMirror, HelpGraphics and index.css match 3.2.0 theme and language tokens', () => {
  const settingsOverlay = read('src/components/SettingsOverlay.tsx');
  const indexCss = read('src/index.css');
  const settingsRow = read('src/components/settings/SettingsRow.tsx');
  const phoneMirror = read('src/components/settings/PhoneMirrorSettings.tsx');
  const helpGraphics = read('src/components/settings/help/HelpGraphics.tsx');
  const helpSettings = read('src/components/settings/HelpSettings.tsx');

  assert.match(settingsOverlay, /sttProviderRejectsLanguage\(sttProvider, recognitionLanguage\)/);
  assert.match(settingsOverlay, /\{isOpen && <SettingsGuide \/>\}/);
  assert.doesNotMatch(settingsOverlay, /isLavender \? 'bg-bg-item-surface' : 'bg-bg-card'/);
  assert.match(settingsRow, /bg-bg-settings-tile/);
  assert.match(phoneMirror, /bg-bg-settings-tile/);
  assert.match(helpGraphics, /bg-bg-settings-tile/);
  assert.match(helpSettings, /icon=\{<NativelyGlyph \/>\}\s*title=\{t\('Show the guide again'\)\}/);
  assert.match(indexCss, /\[data-settings-theme="periwinkle"\][\s\S]*?--bg-card:\s*#27272A;/);
  assert.match(indexCss, /\[data-theme='light'\] \[data-settings-theme="periwinkle"\][\s\S]*?--bg-card:\s*#FBFBFD;/);
});

test('NativelyInterface, TopPill, OverlayAuxWindows, NotesWindow, App and MeetingDetails match 3.2.0 guide and stream wiring', () => {
  const iface = read('src/components/NativelyInterface.tsx');
  const topPill = read('src/components/ui/TopPill.tsx');
  const aux = read('src/components/OverlayAuxWindows.tsx');
  const notes = read('src/components/NotesWindow.tsx');
  const app = read('src/App.tsx');
  const meeting = read('src/components/MeetingDetails.tsx');

  assert.doesNotMatch(iface, /releasePhoneOverlayAnswer/);
  assert.match(iface, /shouldApplyLiveAnswerDiscard\(liveAnswerGenIdRef\.current, data\?\.generationId\)/);
  assert.equal((iface.match(/data-guide=\{id === 'what_to_answer' \? 'what-to-answer' : undefined\}/g) || []).length, 2);
  assert.match(topPill, /guide-stop-count/);
  assert.match(topPill, /data-guide="overlay-stop"/);
  assert.match(aux, /useGuideStopLock/);
  assert.match(aux, /useGuideLit\([\s\S]{0,100}'\[data-guide="overlay-stop"\]'/);
  assert.match(notes, /useGuideStopLock/);
  assert.match(notes, /notesGuide\.live === 'notepad' \? ' guide-write' : ''/);
  assert.match(notes, /const foldListening = askOpen && notesGuide\.live !== 'stop2'/);
  assert.match(app, /<LauncherGuide[^>]*onShowHome=\{openLauncherHome\}/);
  assert.match(app, /dispatchGuide\(\{ type: 'trial_out' \}\)/);
  assert.match(app, /!isolateOnboarding && showWelcome === false && \(isLauncherWindow \|\| isDefault\) && \(/);
  assert.match(meeting, /data-guide="meeting-tabs"/);
});

test('AIProvidersSettings, ProfileIntelligenceSettings and ModesSettings match 3.2.0 parity', () => {
  const ai = read('src/components/settings/AIProvidersSettings.tsx');
  const profile = read('src/components/ProfileIntelligenceSettings.tsx');
  const modes = read('premium/src/ModesSettings.tsx');

  assert.doesNotMatch(ai, /const refreshed = await window\.electronAPI\?\.codexOAuthStatus\?\.\(\)/);
  assert.doesNotMatch(profile, /companyResearchError/);
  assert.match(modes, /mm-dot-selector-styles/);
  assert.match(modes, /data-testid="dot-selector"/);
  assert.match(modes, /data-sample-row/);
  assert.match(modes, /data-switch=/);
  assert.match(modes, /failed_to_build_contract/);
  assert.match(modes, /<LiquidGlassButton/);
  assert.match(modes, /state="listening"/);
  assert.doesNotMatch(modes, /onModeChanged\?:/);
});
