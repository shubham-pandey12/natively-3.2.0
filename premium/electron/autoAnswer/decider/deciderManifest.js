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

// premium/electron/autoAnswer/decider/deciderManifest.ts
var deciderManifest_exports = {};
__export(deciderManifest_exports, {
  DECIDER_MANIFEST_SCHEMA: () => DECIDER_MANIFEST_SCHEMA,
  parseDeciderManifest: () => parseDeciderManifest
});
module.exports = __toCommonJS(deciderManifest_exports);

// premium/electron/autoAnswer/AutoAnswerJudge.ts
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
  const stateRoom = m.state_room ?? 0;
  if (kind === "seq-cls" && !(Number.isInteger(stateRoom) && stateRoom > 0)) throw new Error("manifest: state_room");
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
  if (kind === "seq-cls" && stateRoom > maxLen - 2) throw new Error("manifest: state_room exceeds max_len");
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
    stateRoom,
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DECIDER_MANIFEST_SCHEMA,
  parseDeciderManifest
});
