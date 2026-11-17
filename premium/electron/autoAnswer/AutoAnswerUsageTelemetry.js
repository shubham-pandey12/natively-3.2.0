"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// premium/electron/autoAnswer/AutoAnswerUsageTelemetry.ts
var AutoAnswerUsageTelemetry_exports = {};
__export(AutoAnswerUsageTelemetry_exports, {
  AutoAnswerUsageTelemetry: () => AutoAnswerUsageTelemetry
});
module.exports = __toCommonJS(AutoAnswerUsageTelemetry_exports);
var import_node_crypto = require("node:crypto");
var IDENT_RE = /^[A-Za-z0-9_.:@/-]{1,64}$/;
var MAX_DURATION_MS = 864e5;
var MAX_TRACKED_QUESTIONS = 32;
var FEATURE = "meeting_copilot";
var ZERO = { candidates: 0, answered: 0, silent: 0, judgeTimeouts: 0, judgeErrors: 0, kept: 0, superseded: 0 };
function ident(v) {
  return typeof v === "string" && IDENT_RE.test(v) ? v : void 0;
}
function ms(v) {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : void 0;
}
var AutoAnswerUsageTelemetry = class {
  constructor(deps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? import_node_crypto.randomUUID;
  }
  deps;
  now;
  newId;
  meetingId = null;
  meetingStartedAt = 0;
  meetingMode = "none";
  counts = { ...ZERO };
  questions = /* @__PURE__ */ new Map();
  pending = null;
  /** A meeting started: counts restart under a fresh id. */
  meetingStarted() {
    this.flushPending("unresolved");
    this.beginMeeting();
  }
  /** The meeting ended: the open answer is sent unresolved, then the meeting row. */
  meetingEnded() {
    try {
      this.flushPending("unresolved");
      if (this.meetingId && this.counts.candidates > 0) this.emitMeeting();
    } catch {
    }
    this.meetingId = null;
    this.counts = { ...ZERO };
    this.questions.clear();
  }
  /** One engine telemetry event. Never throws. */
  observe(event) {
    try {
      if (!this.meetingId) this.beginMeeting();
      const id = event.questionId;
      switch (event.name) {
        case "auto_answer_candidate": {
          if (!id) return;
          this.counts.candidates++;
          if (this.questions.size >= MAX_TRACKED_QUESTIONS) {
            const oldest = this.questions.keys().next().value;
            if (oldest !== void 0) this.questions.delete(oldest);
          }
          this.questions.set(id, { candidateAt: this.now() });
          return;
        }
        case "auto_answer_judged": {
          if (event.judgeOutcome === "timeout") this.counts.judgeTimeouts++;
          else if (event.judgeOutcome === "error" || event.judgeOutcome === "unparseable") this.counts.judgeErrors++;
          const q = id ? this.questions.get(id) : void 0;
          if (!q) return;
          if (event.dialogueAct) q.act = event.dialogueAct;
          if (typeof event.answerability === "number") q.answerability = event.answerability;
          if (event.judgeOutcome === "verdict") q.judgeMs = ms(event.judgeMs);
          return;
        }
        case "auto_answer_ignored": {
          if (!id || !this.questions.has(id)) return;
          this.counts.silent++;
          this.questions.delete(id);
          return;
        }
        case "auto_answer_decision": {
          if (!id || event.action !== "auto") return;
          this.flushPending("unresolved");
          this.counts.answered++;
          const selection = this.deps.answerModel() ?? {};
          this.pending = {
            questionId: id,
            decidedAt: this.now(),
            question: this.questions.get(id),
            mode: this.currentMode(),
            provider: ident(selection.provider),
            model: ident(selection.model),
            awaitingFirstToken: true
          };
          this.questions.delete(id);
          return;
        }
        case "auto_answer_feedback": {
          if (!this.pending || this.pending.questionId !== id) return;
          if (event.feedback === "kept") this.counts.kept++;
          else if (event.feedback === "superseded") this.counts.superseded++;
          else return;
          this.flushPending(event.feedback, ms(event.feedbackMs));
          return;
        }
        default:
          return;
      }
    } catch {
    }
  }
  /**
   * Answer content reached the overlay. The first one after an automatic
   * dispatch is that answer's first visible word.
   */
  answerShown() {
    const p = this.pending;
    if (!p || !p.awaitingFirstToken) return;
    p.awaitingFirstToken = false;
    p.firstTokenMs = ms(this.now() - (p.question?.candidateAt ?? p.decidedAt));
  }
  /**
   * Whatever shows next is not the automatic answer's: a manual answer took
   * over, or the automatic one was discarded. The open answer keeps waiting
   * for its feedback; it just stops waiting for a first word.
   */
  stopAwaitingAnswer() {
    if (this.pending) this.pending.awaitingFirstToken = false;
  }
  beginMeeting() {
    this.meetingId = this.newId();
    this.meetingStartedAt = this.now();
    this.meetingMode = this.currentMode();
    this.counts = { ...ZERO };
    this.questions.clear();
  }
  currentMode() {
    try {
      return ident(this.deps.mode()) ?? "none";
    } catch {
      return "none";
    }
  }
  flushPending(feedback, feedbackMs) {
    const p = this.pending;
    this.pending = null;
    if (!p || !this.meetingId) return;
    const q = p.question;
    const metadata = {
      op: "auto_answer",
      mode: p.mode,
      feedback
    };
    if (q?.act && ident(q.act)) metadata.act = q.act;
    if (typeof q?.answerability === "number" && Number.isFinite(q.answerability)) {
      metadata.answerability = Math.round(q.answerability * 100) / 100;
    }
    if (q?.judgeMs !== void 0) metadata.judge_ms = q.judgeMs;
    if (p.firstTokenMs !== void 0) metadata.first_token_ms = p.firstTokenMs;
    if (feedback === "superseded" && feedbackMs !== void 0) metadata.feedback_ms = feedbackMs;
    this.send({
      event_type: "feature_completed",
      // Nothing showed: the answer never reached the user.
      event_status: p.firstTokenMs !== void 0 ? "completed" : "interrupted",
      feature: FEATURE,
      feature_session_id: this.meetingId,
      ...p.provider ? { provider: p.provider } : {},
      ...p.model ? { model: p.model } : {},
      metadata
    });
  }
  emitMeeting() {
    const c = this.counts;
    const duration = ms(this.now() - this.meetingStartedAt);
    this.send({
      event_type: "feature_completed",
      event_status: "completed",
      feature: FEATURE,
      feature_session_id: this.meetingId ?? void 0,
      reported_count: c.candidates,
      ...duration !== void 0 && duration <= MAX_DURATION_MS ? { reported_duration_ms: duration } : {},
      metadata: {
        op: "auto_answer_meeting",
        mode: this.meetingMode,
        answered: c.answered,
        silent: c.silent,
        judge_timeouts: c.judgeTimeouts,
        judge_errors: c.judgeErrors,
        kept: c.kept,
        superseded: c.superseded
      }
    });
  }
  send(row) {
    try {
      this.deps.sink(row);
    } catch {
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AutoAnswerUsageTelemetry
});
