// Launcher show gate: never put the launcher on screen before its page has
// painted.
//
// Why: on Windows the launcher is a frameless window created with
// `transparent: true` and a fully transparent background (#00000000), so its
// rounded CSS corners are not squared off by a native background. Until the
// renderer paints, that window has NOTHING to draw. Showing it early (a second
// launch while the first is still starting — common with start-at-login — a
// tray double-click, Cmd/Ctrl+B, a calendar "open") produced a window Electron
// reports as visible that the user cannot see. Measured 2026-11-21 on Windows
// 11: launcher shown at 1085 ms, ready-to-show at 1815 ms, screen capture in
// between shows nothing; afterwards "Launcher already visible; skipping
// duplicate show" and Ctrl+B "hid" the invisible window.
//
// The gate holds a show requested before the first paint and hands it to the
// first-paint handler, which performs it. macOS gets the same gate: an early
// show there is a black (not invisible) window, so holding it is harmless and
// keeps one code path.

export interface PendingLauncherShow {
  inactive: boolean;
  /**
   * Cmd/Ctrl+B asked for the launcher on a display: the one under the cursor
   * WHEN IT WAS PRESSED (resolved then, not at paint), or null for none.
   */
  targetDisplayId: number | null;
}

export class LauncherShowGate {
  private painted = false;
  private pending: PendingLauncherShow | null = null;

  isPainted(): boolean {
    return this.painted;
  }

  /**
   * A show was requested. Returns true when the caller may show now; false
   * when it is held for the first paint. A later request before the paint
   * replaces an earlier one, except that a focused (non-inactive) request
   * wins over an inactive one.
   */
  requestShow(inactive: boolean, opts: { targetDisplayId?: number | null } = {}): boolean {
    if (this.painted) return true;
    const target = opts.targetDisplayId ?? null;
    this.pending = {
      inactive: this.pending ? this.pending.inactive && inactive : inactive,
      // The latest press that named a display wins; a plain show keeps it.
      targetDisplayId: target !== null ? target : (this.pending?.targetDisplayId ?? null),
    };
    return false;
  }

  hasPendingShow(): boolean {
    return this.pending !== null;
  }

  /** Drop a held show (the launcher was explicitly hidden before it painted). */
  cancelPendingShow(): void {
    this.pending = null;
  }

  /** First paint: returns the held show, if any. Idempotent. */
  markPainted(): PendingLauncherShow | null {
    this.painted = true;
    const held = this.pending;
    this.pending = null;
    return held;
  }

  /** A new launcher window was created: back to unpainted. */
  reset(): void {
    this.painted = false;
    this.pending = null;
  }
}

/**
 * At first paint, should the launcher be shown? Cold start shows it, as before,
 * but only while launcher mode is still current: if a meeting moved the app to
 * the overlay, or a notepad meeting owes the launcher (hidden switch), a late
 * paint must not undo that newer decision.
 */
export function shouldShowAtFirstPaint(state: { mode: 'launcher' | 'overlay'; launcherShowOwed: boolean }): boolean {
  return state.mode === 'launcher' && !state.launcherShowOwed;
}

export type ToggleAction = 'hold-show' | 'hide' | 'show';

/**
 * What Cmd/Ctrl+B should do, decided from what is actually on screen rather
 * than an internal flag that can drift (a minimized window, a window shown
 * before it painted).
 *
 * Before the first paint the answer is always "show when painted": the user
 * pressing the shortcut during a slow start wants to see the app; hiding a
 * window that never appeared would leave them with nothing once it paints.
 */
export function decideToggle(state: {
  painted: boolean;
  visible: boolean;
  minimized: boolean;
  /** Opacity, or 1 while a pending opacity-shield restore will make it 1. */
  effectiveOpacity: number;
}): ToggleAction {
  if (!state.painted) return 'hold-show';
  const onScreen = state.visible && !state.minimized && state.effectiveOpacity > 0;
  return onScreen ? 'hide' : 'show';
}

/**
 * How long a launcher may go without its first paint before it is reloaded,
 * and how often. A page that never paints leaves a transparent window that is
 * alive and unreachable.
 */
export const LAUNCHER_FIRST_PAINT_TIMEOUT_MS = 15_000;
export const LAUNCHER_MAX_PAINT_RELOADS = 2;
/** A renderer reported unresponsive for this long is restarted. */
export const LAUNCHER_HANG_RESTART_MS = 10_000;
export const LAUNCHER_MAX_HANG_RESTARTS = 2;
/** Fallback background shown if the launcher must be shown without ever painting. */
export const LAUNCHER_FALLBACK_BACKGROUND = '#0b0b0d';
