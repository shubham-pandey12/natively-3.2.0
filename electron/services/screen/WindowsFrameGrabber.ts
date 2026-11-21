// Windows screenshot capture that does not freeze the main process.
//
// Why: on Windows, desktopCapturer.getSources() does its screen enumeration
// and thumbnail grab synchronously on Electron's main thread. Measured on a
// 1-display Windows 11 machine (Electron in this repo): ~800 ms per call,
// ~2 s on the first, with the main event loop blocked for all of it — every
// window freezes and IPC queues up. Even a 0×0-thumbnail call blocks ~800 ms,
// so the enumeration itself is the cost, not the thumbnail.
//
// What this does instead:
//   1. Enumerate screens ONCE (0×0 thumbnails) and cache display.id → source
//      id. The cache is dropped when displays are added or removed.
//   2. Grab the frame in a hidden, sandboxed window with getUserMedia
//      ({chromeMediaSource: 'desktop'}), crop and PNG-encode it there.
//      That work runs in the renderer/GPU processes; the main loop stays free
//      (measured ≤15 ms of main-loop block per grab).
//
// macOS is NOT routed here: its capture path (desktopCapturer + TCC checks)
// is unchanged. Callers must fall back to desktopCapturer if this throws.

import path from 'node:path';
import type { BrowserWindow as BrowserWindowType } from 'electron';

const PARTITION = 'natively-frame-grab';
const GRAB_TIMEOUT_MS = 5_000;
// The capture stream stays open this long after the last grab, so the next
// screenshot reads an already-flowing frame (~40 ms) instead of starting
// capture (~400 ms). Measured cost while open: ~2% GPU, ~0% CPU.
// After windows were just excluded from capture (WDA_EXCLUDEFROMCAPTURE), the
// stream keeps delivering frames that still show them for a while. Measured on
// Windows 11 (~25 fps stream): the exclusion first appears 2–3 frames /
// 85–130 ms after the toggle. Use a frame that is BOTH ≥4 frames newer and
// ≥180 ms after the request; give up waiting at 500 ms.
export const EXCLUSION_SETTLE_FRAMES = 4;
export const EXCLUSION_SETTLE_MS = 180;
export const EXCLUSION_MAX_WAIT_MS = 500;

const SINGLE_DISPLAY_SOURCE_ID = 'screen:0:0';
const IDLE_CLOSE_MS = 10 * 60_000;

/** Only Windows uses the renderer grab; every other platform keeps desktopCapturer. */
export function shouldUseRendererFrameGrab(platform: NodeJS.Platform): boolean {
  switch (platform) {
    case 'win32':
      return true;
    case 'darwin':
      return false;
    default:
      return false;
  }
}

export interface ScreenSourceInfo {
  id: string;
  display_id?: string;
}

/** Map display ids to desktop source ids. Sources without a display_id are skipped. */
export function buildSourceMap(sources: ScreenSourceInfo[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of sources) {
    if (s.display_id && s.id.startsWith('screen:')) map.set(String(s.display_id), s.id);
  }
  return map;
}

export interface FrameHandle {
  width: number;
  height: number;
  /** PNG of the given crop (or the whole frame when crop is omitted). */
  encode(crop?: { x: number; y: number; width: number; height: number }): Promise<Buffer>;
}

