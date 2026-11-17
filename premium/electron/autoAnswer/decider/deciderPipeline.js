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

// premium/electron/autoAnswer/decider/deciderPipeline.ts
var deciderPipeline_exports = {};
__export(deciderPipeline_exports, {
  decideFields: () => decideFields,
  decideRequest: () => decideRequest,
  decideStudentFields: () => decideStudentFields,
  decideStudentRequest: () => decideStudentRequest,
  encodeStudentInput: () => encodeStudentInput,
  fieldsForRequest: () => fieldsForRequest,
  prepareDecider: () => prepareDecider,
  prepareStudent: () => prepareStudent,
  softmax: () => softmax
});
module.exports = __toCommonJS(deciderPipeline_exports);

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
var DECIDER_QUESTION = Object.freeze({
  type: "choice",
  instructions: "An assistant drafts answers for the USER in a live meeting. OTHERS is the meeting audio and may hold several voices. Does the latest speech in `candidate` contain a finished question or task aimed at the USER that they must answer or start now and that is not already in `last_answered`?",
  criteria: Object.freeze({
    answer: "a finished question or task for the USER, including short or yes/no ones and declarative tasks",
    silent: "not an ask, aimed at someone else, rhetorical or self-answered, logistics, permission, deferral, or already answered",
    wait: "an unfinished fragment, or a structure announced but not yet delivered"
  })
});
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

