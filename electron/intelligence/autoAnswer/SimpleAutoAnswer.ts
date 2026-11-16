/**
 * SIMPLE Auto Answer engine (user decision 2026-08-25) — "legacy trigger,
 * judge brain".
 *
 * Six live rounds showed the V3 candidate machinery (quiet windows, revision
 * re-judging, act heuristics, channel state machine) eating real questions
 * before the judge — which was never wrong — could rule. This engine is the
 * requested middle ground:
 *
 *   interviewer speech STOPS (stability window, endpoint-shortened)
 *     → cheap local prefilter (dup / backchannel / too short — zero cost)
 *       → ONE judge call ("autoanswer yes/no" + the extracted question)
 *         → dispatch | offer | silent.
 *
 * Cost/latency discipline:
 *  - one call per STOPPAGE, never per final (V3 judged one utterance 6×);
 *  - interims and finals both restart the stability window, so the call fires
 *    only when the interviewer has actually stopped — and the window overlaps
 *    the LLM latency the user must wait through anyway;
 *  - a call is superseded (never applied) when new interviewer speech arrives
 *    while it is in flight — the next stoppage re-judges with more context;
 *  - the judge prompt's static prefix enables implicit provider caching.
 *
 * The user channel is INERT (user decision 2026-09-03). The user answers the
 * moment a question lands — nobody sits in silence waiting for the overlay —
 * so their own speech never cancels a streaming answer, never clears a
 * candidate and never drops a parked or deferred verdict. The mic is still
 * transcribed (the judge sees both sides), it just has no vote here. This
 * retired the 2026-08-24 "lenient mic" policy and its echo latch with it.
 * Judge unavailable → almost-legacy fallback: dispatch only when the stopped
 * speech ends with '?'.
 */

import type { TranscriptSegment } from '../../SessionTracker';
import type { TranscriptTurn } from '../../llm/transcriptCleaner';
import type { Clock, ClockTimer } from './AutoAnswerClock';
import { systemClock } from './AutoAnswerClock';
import {
    JUDGE_DEADLINE_MS, JUDGE_CONTEXT_TURNS, parseJudgeVerdict, routeForVerdict, type JudgeRequest,
} from './AutoAnswerJudge';
import { isMidWordCut, joinTranscriptParts, normalizeForCompare, tokenContainment } from './AutoAnswerText';
import type { AutoAnswerThresholds } from './AutoAnswerPolicy';
import { DEFAULT_THRESHOLDS } from './AutoAnswerPolicy';
import type { AutoAnswerCancelReason, AutoAnswerDispatchResult, AutoAnswerQuestion, AutoAnswerTelemetryEvent } from './AutoAnswerTypes';

/** Interviewer-side prefilter: a candidate that is nothing but acknowledgements never costs a judge call. */
export const USER_BACKCHANNEL = /^(?:(?:yeah|yes|yep|yup|ya|mm-?hm+|mhm+|uh-?huh|ok(?:ay)?|right|sure|cool|got it|i see|nice|great|perfect|exactly|interesting|makes sense|sounds good|true|correct|wow|oh|ah|hm+|haha+|alright|of course|fair enough|no problem|totally|absolutely|definitely|indeed|good|fine)[\s,.!?-]*){1,4}$/i;
/** The interviewer must be quiet this long before the judge is consulted. Unfitted placeholder. */
export const STABILITY_MS = 900;
/**
 * Quiet needed before the judge is ASKED, as opposed to before the answer is
 * COMMITTED (that stays STABILITY_MS).
 *
 * The judge costs ~1.3 s and, until now, that whole cost sat after the 900 ms
 * window — so an answer landed ~2.2 s after the interviewer stopped, where the
 * legacy trigger fired at 900 ms flat. Asking earlier overlaps the judge with
 * the rest of the window instead of queueing behind it.
 *
 * It is deliberately a QUIET window rather than "on every final": interims
 * keep pushing it out, so during continuous speech the early judge never
 * fires. That is the whole ration — no counter, no cooldown, just the fact
 * that a talking interviewer never leaves a 120 ms gap. It also multiplies
 * only the CHEAP call: the judge is ~2.2k tokens on flash-lite and never
 * touches the answer engine, whereas prefetching the ANSWER early would take
 * activeMode out of idle and park the real dispatch behind a junk generation.
 */
export const EARLY_JUDGE_MS = 120;
/** A provider endpoint (speech_final / <end>) confirms the stop: shorten the wait. */
export const ENDPOINT_CONFIRM_MS = 350;
/** Below this many NEW words (and no '?') we wait for more speech instead of calling. */
export const MIN_NEW_WORDS = 4;
/**
 * Fire at anything above this. The offer card is gone, so this is the only
 * line left in the dispatch decision — above it the answer is drafted, below
 * it nothing happens.
 *
 * 0.20 (user, 2026-08-25) → 0.30 (user, 2026-08-26).
 *
 * Worth knowing before tuning it again: the judge's output is effectively
 * QUANTIZED. Across every session captured so far it has returned only
 * 0 (×132), 0.1 (×69), 0.4 (×5), 0.8 (×2), 0.9 (×19) and 1.0 (×13) — nothing
 * has ever landed between 0.2 and 0.3, so this move changes no dispatch that
 * has actually occurred. The weak band that produced the one questionable
 * answer of the 2026-08-26 session ("I recommend maybe sharing your screen.")
 * is 0.4, and only a floor above 0.4 removes it.
 */
export const ANSWER_FLOOR = 0.30;
/** Judge-unavailable fallback on punctuation-less providers: interrogative-led utterances. */
export const FALLBACK_INTERROGATIVE = /^(?:(?:ok(?:ay)?|so|and|now|alright|well)[,.!\s]+)*(?:how|what|why|when|where|which|who|whose|can|could|would|should|do|does|did|are|is|will|have you|tell me|tell us|walk me|walk us|explain|describe)\b/i;
/**
 * Prefetch pacing. Starting the answer alongside the judge removes ~830 ms
 * (measured) from the critical path, but a prefetch the verdict rejects is a
 * wasted generation, so it has to be rationed.
 *
 * The first cut rationed it with the OLD heuristic scorer — which is exactly
 * the thing the judge replaced because it cannot see declarative tasks. So
 * "why did you choose Postgres?" got the speedup and "your task is to
 * recreate this game in React" did not: the case the feature exists for was
 * the one case that never benefited. Now the ration is TIME, not shape — at
 * most one prefetch per window, so a long meeting cannot spend more than a
 * bounded number of generations no matter how it is phrased.
 *
 * 2026-09-22: the time ration is the FLOOR, not the only gate. Live telemetry
 * (9 automatic answers, Deepgram + gpt-5.6-luna) showed the judge (1.2-2.5 s)
 * and the answer's first token (0.7-2.7 s) running back to back, because an
 * interview asks faster than once per 25 s and the ration let the head start
 * fire for one question in several. A candidate that is question-SHAPED — a
 * trailing '?' or an interrogative lead ("tell me", "walk me through", "how
 * would you") — is the high-prior case: those are the asks the judge
 * overwhelmingly said 'answer' to, so a rejected prefetch is rare there and
 * the shape now bypasses the ration. Statements and bare declarative tasks
 * keep it: their prior is low, and the ration is what bounds the spend.
 * (The engine's own guards — never over a live stream or an existing
 * speculation — still apply on top, so bypassing cannot stack generations.)
 */
export const PREFETCH_MIN_INTERVAL_MS = 25_000;
/**
 * STT providers whose transcript can be trusted to be caught up when the local
 * VAD reports the interviewer stopped: they stream interims, so a dangling
 * interim tells the controller the last words' final is still in flight (see
 * onLocalSpeechEnd). The rest produce their FINAL from the end of the segment
 * itself — REST uploads (groq, azure, ibmwatson), OpenAI's whisper-1 REST
 * fallback, and the local models (their own VAD closes the segment, then
 * inference runs) — so the stop always precedes the text and would judge the
 * turn without its last words.
 */
export function acceptsLocalSpeechEndHint(sttProvider: string): boolean {
    return !['none', 'groq', 'azure', 'ibmwatson', 'openai', 'local-whisper'].includes(sttProvider);
}
/** A transcript stretch split after . ? ! — the unit a question's shape lives in. */
export function sentencesOf(text: string): string[] {
    return text.split(/(?<=[.?!])\s+/).map(s => s.trim()).filter(Boolean);
}
/**
 * The shape that earns an unrationed prefetch: a sentence that ends in '?' or
 * opens with an interrogative lead. Per SENTENCE, not per candidate: a
 * candidate usually opens with the lead-in the judge already ruled silent
 * ("Great. So I'm Sarah, I lead the platform team…"), and a whole-candidate
 * test read THAT as the lead — live 2026-09-26 "…Let's start with you. Tell me
 * a little bit about yourself" got no head start.
 */
export function isQuestionShaped(candidate: string): boolean {
    return sentencesOf(candidate).some(s => /\?\s*$/.test(s) || FALLBACK_INTERROGATIVE.test(s));
}
/**
 * The asks that carry no question at all (2026-09-27). In sales, support and
 * seminar sessions the ask is often a REPORT: a pain point ("our biggest pain
 * is that escalations get lost over the weekend"), a symptom ("now it says
 * license limit reached"), or an observation about the user's work ("I
 * noticed the baseline numbers are lower than the paper's"). Across 343 live
 * judged candidates these were the only 4 answered asks that were not
 * question-shaped, and the prefetch ration made one of them (sales, 19.8 s
 * after the last prefetch) wait the whole judge before its answer started.
 * This pattern matched all 4 and 10 others (mostly that same pain point on
 * runs where the judge ruled it "either" way), so it rides the question-shape
 * bypass. A fragment that stops on a hanging word is still unfinished.
 */