export interface FrameGrabberDeps {
  enumerate(): Promise<ScreenSourceInfo[]>;
  /** Number of connected displays (optional; enables the single-display shortcut). */
  displayCount?(): number;
  runInPage(js: string): Promise<unknown>;
  closePage(): void;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export class WindowsFrameGrabber {
  private sourceMap: Map<string, string> | null = null;
  private enumerating: Promise<Map<string, string>> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  // Resolves when the in-flight grab is encoded, released or failed. A second
  // grab waits for it instead of failing (and falling back to the blocking
  // desktopCapturer path), e.g. a screenshot during the launch prewarm.
  private idle: Promise<void> = Promise.resolve();
  private markIdle: (() => void) | null = null;
  private singleDisplayGuessFailed = false;

  constructor(private readonly deps: FrameGrabberDeps) {}

  /** Drop the cached display → source map (displays changed). */
  invalidateSources(): void {
    this.sourceMap = null;
  }

  /** Displays were added/removed: drop the cache and allow the single-display shortcut again. */
  onDisplaysChanged(): void {
    this.sourceMap = null;
    this.singleDisplayGuessFailed = false;
  }

  /** Fill the source cache ahead of the first screenshot. Safe to call repeatedly. */
  async prewarm(displayId?: string | number, maxSize?: { width: number; height: number }): Promise<void> {
    if (this.deps.displayCount?.() !== 1) await this.getSourceMap();
    if (displayId === undefined || !maxSize || this.busy) return;
    // Opening the stream goes through the same queue as screenshots.
    // Open the stream now so the first screenshot is a warm read.
    await this.grab(displayId, maxSize);
    this.release();
  }

  private getSourceMap(force = false): Promise<Map<string, string>> {
    if (!force && this.sourceMap) return Promise.resolve(this.sourceMap);
    if (this.enumerating) return this.enumerating;
    this.enumerating = this.deps.enumerate()
      .then((sources) => {
        this.sourceMap = buildSourceMap(sources);
        return this.sourceMap;
      })
      .finally(() => { this.enumerating = null; });
    return this.enumerating;
  }

  async resolveSourceId(displayId: string | number): Promise<string> {
    const key = String(displayId);
    // One display → one screen source, always 'screen:0:0'. Skips the
    // enumeration (the ~0.8–2 s main-thread block) entirely. If the guess is
    // ever wrong the grab fails, the cache is invalidated, the caller falls
    // back, and later grabs enumerate for real.
    if (!this.sourceMap && !this.singleDisplayGuessFailed && this.deps.displayCount?.() === 1) {
      return SINGLE_DISPLAY_SOURCE_ID;
    }
    let id = (await this.getSourceMap()).get(key);
    if (!id) id = (await this.getSourceMap(true)).get(key);
    if (!id) throw new Error(`no desktop source for display ${key}`);
    return id;
  }

  /**
   * Grab one frame of the display, scaled to fit maxSize (the old thumbnail
   * size, so the output dimensions match the desktopCapturer path).
   */
  async grab(
    displayId: string | number,
    maxSize: { width: number; height: number },
    opts: { waitNewFrames?: number } = {},
  ): Promise<FrameHandle> {
    while (this.busy) await this.idle;
    this.busy = true;
    this.idle = new Promise<void>((resolve) => { this.markIdle = resolve; });
    this.cancelIdleClose();
    try {
      const sourceId = await this.resolveSourceId(displayId);
      const w = Math.max(1, Math.round(maxSize.width));
      const h = Math.max(1, Math.round(maxSize.height));
      const size = await withTimeout(this.deps.runInPage(grabScript(sourceId, w, h, Math.max(0, Math.floor(opts.waitNewFrames ?? 0)))), GRAB_TIMEOUT_MS, 'frame grab') as { width?: unknown; height?: unknown };
      const width = Number(size?.width);
      const height = Number(size?.height);
      if (!(width > 0 && height > 0)) throw new Error('frame grab returned an empty frame');
      return {
        width,
        height,
        encode: async (crop) => {
          try {
            const c = crop ?? { x: 0, y: 0, width, height };
            const b64 = await withTimeout(this.deps.runInPage(encodeScript(c)), GRAB_TIMEOUT_MS, 'frame encode');
            if (typeof b64 !== 'string' || b64.length === 0) throw new Error('frame encode returned no data');
            return Buffer.from(b64, 'base64');
          } catch (encodeErr) {
            // A timed-out or failed encode may leave the page mid-work: reset it.
            this.deps.closePage();
            throw encodeErr;
          } finally {
            this.finishOp();
          }
        },
      };
    } catch (err) {
      // A timed-out grab may still be running in the page: drop the page so
      // the next grab starts clean instead of racing it.
      this.deps.closePage();
      this.finishOp();
      // A failed grab may mean a stale source id (monitor change we missed),
      // or a wrong single-display guess: stop guessing, enumerate next time.
      if (!this.sourceMap) this.singleDisplayGuessFailed = true;
      this.invalidateSources();
      throw err;
    }
  }

  /** Release a frame without encoding (e.g. the crop turned out empty). */
  release(): void {
    if (!this.busy) return;
    this.deps.runInPage('window.__nativelyFrame = null; true').catch(() => {});
    this.finishOp();
  }

  private finishOp(): void {
    this.busy = false;
    const done = this.markIdle;
    this.markIdle = null;
    done?.();
    this.scheduleIdleClose();
  }

  dispose(): void {
    this.cancelIdleClose();
    this.deps.closePage();
  }

  private cancelIdleClose(): void {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
  }

  private scheduleIdleClose(): void {
    this.cancelIdleClose();
    this.idleTimer = setTimeout(() => { this.idleTimer = null; if (!this.busy) this.deps.closePage(); }, IDLE_CLOSE_MS);
    (this.idleTimer as { unref?: () => void }).unref?.();
  }
}

/**
 * Page side: keep one desktop stream open (reopened when the source or size
 * changes or the track ended), pump frames into window.__ng.latest, and
 * snapshot the newest one. waitFrames > 0 waits for that many frames newer
 * than the call AND EXCLUSION_SETTLE_MS (≤ EXCLUSION_MAX_WAIT_MS) — used after windows were just excluded from capture,
 * so the snapshot cannot predate the exclusion.
 */
export function grabScript(sourceId: string, maxW: number, maxH: number, waitFrames = 0): string {
  return `(async () => {
    window.__nativelyFrame = null;
    const want = { id: ${JSON.stringify(sourceId)}, w: ${maxW}, h: ${maxH} };
    let ng = window.__ng;
    if (ng && (ng.id !== want.id || ng.w !== want.w || ng.h !== want.h || ng.track.readyState !== 'live' || ng.dead)) {
      try { ng.track.stop(); } catch {}
      if (ng.latest) { try { ng.latest.close(); } catch {} }
      ng = window.__ng = null;
    }
    if (!ng) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: {
        chromeMediaSource: 'desktop', chromeMediaSourceId: want.id,
        maxWidth: want.w, maxHeight: want.h, maxFrameRate: 30 } } });
      const track = stream.getVideoTracks()[0];
      ng = window.__ng = { ...want, track, latest: null, count: 0, dead: false };
      const reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
      const self = ng;
      (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (self.latest) self.latest.close();
            self.latest = value; self.count++;
          }
        } catch {}
        self.dead = true;
      })();
    }
    const waitFor = (target, minMs, maxMs) => new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        const dt = performance.now() - t0;
        (ng.dead || dt > maxMs || (ng.count >= target && dt >= minMs)) ? resolve() : setTimeout(tick, 4);
      };
      tick();
    });
    if (!ng.latest) await waitFor(1, 0, 3000);
    if (${waitFrames} > 0) await waitFor(ng.count + ${waitFrames}, ${EXCLUSION_SETTLE_MS}, ${EXCLUSION_MAX_WAIT_MS});
    const frame = ng.latest;
    if (!frame) throw new Error('no video frame');
    const c = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
    c.getContext('2d').drawImage(frame, 0, 0);
    window.__nativelyFrame = c;
    return { width: c.width, height: c.height };
  })()`;
}

export function encodeScript(crop: { x: number; y: number; width: number; height: number }): string {
  const { x, y, width, height } = crop;
  return `(async () => {
    const src = window.__nativelyFrame; window.__nativelyFrame = null;
    if (!src) throw new Error('no frame');
    let out = src;
    if (${x} !== 0 || ${y} !== 0 || ${width} !== src.width || ${height} !== src.height) {
      out = new OffscreenCanvas(${width}, ${height});
      out.getContext('2d').drawImage(src, ${x}, ${y}, ${width}, ${height}, 0, 0, ${width}, ${height});
    }
    const bytes = new Uint8Array(await (await out.convertToBlob({ type: 'image/png' })).arrayBuffer());
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  })()`;
}

function pageDir(): string {
  const fs = require('node:fs') as typeof import('node:fs');
  const { app } = require('electron') as typeof import('electron');
  const candidates = [
    path.join(app.getAppPath(), 'dist-electron', 'electron', 'services', 'screen'),
    path.join(__dirname, 'services', 'screen'),
    path.join(__dirname, 'screen'),
    __dirname,
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'frameGrab.html'))) ?? candidates[0];
}

