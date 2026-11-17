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

// premium/electron/autoAnswer/decider/AutoAnswerDecider.ts
var AutoAnswerDecider_exports = {};
__export(AutoAnswerDecider_exports, {
  AutoAnswerDecider: () => AutoAnswerDecider,
  HOSTED_DEADLINE_MS: () => HOSTED_DEADLINE_MS,
  LOCAL_DEADLINE_MS: () => LOCAL_DEADLINE_MS
});
module.exports = __toCommonJS(AutoAnswerDecider_exports);

// premium/electron/autoAnswer/AutoAnswerText.ts
function normalizeForCompare(s) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function tokenContainment(needle, haystack) {
  const nq = normalizeForCompare(needle).split(" ").filter(Boolean);
  if (nq.length === 0) return 0;
  const have = new Set(normalizeForCompare(haystack).split(" ").filter(Boolean));
  let hit = 0;
  for (const t of nq) if (have.has(t)) hit++;
  return hit / nq.length;
}

// premium/electron/autoAnswer/AutoAnswerJudge.ts
var JUDGE_CONTAINMENT_MIN = 0.65;
var JUDGE_CONTEXT_TURNS = 8;
var JUDGE_TURN_CHAR_CAP = 400;
var JUDGE_CANDIDATE_CHAR_CAP = 1e3;
var JUDGE_ANSWERED_CHAR_CAP = 250;
var JUDGE_PROMPT_MAX_VARIABLE_CHARS = JUDGE_CONTEXT_TURNS * JUDGE_TURN_CHAR_CAP + JUDGE_CANDIDATE_CHAR_CAP + JUDGE_ANSWERED_CHAR_CAP;
var NOT_A_NAME = /* @__PURE__ */ new Set([
  "and",
  "all",
  "but",
  "the",
  "how",
  "why",
  "what",
  "who",
  "can",
  "could",
  "okay",
  "yes",
  "yeah",
  "right",
  "great",
  "good",
  "thanks",
  "now",
  "well",
  "also",
  "then",
  "that",
  "this",
  "just",
  "even",
  "ever",
  "over",
  "alright",
  "before",
  "after",
  "one",
  "let's",
  "hey",
  "morning",
  "any",
  "are",
  "did",
  "does",
  "will",
  "would"
]);
var NOT_A_VOCATIVE = /* @__PURE__ */ new Set([
  ...NOT_A_NAME,
  "yes",
  "yep",
  "no",
  "nope",
  "ok",
  "so",
  "sure",
  "cool",
  "nice",
  "perfect",
  "awesome",
  "excellent",
  "first",
  "second",
  "third",
  "hmm",
  "um",
  "uh",
  "oh",
  "ah",
  "like",
  "sorry",
  "hi",
  "hello",
  "please",
  "interesting",
  "today",
  "tomorrow",
  "yesterday",
  "instead",
  "otherwise",
  "meanwhile",
  "again",
  "anyway",
  "however",
  "sir",
  "madam",
  "ma'am",
  "guys",
  "everyone",
  "everybody",
  "folks",
  "team",
  "all",
  "fine",
  "wow",
  "there",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
]);
var JUDGE_ACTS = {
  question: "general_question",
  follow_up: "follow_up_question",
  coding_task: "coding_question",
  behavioral: "behavioral_question",
  technical: "technical_question",
  rhetorical: "rhetorical",
  statement: "statement",
  social: "social",
  incomplete: "incomplete"
};
function parseJudgeVerdict(raw, candidateText) {
  if (!raw) return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const isAsk = obj.is_ask;
  const directed = obj.directed_at_user;
  const complete = obj.complete;
  if (typeof isAsk !== "boolean" || typeof directed !== "boolean" || typeof complete !== "boolean") return null;
  const rawAns = obj.answerability;
  if (typeof rawAns !== "number" || Number.isNaN(rawAns)) return null;
  const answerability = Math.max(0, Math.min(1, rawAns));
  const act = JUDGE_ACTS[String(obj.act)] ?? (isAsk ? "general_question" : "statement");
  let questionText = null;
  if (typeof obj.question_text === "string" && obj.question_text.trim()) {
    const grounded = tokenContainment(obj.question_text, candidateText) >= JUDGE_CONTAINMENT_MIN;
    questionText = grounded ? obj.question_text.trim() : null;
  }
  const rawAction = String(obj.action ?? "").toLowerCase();
  const action = rawAction === "answer" || rawAction === "offer" ? "answer" : rawAction === "silent" ? "silent" : !isAsk || !directed ? "silent" : "answer";
  return { isAsk, directedAtUser: directed, complete, act, answerability, questionText, action };
}
function routeForVerdict(v) {
  if (!v.complete || v.act === "incomplete") return { route: "wait_incomplete" };
  if (!v.isAsk) return { route: "ignore", reason: "not_question" };
  if (v.act === "rhetorical") return { route: "ignore", reason: "rhetorical" };
  if (!v.directedAtUser) return { route: "ignore", reason: "not_question" };
  if (v.action === "silent") return { route: "ignore", reason: "low_answerability" };
  return { route: "evaluate", action: v.action, answerability: v.answerability, act: v.act, questionText: v.questionText };
}