// premium/electron/autoAnswer/decider/layaSequence.ts
function toInternalChoice(q) {
  const crit = Array.isArray(q.criteria) ? Object.fromEntries(q.criteria.map((c) => [c, null])) : { ...q.criteria };
  return { t: "choice", ins: q.instructions, crit };
}
var QTYPE_CHOICE = 0;
var DEFAULT_MAX_LEN = 512;
var DEFAULT_HEAD_MAX_LEN = 192;
var OPTION_MAX_TOKENS = 48;
function renderCriterion(value) {
  if (typeof value === "string") return value;
  return pyJson(value);
}
function pyJson(v) {
  if (v === null || v === void 0) return "null";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return `[${v.map(pyJson).join(", ")}]`;
  if (typeof v === "object") return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${pyJson(x)}`).join(", ")}}`;
  return JSON.stringify(String(v));
}
function renderChoiceOptions(q) {
  return Object.entries(q.crit).map(([k, v]) => v === null || v === void 0 || v === "" ? String(k) : `${k}: ${renderCriterion(v)}`);
}
var unmask = (text, mask) => text.split(mask).join(" ");
function buildHead(tok, q, headMaxLen = DEFAULT_HEAD_MAX_LEN) {
  const opts = renderChoiceOptions(q);
  const ins = unmask(String(q.ins), tok.maskToken);
  let headIds = tok.encode(`${q.t} question: ${ins}`);
  let optIds = opts.map((o) => [tok.maskTokenId, ...tok.encode(" " + unmask(o, tok.maskToken)).slice(0, OPTION_MAX_TOKENS)]);
  let optBudget = headMaxLen - optIds.reduce((n, o) => n + o.length, 0);
  let perOption = null;
  if (optBudget < 16) {
    const per = Math.max(4, Math.floor((headMaxLen - 16) / Math.max(1, optIds.length)));
    perOption = per;
    optIds = optIds.map((o) => o.slice(0, per));
    optBudget = headMaxLen - optIds.reduce((n, o) => n + o.length, 0);
  }
  headIds = headIds.slice(0, Math.max(8, optBudget));
  const ids = [tok.clsTokenId, ...headIds, tok.sepTokenId];
  const markers = [];
  for (const o of optIds) {
    markers.push(ids.length);
    ids.push(...o);
  }
  ids.push(tok.sepTokenId);
  return { ids, markers, stats: { options: optIds.length, optionsDistinct: new Set(optIds.map((o) => o.join(","))).size, tokensPerOption: perOption } };
}
function stateRoom(head, maxLen = DEFAULT_MAX_LEN) {
  return Math.max(0, maxLen - head.ids.length - 1);
}
function countStateTokens(tok, serializedState) {
  return tok.encode(unmask(serializedState, tok.maskToken)).length;
}
function buildSequence(tok, serializedState, head, maxLen = DEFAULT_MAX_LEN) {
  const room = stateRoom(head, maxLen);
  const stateIds = tok.encode(unmask(serializedState, tok.maskToken));
  const st = stateIds.slice(0, room);
  let ids = [...head.ids, ...st, tok.sepTokenId];
  ids = ids.slice(0, maxLen);
  const markers = head.markers.filter((m) => m < maxLen);
  return {
    ids,
    markers,
    truncation: { stateTokens: stateIds.length, stateTokensUsed: st.length, stateTokensDropped: stateIds.length - st.length, truncated: st.length < stateIds.length }
  };
}
function collate(seqs, padId) {
  const n = seqs.length;
  const L = Math.max(...seqs.map((s) => s.ids.length));
  const kmax = Math.max(...seqs.map((s) => s.markers.length));
  const K = Math.max(kmax, 2);
  const inputIds = new BigInt64Array(n * L).fill(BigInt(padId));
  const attentionMask = new BigInt64Array(n * L);
  const markerPos = new BigInt64Array(n * K);
  const markerMask = new Uint8Array(n * K);
  const qtype = new BigInt64Array(n).fill(BigInt(QTYPE_CHOICE));
  seqs.forEach((s, i) => {
    s.ids.forEach((id, j) => {
      inputIds[i * L + j] = BigInt(id);
      attentionMask[i * L + j] = 1n;
    });
    s.markers.forEach((m, j) => {
      markerPos[i * K + j] = BigInt(m);
      markerMask[i * K + j] = 1;
    });
  });
  return { n, length: L, markerCols: K, inputIds, attentionMask, markerPos, markerMask, qtype };
}
var TEMP_MIN = 0.5;
var TEMP_MAX = 5;
function clampTemperature(t, lo = TEMP_MIN, hi = TEMP_MAX) {
  if (typeof t !== "number" || !Number.isFinite(t)) return 1;
  return Math.min(hi, Math.max(lo, t));
}
function tempBucket(k) {
  const size = k <= 2 ? "2" : k <= 5 ? "3-5" : k <= 10 ? "6-10" : "11+";
  return `choice:${size}`;
}
var round4 = (x) => Math.round(x * 1e4) / 1e4;
function decodeChoice(logitsRow, q, k, cal) {
  const raw = cal.temperatureByOptions?.[tempBucket(k)];
  const t = raw !== void 0 ? clampTemperature(raw) : clampTemperature(cal.temperature[QTYPE_CHOICE] ?? 1);
  const z = Array.from({ length: k }, (_, i) => Number(logitsRow[i]) / t);
  const zmax = Math.max(...z);
  const e = z.map((v) => Math.exp(v - zmax));
  const sum = e.reduce((a, b) => a + b, 0);
  const p = e.map((v) => v / sum);
  const keys = Object.keys(q.crit);
  let best = 0;
  for (let i = 1; i < k; i++) if (p[i] > p[best]) best = i;
  let confidence = 1;
  if (k >= 2) {
    const ent = -p.reduce((acc, x) => acc + x * Math.log(Math.min(1, Math.max(1e-12, x))), 0);
    confidence = Math.min(1, Math.max(0, 1 - ent / Math.log(k)));
  }
  return {
    choice: keys[best],
    probabilities: Object.fromEntries(keys.slice(0, k).map((key, i) => [key, round4(p[i])])),
    confidence: round4(confidence),
    answerConfidence: round4(Math.min(1, Math.max(0, p[best])))
  };
}

