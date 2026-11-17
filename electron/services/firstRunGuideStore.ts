import { BrowserWindow } from 'electron';
import { SettingsManager } from './SettingsManager';
import { GUIDE_EVENT_TYPES, guideStopLockLeft, normalizeGuideState, reconcileGuide, reduceGuide } from '../../src/lib/onboarding/firstRunGuide.mjs';

type GuideEvent = { type: string; [key: string]: unknown };
type GuideDeps = {
  meetingActive(): boolean;
  meetingSurface?(): string;
  factsProvider(): { hasOwnAiKey: boolean; hasNativelyKey: boolean; isPremium: boolean; launchCount: number; hasMeetings?: boolean };
  onGuideStart?(): void;
  onGuideEnd?(): void;
  onFirstMeetingStarted?(): void;
  onEnterStep?(step: string): void;
};
let deps: GuideDeps = {
  meetingActive: () => false,
  factsProvider: () => ({ hasOwnAiKey: false, hasNativelyKey: false, isPremium: false, launchCount: 0 }),
};
let launchReconciled = false;

export function configureGuideStore(next: GuideDeps): void { deps = next; }

function save(current: any, next: any): any {
  if (next === current) return current;
  if (!SettingsManager.getInstance().set('firstRunGuide', next)) return current;
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send('guide:changed', next);
  });
  return next;
}

function read(now: number): { raw: any; state: any } {
  const raw = SettingsManager.getInstance().get('firstRunGuide') as any;
  return { raw, state: normalizeGuideState(raw, now) };
}

export function getGuideState(): any {
  const now = Date.now();
  const { raw, state } = read(now);
  const next = reconcileGuide(state, { meetingActive: deps.meetingActive(), atLaunch: !launchReconciled, surface: deps.meetingSurface?.() }, now);
  launchReconciled = true;
  if (next !== state) return save(state, next);
  // A stored state that normalised to another status (expired, or repaired)
  // is written back; an active guide that ended this way hands the surface back.
  if (raw && state.status !== raw.status) {
    SettingsManager.getInstance().set('firstRunGuide', state);
    if (raw.status === 'active') {
      try { deps.onGuideEnd?.(); } catch (e: any) { console.warn('[Guide] end hand-off failed:', e?.message); }
    }
  }
  return state;
}

export function applyGuideEvent(event: GuideEvent): any {
  const now = Date.now();
  const { state: current } = read(now);
  let reduced: any;
  if (event.type === 'meeting_started') {
    reduced = reduceGuide(current, { type: 'meeting_started', surface: deps.meetingSurface?.() }, now);
  } else if (event.type === 'meeting_saved') {
    reduced = reduceGuide(current, { type: 'meeting_saved', meetingId: event.meetingId, meetingActive: deps.meetingActive() }, now);
  } else if (event.type === 'plans_closed') {
    const own = deps.factsProvider();
    reduced = reduceGuide(current, { type: 'plans_closed', facts: { ...own, launchCount: Number((event.facts as any)?.launchCount) || own.launchCount } }, now);
  } else if (event.type === 'plan_changed') {
    reduced = reduceGuide(current, { type: 'plan_changed', facts: deps.factsProvider() }, now);
  } else if (event.type === 'trial_out' || event.type === 'trial_unavailable') {
    reduced = reduceGuide(current, { type: event.type, facts: deps.factsProvider() }, now);
  } else {
    reduced = reduceGuide(current, event, now);
  }
  const next = event.type === 'restart' || event.type === 'plans_closed'
    ? reconcileGuide(reduced, { meetingActive: deps.meetingActive(), atLaunch: false, surface: deps.meetingSurface?.() }, now) : reduced;
  if (next !== current) console.log(`[Guide] ${event.type}: ${current.step}/${current.status} -> ${next.step}/${next.status}`);
  const saved = save(current, next);
  if (saved !== next) return saved;
  const began = next.status === 'active' && (current.status !== 'active' || event.type === 'restart');
  const ended = current.status === 'active' && next.status !== 'active';
  try {
    if (began) deps.onGuideStart?.();
    if (ended) deps.onGuideEnd?.();
    if (event.type === 'meeting_started' && current.step === 'start' && next.status === 'active') deps.onFirstMeetingStarted?.();
    if (next.status === 'active' && next.step !== current.step) deps.onEnterStep?.(next.step);
  } catch (e: any) { console.warn('[Guide] step hand-off failed:', e?.message); }
  return saved;
}

// Called from end-meeting and screenshot paths: a guide fault must never block them.
export function guideStopLockedMs(): number {
  try { return guideStopLockLeft(read(Date.now()).state, Date.now()); } catch { return 0; }
}
export function guideScreenshotTaken(): void {
  try {
    const g = read(Date.now()).state;
    if (g.status === 'active' && g.step === 'screenshot') applyGuideEvent({ type: 'screenshot_taken' });
  } catch (e: any) { console.warn('[Guide] screenshot not reported:', e?.message); }
}
export function guideSurfaceSet(surface: string): void {
  try {
    const g = read(Date.now()).state;
    if (surface === 'notepad' && g.status === 'active' && g.step === 'surface') applyGuideEvent({ type: 'surface_notepad' });
  } catch (e: any) { console.warn('[Guide] surface not reported:', e?.message); }
}

export function dispatchGuideFromWindow(event: unknown): any {
  const type = (event as GuideEvent | null)?.type;
  if (typeof type !== 'string' || !GUIDE_EVENT_TYPES.includes(type)) {
    return read(Date.now()).state;
  }
  return applyGuideEvent(event as GuideEvent);
}
