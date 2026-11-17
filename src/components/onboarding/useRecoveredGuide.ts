import { useCallback, useEffect, useRef, useState } from 'react';

export type GuideState = {
  status: string;
  step: string;
  variant?: string;
  outcome?: string | null;
  updatedAt?: number | null;
  endedMeetingId?: string | null;
  stopLockUntil?: number | null;
};

export const GUIDE_STEP_NUMBERS: Record<string, number> = {
  start: 1, overlay: 2, answer: 3, screenshot: 4, stop: 5,
  notes: 6, surface: 7, start2: 8, notepad: 9, ask: 10,
  recipe: 11, stop2: 12, notes2: 13, plans: 14, keys: 14,
};
export const GUIDE_STEP_TOTAL = 14;

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
