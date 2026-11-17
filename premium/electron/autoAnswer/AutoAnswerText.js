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

// premium/electron/autoAnswer/AutoAnswerText.ts
var AutoAnswerText_exports = {};
__export(AutoAnswerText_exports, {
  echoContainment: () => echoContainment,
  isMidWordCut: () => isMidWordCut,
  joinTranscriptParts: () => joinTranscriptParts,
  normalizeForCompare: () => normalizeForCompare,
  tokenContainment: () => tokenContainment
});
module.exports = __toCommonJS(AutoAnswerText_exports);
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
function echoContainment(needle, haystack) {
  const nq = normalizeForCompare(needle).split(" ").filter(Boolean);
  if (nq.length === 0) return 0;
  const hv = normalizeForCompare(haystack).split(" ").filter(Boolean);
  const have = new Set(hv);
  let hit = 0;
  for (const t of nq) {
    if (have.has(t)) {
      hit++;
      continue;
    }
    if (t.length < 3) continue;
    if (hv.some((h) => h.length >= 3 && (h.startsWith(t) || t.startsWith(h)))) hit++;
  }
  return hit / nq.length;
}
function isMidWordCut(finalText, latestInterim) {
  if (!finalText || !latestInterim) return false;
  if (latestInterim.length <= finalText.length) return false;
  if (!latestInterim.startsWith(finalText)) return false;
  const before = finalText[finalText.length - 1];
  const after = latestInterim[finalText.length];
  const word = (c) => /\w/.test(c);
  const apos = (c) => c === "'" || c === "\u2019";
  if (apos(before) && apos(after)) return false;
  return (word(before) || apos(before)) && (word(after) || apos(after));
}
function joinTranscriptParts(parts) {
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    if (i === 0) {
      out = parts[i].text;
      continue;
    }
    out += (parts[i - 1].glueNext ? "" : " ") + parts[i].text;
  }
  return out.replace(/\s+/g, " ").trim();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  echoContainment,
  isMidWordCut,
  joinTranscriptParts,
  normalizeForCompare,
  tokenContainment
});
