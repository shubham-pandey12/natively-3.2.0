// Launcher show gate + Ctrl+B decision (2026-11-21).
//
// The win32 launcher is a transparent frameless window: shown before its page
// paints, it is an invisible window that Ctrl+B and relaunch then act on. The
// gate holds early shows until the first paint; the toggle decides from what is
// on screen. Pure module — runs under ELECTRON_RUN_AS_NODE.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const gate = require(path.resolve(__dirname, '../../../dist-electron/electron/utils/launcherShowGate.js'));
const { LauncherShowGate, decideToggle } = gate;
const read = (rel) => fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');

test('a show before the first paint is held and handed to the paint', () => {
  const g = new LauncherShowGate();
  assert.equal(g.requestShow(true), false);
  assert.equal(g.hasPendingShow(), true);
  assert.deepEqual(g.markPainted(), { inactive: true, targetDisplayId: null });
  assert.equal(g.hasPendingShow(), false);
  assert.equal(g.requestShow(true), true, 'after the paint, shows go straight through');
});

test('a focused request wins over an inactive one while held', () => {
  const g = new LauncherShowGate();
  g.requestShow(true);
  g.requestShow(false);
  g.requestShow(true);
  assert.deepEqual(g.markPainted(), { inactive: false, targetDisplayId: null });
});

test('no held show: paint returns null; markPainted is idempotent; reset re-arms', () => {
  const g = new LauncherShowGate();
  assert.equal(g.markPainted(), null);
  assert.equal(g.markPainted(), null);
  assert.equal(g.isPainted(), true);
  g.reset();
  assert.equal(g.isPainted(), false);
  assert.equal(g.requestShow(false), false);
  g.cancelPendingShow();
  assert.equal(g.markPainted(), null);
});

test('Ctrl+B before the paint always ends in a show, never a hide', () => {
  assert.equal(decideToggle({ painted: false, visible: true, minimized: false, effectiveOpacity: 1 }), 'hold-show');
  assert.equal(decideToggle({ painted: false, visible: false, minimized: false, effectiveOpacity: 0 }), 'hold-show');
});

test('Ctrl+B decides from what is on screen', () => {
  const on = { painted: true, visible: true, minimized: false, effectiveOpacity: 1 };
  assert.equal(decideToggle(on), 'hide');
  assert.equal(decideToggle({ ...on, visible: false }), 'show');
  assert.equal(decideToggle({ ...on, minimized: true }), 'show', 'minimized: one press restores it');
  assert.equal(decideToggle({ ...on, effectiveOpacity: 0 }), 'show', 'left at opacity 0 (#529): one press repairs it');
});

