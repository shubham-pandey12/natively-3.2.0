// WindowsFrameGrabber: Windows screenshots grab the frame in a hidden renderer
// so desktopCapturer.getSources() (~0.8–2 s main-thread block on Windows) runs
// once, not per screenshot. These tests drive the compiled module with
// injected deps — no Electron window is created.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const mod = require(path.resolve(__dirname, '../../../dist-electron/electron/services/screen/WindowsFrameGrabber.js'));
const { WindowsFrameGrabber, shouldUseRendererFrameGrab, buildSourceMap } = mod;

function fakeDeps({ sources = [{ id: 'screen:0:0', display_id: '11' }], frame = { width: 1536, height: 864 }, failGrab = false } = {}) {
  const calls = { enumerate: 0, scripts: [], closed: 0 };
  let current = sources;
  return {
    calls,
    setSources(s) { current = s; },
    deps: {
      enumerate: async () => { calls.enumerate++; return current; },
      runInPage: async (js) => {
        calls.scripts.push(js);
        if (js.includes('getUserMedia')) { if (failGrab) throw new Error('NotReadableError'); return frame; }
        if (js.includes('convertToBlob')) return Buffer.from('PNGDATA').toString('base64');
        return true;
      },
      closePage: () => { calls.closed++; },
    },
  };
}

test('only win32 takes the renderer grab; darwin keeps desktopCapturer', () => {
  assert.equal(shouldUseRendererFrameGrab('win32'), true);
  assert.equal(shouldUseRendererFrameGrab('darwin'), false);
  assert.equal(shouldUseRendererFrameGrab('linux'), false);
});

test('buildSourceMap keys screen sources by display_id', () => {
  const m = buildSourceMap([{ id: 'screen:0:0', display_id: '11' }, { id: 'screen:1:0', display_id: '22' }, { id: 'window:5:0', display_id: '33' }, { id: 'screen:2:0' }]);
  assert.deepEqual([...m.entries()], [['11', 'screen:0:0'], ['22', 'screen:1:0']]);
});

test('screens are enumerated once across several grabs', async () => {
  const f = fakeDeps();
  const g = new WindowsFrameGrabber(f.deps);
  for (let i = 0; i < 3; i++) {
    const frame = await g.grab(11, { width: 1536, height: 864 });
    assert.equal(frame.width, 1536);
    assert.equal((await frame.encode()).toString(), 'PNGDATA');
  }
  assert.equal(f.calls.enumerate, 1);
  assert.match(f.calls.scripts[0], /const want = \{ id: "screen:0:0", w: 1536, h: 864 \}/);
  g.dispose();
});

test('prewarm fills the cache so the first grab does not enumerate', async () => {
  const f = fakeDeps();
  const g = new WindowsFrameGrabber(f.deps);
  await g.prewarm();
  const frame = await g.grab(11, { width: 10, height: 10 });
  await frame.encode();
  assert.equal(f.calls.enumerate, 1);
  g.dispose();
});

test('an unknown display re-enumerates once, then throws so the caller falls back', async () => {
  const f = fakeDeps();
  const g = new WindowsFrameGrabber(f.deps);
  await g.prewarm();
  f.setSources([{ id: 'screen:0:0', display_id: '11' }, { id: 'screen:1:0', display_id: '22' }]);
  const frame = await g.grab(22, { width: 10, height: 10 });
  await frame.encode();
  assert.match(f.calls.scripts[0], /screen:1:0/);
  await assert.rejects(g.grab(99, { width: 10, height: 10 }), /no desktop source for display 99/);
  g.dispose();
});

test('a failed grab invalidates the cache and frees the grabber', async () => {
  const f = fakeDeps({ failGrab: true });
  const g = new WindowsFrameGrabber(f.deps);
  await assert.rejects(g.grab(11, { width: 10, height: 10 }), /NotReadableError/);
  await assert.rejects(g.grab(11, { width: 10, height: 10 }), /NotReadableError/); // not "already in progress"
  assert.equal(f.calls.enumerate, 2);
  g.dispose();
});

test('crop is passed to the page encode and release frees a frame', async () => {
  const f = fakeDeps();
  const g = new WindowsFrameGrabber(f.deps);
  const frame = await g.grab(11, { width: 100, height: 100 });
  await frame.encode({ x: 5, y: 6, width: 7, height: 8 });
  assert.match(f.calls.scripts.at(-1), /drawImage\(src, 5, 6, 7, 8, 0, 0, 7, 8\)/);
  await g.grab(11, { width: 100, height: 100 });
  g.release();
  await g.grab(11, { width: 100, height: 100 }).then((fr) => fr.encode());
  g.dispose();
  assert.ok(f.calls.closed >= 1);
});