export const REPORT_SHAPED = /\b(?:i (?:just )?noticed|i see that|our (?:biggest |main |real )?(?:pain|problem|issue|challenge|concern|bottleneck)s? (?:is|are)|(?:can'?t|cannot|couldn'?t|won'?t|doesn'?t|isn'?t|aren'?t|not able to) (?:log|work|load|connect|sign|access|see|find|open|get)|error|it says|now says|keeps? (?:failing|crashing|timing out)|stopped working|(?:is|are) broken|went down)\b/i;
const HANGING_END = /\b(?:that|and|but|so|because|is|are|was|the|a|an|to|of|with|when|if|which)\s*[,.-]*\s*$/i;
export function isReportShaped(candidate: string): boolean {
    const t = candidate.trim();
    return REPORT_SHAPED.test(t) && !HANGING_END.test(t);
}
/**
 * How long after an automatic answer a manual press still counts as "that
 * answer was not good enough". Long enough for the user to read it and
 * decide, short enough that an unrelated later press is not blamed on it.
 * Unfitted placeholder — this signal exists precisely so it can be fitted.
 */
export const FEEDBACK_WINDOW_MS = 20_000;
/**
 * A verdict discarded as stale is KEPT this long, and re-applied at the next
 * stoppage, when it was positive and the candidate has only grown since.
 *
 * Live run 2026-08-25: 25 of 28 verdicts were thrown away. The engine bumps
 * `judgeSeq` on every interviewer text event, the judge takes ~950 ms, and the
 * stability window measures the gap between transcript ARRIVALS rather than
 * speech — on the relay path finals land in bursts 1-2 s apart, so a stoppage
 * fires mid-sentence and the next arriving segment kills the verdict it paid
 * for. Arrival is not resumption: the text that "superseded" the verdict was
 * usually already spoken when the judge was asked.
 *
 * Deferring instead of discarding keeps the invariant the guard existed for —
 * the held verdict is only ever applied from `onStoppage`, i.e. at a quiet
 * point, never mid-sentence.
 */
export const HELD_MAX_AGE_MS = 15_000;
/**
 * A held verdict is applied ONLY to the byte-identical candidate. Growth may
 * never be held across, in either direction, and this was proved by a test
 * before it could ship:
 *   - the growth COMPLETES the utterance ("tell me about the hardest bug you
 *     ever" + "debugged in production and how you found it?") — applying the
 *     held verdict answers a truncated question;
 *   - the growth is a NEW sentence — applying the held verdict answers Q1
 *     after Q2 arrived, which spec V2 §34 pins as an invariant.
 * So growth always re-judges, exactly as before. What this recovers is the
 * INTERIM supersede: an interim cannot change the candidate (`pending` is
 * finals-only), so a verdict it invalidated is still precisely about the text
 * on the table.
 */
/** Busy-engine retry cadence and give-up. */
export const RETRY_MS = 500;
export const RETRY_TTL_MS = 8000;
/**
 * While a MANUAL answer is streaming, a question parked behind it waits up to
 * this long (from when it was committed) instead of RETRY_TTL_MS: a long
 * manual answer used to outlive the 8 s park and the question asked during it
 * was dropped (engine_busy_or_cooling). onEngineIdle still wakes it the
 * moment the manual answer ends; a newer question still supersedes it.
 */
export const MANUAL_PARK_MAX_MS = 45_000;
/**
 * The engine goes idle a moment BEFORE the manual press reports how it ended
 * (onManualAnswerSettled). A dispatch parked behind that press waits this long
 * for the report, so the handed-over question is settled first; if no report
 * comes, the parked dispatch goes anyway.
 */
export const MANUAL_SETTLE_WAIT_MS = 1500;
/** New speech this much covered by what a manual answer answered is that same question, not a continuation. */
const MANUAL_COVERED_CONTAINMENT = 0.6;
/**
 * The voice detector said the interviewer started talking, and then neither a
 * stop nor any interviewer transcript arrived for this long. The stop was lost
 * (a capture restart or an audio-device switch drops it), and without this
 * Auto Answer would wait for it for the rest of the meeting. Speech that is
 * really going on keeps producing interims well inside this window; it is
 * long enough that a transcriber sending only finals, one per long segment,
 * is not mistaken for silence.
 */
export const SPEAKING_STALE_MS = 8000;
/**
 * Pending interviewer finals older than this no longer belong to the current
 * thought. Raised 30s -> 90s on 2026-08-25: a coding-interview problem
 * statement runs 45-60 s ("design a class that supports these three
 * operations…"), and a 30 s cap silently dropped its opening, so the answer
 * was drafted against two thirds of the spec. Unfitted placeholder.
 */
export const PENDING_MAX_AGE_MS = 90_000;
/**
 * STT stall cap (2026-09-27). The interviewer stopped (the local voice
 * detector says so), their words are on screen as an interim, and the final
 * never comes: the provider has stalled. Live runs showed "…with Z" sitting
 * there for 3.5, 8.7 and 12 s before the final landed with no new speech, and
 * nothing is judged until it does. After this long with the interim frozen
 * (counted from the later of the last interim and the voice detector's stop),
 * the interim stands in for its final.
 *
 * Why 2 s: across 517 recorded live turns the final landed p50 0.75 s, p90
 * 1.1 s, p99 2.2 s after the speaker stopped, so 2 s past the stop cap reaches
 * about 1% of turns, and those are mostly the stalls themselves.
 *
 * What it cannot fix: a relay backlog where not even an interim has arrived
 * (live L14: the first interim came 5.3 s after the speech ended). There is
 * nothing to promote, so that turn waits exactly as before.
 */
export const STALL_PROMOTE_MS = 2000;
/**
 * The late final of a promoted interim is the SAME utterance when its words,
 * minus the interim's last (often clipped) one, are this contained in it and it
 * adds at most STALL_TAIL_WORDS more.
 */
const STALL_SAME_CONTAINMENT = 0.9;
const STALL_TAIL_WORDS = 2;
/** A promoted interim was answered: its late final within this long is not a new question. */
export const STALL_ANSWERED_TTL_MS = 30_000;

/** Whether `final` is the late final of the stalled `interim` rather than new speech. */
export function isSameUtterance(interim: string, final: string): boolean {
    const i = normalizeForCompare(interim).split(' ').filter(Boolean);
    const f = normalizeForCompare(final).split(' ').filter(Boolean);
    if (i.length === 0 || f.length === 0) return false;
    // Same words, same count. Only the last word may differ, and only by the
    // completion of a clipped word ("…with Zoo" → "…with ZooKeeper"): a final
    // that adds or changes words is new speech, not the stalled utterance.
    if (f.length !== i.length) return false;
    const last = i.length - 1;
    for (let index = 0; index < last; index++) {
        if (i[index] !== f[index]) return false;
    }
    if (i[last] !== f[last]) {
        if (/[.?!؟。？！]\s*$/.test(interim) || i[last].length < 3 || !f[last].startsWith(i[last])
            || f[last].length - i[last].length > STALL_TAIL_WORDS) return false;
    }
    return true;
}

export interface SimpleAutoAnswerHost {
    isEnabled(): boolean;
    isMeetingActive(): boolean;
    meetingGeneration(): number;
    engineAccepting(): boolean;
    /**
     * RETIRED 2026-09-03 with the user channel: the engine no longer calls
     * either of these (nothing here cancels a stream any more — see the header)
     * and `main.ts` still supplies both. Left on the interface so reviving the
     * policy is a one-site change rather than a re-wiring; a reader must not
     * take their presence for "the engine can barge in".
     */
    answerStreamActive?(): boolean;
    /** Hot window for judge context (finalized turns, both speakers). */
    recentTurns(): TranscriptTurn[];
    /**
     * Start the automatic answer. Resolve `true` or `{ status: 'completed' }`
     * once it was shown; anything else is treated as not answered (see
     * AutoAnswerDispatchResult) so the question is retried or reported.
     */
    dispatch(question: AutoAnswerQuestion, options: { reuseSpeculative: boolean }): void | Promise<unknown>;
    offer?(question: AutoAnswerQuestion): void;
    retractOffer?(questionId: string, reason: string): void;
    /**
     * Stop the automatic answer in flight (or parked at the planner): the
     * interviewer resumed, the judge failed, or the words it answers changed.
     */
    cancelAutomaticAnswer?(reason: AutoAnswerCancelReason): boolean;
    /** The judge call (same hook as V3): raw model reply, parsed here. */
    /**
     * The judge call. `signal` aborts when the controller supersedes the verdict
     * (more interviewer speech, meeting ended) — the answer would be discarded
     * anyway, so the provider request should stop costing money and quota.
     */
    judgeCandidate?(req: JudgeRequest, signal?: AbortSignal): Promise<string | null>;
    /** Key the engine's speculative cache to this candidate. */
    noteCandidate?(questionId: string, candidateGeneration: number): void;
    /** What the engine currently holds speculatively, for keyed reuse. */
    speculativeSnapshot?(): { questionId: string | null; text: string | null };
    /** Start the answer WHILE the judge decides (see PREFETCH_MIN_ANSWERABILITY). */
    prefetchAnswer?(questionId: string, text: string): void;
    /**
     * The interviewer just stopped and this is the question the next candidate
     * will carry (the finals so far plus the words still in flight as an
     * interim). The host may start work that only needs the text, such as the
     * retrieval query's embedding, before the final transcript lands.
     */
    warmQuery?(text: string): void;
    modeName?(): string | null;
    /** The USER's name, so the judge can tell an ask to them from one to a teammate. */
    userName?(): string | null;
    telemetry?(event: AutoAnswerTelemetryEvent): void;
    log?(line: string): void;
    /**
     * DEV-ONLY content trace: the exact words the judge is ruling on, and what
     * it ruled. Telemetry and `log` carry lengths and reasons only, by
     * construction, which left one question unanswerable from a real run —
     * *which part of the speech was judged?*
     *
     * The engine never decides whether this is safe: the host supplies the
     * hook only while the Context-Intelligence content gate is open (dev build
     * AND verbose AND the explicit env opt-in), so a packaged build has no
     * hook at all.
     */
    logContent?(label: string, text: string): void;
}

