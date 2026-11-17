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

// premium/electron/autoAnswer/decider/deciderPlatform.ts
var deciderPlatform_exports = {};
__export(deciderPlatform_exports, {
  deciderIntraOpThreads: () => deciderIntraOpThreads,
  executionProvidersFor: () => executionProvidersFor,
  ortExecutionProviders: () => ortExecutionProviders,
  resolveDeciderMode: () => resolveDeciderMode
});
module.exports = __toCommonJS(deciderPlatform_exports);
function resolveDeciderMode(env, _isPackaged) {
  const raw = (env.NATIVELY_AUTO_ANSWER_DECIDER ?? "").trim().toLowerCase();
  if (raw === "off" || raw === "shadow" || raw === "on") return raw;
  return "on";
}
function executionProvidersFor(platform, env = {}) {
  const wanted = (env.NATIVELY_DECIDER_EP ?? "").trim().toLowerCase();
  switch (platform) {
    case "darwin":
      return wanted === "coreml" ? ["coreml", "cpu"] : ["cpu"];
    case "win32":
      return wanted === "dml" || wanted === "directml" ? ["dml", "cpu"] : ["cpu"];
    default:
      throw new Error(`Unsupported platform for the Auto Answer decider: ${platform}`);
  }
}
function ortExecutionProviders(eps) {
  return eps.map((ep) => {
    if (ep === "coreml") return { name: "coreml", coreMlFlags: 0 };
    if (ep === "dml") return { name: "dml" };
    return "cpu";
  });
}
function deciderIntraOpThreads(logicalCores, env = {}) {
  const override = Number.parseInt(env.NATIVELY_DECIDER_THREADS ?? "", 10);
  if (Number.isFinite(override) && override > 0) return override;
  return Math.max(1, Math.min(4, Math.floor((logicalCores || 2) / 2)));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  deciderIntraOpThreads,
  executionProvidersFor,
  ortExecutionProviders,
  resolveDeciderMode
});