/** Real Electron wiring: hidden sandboxed window in its own partition. */
export function createElectronFrameGrabber(): WindowsFrameGrabber {
  const { BrowserWindow, session, desktopCapturer, screen } = require('electron') as typeof import('electron');
  let win: BrowserWindowType | null = null;
  let ready: Promise<BrowserWindowType> | null = null;
  let sessionConfigured = false;

  const ours = (wc: Electron.WebContents | null) => !!wc && !!win && !win.isDestroyed() && wc.id === win.webContents.id;

  const ensurePage = (): Promise<BrowserWindowType> => {
    if (win && !win.isDestroyed() && ready) return ready;
    if (!sessionConfigured) {
      sessionConfigured = true;
      const ses = session.fromPartition(PARTITION);
      ses.setPermissionRequestHandler((wc, permission, cb) => cb(ours(wc) && permission === 'media'));
      ses.setPermissionCheckHandler((wc, permission) => ours(wc) && permission === 'media');
    }
    const w = new BrowserWindow({
      show: false,
      width: 100,
      height: 100,
      skipTaskbar: true,
      focusable: false,
      title: 'Natively capture',
      webPreferences: {
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    win = w;
    w.on('closed', () => { if (win === w) { win = null; ready = null; } });
    w.webContents.on('render-process-gone', () => { if (win === w) { win = null; ready = null; try { w.destroy(); } catch { /* gone */ } } });
    ready = w.loadFile(path.join(pageDir(), 'frameGrab.html')).then(() => w);
    ready.catch(() => { if (win === w) { win = null; ready = null; try { w.destroy(); } catch { /* gone */ } } });
    return ready;
  };

  const grabber = new WindowsFrameGrabber({
    enumerate: async () => {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      return sources.map((s) => ({ id: s.id, display_id: s.display_id }));
    },
    displayCount: () => screen.getAllDisplays().length,
    runInPage: async (js) => (await ensurePage()).webContents.executeJavaScript(js, true),
    closePage: () => {
      const w = win;
      win = null;
      ready = null;
      if (w && !w.isDestroyed()) w.destroy();
    },
  });

  // The app quits on win32 from window-all-closed. This hidden window counts
  // as open, so drop it as soon as it is the only window left; otherwise the
  // app would linger for up to IDLE_CLOSE_MS after the user closed everything.
  const { app } = require('electron') as typeof import('electron');
  const watched = new WeakSet<BrowserWindowType>();
  const closeIfAlone = () => {
    const others = BrowserWindow.getAllWindows().filter((w) => w !== win && !w.isDestroyed());
    if (others.length === 0) grabber.dispose();
  };
  const watch = (w: BrowserWindowType) => {
    if (watched.has(w)) return;
    watched.add(w);
    w.once('closed', () => setImmediate(closeIfAlone));
  };
  for (const w of BrowserWindow.getAllWindows()) watch(w);
  app.on('browser-window-created', (_e, w) => watch(w));

  const invalidate = () => grabber.onDisplaysChanged();
  screen.on('display-added', invalidate);
  screen.on('display-removed', invalidate);
  // Not display-metrics-changed: source ids survive scale/work-area changes,
  // and it fires often enough that re-enumerating (~800 ms block) would hurt.
  // A grab that fails on a stale id invalidates the cache itself.
  return grabber;
}