/** What a host dispatch resolved to, read as completed / cancelled / failed. */
function dispatchStatus(result: unknown): 'completed' | 'cancelled' | 'failed' | 'skipped' | 'partial' {
    if (result === true) return 'completed';
    const status = (result as AutoAnswerDispatchResult | null | undefined)?.status;
    return status ?? 'failed';
}

/** Share of a picked ask's words that must come from ruled-out finals for it to count as resurfaced. */
export const RULED_OUT_CONTAINMENT = 0.9;

export class SimpleAutoAnswerEngine {
    /** `provisional`: a stalled interim standing in for its final (STALL_PROMOTE_MS); only ever the LAST part. */
    private pending: Array<{ text: string; at: number; speaker?: string; glueNext?: boolean; provisional?: boolean }> = [];
    /**
     * How many leading `pending` finals a verdict has already ruled NOT an ask
     * (a statement, a rhetorical question, logistics). They stay in the
     * candidate — the judge needs them as context — but a question's SHAPE is
     * only read from the finals after them: otherwise "Great. So I'm Sarah…"
     * is the lead of every later candidate, the prefetch never gets its head
     * start, and a judge failure has no question to fall back on.
     */
    private judgedParts = 0;
    /** Latest interviewer interim — the evidence for whether a final cut a word in half. */
    private lastInterviewerInterim = '';
    /** When the latest utterance's first interim arrived: a voice-detector stop before it belongs to an earlier pause. */
    private utteranceStartAt = 0;
    /** When the local voice detector last saw the interviewer stop; 0 once they speak again. */
    private localStopAt = 0;
    /** Fires STALL_PROMOTE_MS after the interim froze. */
    private stallTimer: ClockTimer | null = null;
    /** Recent answered stand-ins, kept until they expire so reordered finals cannot answer twice. */
    private stallAnswered: Array<{ text: string; at: number; speaker?: string }> = [];
    /**
     * The local voice detector says the interviewer is talking (speech start
     * seen, no stop since). Nothing is judged or dispatched until they stop:
     * transcript gaps while they talk are transcriber latency, not a pause.
     */
    private interviewerSpeaking = false;
    /** Clears a speaking state whose stop never came (see SPEAKING_STALE_MS). */
    private speakingTimer: ClockTimer | null = null;
    /** speakerId of the latest interviewer interim, carried onto a promoted stand-in. */
    private lastInterviewerSpeaker: string | undefined = undefined;
    /** The interim last promoted: one stand-in per frozen interim, however many stops follow. */
    private promotedInterim: string | null = null;
    /**
     * Whether the voice detector's speech STARTS reach this engine (main wires
     * the native speech_edge). With them, a stop stays current until the next
     * start. Without them, only a stop after the utterance's first interim
     * counts, so a stale stop from an earlier pause never promotes mid-speech.
     */
    private speechStartsSeen = false;
    /** speakerId per interviewer final, when the STT diarizes. Keyed by normalized text. */
    private speakerByTurn = new Map<string, string | undefined>();
    private timer: ClockTimer | null = null;
    /** Fires EARLY_JUDGE_MS after the interviewer's last word: asks, never commits. */
    private earlyTimer: ClockTimer | null = null;
    /** Last interviewer text event of any kind — the commit clock. */
    private lastInterviewerAt = 0;
    private retryTimer: ClockTimer | null = null;
    private judgeSeq = 0;
    /** Aborts the judge call in flight; nulled when it settles or is superseded. */
    private judgeAbort: AbortController | null = null;
    private sequence = 0;
    private lastJudgedKey = '';
    /** One retry per candidate after a judge or answer failure (see scheduleRecovery). */
    private recovery: { key: string } | null = null;
    private recoveryTimer: ClockTimer | null = null;
    /** The automatic answer started for these parts and not settled yet. */
    private dispatchInFlight: {
        id: string;
        parts: SimpleAutoAnswerEngine['pending'];
        stalled: { text: string; speaker?: string } | null;
        meetingGeneration: number;
        /** A manual press started while this was in flight (see onManualAnswerStarted). */
        handedOver?: boolean;
    } | null = null;
    private lastAnsweredText: string | null = null;
    private lastAnsweredAt = 0;
    /** A manual answer is running (onManualAnswerStarted → onManualAnswerSettled / onEngineIdle). */
    private manualActive = false;
    /** Id of the latest manual press; a settle from an older press is ignored. */
    private manualPressSeq = 0;
    /** onEngineIdle deferred a parked dispatch until the press settles. */
    private settleWaitTimer: ClockTimer | null = null;
    /**
     * The candidate a spoken manual press took over, kept until that answer
     * settles: a failed press gives it back, and a press made while the
     * interviewer was still talking lets the rest of the question through.
     */
    private manualHandoff: {
        candidate: string;
        /** The press that took it over (manualPressSeq). */
        pressId: number;
        parts: SimpleAutoAnswerEngine['pending'];
        at: number;
        /** The interviewer was still talking when the user pressed. */
        unfinished: boolean;
        meetingGeneration: number;
    } | null = null;
    /** The automatic answer currently inside its feedback window. */
    private feedbackPending: { id: string; at: number; act: AutoAnswerQuestion['dialogueAct']; answerability: number } | null = null;
    private feedbackTimer: ClockTimer | null = null;
    /** When the last prefetch fired, for PREFETCH_MIN_INTERVAL_MS pacing. */
    private lastPrefetchAt: number | null = null;
    /** A dispatch waiting on a busy engine, so onEngineIdle can wake it immediately. */
    private parkedAttempt: (() => void) | null = null;
    /** A positive verdict superseded by still-arriving transcript — see HELD_MAX_AGE_MS. */
    private held: {
        id: string; key: string; text: string;
        answerability: number; act: AutoAnswerQuestion['dialogueAct']; at: number;
    } | null = null;
    /** Punctuation provenance of the latest interviewer final ('provider' family = a missing '?' means something). */
    private punctuationGuaranteed = false;
    /** What last bumped judgeSeq, so a discarded verdict can say what killed it. */
    private judgeSeqCause: NonNullable<AutoAnswerTelemetryEvent['supersededBy']> | null = null;
    private thresholds: AutoAnswerThresholds;

    constructor(
        private readonly host: SimpleAutoAnswerHost,
        private readonly clock: Clock = systemClock,
        thresholds: AutoAnswerThresholds = DEFAULT_THRESHOLDS,
    ) {
        this.thresholds = thresholds;
    }

    setThresholds(t: AutoAnswerThresholds): void { this.thresholds = t; }

    /** Every supersede goes through here so the telemetry can name the cause. */
    private bumpJudgeSeq(cause: NonNullable<AutoAnswerTelemetryEvent['supersededBy']>): void {
        this.clearRecovery();
        this.judgeSeq++;
        this.judgeSeqCause = cause;
        // The in-flight verdict is superseded — stop paying for it.
        if (this.judgeAbort) { try { this.judgeAbort.abort(); } catch { /* never break ingest */ } this.judgeAbort = null; }
    }

    onMeetingStart(): void { this.reset(); }
    onMeetingStop(): void { this.reset(); }
    /**
     * The engine went idle. A dispatch parked behind it should go NOW rather
     * than wait out the rest of its 500 ms poll — measured on a real interview,
     * the poll was adding most of a second on top of an already 6-second wait.
     */
    onEngineIdle(): void {
        const parked = this.parkedAttempt;
        // A spoken manual press is still to report how it ended (its settle
        // call follows idle). Settle the question it took over FIRST: woken
        // now, the parked dispatch went out and the settle found an answer in
        // flight, so a failed press's question was never given back.
        if (this.manualHandoff && parked) {
            this.clearRetry();          // its poll would dispatch it too
            this.clearSettleWait();
            this.settleWaitTimer = this.clock.setTimeout(() => {
                this.settleWaitTimer = null;
                this.manualActive = false;
                this.host.log?.('[AutoAnswer:simple] the manual press never reported its end: releasing the parked question');
                this.wakeParked();
            }, MANUAL_SETTLE_WAIT_MS);
            return;
        }
        // Idle means no manual answer is running any more (its settle call may
        // still follow; it is a no-op for the park).
        this.manualActive = false;
        this.wakeParked();
    }

    private wakeParked(): void {
        const parked = this.parkedAttempt;
        if (!parked) return;
        this.clearRetry();
        parked();
    }

    private clearSettleWait(): void {
        if (this.settleWaitTimer !== null) { this.clock.clearTimeout(this.settleWaitTimer); this.settleWaitTimer = null; }
    }

    /** Provider says the interviewer's turn ended: confirm the stop sooner. */
    onProviderEndpoint(): void {
        if (!this.host.isEnabled() || this.pending.length === 0) return;
        this.arm(ENDPOINT_CONFIRM_MS);
    }