test('the blank page ships with the build', () => {
  const build = fs.readFileSync(path.resolve(__dirname, '../../../scripts/build-electron.js'), 'utf8');
  assert.match(build, /electron\/services\/screen\/frameGrab\.html/);
});

test('ScreenshotHelper gates the grab on shouldUseRendererFrameGrab and keeps a desktopCapturer fallback', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../ScreenshotHelper.ts'), 'utf8');
  assert.match(src, /shouldUseRendererFrameGrab\(process\.platform\)/);
  assert.match(src, /falling back to desktopCapturer/);
  // Empty crop must still fail loudly on the grab path, never fall back.
  const start = src.indexOf('Windows: grab the frame in a hidden renderer');
  const grabBlock = src.slice(start, src.indexOf('let sources: Electron.DesktopCapturerSource[]', start));
  assert.ok(start > 0);
  assert.match(grabBlock, /Region capture failed/);
});

// ---- 2026-11-21 follow-up: warm stream + no-hide capture on Windows --------

const excl = require(path.resolve(__dirname, '../../../dist-electron/electron/services/screen/captureExclusion.js'));

test('no-hide capture: Windows 10 2004+ only; macOS and old Windows keep hiding', () => {
  assert.equal(excl.windowsBuildFromRelease('10.0.26100'), 26100);
  assert.equal(excl.windowsBuildFromRelease('garbage'), 0);
  assert.equal(excl.canExcludeFromCaptureWithoutHiding('win32', '10.0.19041'), true);
  assert.equal(excl.canExcludeFromCaptureWithoutHiding('win32', '10.0.26300'), true);
  assert.equal(excl.canExcludeFromCaptureWithoutHiding('win32', '10.0.18363'), false);
  assert.equal(excl.canExcludeFromCaptureWithoutHiding('darwin', '24.1.0'), false);
  assert.equal(excl.canExcludeFromCaptureWithoutHiding('linux', '6.8.0'), false);
});

