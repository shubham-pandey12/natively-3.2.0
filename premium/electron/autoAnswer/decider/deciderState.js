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

// premium/electron/autoAnswer/decider/deciderState.ts
var deciderState_exports = {};
__export(deciderState_exports, {
  DECIDER_ANSWERED_CHAR_CAP: () => DECIDER_ANSWERED_CHAR_CAP,
  DECIDER_ANSWERED_SHRUNK_CHAR_CAP: () => DECIDER_ANSWERED_SHRUNK_CHAR_CAP,
  DECIDER_CANDIDATE_CHAR_CAP: () => DECIDER_CANDIDATE_CHAR_CAP,
  DECIDER_CONTEXT_TURNS: () => DECIDER_CONTEXT_TURNS,
  DECIDER_LABELS: () => DECIDER_LABELS,
  DECIDER_QUESTION: () => DECIDER_QUESTION,
  DECIDER_QUESTION_ID: () => DECIDER_QUESTION_ID,
  DECIDER_TURN_CHAR_CAP: () => DECIDER_TURN_CHAR_CAP,
  buildDeciderStateFields: () => buildDeciderStateFields,
  computeAddressedTo: () => computeAddressedTo,
  fitDeciderState: () => fitDeciderState,
  keepTail: () => keepTail,
  modeIdForName: () => modeIdForName,
  serializeDeciderState: () => serializeDeciderState
});
module.exports = __toCommonJS(deciderState_exports);