    /**
     * The LOCAL VAD (native capture, 150-200 ms hangover) saw the interviewer
     * stop. Only four STT providers emit their own end-of-turn event; the rest
     * waited the full STABILITY_MS after the last final even though the
     * capture layer already knew. Treat the local stop like a provider
     * endpoint — with one guard: a dangling interim means the final for the
     * last words has not landed yet, and committing now would judge half a
     * turn. That final re-arms the window itself when it arrives.
     */
    onLocalSpeechEnd(confirmEndpoint = true): void {
        this.interviewerSpeaking = false;
        this.clearSpeakingTimer();
        if (!this.host.isEnabled() || !this.host.isMeetingActive()) return;
        this.lastInterviewerAt = this.clock.now();
        // A provider whose finals are not trusted to end a turn (see
        // acceptsLocalSpeechEndHint): the stop only restarts the quiet window.
        if (!confirmEndpoint) {
            if (this.pending.length) this.arm(STABILITY_MS);
            return;
        }
        this.localStopAt = this.clock.now();
        this.host.log?.(`[AutoAnswer:simple] voice stop (${this.lastInterviewerInterim ? 'words in flight' : 'transcript caught up'}, ${this.pending.length} pending)`);
        // The dangling interim IS the stall case: start its clock from here.
        if (this.lastInterviewerInterim) {
            this.armStallCap();
            this.warmNextCandidate();
            return;
        }
        if (this.pending.length === 0) return;
        this.arm(ENDPOINT_CONFIRM_MS);
    }

    /**
     * The local voice detector saw the interviewer start talking again. A stop
     * the stall cap was counting on is over: frozen text now means a slow
     * transcriber mid-speech, not a finished speaker. Decisions not yet acted
     * on are void until the next stop: a verdict and a parked dispatch are
     * dropped, so the question is judged once, after the interviewer finishes.
     *
     * An answer already dispatched is left alone (as in the shipped 3.1.0
     * engine). A voice start carries no words: a cough, "mm-hmm" or "take your
     * time" used to cancel the answer the user was reading, and clearing the
     * in-flight request made its completion unrecorded, so the same question
     * was answered again with the next remark. That answer still settles its
     * own words; anything said after it is judged on its own.
     */
    onLocalSpeechStart(): void {
        if (!this.host.isEnabled() || !this.host.isMeetingActive()) return;
        this.speechStartsSeen = true;
        this.interviewerSpeaking = true;
        this.armSpeakingTimer();
        this.localStopAt = 0;
        this.clearStallCap();
        this.disarm();
        this.dropParked();
        this.held = null;
        this.lastJudgedKey = '';
        this.bumpJudgeSeq('speech_resumed');
    }

    ingest(segment: TranscriptSegment & { speaker: string; final: boolean }): void {
        if (!this.host.isEnabled() || !this.host.isMeetingActive()) return;
        const text = (segment.text ?? '').trim();
        const now = this.clock.now();

        if (segment.speaker === 'interviewer') {
            // Words are arriving: the interviewer really is talking.
            if (text && this.interviewerSpeaking) this.armSpeakingTimer();
            if (!segment.final) {
                // Still talking: every interim pushes the stoppage out — and
                // supersedes any in-flight verdict (review 2026-08-25: a
                // verdict resolving after the interviewer RESUMED must not
                // dispatch mid-sentence; the next stoppage re-judges).
                if (this.pending.length > 0 || text) {
                    if (text) {
                        // The transcript moved again: a promoted stand-in is stale.
                        this.dropProvisional();
                        this.promotedInterim = null;
                        this.bumpJudgeSeq('interim');
                        if (!this.lastInterviewerInterim) this.utteranceStartAt = now;
                        this.lastInterviewerAt = now;
                        this.lastInterviewerInterim = text;
                        this.lastInterviewerSpeaker = (segment as { speakerId?: string }).speakerId;
                        this.armStallCap();
                    }
                    this.arm(STABILITY_MS);
                }
                return;
            }
            if (!text) return;
            this.punctuationGuaranteed = (segment as { punctuationSource?: string }).punctuationSource === 'provider' ||
                (segment as { punctuationSource?: string }).punctuationSource === 'provider_final';
            const speaker = (segment as { speakerId?: string }).speakerId;
            if (speaker !== undefined && speaker !== null) {
                const key = normalizeForCompare(text);
                // Identical words from different speakers cannot label older turns reliably.
                this.speakerByTurn.set(key, !this.speakerByTurn.has(key) || this.speakerByTurn.get(key) === speaker ? speaker : undefined);
                if (this.speakerByTurn.size > 64) {
                    const oldest = this.speakerByTurn.keys().next().value;
                    if (oldest !== undefined) this.speakerByTurn.delete(oldest);
                }
            }
            if (this.absorbStalledFinal(text, now, speaker)) return;
            this.clearStallCap();
            this.promotedInterim = null;
            // Decide the seam NOW: the interim this final was cut from is still
            // in hand, and it is gone as soon as the next one arrives.
            const glueNext = isMidWordCut(text, this.lastInterviewerInterim);
            this.lastInterviewerInterim = '';
            this.pending.push({ text, at: now, speaker, glueNext });
            this.bumpJudgeSeq('final');  // supersede any in-flight verdict: it judged less than this
            this.lastInterviewerAt = now;
            this.arm(STABILITY_MS);
            return;
        }

        // ── user channel: INERT (user decision 2026-09-03) ────────────────
        // The user starts answering as soon as the question lands. Their
        // speech must not cancel the stream, clear the candidate, or drop a
        // parked / deferred verdict — the answer is wanted precisely while
        // they are talking. Nothing to do on this channel.
    }

    private armSpeakingTimer(): void {
        this.clearSpeakingTimer();
        this.speakingTimer = this.clock.setTimeout(() => {
            this.speakingTimer = null;
            if (!this.interviewerSpeaking) return;
            this.host.log?.(`[AutoAnswer:simple] no voice stop after ${SPEAKING_STALE_MS}ms of silence from the transcript: treating it as lost`);
            // An untrusted stop: it only restarts the full quiet window.
            this.onLocalSpeechEnd(false);
        }, SPEAKING_STALE_MS);
    }

    private clearSpeakingTimer(): void {
        if (this.speakingTimer !== null) { this.clock.clearTimeout(this.speakingTimer); this.speakingTimer = null; }
    }

    // ── the stoppage ──────────────────────────────────────────────────────

    private arm(ms: number): void {
        this.disarm();
        this.timer = this.clock.setTimeout(() => { this.timer = null; this.onStoppage(false); }, ms);
        // The early ASK rides the same re-arm, so continuing speech pushes it
        // out exactly as it pushes out the commit.
        const early = Math.min(EARLY_JUDGE_MS, ms);
        this.earlyTimer = this.clock.setTimeout(() => { this.earlyTimer = null; this.onStoppage(true); }, early);
    }

    private disarm(): void {
        if (this.timer !== null) { this.clock.clearTimeout(this.timer); this.timer = null; }
        if (this.earlyTimer !== null) { this.clock.clearTimeout(this.earlyTimer); this.earlyTimer = null; }
    }

    private onStoppage(early: boolean): void {
        // Never while the interviewer is talking, nor while an answer for these
        // words is still in flight (it settles and re-arms for anything newer).
        if (!this.host.isEnabled() || !this.host.isMeetingActive() || this.interviewerSpeaking || this.dispatchInFlight) return;
        // Words still in flight as an interim: their final is coming and re-arms.
        if (this.lastInterviewerInterim && !this.pending.some(p => p.provisional)) return;
        const now = this.clock.now();
        if (now - this.lastAnsweredAt > STALL_ANSWERED_TTL_MS) {
            this.lastAnsweredText = null;
            this.lastAnsweredAt = 0;
        }
        const before = this.pending.length;
        this.pending = this.pending.filter(p => now - p.at <= PENDING_MAX_AGE_MS);
        // Finals arrive in time order, so aged-out ones are always a prefix.
        this.judgedParts = Math.max(0, this.judgedParts - (before - this.pending.length));
        if (this.pending.length === 0) return;
        const candidate = joinTranscriptParts(this.pending);
        const key = normalizeForCompare(candidate);
        const words = candidate.split(/\s+/).filter(Boolean).length;

        // A verdict this candidate already earned, deferred because transcript
        // kept arriving. Checked BEFORE the lastJudgedKey return: an INTERIM
        // supersede leaves the candidate byte-identical, so that return would
        // otherwise swallow the very case this exists for.
        const heldReady = early ? null : this.applicableHeld(key, now);
        if (heldReady) {
            this.held = null;
            this.lastJudgedKey = key;
            this.emit({
                name: 'auto_answer_judged', questionId: heldReady.id, judgeOutcome: 'held_applied',
                judgeMs: now - heldReady.at, dialogueAct: heldReady.act, answerability: heldReady.answerability,
            });
            this.host.log?.(`[AutoAnswer:simple] applying the deferred verdict for ${heldReady.id}`);
            this.host.logContent?.(`deferred verdict applied ${heldReady.id} (a=${heldReady.answerability})`, heldReady.text);
            this.deliver(heldReady.id, heldReady.text, heldReady.answerability, heldReady.act, now);
            return;
        }

        // Zero-cost prefilter — the ONLY heuristics left in the hot path.
        if (key === this.lastJudgedKey) return;                     // verdict already stands
        // A short candidate waits for more speech unless it already looks
        // like a question: a literal '?' (always positive evidence) or an
        // interrogative lead (which needs no punctuation, per the
        // punctuationProvenance absence-is-NEUTRAL contract).
        // Only text with no letter or digit is too short to judge: the judge
        // reads short asks ("Why?", "And Kafka?") better than a word count.
        const tooShort = !/[\p{L}\p{N}]/u.test(candidate);
        if (tooShort) {
            this.emit({ name: 'auto_answer_ignored', skipReason: 'incomplete', candidateWordCount: words });
            return;
        }
        if (USER_BACKCHANNEL.test(candidate)) {
            this.emit({ name: 'auto_answer_ignored', skipReason: 'backchannel', candidateWordCount: words });
            return;
        }
        if (this.lastAnsweredText && now - this.lastAnsweredAt <= STALL_ANSWERED_TTL_MS && normalizeForCompare(this.lastAnsweredText) === key) {
            this.emit({ name: 'auto_answer_ignored', skipReason: 'duplicate' });
            return;
        }

        const id = `${this.host.meetingGeneration()}-q${++this.sequence}`;
        this.emit({
            name: 'auto_answer_candidate', questionId: id,
            candidateWordCount: words, endpointSource: this.pending.some(p => p.provisional) ? 'stt_stall' : 'quiet_window',
        });
        this.lastJudgedKey = key;
        // Whether the judge can tell an ask to the USER from one to a named
        // teammate. Known/unknown only: the trace never prints the name.
        this.host.logContent?.(`judging ${id} (${words}w, user name ${this.host.userName?.() ? 'known' : 'unknown'})`, candidate);
        // Key any speculation the engine starts on its own interims to THIS
        // candidate, so the dispatch below can claim it by id.
        this.host.noteCandidate?.(id, this.sequence);
        this.maybePrefetch(id, candidate, this.unjudgedText(), now);
        void this.consult(id, candidate, now, early);
    }

