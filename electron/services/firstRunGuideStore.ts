import { BrowserWindow } from 'electron';
import { SettingsManager } from './SettingsManager';
import { GUIDE_EVENT_TYPES, guideStopLockLeft, normalizeGuideState, reconcileGuide, reduceGuide } from './firstRunGuidePolicy';

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
let deps: GuideDeps = { meetingActive: () => false, factsProvider: () => ({ hasOwnAiKey: false, hasNativelyKey: false, isPremium: false, launchCount: 0 }) };
let launchReconciled = false;

export function configureGuideStore(next: GuideDeps): void { deps = next; }

function read(now = Date.now()): any {
  return normalizeGuideState(SettingsManager.getInstance().get('firstRunGuide'), now);
}

function save(previous: any, next: any): any {
  if (next === previous) return previous;
  if (!SettingsManager.getInstance().set('firstRunGuide', next)) return previous;
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send('guide:changed', next);
  return next;
}

export function getGuideState(): any {
  const now = Date.now();
  const raw = SettingsManager.getInstance().get('firstRunGuide') as any;
  const current = read(now);
  const next = reconcileGuide(current, { meetingActive: deps.meetingActive(), atLaunch: !launchReconciled, surface: deps.meetingSurface?.() }, now);
  launchReconciled = true;
  if (next !== current) return save(current, next);
  // A stored state that normalised to another status (expired, or repaired)
  // is written back; an active guide that ended this way hands the surface back.
  if (raw && current.status !== raw.status) {
    SettingsManager.getInstance().set('firstRunGuide', current);
    if (raw.status === 'active') {
      try { deps.onGuideEnd?.(); } catch (error: any) { console.warn('[Guide] end hand-off failed:', error?.message); }
    }
  }
  return current;
}

export function applyGuideEvent(event: GuideEvent): any {
  const now = Date.now();
  const current = read(now);
  const facts = deps.factsProvider();
  const enriched = event.type === 'meeting_started' ? { ...event, surface: deps.meetingSurface?.() }
    : event.type === 'meeting_saved' ? { ...event, meetingActive: deps.meetingActive() }
    : event.type === 'plans_closed' ? { ...event, facts: { ...facts, launchCount: Number((event.facts as any)?.launchCount) || facts.launchCount } }
    : ['plan_changed', 'trial_out', 'trial_unavailable'].includes(event.type) ? { type: event.type, facts }
    : event;
  const reduced = reduceGuide(current, enriched, now);
  const next = ['restart', 'plans_closed'].includes(event.type)
    ? reconcileGuide(reduced, { meetingActive: deps.meetingActive(), atLaunch: false, surface: deps.meetingSurface?.() }, now) : reduced;
  if (next !== current) console.log(`[Guide] ${event.type}: ${current.step}/${current.status} -> ${next.step}/${next.status}`);
  const saved = save(current, next);
  if (saved !== next) return saved;
  try {
    if (next.status === 'active' && (current.status !== 'active' || event.type === 'restart')) deps.onGuideStart?.();
    if (current.status === 'active' && next.status !== 'active') deps.onGuideEnd?.();
    if (event.type === 'meeting_started' && current.step === 'start' && next.status === 'active') deps.onFirstMeetingStarted?.();
    if (next.status === 'active' && next.step !== current.step) deps.onEnterStep?.(next.step);
  } catch (error) { console.warn('[Guide] step hand-off failed:', error); }
  return saved;
}

export function dispatchGuideFromWindow(event: unknown): any {
  const type = (event as GuideEvent | null)?.type;
  if (typeof type !== 'string' || !GUIDE_EVENT_TYPES.includes(type)) return read();
  return applyGuideEvent(event as GuideEvent);
}

// Called from end-meeting and screenshot paths: a guide fault must never block them.
export function guideStopLockedMs(): number {
  try { return guideStopLockLeft(read(), Date.now()); } catch { return 0; }
}
export function guideScreenshotTaken(): void {
  try {
    const g = read();
    if (g.status === 'active' && g.step === 'screenshot') applyGuideEvent({ type: 'screenshot_taken' });
  } catch (error: any) { console.warn('[Guide] screenshot not reported:', error?.message); }
}
export function guideSurfaceSet(surface: string): void {
  try {
    const g = read();
    if (surface === 'notepad' && g.status === 'active' && g.step === 'surface') applyGuideEvent({ type: 'surface_notepad' });
  } catch (error: any) { console.warn('[Guide] surface not reported:', error?.message); }
}