// premium/electron/autoAnswer/decider/deciderPipeline.ts
function prepareDecider(tok, cfg) {
  const q = toInternalChoice(DECIDER_QUESTION);
  const head = buildHead(tok, q, cfg.headMaxLen);
  return { tok, q, head, room: stateRoom(head, cfg.maxLen ?? DEFAULT_MAX_LEN), cfg };
}
function fieldsForRequest(req) {
  return buildDeciderStateFields({
    candidateText: req.candidateText,
    recentTurns: req.recentTurns ?? [],
    speakers: req.speakers,
    modeId: modeIdForName(req.modeName ?? null),
    lastAnsweredText: req.lastAnsweredText ?? null,
    userName: req.userName ?? null,
    transcriptLagging: !!req.transcriptLagging
  });
}
async function decideFields(p, fields, run) {
  const fit = fitDeciderState(fields, (s) => countStateTokens(p.tok, s), p.room);
  const seq = buildSequence(p.tok, fit.serialized, p.head, p.cfg.maxLen);
  const batch = collate([seq], p.tok.padTokenId);
  const k = seq.markers.length;
  const row = await run(batch);
  if (!row || row.length < k) throw new Error(`decider graph returned ${row?.length ?? 0} logits for ${k} options`);
  const a = decodeChoice(row, p.q, k, p.cfg.calibration);
  const probabilities = { answer: a.probabilities.answer ?? 0, silent: a.probabilities.silent ?? 0, wait: a.probabilities.wait ?? 0 };
  return {
    choice: a.choice,
    probabilities,
    answerConfidence: a.answerConfidence,
    entropyConfidence: a.confidence,
    // The fit gives ground before the model would cut; any right-truncation left means the
    // candidate itself may be cut, and a cut candidate is never trusted (gateDecision).
    truncated: seq.truncation.truncated,
    ms: 0
  };
}
function decideRequest(p, req, run) {
  return decideFields(p, fieldsForRequest(req), run);
}
function prepareStudent(tok, cfg) {
  return { tok, cfg };
}
function encodeStudentInput(tok, serialized, maxLen) {
  const ids = tok.encode(serialized);
  const room = maxLen - 2;
  const kept = ids.length > room ? ids.slice(ids.length - room) : ids;
  const all = [tok.clsTokenId, ...kept, tok.sepTokenId];
  const inputIds = new BigInt64Array(all.length);
  const attentionMask = new BigInt64Array(all.length);
  for (let i = 0; i < all.length; i++) {
    inputIds[i] = BigInt(all[i]);
    attentionMask[i] = 1n;
  }
  return { inputIds, attentionMask, length: all.length, truncated: ids.length > room };
}
function softmax(logits) {
  let m = -Infinity;
  for (let i = 0; i < logits.length; i++) m = Math.max(m, Number(logits[i]));
  const e = Array.from(logits, (x) => Math.exp(Number(x) - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}
async function decideStudentFields(p, fields, run) {
  const fit = fitDeciderState(fields, (s) => countStateTokens(p.tok, s), p.cfg.stateRoom);
  const input = encodeStudentInput(p.tok, fit.serialized, p.cfg.maxLen);
  const row = await run(input);
  const k = p.cfg.labels.length;
  if (!row || row.length < k) throw new Error(`decider graph returned ${row?.length ?? 0} logits for ${k} labels`);
  const probs = softmax(Array.from(row).slice(0, k));
  const probabilities = { answer: 0, silent: 0, wait: 0 };
  p.cfg.labels.forEach((l, i) => {
    probabilities[l] = probs[i];
  });
  let best = 0;
  for (let i = 1; i < k; i++) if (probs[i] > probs[best]) best = i;
  const entropy = -probs.reduce((a, q) => a + (q > 0 ? q * Math.log(q) : 0), 0);
  return {
    choice: p.cfg.labels[best],
    probabilities,
    answerConfidence: probs[best],
    entropyConfidence: 1 - entropy / Math.log(k),
    truncated: input.truncated,
    ms: 0
  };
}
function decideStudentRequest(p, req, run) {
  return decideStudentFields(p, fieldsForRequest(req), run);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  decideFields,
  decideRequest,
  decideStudentFields,
  decideStudentRequest,
  encodeStudentInput,
  fieldsForRequest,
  prepareDecider,
  prepareStudent,
  softmax
});
