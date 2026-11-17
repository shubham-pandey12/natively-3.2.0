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

// premium/electron/autoAnswer/autoAnswerAccess.ts
var autoAnswerAccess_exports = {};
__export(autoAnswerAccess_exports, {
  AUTO_ANSWER_ACCESS_REQUIRED: () => AUTO_ANSWER_ACCESS_REQUIRED,
  TRAINING_CONSENT_VERSION: () => TRAINING_CONSENT_VERSION,
  autoAnswerAccess: () => autoAnswerAccess,
  isConsentCurrent: () => isConsentCurrent,
  newTrainingConsent: () => newTrainingConsent,
  scrubKnownNames: () => scrubKnownNames,
  scrubTranscriptText: () => scrubTranscriptText
});
module.exports = __toCommonJS(autoAnswerAccess_exports);
var TRAINING_CONSENT_VERSION = 1;
var AUTO_ANSWER_ACCESS_REQUIRED = "auto_answer_access_required";
function isConsentCurrent(consent) {
  if (!consent || typeof consent !== "object") return false;
  const c = consent;
  return c.version === TRAINING_CONSENT_VERSION && typeof c.grantedAt === "string" && !Number.isNaN(Date.parse(c.grantedAt));
}
function autoAnswerAccess(input) {
  const consented = isConsentCurrent(input.consent);
  if (input.proOrTrial) return { allowed: true, basis: "pro", uploads: consented };
  if (consented) return { allowed: true, basis: "sharing", uploads: true };
  return { allowed: false, basis: "none", uploads: false, error: AUTO_ANSWER_ACCESS_REQUIRED };
}
function newTrainingConsent(now = /* @__PURE__ */ new Date()) {
  return { version: TRAINING_CONSENT_VERSION, grantedAt: now.toISOString() };
}
function scrubTranscriptText(text, knownNames = []) {
  return scrubKnownNames(scrubContacts(text), knownNames);
}
function scrubKnownNames(text, knownNames) {
  const parts = /* @__PURE__ */ new Set();
  for (const raw of knownNames) {
    const name = String(raw ?? "").trim();
    if (!name || name.length > 80) continue;
    if (name.length >= 3) parts.add(name);
    for (const p of name.split(/[\s.,'’()-]+/)) if (p.length >= 3) parts.add(p);
  }
  if (!parts.size) return text;
  const alts = [...parts].sort((a, b) => b.length - a.length).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join("|")})(?![\\p{L}\\p{N}])`, "giu");
  return text.replace(re, "[name]");
}
function scrubContacts(text) {
  return text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]").replace(/\bhttps?:\/\/\S+/gi, "[link]").replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, (m) => m.replace(/\D/g, "").length >= 8 ? "[number]" : m).replace(/\d{6,}/g, "[number]");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AUTO_ANSWER_ACCESS_REQUIRED,
  TRAINING_CONSENT_VERSION,
  autoAnswerAccess,
  isConsentCurrent,
  newTrainingConsent,
  scrubKnownNames,
  scrubTranscriptText
});