// premium/electron/autoAnswer/decider/DecisionBackend.ts
var ESCALATE_ALL = Object.freeze({ answer: Infinity, silent: Infinity, wait: Infinity });
function gateDecision(d, t) {
  if (d.truncated) return { action: "escalate", escalateReason: "truncated" };
  const need = t[d.choice];
  if (Number.isFinite(need) && d.answerConfidence >= need) return { action: d.choice };
  return { action: "escalate", escalateReason: "below_threshold" };
}
function labelOfJudgeReply(raw, candidateText) {
  const v = parseJudgeVerdict(raw, candidateText);
  if (!v) return null;
  const route = routeForVerdict(v);
  if (route.route === "wait_incomplete") return "wait";
  return route.route === "evaluate" && route.action === "answer" ? "answer" : "silent";
}
function judgeReplyFor(label) {
  if (label === "answer") {
    return JSON.stringify({ is_ask: true, directed_at_user: true, complete: true, act: "question", action: "answer", answerability: 0.95, question_text: null });
  }
  if (label === "wait") {
    return JSON.stringify({ is_ask: false, directed_at_user: false, complete: false, act: "incomplete", action: "silent", answerability: 0, question_text: null });
  }
  return JSON.stringify({ is_ask: false, directed_at_user: false, complete: true, act: "statement", action: "silent", answerability: 0, question_text: null });
}