    /** The finals no verdict has ruled on yet — where a new ask's shape is read. */
    private unjudgedText(): string {
        return joinTranscriptParts(this.pending.slice(Math.min(this.judgedParts, this.pending.length)));
    }

    /**
     * The held verdict, if it still applies to this candidate: same text, or
     * the same text plus a little more speech. Anything else (a revision that
     * broke the prefix, a long continuation, an old verdict) is dropped here
     * so the stoppage judges afresh.
     */
    private applicableHeld(key: string, now: number): NonNullable<SimpleAutoAnswerEngine['held']> | null {
        const h = this.held;
        if (!h) return null;
        if (now - h.at > HELD_MAX_AGE_MS) { this.held = null; return null; }
        if (key !== h.key) { this.held = null; return null; }   // see the note on HELD_MAX_AGE_MS
        return h;
    }

    /**
     * Start the answer while the judge is still deciding. Rationed by time, so
     * a declarative task gets the same head start as a question mark — see
     * PREFETCH_MIN_INTERVAL_MS. The engine applies its own guards on top (idle
     * only, never over a live stream or an existing speculation), so this can
     * be optimistic without stacking generations.
     */
    private maybePrefetch(id: string, candidate: string, unjudged: string, now: number): void {
        if (!this.host.prefetchAnswer) return;
        // Question-shaped asks, and report-shaped ones (isReportShaped), always
        // get the head start; everything else is
        // rationed by time. See PREFETCH_MIN_INTERVAL_MS for why both exist.
        // The shape is read from the unjudged finals only (see judgedParts).
        const rationed = this.lastPrefetchAt !== null && now - this.lastPrefetchAt < PREFETCH_MIN_INTERVAL_MS;
        if (rationed && !isQuestionShaped(unjudged) && !isReportShaped(unjudged)) return;
        this.lastPrefetchAt = now;
        try {
            this.host.prefetchAnswer(id, candidate);
        } catch { /* prefetch is an optimisation; never break the pipeline */ }
    }

    private async consult(id: string, candidate: string, committedAt: number, early = false): Promise<void> {
        const seq = this.judgeSeq;
        const generation = this.host.meetingGeneration();
        let timer: ClockTimer | null = null;
        let timedOut = false;
        const turns = this.turnsBefore(committedAt);
        const parts = this.pending.map(p => ({ speaker: p.speaker, text: p.text }));
        const partsAtConsult = this.pending.length;
        const unjudged = this.unjudgedText();
        const ruledOut = joinTranscriptParts(this.pending.slice(0, Math.min(this.judgedParts, this.pending.length)));
        // Judged on a promoted interim. If its real final replaces it while
        // this call is out and the verdict then says "unfinished" or fails,
        // the real words must still be judged: nothing else will re-arm.
        const onStandIn = this.pending.some(p => p.provisional);
        const standInReplaced = () => onStandIn && !this.pending.some(p => p.provisional);
        let raw: string | null = null;
        let outcome: 'verdict' | 'timeout' | 'error' | 'unparseable' | 'absent' = 'verdict';
        if (!this.host.judgeCandidate) {
            outcome = 'absent';
        } else {
            // One controller per consult. bumpJudgeSeq() aborts it when newer
            // speech supersedes this verdict; a deadline also aborts it — the
            // controller has stopped waiting, so the provider may stop working.
            const abort = new AbortController();
            this.judgeAbort = abort;
            try {
                raw = await Promise.race([
                    this.host.judgeCandidate({
                        candidateText: candidate,
                        recentTurns: turns,
                        speakers: turns.map(t => (t.role === 'interviewer' ? this.speakerByTurn.get(normalizeForCompare(t.text)) : undefined)),
                        candidateParts: parts,
                        modeName: this.host.modeName?.() ?? null,
                        questionId: id,
                        lastAnsweredText: this.lastAnsweredText,
                        lastAnsweredAgeMs: this.lastAnsweredText ? this.clock.now() - this.lastAnsweredAt : null,
                        userName: this.host.userName?.() ?? null,
                        ...(this.pending.some(p => p.provisional) ? { transcriptLagging: true } : {}),
                    }, abort.signal),
                    new Promise<null>((resolve) => {
                        timer = this.clock.setTimeout(() => { timedOut = true; resolve(null); }, JUDGE_DEADLINE_MS);
                    }),
                ]);
                if (timedOut) { outcome = 'timeout'; try { abort.abort(); } catch { /* noop */ } }
            } catch {
                outcome = 'error';
            } finally {
                if (timer !== null) this.clock.clearTimeout(timer);
                if (this.judgeAbort === abort) this.judgeAbort = null;
            }
        }
        const judgeMs = this.clock.now() - committedAt;
        // Parse FIRST (it is pure and cheap), so that a verdict about to be
        // discarded still reaches telemetry. Live run 2026-08-25: 25 of 28
        // verdicts were dropped here and the record could not say whether a
        // single one of them had said 'answer'.
        const verdict = outcome === 'verdict' ? parseJudgeVerdict(raw, candidate) : null;
        // Superseded: more interviewer speech arrived, the meeting moved on.
        if (seq !== this.judgeSeq || !this.host.isMeetingActive() || this.host.meetingGeneration() !== generation) {
            this.emit({
                name: 'auto_answer_judged', questionId: id, judgeOutcome: 'stale', judgeMs,
                supersededBy: !this.host.isMeetingActive() ? 'meeting_ended'
                    : this.host.meetingGeneration() !== generation ? 'meeting_reset'
                    : (this.judgeSeqCause ?? undefined),
                ...(verdict ? {
                    judgeIsAsk: verdict.isAsk, judgeDirectedAtUser: verdict.directedAtUser,
                    dialogueAct: verdict.act, answerability: verdict.answerability,
                } : {}),
            });
            this.host.logContent?.(
                `superseded ${id} by ${this.judgeSeqCause ?? 'unknown'} after ${judgeMs}ms`
                + (verdict ? ` — it had said ${verdict.isAsk ? 'ASK' : 'not-ask'} a=${verdict.answerability}` : ''),
                candidate);
            // Discarded, not held: the words that superseded it may change the
            // question, and the next stoppage judges the whole of it.
            return;
        }
        if (!verdict) {
            if (outcome === 'verdict') outcome = 'unparseable';
            if (outcome !== 'absent') this.emit({ name: 'auto_answer_judged', questionId: id, judgeOutcome: outcome as 'timeout' | 'error' | 'unparseable', judgeMs });
            // A transient judge failure must not silence the question forever
            // (review 2026-08-25): clear the key so the next stoppage retries.
            this.lastJudgedKey = '';
            if (standInReplaced()) { this.arm(ENDPOINT_CONFIRM_MS); return; }
            // No verdict: fall back to the question's shape, as the shipped
            // 3.1.0 engine does. A judge outage (or a slow judge) otherwise
            // silenced every question for the whole interview. Half-finished
            // questions are kept out by the speaking guard in deliver(): no
            // dispatch while the interviewer is still talking.
            const fresh = sentencesOf(unjudged);
            const asked = /\?\s*$/.test(candidate) || fresh.some(s => /\?\s*$/.test(s));
            const interrogative = fresh.some(s => FALLBACK_INTERROGATIVE.test(s));
            if (asked || (!this.punctuationGuaranteed && interrogative)) {
                this.host.log?.(`[AutoAnswer:simple] judge ${outcome} — fallback dispatch`);
                this.deliver(id, candidate, 0.9, 'general_question', committedAt);
                return;
            }
            // Not shaped like a question: one more try, then let it go.
            if (outcome !== 'absent' && this.scheduleRecovery(candidate)) return;
            this.host.cancelAutomaticAnswer?.('judge_unavailable');
            this.emit({ name: 'auto_answer_ignored', questionId: id, skipReason: 'judge_unavailable', question: candidate });
            return;
        }
        this.emit({
            name: 'auto_answer_judged', questionId: id, judgeOutcome: 'verdict', judgeMs,
            judgeIsAsk: verdict.isAsk, judgeDirectedAtUser: verdict.directedAtUser,
            dialogueAct: verdict.act, answerability: verdict.answerability,
        });
        const route = routeForVerdict(verdict);
        this.host.logContent?.(
            `verdict ${id} → ${route.route === 'evaluate' ? route.action : route.route}`
            + ` (${verdict.act}, a=${verdict.answerability}, ${judgeMs}ms)`,
            route.route === 'evaluate' ? (route.questionText ?? candidate) : candidate);
        if (route.route !== 'evaluate') {
            const reason = route.route === 'wait_incomplete' ? 'incomplete' : route.reason;
            this.emit({ name: 'auto_answer_ignored', questionId: id, skipReason: reason, dialogueAct: verdict.act, answerability: verdict.answerability });
            if (route.route === 'wait_incomplete') {
                this.lastJudgedKey = '';   // more speech may finish it → re-judge then
                if (standInReplaced()) this.arm(ENDPOINT_CONFIRM_MS);   // …or its real final already has
            }
            // Ruled not an ask: these finals stay as context, but a later
            // ask's shape is read after them. An INCOMPLETE ask stays open.
            else this.judgedParts = partsAtConsult;
            return;
        }
        // The ask the judge picked lies wholly in finals an EARLIER verdict
        // ruled not an ask, and not in the new speech: someone replied to it,
        // and the reply made it look open. Live 2026-09-27 (team meet): "Raj,
        // can you make sure support knows…" was ruled silent (a request to a
        // teammate), then Raj's "Yes, I'll post in their channel" arrived, the
        // merged candidate was judged again, and the Raj request got answered.
        // An incomplete ask never counts as ruled out (judgedParts does not
        // advance on it), so speech that FINISHES a question is unaffected.
        const extractedKey = route.questionText ? ` ${normalizeForCompare(route.questionText)} ` : null;
        if (route.action === 'answer' && extractedKey && ruledOut
            && ` ${normalizeForCompare(ruledOut)} `.includes(extractedKey)
            && !` ${normalizeForCompare(unjudged)} `.includes(extractedKey)) {
            this.host.logContent?.(`ruled-out ask resurfaced ${id}`, route.questionText ?? candidate);
            this.emit({ name: 'auto_answer_ignored', questionId: id, skipReason: 'already_ruled_out', answerability: route.answerability });
            this.judgedParts = partsAtConsult;
            return;
        }
        // The whole of what the interviewer said is answered, not the judge's
        // extraction of it: the extraction drops context the answer needs.
        const text = candidate;
        // Answer or nothing. The judge decides, and the only number left in
        // the decision is ANSWER_FLOOR — the per-mode bars no longer gate a
        // dispatch, because the thing they used to demote to (the offer card)
        // is gone.
        if (route.action === 'answer' && route.answerability > ANSWER_FLOOR) {
            // An EARLY verdict was asked after EARLY_JUDGE_MS of quiet, which
            // is not enough to call the turn over. If the judge happened to be
            // fast enough that STABILITY_MS has still not elapsed, hold the
            // verdict — the commit timer is already armed and will apply it —
            // rather than answering into a breath. Usually the ~1.3 s judge has
            // outlasted the window on its own and this commits immediately.
            //
            // Only while that commit is still PENDING. A provider endpoint or the
            // local VAD can confirm the stop early (ENDPOINT_CONFIRM_MS), and that
            // commit runs while the judge is still out — it finds the key already
            // judged and returns. Holding after it has fired waited for a timer
            // that would never fire again: live 2026-09-27 (DeepSeek judge,
            // 0.66 s) an 'answer, a=0.9' verdict sat unapplied until the next
            // interviewer speech replaced the question.
            if (early && this.timer !== null && this.clock.now() - this.lastInterviewerAt < STABILITY_MS) {
                this.held = { id, key: normalizeForCompare(candidate), text, answerability: route.answerability, act: route.act, at: this.clock.now() };
                return;
            }
            this.deliver(id, text, route.answerability, route.act, committedAt);
        } else {
            this.emit({ name: 'auto_answer_ignored', questionId: id, skipReason: 'low_answerability', answerability: route.answerability });
            this.judgedParts = partsAtConsult;
        }
    }

