"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// premium/electron/autoAnswer/decider/deciderWorker.ts
var import_worker_threads = require("worker_threads");
var import_path = __toESM(require("path"));

// electron/utils/onnxThreadConfig.ts
function readIntEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function readBoolEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}
function defaultPerfCoreIntraOpThreads() {
  let logical = 4;
  try {
    logical = require("os").cpus()?.length || 4;
  } catch {
    logical = 4;
  }
  return Math.max(1, Math.min(4, Math.floor(logical / 2)));
}
function getBoundedOnnxSessionOptions(workload = "default") {
  const intraDefault = workload === "default" ? 1 : defaultPerfCoreIntraOpThreads();
  return {
    intraOpNumThreads: readIntEnv("NATIVELY_ONNX_INTRA_OP_THREADS", intraDefault),
    interOpNumThreads: readIntEnv("NATIVELY_ONNX_INTER_OP_THREADS", 1),
    executionMode: "sequential",
    // Disable ORT's persistent BFCArena/memory-pattern reuse by default.
    // The crash forensics above point at BFCArena::Extend; standard system
    // allocations are safer inside Electron. Env vars keep this reversible
    // for perf experiments without shipping a new build.
    enableCpuMemArena: readBoolEnv("NATIVELY_ONNX_ENABLE_CPU_MEM_ARENA", false),
    enableMemPattern: readBoolEnv("NATIVELY_ONNX_ENABLE_MEM_PATTERN", false)
  };
}
var _sem = (() => {
  const g = globalThis;
  if (!g.__nativelyOnnxSemaphoreV1__) {
    g.__nativelyOnnxSemaphoreV1__ = { inFlightNormal: 0, inFlightHigh: 0, exclusiveInFlight: 0, waitersNormal: [], waitersHigh: [] };
  }
  return g.__nativelyOnnxSemaphoreV1__;
})();

// electron/utils/workerStatus.ts
function classifyWorkerFailure(error) {
  const message = error instanceof Error ? error.stack || error.message : String(error || "unknown worker failure");
  const said = error instanceof Error ? `${error.message} ${error.code ?? ""}` : message;
  const lower = said.toLowerCase();
  if (lower.includes("onnxruntime-common") || lower.includes("@huggingface/transformers")) {
    return { reason: "module-missing", recoverable: false, message };
  }
  if (lower.includes("onnxruntime-node") || lower.includes("onnxruntime_binding") || /\.node(?![\w.])/.test(lower) || lower.includes("err_dlopen_failed")) {
    return { reason: "native-addon-missing", recoverable: false, message };
  }
  if (lower.includes("local_files_only") || lower.includes("no such file") || lower.includes("not found") || lower.includes("missing") || lower.includes("doesn't exist") || lower.includes("protobuf parsing failed") || lower.includes("load model from")) {
    return { reason: "model-missing", recoverable: false, message };
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return { reason: "init-timeout", recoverable: true, message };
  }
  if (lower.includes("memory") || lower.includes("allocation") || lower.includes("arena")) {
    return { reason: "memory-pressure", recoverable: true, message };
  }
  return { reason: "unknown", recoverable: true, message };
}

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

// premium/electron/autoAnswer/decider/DecisionBackend.ts
var ESCALATE_ALL = Object.freeze({ answer: Infinity, silent: Infinity, wait: Infinity });