// premium/electron/autoAnswer/AutoAnswerJudge.ts
var JUDGE_CONTEXT_TURNS = 8;
var JUDGE_TURN_CHAR_CAP = 400;
var JUDGE_CANDIDATE_CHAR_CAP = 1e3;
var JUDGE_ANSWERED_CHAR_CAP = 250;
var JUDGE_PROMPT_MAX_VARIABLE_CHARS = JUDGE_CONTEXT_TURNS * JUDGE_TURN_CHAR_CAP + JUDGE_CANDIDATE_CHAR_CAP + JUDGE_ANSWERED_CHAR_CAP;
function judgeUserFirstName(raw) {
  const first = String(raw ?? "").trim().split(/\s+/)[0] ?? "";
  const clean = first.replace(/[^\p{L}\p{M}'’-]/gu, "").slice(0, 30);
  return new RegExp("\\p{L}.*\\p{L}", "u").test(clean) ? clean : null;
}
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
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
function userNameSlipsIn(texts, name) {
  const want = name.toLowerCase();
  const found = /* @__PURE__ */ new Map();
  for (const text of texts) {
    for (const m of String(text ?? "").matchAll(new RegExp("\\p{Lu}[\\p{L}\\p{M}'\u2019-]*", "gu"))) {
      const word = m[0].replace(/['’-]+$/, "");
      const low = word.toLowerCase();
      if (low === want || low.length < 3 || NOT_A_NAME.has(low) || found.has(low)) continue;
      const affix = Math.min(low.length, want.length) >= 3 && (low.startsWith(want) || want.startsWith(low));
      if (affix || editDistance(low, want) <= (Math.max(low.length, want.length) >= 6 ? 2 : 1)) found.set(low, word);
    }
  }
  return [...found.values()].slice(0, 4);
}
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
function addressedNamesIn(text) {
  const out = [];
  const re = new RegExp("(?:^|[.?!,;:]\\s+|\\b(?:thanks|thank you|okay|so|and|hi|hey|well|now|alright|right|great)\\s+)(\\p{Lu}[\\p{L}\\p{M}'\u2019-]{2,})(?=\\s*,)", "giu");
  for (const m of String(text ?? "").matchAll(re)) {
    const word = m[1];
    if (!new RegExp("^\\p{Lu}", "u").test(word) || NOT_A_VOCATIVE.has(word.toLowerCase()) || /ly$/i.test(word)) continue;
    if (!out.includes(word)) out.push(word);
  }
  return out;
}

// premium/electron/autoAnswer/decider/deciderState.ts
var DECIDER_QUESTION_ID = "respond";
var DECIDER_QUESTION = Object.freeze({
  type: "choice",
  instructions: "An assistant drafts answers for the USER in a live meeting. OTHERS is the meeting audio and may hold several voices. Does the latest speech in `candidate` contain a finished question or task aimed at the USER that they must answer or start now and that is not already in `last_answered`?",
  criteria: Object.freeze({
    answer: "a finished question or task for the USER, including short or yes/no ones and declarative tasks",
    silent: "not an ask, aimed at someone else, rhetorical or self-answered, logistics, permission, deferral, or already answered",
    wait: "an unfinished fragment, or a structure announced but not yet delivered"
  })
});
var DECIDER_LABELS = ["answer", "silent", "wait"];
var DECIDER_CONTEXT_TURNS = 6;
var DECIDER_TURN_CHAR_CAP = 400;
var DECIDER_CANDIDATE_CHAR_CAP = 1e3;
var DECIDER_ANSWERED_CHAR_CAP = 250;
var DECIDER_ANSWERED_SHRUNK_CHAR_CAP = 120;
function keepTail(text, max) {
  const t = String(text ?? "");
  return t.length <= max ? t : `\u2026${t.slice(t.length - max)}`;
}
function computeAddressedTo(candidate, contextTexts, userName) {
  const name = judgeUserFirstName(userName);
  if (!name) return "none";
  const named = addressedNamesIn(candidate);
  if (named.length === 0) return "none";
  const slips = userNameSlipsIn([candidate, ...contextTexts], name);
  const isUser = (w) => [name, ...slips].some((n) => n.toLowerCase() === w.toLowerCase());
  if (named.some(isUser)) return "user";
  return "other";
}
function buildDeciderStateFields(input) {
  const turns = input.recentTurns ?? [];
  const keptFrom = Math.max(0, turns.length - DECIDER_CONTEXT_TURNS);
  const kept = turns.slice(keptFrom);
  const context = kept.map((t, i) => {
    const text = keepTail(t.text, DECIDER_TURN_CHAR_CAP);
    if (t.role !== "interviewer") return `USER: ${text}`;
    const who = input.speakers?.[keptFrom + i];
    return `${who ? `OTHERS/${who}` : "OTHERS"}: ${text}`;
  });
  const candidate = keepTail(input.candidateText, DECIDER_CANDIDATE_CHAR_CAP);
  const answered = input.lastAnsweredText ? keepTail(input.lastAnsweredText, DECIDER_ANSWERED_CHAR_CAP) : null;
  return {
    mode: String(input.modeId || "general"),
    addressed_to: computeAddressedTo(candidate, kept.map((t) => String(t.text ?? "")), input.userName),
    transcript_lagging: input.transcriptLagging === true,
    context,
    last_answered: answered,
    candidate
  };
}
function serializeDeciderState(f) {
  const s = (v) => JSON.stringify(v);
  const ctx = `[${f.context.map(s).join(", ")}]`;
  return `{${[
    `"mode": ${s(f.mode)}`,
    `"addressed_to": ${s(f.addressed_to)}`,
    `"transcript_lagging": ${f.transcript_lagging ? "true" : "false"}`,
    `"context": ${ctx}`,
    `"last_answered": ${f.last_answered === null ? "null" : s(f.last_answered)}`,
    `"candidate": ${s(f.candidate)}`
  ].join(", ")}}`;
}
function fitDeciderState(fields, countTokens, room) {
  let f = { ...fields, context: [...fields.context] };
  let droppedTurns = 0;
  let answeredShrunk = false;
  let droppedCandidateWords = 0;
  const fits = () => countTokens(serializeDeciderState(f)) <= room;
  while (!fits() && f.context.length > 0) {
    f.context.shift();
    droppedTurns++;
  }
  if (!fits() && f.last_answered !== null && f.last_answered.length > DECIDER_ANSWERED_SHRUNK_CHAR_CAP + 1) {
    f.last_answered = keepTail(f.last_answered.replace(/^…/, ""), DECIDER_ANSWERED_SHRUNK_CHAR_CAP);
    answeredShrunk = true;
  }
  if (!fits()) {
    const words = f.candidate.replace(/^…/, "").split(/\s+/).filter(Boolean);
    while (!fits() && words.length > 1) {
      words.shift();
      droppedCandidateWords++;
      f.candidate = `\u2026${words.join(" ")}`;
    }
  }
  return { serialized: serializeDeciderState(f), fields: f, droppedTurns, answeredShrunk, droppedCandidateWords };
}
function modeIdForName(name) {
  const n = String(name ?? "").trim().toLowerCase();
  if (!n) return null;
  const table = {
    "general": "general",
    "technical interview": "technical-interview",
    "system design interview": "technical-interview",
    "looking for work": "looking-for-work",
    "sales": "sales",
    "recruiting": "recruiting",
    "team meet": "team-meet",
    "lecture": "lecture",
    "seminar": "seminar",
    "call center": "call-center"
  };
  return table[n] ?? null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DECIDER_ANSWERED_CHAR_CAP,
  DECIDER_ANSWERED_SHRUNK_CHAR_CAP,
  DECIDER_CANDIDATE_CHAR_CAP,
  DECIDER_CONTEXT_TURNS,
  DECIDER_LABELS,
  DECIDER_QUESTION,
  DECIDER_QUESTION_ID,
  DECIDER_TURN_CHAR_CAP,
  buildDeciderStateFields,
  computeAddressedTo,
  fitDeciderState,
  keepTail,
  modeIdForName,
  serializeDeciderState
});