    /** Dispatch now, or retry while the engine is busy — woken early by onEngineIdle. */
    private deliver(id: string, text: string, answerability: number, act: AutoAnswerQuestion['dialogueAct'], committedAt: number): void {
        const deadline = this.clock.now() + RETRY_TTL_MS;
        const seqAtDeliver = this.judgeSeq;
        const attempt = () => {
            if (!this.host.isEnabled() || !this.host.isMeetingActive() || this.interviewerSpeaking
                || this.judgeSeq !== seqAtDeliver || this.dispatchInFlight) {
                // Live session 2026-09-03 (13-q6): a verdict of 1.0 was parked
                // behind the engine's own prefetch, the next candidate bumped
                // the sequence, and this branch exited with nothing — no
                // telemetry, no log, no answer. A park was armed, so its death
                // is an outcome and must be reported like every other one.
                // Identity, not mere presence: deliver() arms a new retry timer
                // without clearing the previous one, so a stale attempt closure
                // can still fire while a NEWER, still-valid dispatch holds the
                // park. Nulling that one here would cost it its onEngineIdle
                // fast-wake and mis-attribute the drop to the wrong question.
                const wasParked = this.parkedAttempt === attempt;
                if (wasParked) this.parkedAttempt = null;
                if (wasParked) {
                    const reason = this.host.isMeetingActive() ? 'superseded_while_parked' : 'meeting_inactive';
                    this.host.log?.(`[AutoAnswer:simple] parked dispatch for ${id} dropped: ${reason}${reason === 'superseded_while_parked' ? ` (by ${this.judgeSeqCause ?? 'unknown'})` : ''}`);
                    this.emit({ name: 'auto_answer_ignored', questionId: id, skipReason: reason, answerability });
                }
                return;
            }
            if (!this.host.engineAccepting()) {
                // Behind a manual answer the park outlives RETRY_TTL_MS (see
                // MANUAL_PARK_MAX_MS); onEngineIdle wakes it when that ends.
                const until = this.manualActive ? Math.max(deadline, committedAt + MANUAL_PARK_MAX_MS) : deadline;
                if (this.clock.now() >= until) {
                    this.parkedAttempt = null;
                    this.emit({ name: 'auto_answer_ignored', questionId: id, skipReason: 'engine_busy_or_cooling', question: text });
                    return;
                }
                this.parkedAttempt = attempt;
                this.retryTimer = this.clock.setTimeout(attempt, RETRY_MS);
                return;
            }
            this.parkedAttempt = null;
            const q = this.question(id, text, answerability, act, committedAt);
            // If the engine already has an answer in flight for THIS question
            // (our prefetch, or its own interim speculation keyed by
            // noteCandidate), adopt it instead of starting over — that is the
            // whole point of prefetching.
            const snapshot = this.host.speculativeSnapshot?.();
            const reuseSpeculative = Boolean(snapshot && snapshot.questionId === id && snapshot.text);
            const promoted = this.pending.find(p => p.provisional);
            const request: NonNullable<SimpleAutoAnswerEngine['dispatchInFlight']> = {
                id, parts: [...this.pending],
                stalled: promoted ? { text: promoted.text, speaker: promoted.speaker } : null,
                meetingGeneration: this.host.meetingGeneration(),
            };
            // The candidate stays pending until the answer settles: a failed
            // or cancelled answer leaves these words to be judged again.
            this.dispatchInFlight = request;
            this.emit({ name: 'auto_answer_decision', questionId: id, action: 'auto', answerability });
            if (reuseSpeculative) this.host.log?.(`[AutoAnswer:simple] reusing the prefetched answer for ${id}`);
            void Promise.resolve().then(() => {
                if (this.dispatchInFlight !== request || this.judgeSeq !== seqAtDeliver || !this.host.isEnabled()
                    || !this.host.isMeetingActive() || this.host.meetingGeneration() !== request.meetingGeneration) {
                    return { status: 'cancelled' } as AutoAnswerDispatchResult;
                }
                return this.host.dispatch(q, { reuseSpeculative });
            }).catch((): AutoAnswerDispatchResult => ({ status: 'failed' })).then((result) => {
                if (this.dispatchInFlight !== request || this.host.meetingGeneration() !== request.meetingGeneration) return;
                this.dispatchInFlight = null;
                this.lastJudgedKey = '';
                const status = dispatchStatus(result);
                const outcome = result as AutoAnswerDispatchResult | undefined;
                // 'partial': part of the answer was shown. The engine keeps its
                // cooldown for it too; answering these words again would put a
                // second card under the first.
                if (status === 'completed' || status === 'partial') {
                    this.settleParts(request, text, true);
                    this.armFeedback(id, act, answerability);
                    return;
                }
                // A manual press took over while this answer was in flight. The
                // user asked for that answer instead, so these words are not
                // answered again afterwards.
                if (request.handedOver) {
                    this.settleParts(request, text, true);
                    this.emit({ name: 'auto_answer_ignored', questionId: id, skipReason: 'dispatch_cancelled', question: text });
                    return;
                }
                if (status === 'skipped') {
                    // An earlier automatic answer still held the engine: nothing
                    // was decided about this question, so it is sent again.
                    if (outcome?.reason === 'busy') {
                        if (this.scheduleRecovery(text)) return;
                        this.emit({ name: 'auto_answer_ignored', questionId: id, skipReason: 'engine_busy_or_cooling', question: text });
                        this.giveUpParts(request, text);
                        return;
                    }
                    // A decision about these words (the planner stayed silent, or
                    // a manual answer owns them): they are done. Kept pending,
                    // they joined the next question and were answered with it.
                    this.settleParts(request, text, outcome?.reason === 'already_answered');
                    this.emit({
                        name: 'auto_answer_ignored', questionId: id,
                        skipReason: outcome?.reason === 'already_answered' ? 'already_answered' : 'dispatch_declined',
                        question: text,
                    });
                    return;
                }
                if (status === 'cancelled') {
                    // Cancelled before it was shown (transcript revised, Auto
                    // Answer turned off): these words are judged again.
                    this.emit({ name: 'auto_answer_ignored', questionId: id, skipReason: 'dispatch_cancelled', question: text });
                    return;
                }
                const retryable = outcome?.retryable !== false;
                if (retryable && this.scheduleRecovery(text)) return;
                this.emit({ name: 'auto_answer_ignored', questionId: id, skipReason: 'dispatch_failed', question: text });
                this.giveUpParts(request, text);
            });
        };
        attempt();
    }