test('WindowHelper: every launcher show goes through the gate; first paint shows it', () => {
  const src = read('WindowHelper.ts');
  assert.match(src, /!this\.launcherShowGate\.requestShow\(requestedInactive\)/);
  assert.match(src, /this\.launcherWindow\.once\('ready-to-show', \(\) => \{[\s\S]*?this\.markLauncherFirstPaint\('ready-to-show'\);/);
  assert.match(src, /this\.launcherShowGate\.reset\(\);[\s\S]*?loadLauncher\(\);\s*this\.armLauncherRecovery\(this\.launcherWindow\);/);
  // The only direct launcher show()/showInactive() calls are inside switchToLauncher.
  const start = src.indexOf('public switchToLauncher(');
  const end = src.indexOf('public showOwedLauncher(');
  const outside = src.slice(0, start) + src.slice(end);
  assert.doesNotMatch(outside, /this\.launcherWindow\??\.(show|showInactive)\(/);
});

test('WindowHelper: toggle uses decideToggle; already-visible check ignores minimized/transparent', () => {
  const src = read('WindowHelper.ts');
  const t = src.slice(src.indexOf('public toggleMainWindow('), src.indexOf('private refreshLauncherMinimum('));
  assert.match(t, /decideToggle\(/);
  assert.match(t, /this\.launcherShowGate\.requestShow\(true, \{\s*targetDisplayId: onCurrentDisplay \? \(this\.shortcutTargetDisplay\(\)\?\.id \?\? null\) : null,/);
  assert.match(src, /!this\.launcherWindow\.isMinimized\(\) &&\s*\(this\.launcherWindow\.getOpacity\(\) > 0 \|\| this\.opacityTimeout !== null\)/);
});

test('WindowHelper: never-painting or hung launcher is recovered, bounded', () => {
  const src = read('WindowHelper.ts');
  const r = src.slice(src.indexOf('private armLauncherRecovery('), src.indexOf('private clearLauncherRecoveryTimers('));
  assert.match(r, /reloadIgnoringCache\(\)/);
  assert.match(r, /LAUNCHER_MAX_PAINT_RELOADS/);
  assert.match(r, /setBackgroundColor\(LAUNCHER_FALLBACK_BACKGROUND\)/);
  assert.match(r, /forcefullyCrashRenderer\(\);/);
  assert.match(r, /LAUNCHER_MAX_HANG_RESTARTS/);
  assert.match(src, /this\.launcherWindow = null;\s*this\.clearLauncherRecoveryTimers\(\);/);
});

test('main: helper windows are preloaded after the launcher paints, not at startup', () => {
  const main = read('main.ts');
  assert.match(main, /onLauncherFirstPaint\(\(\) => \{\s*setTimeout\(\(\) => this\.cropperWindowHelper\.preload\(\), STARTUP_DEFERRED_WINDOW_DELAY_MS\);/);
  assert.match(main, /onLauncherFirstPaint\(\(\) => \{\s*setTimeout\(\(\) => \{\s*appState\.settingsWindowHelper\.preloadWindow\(\)\s*appState\.modelSelectorWindowHelper\.preloadWindow\(\)/);
  assert.doesNotMatch(main, /^\s*appState\.settingsWindowHelper\.preloadWindow\(\)\n\s*appState\.modelSelectorWindowHelper\.preloadWindow\(\)\n\n/m);
});


// ---- Review 2026-11-21 (Codex) ----

test('a Ctrl+B held before paint keeps the display it was pressed on', () => {
  const g = new LauncherShowGate();
  g.requestShow(true, { targetDisplayId: 7 });
  g.requestShow(false); // a later plain show does not drop it
  assert.deepEqual(g.markPainted(), { inactive: false, targetDisplayId: 7 });
  const g2 = new LauncherShowGate();
  g2.requestShow(true, { targetDisplayId: 7 });
  g2.requestShow(true, { targetDisplayId: 9 }); // the latest press wins
  assert.equal(g2.markPainted().targetDisplayId, 9);
});

test('first paint does not override a newer mode decision', () => {
  assert.equal(gate.shouldShowAtFirstPaint({ mode: 'launcher', launcherShowOwed: false }), true);
  assert.equal(gate.shouldShowAtFirstPaint({ mode: 'overlay', launcherShowOwed: false }), false, 'a meeting moved to the overlay first');
  assert.equal(gate.shouldShowAtFirstPaint({ mode: 'launcher', launcherShowOwed: true }), false, 'a notepad meeting owes the launcher');
});

test('WindowHelper: first paint applies the held display target and respects the mode', () => {
  const src = read('WindowHelper.ts');
  const m = src.slice(src.indexOf('private markLauncherFirstPaint('), src.indexOf('private armLauncherRecovery('));
  assert.match(m, /shouldShowAtFirstPaint\(\{ mode: this\.currentWindowMode, launcherShowOwed: this\.launcherShowOwed \}\)/);
  assert.match(m, /if \(held && held\.targetDisplayId !== null\) this\.prepareShortcutRestore\(held\.targetDisplayId\);\s*[\s\S]*?this\.switchToLauncher\(/);
  // Resolved when pressed; a display that went away falls back to the current target.
  const prep = src.slice(src.indexOf('public prepareShortcutRestore('));
  assert.match(prep.slice(0, 600), /const pinned = targetDisplayId != null \? screen\.getAllDisplays\(\)\.find\(\(d\) => d\.id === targetDisplayId\) : undefined;\s*const display = pinned \?\? shortcutRestoreDisplay\(/);
});

test('WindowHelper: a hang restart is reloaded by one owner only', () => {
  const src = read('WindowHelper.ts');
  const r = src.slice(src.indexOf('private armLauncherRecovery('), src.indexOf('private clearLauncherRecoveryTimers('));
  assert.doesNotMatch(r, /forcefullyCrashRenderer\(\);\s*win\.webContents\.reload\(\);/);
  assert.match(r, /once\('render-process-gone'[\s\S]*?if \(!appReloads && !win\.isDestroyed\(\)\)[\s\S]*?forcefullyCrashRenderer\(\);/);
  assert.match(r, /webContents\.on\('render-process-gone', \(\) => \{\s*if \(this\.launcherHangTimer\)/);
});

test('IPC launcher navigation waits until the page listens; showing waits for the paint', () => {
  const ipc = read('ipcHandlers.ts');
  for (const [handler, channel] of [["'settings:open-tab'", 'settings:open-tab'], ["'notes-window:open-meeting'", 'launcher:open-meeting']]) {
    const i = ipc.indexOf(`safeHandle(${handler}`);
    const body = ipc.slice(i, i + 1500);
    const at = body.indexOf(`sendToLauncherWhenListening('${channel}'`);
    assert.ok(at > 0, `${handler} queues ${channel} until the launcher listens`);
    assert.ok(body.indexOf('launcherWin.show()') > at, `${handler} shows only in the after-callback`);
    assert.equal(body.indexOf('webContents.send('), -1, `${handler} never sends directly`);
  }
  const wh = read('WindowHelper.ts');
  assert.match(wh, /ipcMain\.on\('launcher:listening'[\s\S]*?event\.sender\.id !== launcher\.webContents\.id/);
  assert.match(wh, /private deliverToLauncher\([\s\S]*?webContents\.send\(channel, \.\.\.args\);[\s\S]*?if \(after\) this\.onLauncherFirstPaint\(after\);/);
  assert.match(wh, /if \(mainFrame && !sameDocument\) this\.launcherListening\.clear\(\);/);
  const pre = read('preload.ts');
  assert.match(pre, /ipcRenderer\.on\('settings:open-tab', subscription\);[\s\S]{0,200}ipcRenderer\.send\('launcher:listening', 'settings:open-tab'\)/);
  assert.match(pre, /ipcRenderer\.on\('launcher:open-meeting', subscription\);[\s\S]{0,200}ipcRenderer\.send\('launcher:listening', 'launcher:open-meeting'\)/);
});

test('screenshot: an invalidated attempt is never returned; two in a row fall back to hiding', () => {
  const main = read('main.ts');
  const c = main.slice(main.indexOf('private async captureExcludingWindows'), main.indexOf('private async runExclusionCapture'));
  assert.match(c, /for \(let attempt = 1; attempt <= 2; attempt\+\+\) \{[\s\S]*?if \(!windowsChanged\) return \{ ok: true, result \};[\s\S]*?deleteScreenshot\(result\)[\s\S]*?\}\s*return \{ ok: false \};/);
  assert.doesNotMatch(c, /attempt >= 2\) return result/);
  const w = main.slice(main.indexOf('private async withScreenshotCaptureSession'));
  assert.match(w.slice(0, 1200), /const outcome = await this\.runExclusionCapture\(session, capture\);\s*if \(outcome\.ok\) return outcome\.result;/);
});

test('cropper: a late-painting cold cropper is shown only for a selection still waiting', () => {
  const src = read('CropperWindowHelper.ts');
  assert.match(src, /if \(showImmediately && this\.isWaitingForSelection\) \{\s*this\.applyOpacityShield\(\);/);
});

test('Ctrl+B no-focus show raises the launcher in front on Windows only', () => {
  const src = read('WindowHelper.ts');
  const m = src.slice(src.indexOf('private showLauncherInactive('), src.indexOf('public switchToLauncher('));
  assert.match(m, /win\.showInactive\(\);\s*if \(process\.platform === 'win32'\) \{\s*try \{\s*win\.moveTop\(\);/);
  const sw = src.slice(src.indexOf('public switchToLauncher('), src.indexOf('public showOwedLauncher('));
  assert.equal((sw.match(/if \(inactive\) this\.showLauncherInactive\(\);/g) || []).length, 2, 'both show branches use it');
  assert.doesNotMatch(sw, /this\.launcherWindow\.showInactive\(\)/);
});
