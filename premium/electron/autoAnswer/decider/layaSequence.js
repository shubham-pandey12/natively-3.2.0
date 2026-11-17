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

// premium/electron/autoAnswer/decider/layaSequence.ts
var layaSequence_exports = {};
__export(layaSequence_exports, {
  DEFAULT_HEAD_MAX_LEN: () => DEFAULT_HEAD_MAX_LEN,
  DEFAULT_MAX_LEN: () => DEFAULT_MAX_LEN,
  QTYPE_CHOICE: () => QTYPE_CHOICE,
  TEMP_MAX: () => TEMP_MAX,
  TEMP_MIN: () => TEMP_MIN,
  buildHead: () => buildHead,
  buildSequence: () => buildSequence,
  clampTemperature: () => clampTemperature,
  collate: () => collate,
  countStateTokens: () => countStateTokens,
  decodeChoice: () => decodeChoice,
  renderChoiceOptions: () => renderChoiceOptions,
  renderCriterion: () => renderCriterion,
  stateRoom: () => stateRoom,
  tempBucket: () => tempBucket,
  toInternalChoice: () => toInternalChoice
});
module.exports = __toCommonJS(layaSequence_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_HEAD_MAX_LEN,
  DEFAULT_MAX_LEN,
  QTYPE_CHOICE,
  TEMP_MAX,
  TEMP_MIN,
  buildHead,
  buildSequence,
  clampTemperature,
  collate,
  countStateTokens,
  decodeChoice,
  renderChoiceOptions,
  renderCriterion,
  stateRoom,
  tempBucket,
  toInternalChoice
});
