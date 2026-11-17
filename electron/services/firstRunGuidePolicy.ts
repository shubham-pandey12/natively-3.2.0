const GUIDE_RESUME_MS = 7 * 24 * 60 * 60 * 1e3;
const GUIDE_MAX_LAUNCH = 3;
const STEPS = [
  "start",
  "overlay",
  "answer",
  "screenshot",
  "stop",
  "notes",
  "surface",
  "start2",
  "notepad",
  "ask",
  "recipe",
  "stop2",
  "notes2",
  "plans",
  "keys"
];
const STATUSES = ["idle", "active", "skipped", "finished", "expired"];
const VARIANTS = ["normal", "trial_out", "no_trial"];
const OUTCOMES = ["bought", "own_keys", null];
const GUIDE_STEP_NUMBER = Object.freeze({
  start: 1,
  overlay: 2,
  answer: 3,
  screenshot: 4,
  stop: 5,
  notes: 6,
  surface: 7,
  start2: 8,
  notepad: 9,
  ask: 10,
  recipe: 11,
  stop2: 12,
  notes2: 13,
  plans: 14,
  keys: 14
});
const GUIDE_STOP_LOCK_MS = 3e4;
export function guideStopLockLeft(state: any, now: number) {
  if (!state || state.status !== "active" || typeof state.stopLockUntil !== "number") return 0;
  return Math.max(0, Math.min(GUIDE_STOP_LOCK_MS, state.stopLockUntil - now));
}
const BEFORE_PLANS = STEPS.slice(0, STEPS.indexOf("plans"));
const MEETING_1 = ["overlay", "answer", "screenshot", "stop"];
const MEETING_2 = ["notepad", "ask", "recipe", "stop2"];
const IN_MEETING = [...MEETING_1, ...MEETING_2];
const ADVANCE: Record<string, [string, string][]> = {
  overlay_next: [["overlay", "answer"]],
  answer_shown: [["answer", "screenshot"]],
  screenshot_taken: [["screenshot", "stop"]],
  notes_next: [["notes", "surface"], ["notes2", "plans"]],
  surface_notepad: [["surface", "start2"]],
  note_typed: [["notepad", "ask"]],
  ask_opened: [["ask", "recipe"]],
  recipe_run: [["recipe", "stop2"]],
  own_keys: [["plans", "keys"]]
};
export const GUIDE_EVENT_TYPES = Object.freeze([
  "plans_closed",
  "meeting_started",
  "answer_shown",
  "screenshot_taken",
  "note_typed",
  "meeting_stopped",
  "overlay_next",
  "notes_next",
  "ask_opened",
  "recipe_run",
  "trial_out",
  "trial_unavailable",
  "plan_changed",
  "own_keys",
  "keys_done",
  "skip",
  "restart"
]);
export function emptyGuideState() {
  return { status: "idle", step: "start", variant: "normal", outcome: null, startedAt: null, updatedAt: null, endedMeetingId: null, stopLockUntil: null };
}
const isTime = (v: any) => v === null || typeof v === "number" && Number.isFinite(v);
export function normalizeGuideState(raw: any, now: number) {
  if (!raw || typeof raw !== "object") return emptyGuideState();
  const { status, step, variant, outcome, startedAt, updatedAt } = raw;
  const endedMeetingId = raw.endedMeetingId === void 0 ? null : raw.endedMeetingId;
  const stopLockUntil = typeof raw.stopLockUntil === "number" && Number.isFinite(raw.stopLockUntil) ? raw.stopLockUntil : null;
  if (!STATUSES.includes(status) || !STEPS.includes(step) || !VARIANTS.includes(variant) || !OUTCOMES.includes(outcome) || !isTime(startedAt) || !isTime(updatedAt) || !(endedMeetingId === null || typeof endedMeetingId === "string" && endedMeetingId.length > 0)) {
    return emptyGuideState();
  }
  const state = { status, step, variant, outcome, startedAt, updatedAt, endedMeetingId, stopLockUntil };
  if (status === "active" && typeof updatedAt === "number" && now - updatedAt > GUIDE_RESUME_MS) {
    return { ...state, status: "expired" };
  }
  return state;
}
function isGuideEligible(facts: any) {
  return !!facts && !facts.hasOwnAiKey && !facts.hasMeetings && Number(facts.launchCount) <= GUIDE_MAX_LAUNCH;
}
const move = (state: any, patch: any, now: number) => ({ ...state, ...patch, updatedAt: now });
const fresh = (now: number) => ({ ...emptyGuideState(), status: "active", startedAt: now, updatedAt: now });
export function reduceGuide(state: any, event: any, now: number) {
  if (!event || typeof event !== "object") return state;
  if (event.type === "restart") return fresh(now);
  if (event.type === "plans_closed") {
    return state.status === "idle" && isGuideEligible(event.facts) ? fresh(now) : state;
  }
  if (state.status !== "active") return state;
  switch (event.type) {
    case "skip":
      return move(state, { status: "skipped" }, now);
    case "meeting_started": {
      if (state.step !== "start" && state.step !== "start2") return state;
      const surface = event.surface === "overlay" || event.surface === "notepad" ? event.surface : state.step === "start" ? "overlay" : "notepad";
      const stopLockUntil = state.step === "start" ? now + GUIDE_STOP_LOCK_MS : null;
      return move(state, { step: surface === "notepad" ? "notepad" : "overlay", stopLockUntil }, now);
    }
    case "meeting_stopped":
      if (MEETING_1.includes(state.step)) return move(state, { step: "notes" }, now);
      if (MEETING_2.includes(state.step)) return move(state, { step: "notes2" }, now);
      return state;
    case "meeting_saved": {
      if (event.meetingActive) return state;
      const late = typeof event.meetingId === "string" && event.meetingId ? event.meetingId : null;
      if (late && state.step === "surface" && !state.endedMeetingId) return move(state, { step: "notes", endedMeetingId: late }, now);
      const first = MEETING_1.includes(state.step) || state.step === "notes";
      const second = MEETING_2.includes(state.step) || state.step === "notes2";
      if (!first && !second) return state;
      const notesStep = first ? "notes" : "notes2";
      const id = typeof event.meetingId === "string" && event.meetingId ? event.meetingId : null;
      if (!id && state.step === notesStep && state.endedMeetingId) return state;
      if (id) return state.step === notesStep && state.endedMeetingId === id ? state : move(state, { step: notesStep, endedMeetingId: id }, now);
      return move(state, { step: first ? "surface" : "plans", endedMeetingId: null }, now);
    }
    case "trial_out":
    case "trial_unavailable": {
      if (!BEFORE_PLANS.includes(state.step) || event.facts?.hasNativelyKey || event.facts?.hasOwnAiKey) return state;
      return move(state, { step: "plans", variant: event.type === "trial_out" ? "trial_out" : "no_trial" }, now);
    }
    case "plan_changed": {
      if (state.step !== "plans" || !event.facts) return state;
      if (event.facts.hasNativelyKey) return move(state, { status: "finished", outcome: "bought" }, now);
      if (event.facts.isPremium) return move(state, { step: "keys" }, now);
      return state;
    }
    case "keys_done":
      return state.step === "keys" ? move(state, { status: "finished", outcome: "own_keys" }, now) : state;
    default: {
      const edge = (ADVANCE[event.type] ?? []).find(([from]) => from === state.step);
      if (!edge) return state;
      const patch = edge[1] === "start2" || edge[1] === "plans" ? { step: edge[1], endedMeetingId: null } : { step: edge[1] };
      return move(state, patch, now);
    }
  }
}
export function reconcileGuide(state: any, { meetingActive, atLaunch, surface }: any, now: number) {
  if (!state || state.status !== "active") return state;
  if (meetingActive && (state.step === "start" || state.step === "start2")) return reduceGuide(state, { type: "meeting_started", surface }, now);
  if (atLaunch && !meetingActive && IN_MEETING.includes(state.step)) return reduceGuide(state, { type: "meeting_stopped" }, now);
  return state;
}
const ALMOST_GONE_MS = 15 * 60 * 1e3;

/**
 * The guide's account facts from their raw sources (3.2.0). The trial sentinel
 * is a placeholder key, not a purchased one, so it never counts as a Natively key.
 */
export function guideFactsFromSources({
  nativelyKey, trialSentinel, licensed, hasOwnAiKey, hasMeetings, launchCount = 0,
}: {
  nativelyKey?: unknown; trialSentinel?: string; licensed?: unknown; hasOwnAiKey?: unknown;
  hasMeetings?: unknown; launchCount?: unknown;
} = {}) {
  return {
    hasOwnAiKey: !!hasOwnAiKey,
    hasMeetings: !!hasMeetings,
    hasNativelyKey: typeof nativelyKey === 'string' && nativelyKey.length > 0 && nativelyKey !== trialSentinel,
    isPremium: !!licensed,
    launchCount: Number(launchCount) || 0,
  };
}