    /**
     * The words a dispatch carried are done with: answered, handed to a manual
     * answer, or deliberately not answered. They leave `pending`, so they never
     * join the next question. Newer words that arrived meanwhile stay and get
     * their own quiet window.
     */
    private settleParts(request: NonNullable<SimpleAutoAnswerEngine['dispatchInFlight']>, text: string, answered: boolean): void {
        this.clearRecovery();
        if (answered) {
            this.lastAnsweredText = text;
            this.lastAnsweredAt = this.clock.now();
            this.stallAnswered = this.stallAnswered.filter(record => this.clock.now() - record.at <= STALL_ANSWERED_TTL_MS);
            if (request.stalled) this.stallAnswered.push({ ...request.stalled, at: this.clock.now() });
            this.stallAnswered = this.stallAnswered.slice(-64);
        }
        this.pending = this.pending.filter(part => !request.parts.includes(part));
        this.judgedParts = 0;
        if (this.pending.length && !this.interviewerSpeaking) this.arm(STABILITY_MS);
    }

    /**
     * Auto Answer gave up on these words (the retry was used). While the
     * interviewer is still talking they stay, to be judged with the rest of
     * the question; otherwise they are dropped so the next question is not
     * answered together with an old one.
     */
    private giveUpParts(request: NonNullable<SimpleAutoAnswerEngine['dispatchInFlight']>, text: string): void {
        if (this.interviewerSpeaking) return;
        this.settleParts(request, text, false);
    }

    /**
     * Judge or answer failed: try the same words once more after RETRY_MS.
     * One retry per candidate; any new speech (bumpJudgeSeq) cancels it.
     * Returns false when no retry was scheduled.
     */
    private scheduleRecovery(text: string): boolean {
        const key = normalizeForCompare(text);
        if (this.recovery?.key === key) return false;
        if (!this.host.isEnabled() || !this.host.isMeetingActive() || this.interviewerSpeaking) return false;
        const seq = this.judgeSeq;
        const generation = this.host.meetingGeneration();
        this.disarm();
        this.recovery = { key };
        this.emit({ name: 'auto_answer_retrying', question: text });
        this.recoveryTimer = this.clock.setTimeout(() => {
            this.recoveryTimer = null;
            if (seq !== this.judgeSeq || generation !== this.host.meetingGeneration() || !this.host.isEnabled() || !this.host.isMeetingActive()) return;
            this.lastJudgedKey = '';
            this.onStoppage(false);
        }, RETRY_MS);
        return true;
    }

    private clearRecovery(): void {
        if (this.recoveryTimer !== null) this.clock.clearTimeout(this.recoveryTimer);
        this.recoveryTimer = null;
        this.recovery = null;
    }

    private question(id: string, text: string, answerability: number, act: AutoAnswerQuestion['dialogueAct'], committedAt: number): AutoAnswerQuestion {
        const now = this.clock.now();
        return {
            id, text,
            confidence: answerability, answerability, completionConfidence: 1,
            dialogueAct: act,
            isFollowUp: act === 'follow_up_question', followUpTarget: '',
            startedAt: this.pending[0]?.at ?? committedAt, lastUpdatedAt: now, committedAt,
            endpointSource: 'quiet_window',
            sourceSegments: this.pending.map(p => p.at),
            candidateGeneration: this.sequence,
            meetingGeneration: this.host.meetingGeneration(),
        };
    }

    private turnsBefore(cutoff: number): TranscriptTurn[] {
        // Judge context: the hot window minus the pending finals themselves.
        const pendingSet = new Set(this.pending.map(p => normalizeForCompare(p.text)));
        return this.host.recentTurns()
            .filter(t => !(t.role === 'interviewer' && pendingSet.has(normalizeForCompare(t.text))))
            .slice(-JUDGE_CONTEXT_TURNS);
    }

    /**
     * A manual What-to-Answer started. Inside the feedback window that is the
     * user telling us the automatic answer missed; the offer card (if any) is
     * committed either way.
     */
    onManualAnswerStarted(): number {
        const pressId = ++this.manualPressSeq;
        // A newer press replaces an older one's unsettled handover (the older
        // press's settle is then ignored), and any wait for that settle.
        this.clearSettleWait();
        // The manual answer owns the screen now: nothing judged, parked or
        // dispatched before the press goes out after it.
        this.disarm();
        this.dropParked();
        // An automatic answer in flight is NOT forgotten here: forgetting it
        // ignored how it ended, so a shown answer was never recorded and its
        // words were answered a second time. It is marked handed over instead;
        // when it settles, its words are done with whether it was shown or cut.
        if (this.dispatchInFlight) this.dispatchInFlight.handedOver = true;
        this.manualActive = true;
        this.lastJudgedKey = '';
        this.held = null;
        this.bumpJudgeSeq('manual_answer');
        const pending = this.feedbackPending;
        if (!pending) return pressId;
        this.clearFeedback();
        const feedbackMs = this.clock.now() - pending.at;
        this.emit({
            name: 'auto_answer_feedback', questionId: pending.id, feedback: 'superseded', feedbackMs,
            dialogueAct: pending.act, answerability: pending.answerability,
        });
        this.host.log?.(`[AutoAnswer:simple] superseded by a manual answer after ${feedbackMs}ms`);
        return pressId;
    }

    /**
     * A manual press is answering what the interviewer just said: the question
     * is handed over to it. Whatever this engine still held for that question
     * — a dispatch parked behind the busy engine, a verdict deferred or still
     * being judged, the pending candidate itself — is dropped, so it is never
     * dispatched after the manual answer as a second answer to one question.
     * The candidate is remembered as answered, so the judge is told and a
     * restatement of it is not dispatched either. Speech that arrives after
     * the press starts a new candidate as usual.
     */
    onManualSpokenAnswer(): void {
        const candidate = this.pending.length > 0 ? joinTranscriptParts(this.pending) : '';
        const hadWork = Boolean(candidate) || this.parkedAttempt !== null || this.held !== null || this.judgeAbort !== null;
        // Read BEFORE anything is cleared: was the interviewer mid-question?
        const unfinished = this.interviewerSpeaking || Boolean(this.lastInterviewerInterim);
        this.dropParked();
        this.disarm();
        this.held = null;
        this.bumpJudgeSeq('manual_answer');
        // Provisional until the manual answer settles (onManualAnswerSettled):
        // while it streams, a restatement of these words is not dispatched.
        if (candidate) { this.lastAnsweredText = candidate; this.lastAnsweredAt = this.clock.now(); }
        this.manualHandoff = candidate
            ? { candidate, pressId: this.manualPressSeq, parts: [...this.pending], at: this.clock.now(), unfinished, meetingGeneration: this.host.meetingGeneration() }
            : null;
        // A stalled interim stood in for its final: that late final is the
        // same question, already handed over (see absorbStalledFinal).
        const promoted = this.pending.find(p => p.provisional);
        if (promoted) this.stallAnswered = [...this.stallAnswered, { text: promoted.text, speaker: promoted.speaker, at: this.clock.now() }].slice(-64);
        this.pending = [];
        this.judgedParts = 0;
        this.lastJudgedKey = '';
        if (hadWork) this.host.log?.('[AutoAnswer:simple] the question was handed over to a manual answer');
    }

    /**
     * The manual answer ended. Only now is the handed-over question decided:
     * - failed / cancelled / empty: it was NOT answered, so its words go back
     *   to Auto Answer (ahead of anything said since) and are judged again;
     * - answered, but pressed while the interviewer was still talking and they
     *   went on with words the answer did not cover: the answer covered only
     *   the start, so the whole question is judged again (as one candidate);
     * - answered otherwise: the question it answered is remembered as answered.
     * `answeredQuestion` is what the manual answer actually answered (it may
     * include an interim the candidate did not have).
     */
    onManualAnswerSettled(outcome: { answered: boolean; answeredQuestion?: string; pressId?: number }): void {
        // An older press settling after a newer one started: the newer press
        // owns the state (its handover, its running answer). Leave it alone.
        if (outcome.pressId !== undefined && outcome.pressId !== this.manualPressSeq) return;
        this.manualActive = false;
        this.clearSettleWait();
        const handoff = this.manualHandoff;
        this.manualHandoff = null;
        if (!handoff || handoff.meetingGeneration !== this.host.meetingGeneration() || !this.host.isMeetingActive()) {
            this.wakeParked();
            return;
        }
        // An automatic answer already went out for something newer: leave it be.
        if (this.dispatchInFlight) {
            if (outcome.answered) this.rememberAnswered(outcome.answeredQuestion?.trim() || handoff.candidate);
            else if (this.lastAnsweredText === handoff.candidate) { this.lastAnsweredText = null; this.lastAnsweredAt = 0; }
            return;
        }
        const now = this.clock.now();
        // Everything pending now was said after the press (the handover took the rest).
        const later = this.pending.filter(p => !handoff.parts.includes(p));
        const answeredText = outcome.answeredQuestion?.trim() || handoff.candidate;
        if (outcome.answered) {
            const covered = (p: { text: string }) => tokenContainment(p.text, answeredText) >= MANUAL_COVERED_CONTAINMENT;
            const continued = handoff.unfinished && later.some(p => !covered(p));
            if (!continued) {
                this.rememberAnswered(answeredText);
                // The interviewer only finished the words the answer already
                // covered: that tail is the answered question, not a new one.
                if (handoff.unfinished && later.length > 0) {
                    this.pending = this.pending.filter(p => !later.includes(p));
                    this.judgedParts = 0;
                    this.lastJudgedKey = '';
                    this.held = null;
                    this.dropParked();
                    this.bumpJudgeSeq('manual_answer');
                    if (this.pending.length === 0) this.disarm();
                }
                // Something newer was parked behind the press: it goes now.
                this.wakeParked();
                return;
            }
            this.host.log?.('[AutoAnswer:simple] the interviewer finished the question after the manual press: judging the whole question');
        } else {
            this.host.log?.('[AutoAnswer:simple] the manual answer did not complete: the question goes back to Auto Answer');
        }
        if (this.lastAnsweredText === handoff.candidate) { this.lastAnsweredText = null; this.lastAnsweredAt = 0; }
        // Give the handed-over words back, ahead of what was said since, within the usual age bound.
        const restored = handoff.parts.filter(p => now - p.at <= PENDING_MAX_AGE_MS && !this.pending.includes(p));
        this.pending = [...restored, ...this.pending];
        this.judgedParts = 0;
        this.lastJudgedKey = '';
        this.held = null;
        this.dropParked();
        this.bumpJudgeSeq('manual_answer');
        if (this.pending.length > 0 && !this.interviewerSpeaking) this.arm(ENDPOINT_CONFIRM_MS);
    }

