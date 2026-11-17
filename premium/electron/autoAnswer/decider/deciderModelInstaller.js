"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// premium/electron/autoAnswer/decider/deciderModelInstaller.ts
var deciderModelInstaller_exports = {};
__export(deciderModelInstaller_exports, {
  DECIDER_DOWNLOAD_PATH: () => DECIDER_DOWNLOAD_PATH,
  DeciderModelInstaller: () => DeciderModelInstaller
});
module.exports = __toCommonJS(deciderModelInstaller_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_crypto = __toESM(require("crypto"));

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

// premium/electron/autoAnswer/decider/deciderModelInstaller.ts
var DECIDER_DOWNLOAD_PATH = "/v1/models/auto-answer-decider/download";
var InstallError = class extends Error {
  constructor(message, retryable, notEntitled = false) {
    super(message);
    this.retryable = retryable;
    this.notEntitled = notEntitled;
  }
  retryable;
  notEntitled;
};
var sha256File = (p) => import_crypto.default.createHash("sha256").update(import_fs.default.readFileSync(p)).digest("hex");
var DeciderModelInstaller = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  running = null;
  progress = null;
  lastError = null;
  shipped;
  manifest() {
    if (this.shipped !== void 0) return this.shipped;
    try {
      this.shipped = parseDeciderManifest(JSON.parse(import_fs.default.readFileSync(import_path.default.join(this.deps.bundledDir, "manifest.json"), "utf8")));
    } catch (e) {
      this.deps.log?.warn?.(`[DeciderInstaller] shipped manifest unreadable: ${e instanceof Error ? e.message : e}`);
      this.shipped = null;
    }
    return this.shipped;
  }
  variantEntry() {
    const m = this.manifest();
    const c = this.deps.choice;
    if (!m || !c) return null;
    const v = m.variants[c.variant];
    return v && v.runtime === c.runtime ? { m, c, v } : null;
  }
  targetDir() {
    const e = this.variantEntry();
    return e ? import_path.default.join(this.deps.installRoot, `${e.m.version}-${e.c.variant}`) : null;
  }
  /** The installed model directory for this app version and machine, or null. Size-checked; sha256 was checked at install. */
  installedDir() {
    const e = this.variantEntry();
    const dir = this.targetDir();
    if (!e || !dir) return null;
    try {
      const installed = parseDeciderManifest(JSON.parse(import_fs.default.readFileSync(import_path.default.join(dir, "manifest.json"), "utf8")));
      if (installed.version !== e.m.version || installed.graph !== e.v.graph || installed.runtime !== e.v.runtime) return null;
      return import_fs.default.statSync(import_path.default.join(dir, e.v.graph)).size === e.v.bytes ? dir : null;
    } catch {
      return null;
    }
  }
  status() {
    const e = this.variantEntry();
    if (!e) return { state: "unsupported" };
    const dir = this.installedDir();
    if (dir) return { state: "installed", variant: e.c.variant, version: e.m.version, dir };
    if (this.running && this.progress) return { state: "downloading", variant: e.c.variant, ...this.progress };
    if (!this.deps.credential()) return { state: "not_entitled" };
    if (this.lastError) return { state: "error", variant: e.c.variant, ...this.lastError };
    return { state: "available", variant: e.c.variant, bytes: e.v.bytes };
  }
  /** Download, verify and install. Concurrent calls share one run. */
  install(onProgress, signal) {
    if (this.running) return this.running;
    this.running = this.run(onProgress, signal).finally(() => {
      this.running = null;
      this.progress = null;
    });
    return this.running;
  }
  /** Delete every installed copy (Settings "Remove"). */
  remove() {
    try {
      import_fs.default.rmSync(this.deps.installRoot, { recursive: true, force: true });
    } catch {
    }
    this.lastError = null;
  }
  async run(onProgress, signal) {
    const e = this.variantEntry();
    const dir = this.targetDir();
    if (!e || !dir) return { state: "unsupported" };
    if (this.installedDir()) return this.status();
    const cred = this.deps.credential();
    if (!cred) return { state: "not_entitled" };
    const partial = `${dir}.partial`;
    this.lastError = null;
    try {
      const parts = await this.requestLinks(cred, e.m.version, e.c.variant, signal);
      const total = parts.reduce((n, p) => n + p.bytes, 0);
      if (total !== e.v.bytes) throw new InstallError("the server offered a model of the wrong size", false);
      import_fs.default.rmSync(partial, { recursive: true, force: true });
      import_fs.default.mkdirSync(partial, { recursive: true });
      this.progress = { received: 0, total };
      onProgress?.(this.status());
      await this.downloadGraph(parts, import_path.default.join(partial, e.v.graph), e.v.sha256, signal, (received) => {
        this.progress = { received, total };
        onProgress?.(this.status());
      });
      for (const f of e.m.files.filter((x) => x.path !== e.v.graph)) {
        const src = import_path.default.join(this.deps.bundledDir, ...f.path.split("/"));
        if (sha256File(src) !== f.sha256) throw new InstallError(`shipped ${f.path} does not match its manifest`, false);
        const dst = import_path.default.join(partial, ...f.path.split("/"));
        import_fs.default.mkdirSync(import_path.default.dirname(dst), { recursive: true });
        import_fs.default.copyFileSync(src, dst);
      }
      const raw = JSON.parse(import_fs.default.readFileSync(import_path.default.join(this.deps.bundledDir, "manifest.json"), "utf8"));
      delete raw.variants;
      raw.graph = e.v.graph;
      raw.runtime = e.v.runtime;
      raw.installed_variant = e.c.variant;
      raw.files = [{ path: e.v.graph, sha256: e.v.sha256, bytes: e.v.bytes }, ...e.m.files.filter((x) => x.path !== e.v.graph)];
      import_fs.default.writeFileSync(import_path.default.join(partial, "manifest.json"), JSON.stringify(raw, null, 2));
      if (import_fs.default.existsSync(this.deps.installRoot)) {
        for (const name of import_fs.default.readdirSync(this.deps.installRoot)) {
          const p = import_path.default.join(this.deps.installRoot, name);
          if (p !== partial) import_fs.default.rmSync(p, { recursive: true, force: true });
        }
      }
      import_fs.default.renameSync(partial, dir);
      this.deps.log?.info?.(`[DeciderInstaller] installed ${e.m.version} ${e.c.variant}`);
      const done = this.status();
      onProgress?.(done);
      return done;
    } catch (err) {
      try {
        import_fs.default.rmSync(partial, { recursive: true, force: true });
      } catch {
      }
      this.progress = null;
      const ie = err instanceof InstallError ? err : new InstallError(signal?.aborted ? "cancelled" : `network: ${err instanceof Error ? err.message : String(err)}`, true);
      if (ie.notEntitled) {
        this.lastError = null;
        const s2 = { state: "not_entitled" };
        onProgress?.(s2);
        return s2;
      }
      this.lastError = { error: ie.message, retryable: ie.retryable };
      this.deps.log?.warn?.(`[DeciderInstaller] install failed: ${ie.message}`);
      const s = this.status();
      onProgress?.(s);
      return s;
    }
  }
  async requestLinks(cred, version, variant, signal) {
    const headers = { "content-type": "application/json" };
    if (cred.kind === "api_key") headers["x-natively-key"] = cred.key;
    else {
      headers["x-natively-pro-license"] = cred.key;
      headers["x-natively-pro-provider"] = cred.provider;
    }
    const f = this.deps.fetchImpl ?? fetch;
    const res = await f(`${this.deps.apiBase}${DECIDER_DOWNLOAD_PATH}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ version, variant }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2e4)]) : AbortSignal.timeout(2e4)
    });
    const body = await res.json().catch(() => null);
    if (res.status === 401 || res.status === 403) throw new InstallError(String(body?.error || "not entitled"), false, true);
    if (res.status === 404) throw new InstallError("this model version is no longer offered; update Natively", false);
    if (res.status === 429) throw new InstallError("too many downloads today; try again tomorrow", true);
    if (!res.ok || !body?.ok || !Array.isArray(body.parts) || body.parts.length < 1) throw new InstallError(`server answered ${res.status}`, true);
    for (const p of body.parts) {
      if (typeof p?.url !== "string" || !/^https:\/\//.test(p.url) || !/^[0-9a-f]{64}$/.test(String(p.sha256)) || !Number.isInteger(p.bytes)) {
        throw new InstallError("the server answered an unreadable part list", true);
      }
    }
    return body.parts;
  }
  async downloadGraph(parts, dest, graphSha, signal, onBytes) {
    const f = this.deps.fetchImpl ?? fetch;
    const whole = import_crypto.default.createHash("sha256");
    const fd = import_fs.default.openSync(dest, "w");
    let received = 0;
    try {
      for (const p of parts) {
        const res = await f(p.url, { signal });
        if (!res.ok || !res.body) throw new InstallError(`part download answered ${res.status}`, true);
        const h = import_crypto.default.createHash("sha256");
        let n = 0;
        const reader = res.body.getReader();
        for (; ; ) {
          const { done, value } = await reader.read();
          if (done) break;
          const buf = Buffer.from(value);
          n += buf.length;
          if (n > p.bytes) throw new InstallError("a part was longer than announced", true);
          h.update(buf);
          whole.update(buf);
          import_fs.default.writeSync(fd, buf);
          received += buf.length;
          onBytes(received);
        }
        if (n !== p.bytes || h.digest("hex") !== p.sha256) throw new InstallError("a downloaded part failed its checksum", true);
      }
    } finally {
      import_fs.default.closeSync(fd);
    }
    if (whole.digest("hex") !== graphSha) throw new InstallError("the downloaded model does not match this app\u2019s manifest", false);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DECIDER_DOWNLOAD_PATH,
  DeciderModelInstaller
});
