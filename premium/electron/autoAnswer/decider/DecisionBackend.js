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

// premium/electron/autoAnswer/decider/DecisionBackend.ts
var DecisionBackend_exports = {};
__export(DecisionBackend_exports, {
  ESCALATE_ALL: () => ESCALATE_ALL,
  gateDecision: () => gateDecision,
  judgeReplyFor: () => judgeReplyFor,
  labelOfJudgeReply: () => labelOfJudgeReply
});
module.exports = __toCommonJS(DecisionBackend_exports);

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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ESCALATE_ALL,
  gateDecision,
  judgeReplyFor,
  labelOfJudgeReply
});
