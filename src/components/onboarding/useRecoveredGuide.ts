import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import {
  GUIDE_DONE_HOLD_MS,
  GUIDE_STEP_NUMBER,
  GUIDE_STEP_TOTAL,
  GUIDE_STOP_LOCK_MS,
  guideStopLockLeft,
} from '../../lib/onboarding/firstRunGuide.mjs';
import { shortcutKeysFor } from '../../lib/onboarding/shortcutKeys.mjs';
import { isMac, isWindows } from '../../utils/platformUtils';

export type GuideState = {
  status: string;
  step: string;
  variant?: string;
  outcome?: string | null;
  updatedAt?: number | null;
  endedMeetingId?: string | null;
  stopLockUntil?: number | null;
};

export { GUIDE_DONE_HOLD_MS, GUIDE_STEP_NUMBER, GUIDE_STEP_TOTAL, GUIDE_STOP_LOCK_MS };
export const GUIDE_STEP_NUMBERS: Readonly<Record<string, number>> = GUIDE_STEP_NUMBER;

let leavingCount = 0;
function setLeaving(value: boolean) {
  leavingCount = Math.max(0, leavingCount + (value ? 1 : -1));
  if (leavingCount > 0) document.documentElement.setAttribute('data-guide-leaving', '');
  else document.documentElement.removeAttribute('data-guide-leaving');
}

export function dispatchGuide(event: { type: string; [key: string]: unknown }) {
  window.electronAPI?.guideDispatch?.(event)?.catch?.(() => {});
}

export function useRecoveredGuide() {
  const [state, setState] = useState<GuideState | null>(null);
  const [justDone, setJustDone] = useState(false);
  const previous = useRef<GuideState | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leavingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaving = useRef(false);
  const markLeaving = useCallback((value: boolean) => {
    if (leaving.current !== value) { leaving.current = value; setLeaving(value); }
  }, []);
  const accept = useCallback((next: GuideState | null) => {
    if (!next) return;
    if (finishTimer.current) { clearTimeout(finishTimer.current); finishTimer.current = null; }
    if (leavingTimer.current) { clearTimeout(leavingTimer.current); leavingTimer.current = null; }
    const old = previous.current;
    const changed = !!old && old.status === 'active' && (next.step !== old.step || next.status !== 'active');
    const finish = () => { finishTimer.current = null; previous.current = next; setState(next); setJustDone(false); markLeaving(false); };
    if (changed && next.status === 'skipped') {
      markLeaving(true);
      finishTimer.current = setTimeout(finish, 160);
      return;
    }
    if (changed) {
      setJustDone(true);
      leavingTimer.current = setTimeout(() => { leavingTimer.current = null; markLeaving(true); }, 840);
      finishTimer.current = setTimeout(finish, 1000);
      return;
    }
    finish();
  }, [markLeaving]);
  useEffect(() => {
    let live = true;
    window.electronAPI?.guideGet?.().then(next => { if (live) accept(next); }).catch(() => {});
    const off = window.electronAPI?.onGuideChanged?.(accept);
    return () => {
      live = false; off?.();
      if (finishTimer.current) clearTimeout(finishTimer.current);
      if (leavingTimer.current) clearTimeout(leavingTimer.current);
      markLeaving(false);
    };
  }, [accept, markLeaving]);
  return { state, justDone, dispatch: dispatchGuide };
}

export function useGuideStopLock(): { seconds: number; label: string } {
  const t = useT();
  const [state, setState] = useState<GuideState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    window.electronAPI?.guideGet?.().then((next) => {
      if (alive && next) setState(next);
    }).catch(() => {});
    const off = window.electronAPI?.onGuideChanged?.((next) => {
      if (next) {
        setState(next);
        setNow(Date.now());
      }
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);
  const remainingMs = guideStopLockLeft(state, now);
  useEffect(() => {
    if (remainingMs <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), remainingMs % 1000 || 1000);
    return () => clearTimeout(timer);
  }, [remainingMs]);
  const seconds = Math.ceil(remainingMs / 1000);
  return {
    seconds,
    label: seconds > 0 ? t('Stop unlocks in {n} s').replace('{n}', String(seconds)) : '',
  };
}

export function isGuideStep(state: GuideState | null | undefined, ...steps: string[]): boolean {
  return !!state && state.status === 'active' && steps.includes(state.step);
}

const GUIDE_PLATFORM = isMac ? 'darwin' : isWindows ? 'win32' : 'linux';

export function useGuideShortcuts(active: boolean) {
  const [keybinds, setKeybinds] = useState<Array<{ id: string; accelerator?: string }> | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    window.electronAPI?.getKeybinds?.().then((next) => {
      if (alive) setKeybinds(next ?? null);
    }).catch(() => {});
    const off = window.electronAPI?.onKeybindsUpdate?.((next) => setKeybinds(next ?? null));
    return () => {
      alive = false;
      off?.();
    };
  }, [active]);
  return useCallback((id: string) => shortcutKeysFor(keybinds, id, GUIDE_PLATFORM), [keybinds]);
}

function observeGuideTarget(update: () => void) {
  let frame = 0;
  let until = 0;
  const tick = () => { frame = 0; update(); if (performance.now() < until) frame = requestAnimationFrame(tick); };
  const changed = () => { until = performance.now() + 600; if (!frame) frame = requestAnimationFrame(tick); };
  const observer = new MutationObserver(changed);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden', 'aria-expanded', 'data-state'] });
  const events = ['resize', 'scroll', 'transitionrun', 'transitionend', 'animationstart', 'animationend'];
  events.forEach(event => window.addEventListener(event, changed, true));
  const interval = setInterval(update, 1000);
  update(); changed();
  return () => { if (frame) cancelAnimationFrame(frame); observer.disconnect(); events.forEach(event => window.removeEventListener(event, changed, true)); clearInterval(interval); };
}

function visibleGuideTarget(selector: string) {
  return [...document.querySelectorAll<HTMLElement>(selector)].find(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0;
  }) ?? null;
}

export function useGuideHighlight(selector: string | null) {
  useEffect(() => {
    const clear = (except?: Element | null) => document.querySelectorAll('[data-guide-lit]').forEach(element => { if (element !== except) element.removeAttribute('data-guide-lit'); });
    if (!selector) { clear(); return; }
    const stop = observeGuideTarget(() => {
      const target = visibleGuideTarget(selector);
      clear(target);
      if (target && !target.hasAttribute('data-guide-lit')) target.setAttribute('data-guide-lit', '');
    });
    return () => { stop(); clear(); };
  }, [selector]);
}

export function useGuideAnchor(selector: string | null) {
  const [bounds, setBounds] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!selector) { setBounds(null); return; }
    let old = '';
    return observeGuideTarget(() => {
      const target = visibleGuideTarget(selector);
      let next = target?.getBoundingClientRect() ?? null;
      if (target && next) {
        const covering = document.elementFromPoint(next.left + next.width / 2, next.top + next.height / 2);
        if (covering && !target.contains(covering) && !covering.closest('[data-guide-card]')) next = null;
      }
      const key = next ? `${Math.round(next.left)},${Math.round(next.top)},${Math.round(next.width)},${Math.round(next.height)}` : '';
      if (key !== old) { old = key; setBounds(next); }
    });
  }, [selector]);
  return bounds;
}