// premium/electron/autoAnswer/decider/AutoAnswerDecider.ts
var HOSTED_DEADLINE_MS = 600;
var LOCAL_DEADLINE_MS = 900;
var AutoAnswerDecider = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  /** Drop-in for the engine host's `judgeCandidate`. */
  async judge(req, signal) {
    const mode = this.deps.mode();
    if (mode === "off") return this.deps.llmJudge ? this.deps.llmJudge(req, signal) : null;
    if (mode === "shadow") return this.shadow(req, signal);
    return this.authoritative(req, signal);
  }
  /** Backends only, no LLM: the first one that answers in time, gated. */
  async decide(req, signal) {
    const start = this.deps.clock.now();
    const available = this.safeBackends().filter((b) => {
      try {
        return b.isAvailable();
      } catch {
        return false;
      }
    });
    if (!available.length) return { action: "escalate", escalateReason: "no_backend", choice: null, probabilities: null, answerConfidence: null, backend: "none", ms: 0 };
    for (const backend of available) {
      if (signal?.aborted) break;
      const d = await this.withDeadline(backend, req, signal);
      if (!d) continue;
      const gated = gateDecision(d, this.deps.thresholds(backend.kind));
      return { ...gated, choice: d.choice, probabilities: d.probabilities, answerConfidence: d.answerConfidence, backend: backend.kind, ms: this.deps.clock.now() - start };
    }
    return { action: "escalate", escalateReason: "backends_failed", choice: null, probabilities: null, answerConfidence: null, backend: "none", ms: this.deps.clock.now() - start };
  }
  async shadow(req, signal) {
    if (!this.safeBackends().some((b) => {
      try {
        return b.isAvailable();
      } catch {
        return false;
      }
    })) {
      return this.deps.llmJudge ? this.deps.llmJudge(req, signal) : null;
    }
    const decided = this.decide(req, signal).catch(() => null);
    let raw = null;
    let judgeErr = null;
    try {
      raw = this.deps.llmJudge ? await this.deps.llmJudge(req, signal) : null;
    } catch (e) {
      judgeErr = e;
    }
    void decided.then((d) => {
      if (!d || signal?.aborted) return;
      const judgeLabel = judgeErr ? void 0 : labelOfJudgeReply(raw, req.candidateText) ?? void 0;
      this.emit(req, "shadow", d, {
        ...judgeLabel ? { judgeLabel } : {},
        ...judgeLabel && d.choice ? { shadowAgree: judgeLabel === d.choice } : {}
      });
    });
    if (judgeErr) throw judgeErr;
    return raw;
  }
  async authoritative(req, signal) {
    const d = await this.decide(req, signal);
    if (d.action !== "escalate") {
      this.emit(req, "on", d);
      return judgeReplyFor(d.action);
    }
    let raw = null;
    let judgeErr = null;
    try {
      raw = this.deps.llmJudge ? await this.deps.llmJudge(req, signal) : null;
    } catch (e) {
      judgeErr = e;
    }
    if (!judgeErr && labelOfJudgeReply(raw, req.candidateText) !== null) {
      this.emit(req, "on", d);
      return raw;
    }
    if (d.choice === "answer" && !signal?.aborted) {
      this.emit(req, "on", d, { doubtAnswered: true });
      return judgeReplyFor("answer");
    }
    this.emit(req, "on", d);
    if (judgeErr) throw judgeErr;
    return raw;
  }
  safeBackends() {
    try {
      return this.deps.backends() ?? [];
    } catch {
      return [];
    }
  }
  /** One backend under its deadline. Null on timeout, error, abort or a malformed decision. */
  withDeadline(backend, req, outer) {
    const ms = this.deps.deadlineMs?.(backend.kind) ?? (backend.kind === "hosted" ? HOSTED_DEADLINE_MS : LOCAL_DEADLINE_MS);
    const ctl = new AbortController();
    const onOuter = () => ctl.abort();
    outer?.addEventListener("abort", onOuter, { once: true });
    let timer = null;
    const cleanup = () => {
      if (timer !== null) this.deps.clock.clearTimeout(timer);
      outer?.removeEventListener("abort", onOuter);
    };
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(v);
      };
      timer = this.deps.clock.setTimeout(() => {
        ctl.abort();
        done(null);
      }, ms);
      ctl.signal.addEventListener("abort", () => done(null), { once: true });
      Promise.resolve().then(() => backend.decide(req, ctl.signal)).then((d) => done(isDecision(d) ? d : null), () => done(null));
    });
  }
  emit(req, mode, d, extra = {}) {
    if (!this.deps.telemetry) return;
    try {
      this.deps.telemetry({
        name: "auto_answer_decided",
        questionId: req.questionId,
        decisionMode: mode,
        decisionBackend: d.backend,
        decisionAction: d.action,
        ...d.choice ? { decisionChoice: d.choice } : {},
        ...typeof d.answerConfidence === "number" ? { decisionConfidence: Math.round(d.answerConfidence * 1e4) / 1e4 } : {},
        decisionMs: d.ms,
        escalated: d.action === "escalate",
        ...d.escalateReason ? { escalateReason: d.escalateReason } : {},
        ...extra
      });
    } catch {
    }
  }
};
function isDecision(d) {
  const x = d;
  return !!x && (x.choice === "answer" || x.choice === "silent" || x.choice === "wait") && typeof x.answerConfidence === "number" && Number.isFinite(x.answerConfidence);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AutoAnswerDecider,
  HOSTED_DEADLINE_MS,
  LOCAL_DEADLINE_MS
});
