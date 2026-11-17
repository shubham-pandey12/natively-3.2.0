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

// premium/electron/autoAnswer/decider/deciderRuntime.ts
var deciderRuntime_exports = {};
__export(deciderRuntime_exports, {
  chooseDeciderRuntime: () => chooseDeciderRuntime,
  ortModuleFor: () => ortModuleFor
});
module.exports = __toCommonJS(deciderRuntime_exports);
var INT8 = { variant: "int8", runtime: "ort-1.24", host: "utility", ortModule: "onnxruntime-node-decider" };
var Q4 = { variant: "q4", runtime: "ort-1.22", host: "thread", ortModule: "onnxruntime-node" };
function darwinVersion(release) {
  const [major, minor] = release.split(".").map((n) => parseInt(n, 10));
  if (!Number.isFinite(major)) return null;
  return [major, Number.isFinite(minor) ? minor : 0];
}
function chooseDeciderRuntime(platform, arch, release) {
  switch (platform) {
    case "win32":
      return arch === "x64" || arch === "arm64" ? INT8 : null;
    case "darwin": {
      const v = darwinVersion(release);
      if (!v) return null;
      const [major, minor] = v;
      const atLeast133 = major > 22 || major === 22 && minor >= 4;
      if (!atLeast133) return null;
      if (arch === "arm64" && major >= 23) return INT8;
      if (arch === "arm64" || arch === "x64") return Q4;
      return null;
    }
    default:
      return null;
  }
}
function ortModuleFor(runtime) {
  return runtime === "ort-1.24" ? "onnxruntime-node-decider" : "onnxruntime-node";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  chooseDeciderRuntime,
  ortModuleFor
});