test('waitNewFrames reaches the page script; default is a plain warm read', async () => {
  const f = fakeDeps();
  const g = new WindowsFrameGrabber(f.deps);
  await (await g.grab(11, { width: 10, height: 10 }, { waitNewFrames: 2 })).encode();
  assert.match(f.calls.scripts[0], /if \(2 > 0\) \{\s*[\s\S]*?const target = ng\.count \+ 2;[\s\S]*?await waitFor\(target, 180, 500\);/);
  assert.equal(mod.EXCLUSION_SETTLE_FRAMES, 4);
  await (await g.grab(11, { width: 10, height: 10 })).encode();
  assert.match(f.calls.scripts.at(-2), /if \(0 > 0\)/);
  g.dispose();
});

test('prewarm with a display opens the stream (one grab, released, no encode)', async () => {
  const f = fakeDeps();
  const g = new WindowsFrameGrabber(f.deps);
  await g.prewarm(11, { width: 10, height: 10 });
  assert.equal(f.calls.scripts.filter((s) => s.includes('getUserMedia')).length, 1);
  assert.equal(f.calls.scripts.filter((s) => s.includes('convertToBlob')).length, 0);
  await (await g.grab(11, { width: 10, height: 10 })).encode(); // not stuck busy
  g.dispose();
});

test('the page script reuses an open stream and reopens it when source/size change or it died', () => {
  const js = mod.grabScript('screen:0:0', 100, 50, 0);
  assert.match(js, /ng\.id !== want\.id \|\| ng\.w !== want\.w \|\| ng\.h !== want\.h \|\| ng\.track\.readyState !== 'live' \|\| ng\.dead/);
  assert.match(js, /if \(!ng\) \{/);
});

test('main: full capture on win32 excludes windows instead of hiding, and restores protection', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '../../main.ts'), 'utf8');
  assert.match(main, /captureKind === 'full' && canExcludeFromCaptureWithoutHiding\(process\.platform, os\.release\(\)\)\) \{\s*const outcome = await this\.runExclusionCapture\(session, capture\);/);
  const i = main.indexOf('private async captureExcludingWindows');
  assert.ok(i > 0);
  const block = main.slice(i, main.indexOf('private async withScreenshotCaptureSession', i));
  assert.match(block, /win\.setContentProtection\(true\)/);
  assert.match(block, /EXCLUSION_SETTLE_FRAMES/);
  assert.match(block, /win\.setContentProtection\(false\)/);
  // Review 2026-11-21: Undetectable cannot clear protection mid-capture, and a
  // window shown mid-capture is excluded and triggers one retry.
  assert.match(block, /this\.captureExclusionActive = true;/);
  assert.match(block, /app\.on\('browser-window-created', onCreated\)/);
  assert.match(block, /win\.on\('show', fn\)/);
  assert.match(block, /if \(!windowsChanged\) return \{ ok: true, result \};/);
  assert.match(block, /return \{ ok: false \};/);
  assert.match(block, /if \(deferred !== undefined\) this\.setUndetectable\(deferred\);/);
  const su = main.slice(main.indexOf('public setUndetectable(state: boolean): void {'));
  assert.match(su.slice(0, 600), /^public setUndetectable\(state: boolean\): void \{\s*if \(this\.captureExclusionActive\) \{[\s\S]*?this\.deferredUndetectable = state;\s*return;/);
  assert.match(block, /finally/);
  assert.doesNotMatch(block, /hideMainWindow/);
});

test('single display: no enumeration at all; a failed guess falls back to enumerating', async () => {
  const f = fakeDeps({ sources: [{ id: 'screen:7:0', display_id: '11' }] });
  f.deps.displayCount = () => 1;
  let failNext = true;
  const run = f.deps.runInPage;
  f.deps.runInPage = async (js) => { if (failNext && js.includes('getUserMedia')) { failNext = false; throw new Error('bad id'); } return run(js); };
  const g = new WindowsFrameGrabber(f.deps);
  await g.prewarm();
  assert.equal(f.calls.enumerate, 0);
  await assert.rejects(g.grab(11, { width: 10, height: 10 }), /bad id/);
  assert.match(f.calls.scripts.length ? f.calls.scripts[0] : 'id: "screen:0:0"', /screen:0:0/);
  await (await g.grab(11, { width: 10, height: 10 })).encode();
  assert.equal(f.calls.enumerate, 1);
  assert.match(f.calls.scripts.find((s) => s.includes('getUserMedia')), /screen:7:0/);
  g.onDisplaysChanged(); // guess allowed again after a display change
  await (await g.grab(11, { width: 10, height: 10 })).encode();
  assert.equal(f.calls.enumerate, 1);
  g.dispose();
});

test('multi display: always maps through enumeration, never guesses', async () => {
  const f = fakeDeps({ sources: [{ id: 'screen:0:0', display_id: '11' }, { id: 'screen:1:0', display_id: '22' }] });
  f.deps.displayCount = () => 2;
  const g = new WindowsFrameGrabber(f.deps);
  await (await g.grab(22, { width: 10, height: 10 })).encode();
  assert.equal(f.calls.enumerate, 1);
  assert.match(f.calls.scripts[0], /screen:1:0/);
  g.dispose();
});


// ---- 2026-11-21 review fixes ----------------------------------------------

test('a second grab waits for the first instead of failing (no blocking fallback)', async () => {
  const f = fakeDeps();
  const g = new WindowsFrameGrabber(f.deps);
  const first = await g.grab(11, { width: 10, height: 10 });
  let secondDone = false;
  const second = g.grab(11, { width: 10, height: 10 }).then((fr) => { secondDone = true; return fr; });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(secondDone, false, 'second grab must wait while the first frame is held');
  await first.encode();
  const fr = await second;
  assert.equal(secondDone, true);
  await fr.encode();
  g.dispose();
});

test('a screenshot during the launch prewarm waits for it', async () => {
  const f = fakeDeps();
  const g = new WindowsFrameGrabber(f.deps);
  const warm = g.prewarm(11, { width: 10, height: 10 });
  const shot = g.grab(11, { width: 10, height: 10 }).then((fr) => fr.encode());
  await warm;
  assert.equal((await shot).toString(), 'PNGDATA');
  g.dispose();
});

test('a failed grab or encode resets the page so the next grab starts clean', async () => {
  const f = fakeDeps({ failGrab: true });
  const g = new WindowsFrameGrabber(f.deps);
  await assert.rejects(g.grab(11, { width: 10, height: 10 }));
  assert.equal(f.calls.closed, 1);
  const f2 = fakeDeps();
  const run = f2.deps.runInPage;
  f2.deps.runInPage = async (js) => { if (js.includes('convertToBlob')) throw new Error('encode boom'); return run(js); };
  const g2 = new WindowsFrameGrabber(f2.deps);
  const fr = await g2.grab(11, { width: 10, height: 10 });
  await assert.rejects(fr.encode(), /encode boom/);
  assert.equal(f2.calls.closed, 1);
  await g2.grab(11, { width: 10, height: 10 }); // not stuck busy
  g2.release();
  g.dispose(); g2.dispose();
});

test('release is a no-op when nothing is held', async () => {
  const f = fakeDeps();
  const g = new WindowsFrameGrabber(f.deps);
  g.release();
  assert.equal(f.calls.scripts.length, 0);
  g.dispose();
});

test('hide path waits for the hide to reach the warm stream; only an explicit 0 skips it', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../ScreenshotHelper.ts'), 'utf8');
  assert.match(src, /const waitNewFrames = opts\.waitNewFrames \?\? EXCLUSION_SETTLE_FRAMES;/);
  const main = fs.readFileSync(path.resolve(__dirname, '../../main.ts'), 'utf8');
  assert.match(main, /private screenshotExclusionWaitFrames: number \| undefined = undefined;/);
  assert.match(main, /finally \{[\s\S]{0,400}?this\.screenshotExclusionWaitFrames = undefined;/);
});

test('the hidden capture window never keeps the app from quitting', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../services/screen/WindowsFrameGrabber.ts'), 'utf8');
  assert.match(src, /browser-window-created/);
  assert.match(src, /if \(others\.length === 0\) grabber\.dispose\(\)/);
});