    private rememberAnswered(text: string): void {
        if (!text) return;
        this.lastAnsweredText = text;
        this.lastAnsweredAt = this.clock.now();
    }

    private armFeedback(id: string, act: AutoAnswerQuestion['dialogueAct'], answerability: number): void {
        this.clearFeedback();
        this.feedbackPending = { id, at: this.clock.now(), act, answerability };
        this.feedbackTimer = this.clock.setTimeout(() => {
            const pending = this.feedbackPending;
            this.feedbackTimer = null;
            this.feedbackPending = null;
            if (!pending) return;
            this.emit({
                name: 'auto_answer_feedback', questionId: pending.id, feedback: 'kept',
                dialogueAct: pending.act, answerability: pending.answerability,
            });
        }, FEEDBACK_WINDOW_MS);
    }

    private clearFeedback(): void {
        if (this.feedbackTimer !== null) { this.clock.clearTimeout(this.feedbackTimer); this.feedbackTimer = null; }
        this.feedbackPending = null;
    }

    private clearRetry(): void {
        if (this.retryTimer !== null) { this.clock.clearTimeout(this.retryTimer); this.retryTimer = null; }
    }

    private dropParked(): void { this.parkedAttempt = null; this.clearRetry(); }

    /**
     * Hand the host the candidate-to-be: the pending finals plus the interim
     * whose final is still in flight. The final usually adds one word to it, so
     * work keyed on this text (the query embedding) is reusable ~0.7 s early.
     */
    private warmNextCandidate(): void {
        if (!this.host.warmQuery || !this.host.isMeetingActive()) return;
        try {
            const parts = [...this.pending.filter(p => !p.provisional), { text: this.lastInterviewerInterim }];
            this.host.warmQuery(joinTranscriptParts(parts));
        } catch { /* an optimisation; never break the pipeline */ }
    }

    // ── the stall cap (STALL_PROMOTE_MS) ─────────────────────────────────

    private clearStallCap(): void {
        if (this.stallTimer !== null) { this.clock.clearTimeout(this.stallTimer); this.stallTimer = null; }
    }

    private armStallCap(): void {
        this.clearStallCap();
        const from = Math.max(this.lastInterviewerAt, this.localStopAt);
        const wait = Math.max(0, from + STALL_PROMOTE_MS - this.clock.now());
        this.stallTimer = this.clock.setTimeout(() => { this.stallTimer = null; this.promoteStalledInterim(); }, wait);
    }

    /**
     * The interim has been frozen STALL_PROMOTE_MS after the speaker stopped:
     * judge it as if it were the final. Never while they are still talking
     * (no voice-detector stop since this utterance began, or a start after it).
     */
    private promoteStalledInterim(): void {
        if (!this.host.isEnabled() || !this.host.isMeetingActive()) return;
        const interim = this.lastInterviewerInterim;
        if (!interim || interim === this.promotedInterim || this.pending.some(p => p.provisional)) return;
        if (this.localStopAt === 0) return;
        if (!this.speechStartsSeen && this.localStopAt < this.utteranceStartAt) return;
        const now = this.clock.now();
        const frozenFor = now - Math.max(this.lastInterviewerAt, this.localStopAt);
        if (frozenFor < STALL_PROMOTE_MS) { this.armStallCap(); return; }
        this.pending.push({ text: interim, at: this.lastInterviewerAt, speaker: this.lastInterviewerSpeaker, provisional: true });
        this.promotedInterim = interim;
        this.host.log?.(`[AutoAnswer:simple] transcript stalled ${now - this.lastInterviewerAt}ms after the speaker stopped: judging the last interim`);
        this.host.logContent?.('stalled interim promoted', interim);
        this.disarm();
        this.onStoppage(false);
    }

    /** Take the stand-in out of the candidate (the transcript moved, or the final said something else). */
    private dropProvisional(): void {
        const i = this.pending.findIndex(p => p.provisional);
        if (i < 0) return;
        // The answer in flight was for words the transcript has now revised.
        if (this.dispatchInFlight?.parts.includes(this.pending[i])) {
            this.dispatchInFlight = null;
            this.host.cancelAutomaticAnswer?.('transcript_revised');
        }
        this.pending.splice(i, 1);
        this.judgedParts = Math.min(this.judgedParts, this.pending.length);
    }

    /**
     * A final arrived after its interim was promoted. If it is the same
     * utterance, it takes the stand-in's place without superseding the verdict
     * already given or in flight (that verdict was about these words), and if
     * the stand-in was already answered, it is not answered twice. Returns true
     * when the final was absorbed.
     */
    private absorbStalledFinal(text: string, now: number, speaker: string | undefined): boolean {
        this.stallAnswered = this.stallAnswered.filter(record => now - record.at <= STALL_ANSWERED_TTL_MS);
        const sameSpeaker = (record: { speaker?: string }) => record.speaker == null || speaker == null || record.speaker === speaker;
        const answered = this.stallAnswered.find(record => sameSpeaker(record) && isSameUtterance(record.text, text));
        if (answered) {
            if (isSameUtterance(this.lastInterviewerInterim, text) && sameSpeaker({ speaker: this.lastInterviewerSpeaker })) {
                this.lastInterviewerInterim = '';
                this.clearStallCap();
            }
            this.host.log?.('[AutoAnswer:simple] a delayed final repeats an answered interim: not answering it again');
            return true;
        }
        const i = this.pending.findIndex(p => p.provisional);
        if (i >= 0) {
            if (!sameSpeaker(this.pending[i])) return false;
            if (!isSameUtterance(this.pending[i].text, text)) { this.dropProvisional(); return false; }
            const before = normalizeForCompare(joinTranscriptParts(this.pending));
            // In place: the answer in flight holds this part by identity.
            Object.assign(this.pending[i], { text, ...(speaker != null ? { speaker } : {}) });
            delete this.pending[i].provisional;
            const after = normalizeForCompare(joinTranscriptParts(this.pending));
            this.lastInterviewerInterim = '';
            this.clearStallCap();
            this.promotedInterim = null;
            if (this.held?.key === before) this.held.key = after;
            if (this.lastJudgedKey === before) this.lastJudgedKey = after;
            // Not judged (or its judge failed, or it was incomplete): judge the real words now.
            else this.arm(ENDPOINT_CONFIRM_MS);
            this.host.log?.('[AutoAnswer:simple] the stalled final arrived: it replaces the promoted interim');
            return true;
        }
        return false;
    }

    private reset(): void {
        this.dispatchInFlight = null;
        this.disarm();
        this.dropParked();
        this.clearFeedback();
        this.pending = [];
        this.judgedParts = 0;
        this.lastInterviewerInterim = '';
        this.lastInterviewerAt = 0;
        this.utteranceStartAt = 0;
        this.localStopAt = 0;
        this.clearStallCap();
        this.stallAnswered = [];
        this.interviewerSpeaking = false;
        this.clearSpeakingTimer();
        this.lastInterviewerSpeaker = undefined;
        this.promotedInterim = null;
        this.speechStartsSeen = false;
        this.speakerByTurn.clear();
        this.lastJudgedKey = '';
        this.lastAnsweredText = null;
        this.lastAnsweredAt = 0;
        this.manualActive = false;
        this.manualHandoff = null;
        this.clearSettleWait();
        this.lastPrefetchAt = null;
        this.held = null;
        this.bumpJudgeSeq('meeting_reset');
        this.sequence = 0;
    }

    private emit(event: Omit<AutoAnswerTelemetryEvent, 'meetingGeneration'>): void {
        try {
            this.host.telemetry?.({ ...event, meetingGeneration: this.host.meetingGeneration() } as AutoAnswerTelemetryEvent);
        } catch { /* telemetry must never break the pipeline */ }
        if (event.name === 'auto_answer_ignored') this.host.log?.(`[AutoAnswer:simple] skipped: ${event.skipReason}${event.questionId ? ` (${event.questionId})` : ''}`);
    }
}