// premium/electron/autoAnswer/decider/deciderManifest.ts
var DECIDER_MANIFEST_SCHEMA = 1;
var isNum = (x) => typeof x === "number" && Number.isFinite(x);
var safeRel = (p) => typeof p === "string" && p.length > 0 && !/^([a-zA-Z]:)?[\\/]/.test(p) && !p.split(/[\\/]/).includes("..");
function thresholdsOf(raw) {
  if (!raw || typeof raw !== "object") return ESCALATE_ALL;
  const one = (v) => isNum(v) && v > 0 && v <= 1 ? v : Infinity;
  return { answer: one(raw.answer), silent: one(raw.silent), wait: one(raw.wait) };
}
function parseDeciderManifest(json) {
  const m = json;
  if (!m || typeof m !== "object") throw new Error("manifest: not an object");
  if (m.schema !== DECIDER_MANIFEST_SCHEMA) throw new Error(`manifest: schema ${m.schema} (want ${DECIDER_MANIFEST_SCHEMA})`);
  if (typeof m.id !== "string" || typeof m.version !== "string") throw new Error("manifest: id/version");
  const kind = m.kind ?? "laya";
  if (kind !== "laya" && kind !== "seq-cls") throw new Error(`manifest: kind ${String(m.kind)}`);
  const labels = m.labels ?? ["answer", "silent", "wait"];
  if (!Array.isArray(labels) || labels.length !== 3 || new Set(labels).size !== 3 || !labels.every((l) => l === "answer" || l === "silent" || l === "wait")) throw new Error("manifest: labels");
  const stateRoom2 = m.state_room ?? 0;
  if (kind === "seq-cls" && !(Number.isInteger(stateRoom2) && stateRoom2 > 0)) throw new Error("manifest: state_room");
  if (!safeRel(m.graph)) throw new Error("manifest: graph path");
  const tokenizerDir = m.tokenizer ?? "tokenizer";
  if (!safeRel(tokenizerDir)) throw new Error("manifest: tokenizer path");
  const maxLen = m.max_len ?? 512;
  const headMaxLen = m.head_max_len ?? 192;
  if (!isNum(maxLen) || !isNum(headMaxLen) || headMaxLen >= maxLen) throw new Error("manifest: max_len/head_max_len");
  const cal = m.calibration ?? {};
  const temperature = Array.isArray(cal.temperature) && cal.temperature.every(isNum) ? cal.temperature : [1, 1, 1];
  const byOpt = {};
  for (const [k, v] of Object.entries(cal.temperature_by_options ?? {})) if (isNum(v)) byOpt[k] = v;
  const files = Array.isArray(m.files) ? m.files : [];
  for (const f of files) {
    if (!safeRel(f?.path) || typeof f.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(f.sha256) || !isNum(f.bytes)) {
      throw new Error("manifest: files entry");
    }
  }
  if (kind === "seq-cls" && stateRoom2 > maxLen - 2) throw new Error("manifest: state_room exceeds max_len");
  const isRuntime = (r) => r === "ort-1.22" || r === "ort-1.24";
  const runtime = m.runtime ?? "ort-1.22";
  if (!isRuntime(runtime)) throw new Error("manifest: runtime");
  const variants = {};
  for (const [name, v] of Object.entries(m.variants ?? {})) {
    if (!/^[a-z0-9]{2,12}$/.test(name) || !safeRel(v?.graph) || typeof v.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(v.sha256) || !(Number.isInteger(v.bytes) && v.bytes > 0) || !isRuntime(v.runtime)) throw new Error(`manifest: variant ${name}`);
    variants[name] = { graph: v.graph, sha256: v.sha256, bytes: v.bytes, runtime: v.runtime };
  }
  return {
    kind,
    labels,
    stateRoom: stateRoom2,
    id: m.id,
    version: m.version,
    graph: m.graph,
    tokenizerDir,
    config: { maxLen, headMaxLen, calibration: { temperature, temperatureByOptions: byOpt } },
    thresholds: thresholdsOf(m.thresholds),
    files,
    runtime,
    variants
  };
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
async function decideFields(p, fields, run2) {
  const fit = fitDeciderState(fields, (s) => countStateTokens(p.tok, s), p.room);
  const seq = buildSequence(p.tok, fit.serialized, p.head, p.cfg.maxLen);
  const batch = collate([seq], p.tok.padTokenId);
  const k = seq.markers.length;
  const row = await run2(batch);
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
function decideRequest(p, req, run2) {
  return decideFields(p, fieldsForRequest(req), run2);
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
async function decideStudentFields(p, fields, run2) {
  const fit = fitDeciderState(fields, (s) => countStateTokens(p.tok, s), p.cfg.stateRoom);
  const input = encodeStudentInput(p.tok, fit.serialized, p.cfg.maxLen);
  const row = await run2(input);
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
function decideStudentRequest(p, req, run2) {
  return decideStudentFields(p, fieldsForRequest(req), run2);
}

// premium/electron/autoAnswer/decider/layaTokenizer.ts
var LAYA_SPECIAL_TOKENS = { mask: "[MASK]", cls: "[CLS]", sep: "[SEP]", pad: "[PAD]" };
function specialTokensFromConfig(config) {
  const pick = (key, fallback) => {
    const v = config?.[key];
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && typeof v.content === "string") return v.content;
    return fallback;
  };
  return {
    mask: pick("mask_token", LAYA_SPECIAL_TOKENS.mask),
    cls: pick("cls_token", LAYA_SPECIAL_TOKENS.cls),
    sep: pick("sep_token", LAYA_SPECIAL_TOKENS.sep),
    pad: pick("pad_token", LAYA_SPECIAL_TOKENS.pad)
  };
}
function adaptTokenizer(tok, special = LAYA_SPECIAL_TOKENS) {
  const id = (token) => {
    const v = tok.model?.tokens_to_ids?.get(token);
    if (typeof v !== "number") throw new Error(`decider tokenizer has no id for special token ${token}`);
    return v;
  };
  const maskTokenId = id(special.mask);
  const clsTokenId = id(special.cls);
  const sepTokenId = id(special.sep);
  const padTokenId = id(special.pad);
  return {
    encode: (text) => Array.from(tok.encode(text, { add_special_tokens: false }), Number),
    maskToken: special.mask,
    maskTokenId,
    clsTokenId,
    sepTokenId,
    padTokenId
  };
}

// premium/electron/autoAnswer/decider/deciderPlatform.ts
function ortExecutionProviders(eps) {
  return eps.map((ep) => {
    if (ep === "coreml") return { name: "coreml", coreMlFlags: 0 };
    if (ep === "dml") return { name: "dml" };
    return "cpu";
  });
}

// premium/electron/autoAnswer/decider/deciderRuntime.ts
function ortModuleFor(runtime) {
  return runtime === "ort-1.24" ? "onnxruntime-node-decider" : "onnxruntime-node";
}

// premium/electron/autoAnswer/decider/deciderWorker.ts
var utilityPort = process.parentPort;
var host = import_worker_threads.parentPort ? { postMessage: (m) => import_worker_threads.parentPort.postMessage(m), onMessage: (fn) => {
  import_worker_threads.parentPort.on("message", fn);
} } : utilityPort ? { postMessage: (m) => utilityPort.postMessage(m), onMessage: (fn) => utilityPort.on("message", (ev) => fn(ev?.data)) } : null;
if (!host) throw new Error("deciderWorker must run as a worker thread or an Electron utility process");
var inUtilityProcess = !import_worker_threads.parentPort;
var parentPort = host;
var session = null;
var ortMod = null;
var prepared = null;
var student = null;
var manifest = null;
var loadingPromise = null;
async function loadTransformers() {
  return new Function('return import("@huggingface/transformers")')();
}
async function loadOrt(runtime) {
  const mod = ortModuleFor(runtime);
  if (mod === "onnxruntime-node-decider") {
    if (!inUtilityProcess) throw new Error("decider: onnxruntime 1.24 only loads in the decider utility process");
    return new Function('return import("onnxruntime-node-decider")')();
  }
  return new Function('return import("onnxruntime-node")')();
}
async function ensureLoaded(msg) {
  if (session) return;
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const fs = await import("fs");
    const dir = msg.modelDir;
    manifest = parseDeciderManifest(JSON.parse(fs.readFileSync(import_path.default.join(dir, "manifest.json"), "utf8")));
    const tdir = import_path.default.join(dir, manifest.tokenizerDir);
    const tokJson = JSON.parse(fs.readFileSync(import_path.default.join(tdir, "tokenizer.json"), "utf8"));
    const tokCfg = JSON.parse(fs.readFileSync(import_path.default.join(tdir, "tokenizer_config.json"), "utf8"));
    ortMod = await loadOrt(manifest.runtime);
    const T = await loadTransformers();
    const tok = adaptTokenizer(new T.PreTrainedTokenizer(tokJson, tokCfg), specialTokensFromConfig(tokCfg));
    if (manifest.kind === "seq-cls") {
      student = prepareStudent(tok, { maxLen: manifest.config.maxLen, stateRoom: manifest.stateRoom, labels: manifest.labels });
    } else {
      prepared = prepareDecider(tok, manifest.config);
    }
    const bounds = { ...getBoundedOnnxSessionOptions(), intraOpNumThreads: msg.threads };
    const eps = Array.isArray(msg.eps) && msg.eps.length ? msg.eps : ["cpu"];
    const graph = import_path.default.join(dir, manifest.graph);
    let lastErr = null;
    for (let i = 0; i < eps.length && !session; i++) {
      try {
        session = await ortMod.InferenceSession.create(graph, { ...bounds, executionProviders: ortExecutionProviders(eps.slice(i)) });
        parentPort.postMessage({ type: "status", status: { type: "ready", backend: "onnx", modelPath: dir }, ep: eps[i] });
      } catch (e) {
        lastErr = e;
      }
    }
    if (!session) throw lastErr ?? new Error("decider session not created");
  })();
  try {
    await loadingPromise;
  } catch (e) {
    loadingPromise = null;
    session = null;
    prepared = null;
    student = null;
    manifest = null;
    const f = classifyWorkerFailure(e);
    parentPort.postMessage({
      type: "status",
      status: { type: f.recoverable ? "degraded" : "failed", backend: "none", reason: f.reason, message: f.message, recoverable: f.recoverable }
    });
    throw e;
  }
}
async function run(b) {
  const T = ortMod.Tensor;
  const out = await session.run({
    input_ids: new T("int64", b.inputIds, [b.n, b.length]),
    attention_mask: new T("int64", b.attentionMask, [b.n, b.length]),
    marker_pos: new T("int64", b.markerPos, [b.n, b.markerCols]),
    marker_mask: new T("bool", b.markerMask, [b.n, b.markerCols]),
    qtype: new T("int64", b.qtype, [b.n])
  });
  const logits = out.logits;
  if (!logits) throw new Error(`decider graph has no 'logits' output; outputs were [${Object.keys(out).join(", ")}]`);
  return Array.from(logits.data).slice(0, b.markerCols);
}
async function runStudent(x) {
  const T = ortMod.Tensor;
  const out = await session.run({
    input_ids: new T("int64", x.inputIds, [1, x.length]),
    attention_mask: new T("int64", x.attentionMask, [1, x.length])
  });
  const logits = out.logits;
  if (!logits) throw new Error(`decider graph has no 'logits' output; outputs were [${Object.keys(out).join(", ")}]`);
  return Array.from(logits.data);
}
parentPort.onMessage(async (msg) => {
  if (msg?.type === "shutdown") {
    process.exit(0);
  }
  try {
    if (msg.type === "init") {
      await ensureLoaded(msg);
      parentPort.postMessage({ type: "ready", requestId: msg.requestId, thresholds: manifest.thresholds, modelVersion: manifest.version });
      return;
    }
    if (msg.type === "decide") {
      await ensureLoaded(msg);
      const t0 = Date.now();
      const decision = student ? await decideStudentRequest(student, msg.req, runStudent) : await decideRequest(prepared, msg.req, run);
      parentPort.postMessage({ type: "result", requestId: msg.requestId, result: { ...decision, ms: Date.now() - t0 } });
      return;
    }
  } catch (e) {
    parentPort.postMessage({ type: "error", requestId: msg?.requestId, error: e instanceof Error ? e.message : String(e) });
  }
});
parentPort.postMessage({ type: "hello" });