// ---- Review 2026-11-21 (Codex): behavioural checks of the page script ----

// Runs grabScript() in a fake page: a track that delivers `frames` frames at
// `everyMs`, then stalls (or ends, with endAfter).
async function runPage({ waitFrames, frames, everyMs = 40, endAfter = false }) {
  let delivered = 0;
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; } };
  class MediaStreamTrackProcessor {
    constructor() {
      this.readable = { getReader: () => ({
        read: () => new Promise((resolve) => {
          if (delivered >= frames) {
            if (endAfter) setTimeout(() => resolve({ done: true }), everyMs);
            return; // stalled: never resolves
          }
          setTimeout(() => { delivered++; resolve({ value: { displayWidth: 100, displayHeight: 50, n: delivered, close() {} }, done: false }); }, everyMs);
        }),
        cancel: async () => {},
      }) };
    }
  }
  const drawn = [];
  class OffscreenCanvas {
    constructor(w, h) { this.width = w; this.height = h; }
    getContext() { return { drawImage: (f) => drawn.push(f.n) }; }
  }
  const window = {};
  const ctx = {
    window, MediaStreamTrackProcessor, OffscreenCanvas, performance, setTimeout,
    navigator: { mediaDevices: { getUserMedia: async () => ({ getVideoTracks: () => [track] }) } },
  };
  const js = mod.grabScript('screen:0:0', 100, 50, waitFrames);
  const fn = new Function(...Object.keys(ctx), `return ${js};`);
  const t0 = Date.now();
  try {
    const size = await fn(...Object.values(ctx));
    return { ok: true, size, drawn, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e.message, drawn, ms: Date.now() - t0 };
  }
}

test('stalled stream after a window change: rejects instead of drawing the old frame', async () => {
  const r = await runPage({ waitFrames: 4, frames: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.error, mod.STALE_FRAME_ERROR);
  assert.deepEqual(r.drawn, [], 'the pre-change frame must never be drawn');
  assert.ok(r.ms >= 450, `waited for the deadline (${r.ms}ms)`);
});

test('track dies during the wait: rejects instead of drawing the old frame', async () => {
  const r = await runPage({ waitFrames: 4, frames: 2, endAfter: true });
  assert.equal(r.ok, false);
  assert.equal(r.error, mod.STALE_FRAME_ERROR);
  assert.deepEqual(r.drawn, []);
});

test('flowing stream: draws a frame at least 4 newer and >= 180 ms later', async () => {
  const r = await runPage({ waitFrames: 4, frames: 1000, everyMs: 20 });
  assert.equal(r.ok, true, r.error);
  assert.ok(r.drawn[0] >= 5, `frame ${r.drawn[0]} is >= 4 newer than the first`);
  assert.ok(r.ms >= 180);
});

test('no window change (waitFrames 0): warm read of the newest frame', async () => {
  const r = await runPage({ waitFrames: 0, frames: 1 });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.drawn, [1]);
});

test('a stale-frame timeout does not invalidate the source cache (no ~1 s re-enumeration)', async () => {
  const f = fakeDeps({ sources: [{ id: 'screen:0:0', display_id: '11' }] });
  const run = f.deps.runInPage;
  let staleOnce = true;
  f.deps.runInPage = async (js) => {
    if (staleOnce && js.includes('getUserMedia')) { staleOnce = false; throw new Error(mod.STALE_FRAME_ERROR); }
    return run(js);
  };
  const g = new WindowsFrameGrabber(f.deps);
  await g.prewarm();
  await assert.rejects(g.grab(11, { width: 10, height: 10 }, { waitNewFrames: 4 }), new RegExp(mod.STALE_FRAME_ERROR));
  await (await g.grab(11, { width: 10, height: 10 })).encode();
  assert.equal(f.calls.enumerate, 1, 'still the one enumeration from prewarm');
  g.dispose();
});
