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

// premium/electron/autoAnswer/training/TrainingTranscriptUploader.ts
var TrainingTranscriptUploader_exports = {};
__export(TrainingTranscriptUploader_exports, {
  MAX_BODY_BYTES: () => MAX_BODY_BYTES,
  MAX_TURNS: () => MAX_TURNS,
  MAX_TURN_CHARS: () => MAX_TURN_CHARS,
  TRAINING_SCHEMA_VERSION: () => TRAINING_SCHEMA_VERSION,
  TRAINING_UPLOAD_PATH: () => TRAINING_UPLOAD_PATH,
  TrainingTranscriptUploader: () => TrainingTranscriptUploader,
  bodyBytes: () => bodyBytes,
  buildTrainingBody: () => buildTrainingBody,
  fitBody: () => fitBody,
  offerTrainingMeeting: () => offerTrainingMeeting,
  setTrainingMeetingSink: () => setTrainingMeetingSink,
  splitLine: () => splitLine,
  uploadTimeoutMs: () => uploadTimeoutMs
});
module.exports = __toCommonJS(TrainingTranscriptUploader_exports);
var import_node_fs = __toESM(require("node:fs"));
var import_node_path = __toESM(require("node:path"));
var import_node_crypto = __toESM(require("node:crypto"));

// premium/electron/autoAnswer/autoAnswerAccess.ts
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

// premium/electron/autoAnswer/training/TrainingTranscriptUploader.ts
var TRAINING_UPLOAD_PATH = "/v1/training/meeting-transcripts";
var TRAINING_SCHEMA_VERSION = 1;
var MAX_FILES = 200;
var MAX_TURNS = 2e5;
var MAX_TURN_CHARS = 4e3;
var MAX_BODY_BYTES = 20 * 1024 * 1024;
var MIN_TURNS_AFTER_413 = 50;
function buildTrainingBody(m, ctx, maxBytes = MAX_BODY_BYTES) {
  const turns = [];
  outer: for (const seg of m.transcript) {
    if (seg.final === false) continue;
    const text = scrubTranscriptText(String(seg.text ?? "").trim(), m.knownNames ?? []);
    if (!text) continue;
    const s = seg.speaker === "user" || seg.speaker === "me" ? "user" : "others";
    const t = Math.max(0, Math.round(seg.timestamp - m.startTime));
    for (const x of splitLine(text, MAX_TURN_CHARS)) {
      turns.push({ s, t, x });
      if (turns.length >= MAX_TURNS) break outer;
    }
  }
  const body = {
    schema: TRAINING_SCHEMA_VERSION,
    // Not the local meeting id: a one-way reference, stable for re-sends only.
    meeting_ref: import_node_crypto.default.createHash("sha256").update(`${ctx.installId}:${m.meetingId}`).digest("hex").slice(0, 32),
    install_id: ctx.installId,
    consent_version: ctx.consent.version,
    consent_granted_at: ctx.consent.grantedAt,
    basis: ctx.basis,
    mode: m.mode,
    duration_ms: Math.max(0, Math.round(m.durationMs)),
    // The day only, never the time of day.
    started_day: new Date(m.startTime).toISOString().slice(0, 10),
    app_version: ctx.appVersion,
    platform: ctx.platform,
    turns
  };
  return fitBody(body, maxBytes);
}
function splitLine(text, max) {
  const out = [];
  let rest = text;
  while (rest.length > max) {
    let cut = max;
    const sp = rest.lastIndexOf(" ", max);
    if (sp > max / 2) cut = sp;
    else if (/[\uD800-\uDBFF]/.test(rest[cut - 1])) cut -= 1;
    const piece = rest.slice(0, cut).trim();
    if (piece) out.push(piece);
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}
function bodyBytes(body) {
  return Buffer.byteLength(JSON.stringify(body), "utf8");
}
function fitBody(body, maxBytes) {
  if (bodyBytes(body) <= maxBytes) return body;
  let used = bodyBytes({ ...body, turns: [] });
  let n = 0;
  for (const turn of body.turns) {
    const b = Buffer.byteLength(JSON.stringify(turn), "utf8") + 1;
    if (used + b > maxBytes) break;
    used += b;
    n++;
  }
  return { ...body, turns: body.turns.slice(0, n) };
}
function uploadTimeoutMs(bytes) {
  return Math.min(10 * 6e4, 6e4 + Math.ceil(bytes / (1024 * 1024)) * 3e4);
}
var meetingSink = null;
function setTrainingMeetingSink(fn) {
  meetingSink = fn;
}
function offerTrainingMeeting(m) {
  try {
    meetingSink?.(m);
  } catch {
  }
}
var TrainingTranscriptUploader = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  ranThisMeeting = false;
  flushing = false;
  timer = null;
  log(m) {
    (this.deps.log ?? ((x) => console.log(`[TrainingUpload] ${x}`)))(m);
  }
  now() {
    return (this.deps.now ?? Date.now)();
  }
  meetingStarted() {
    this.ranThisMeeting = false;
  }
  /** Called whenever Auto Answer acts on this meeting's speech (isAutoAnswerActive). */
  noteAutoAnswerRan() {
    this.ranThisMeeting = true;
  }
  /** At meeting end, after the meeting is saved. Never throws. */
  offerMeeting(m) {
    try {
      const ran = this.ranThisMeeting;
      this.ranThisMeeting = false;
      if (!ran) return;
      const access = this.deps.access();
      const consent = this.deps.consent();
      const installId = this.deps.installId();
      if (!access.uploads || access.basis === "none" || !consent || !installId) return;
      const body = buildTrainingBody(m, { installId, consent, basis: access.basis, appVersion: this.deps.appVersion, platform: this.deps.platform });
      if (!body.turns.length) return;
      const lines = m.transcript.filter((seg) => seg.final !== false && String(seg.text ?? "").trim()).length;
      if (body.turns.length < lines) this.log(`meeting over the upload budget: sending its first ${body.turns.length} lines`);
      import_node_fs.default.mkdirSync(this.deps.dir, { recursive: true });
      const file = import_node_path.default.join(this.deps.dir, `${body.meeting_ref}.json`);
      import_node_fs.default.writeFileSync(`${file}.tmp`, JSON.stringify({ body, attempts: 0, nextAt: 0 }));
      import_node_fs.default.renameSync(`${file}.tmp`, file);
      this.trim();
      this.log(`queued ${body.turns.length} lines`);
      void this.flush();
    } catch (e) {
      this.log(`not queued: ${e?.message}`);
    }
  }
  start() {
    void this.flush();
    if (!this.timer) {
      this.timer = setInterval(() => void this.flush(), 30 * 6e4);
      this.timer.unref?.();
    }
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  files() {
    try {
      return import_node_fs.default.readdirSync(this.deps.dir).filter((f) => f.endsWith(".json")).sort((a, b) => import_node_fs.default.statSync(import_node_path.default.join(this.deps.dir, a)).mtimeMs - import_node_fs.default.statSync(import_node_path.default.join(this.deps.dir, b)).mtimeMs);
    } catch {
      return [];
    }
  }
  trim() {
    const f = this.files();
    for (const name of f.slice(0, Math.max(0, f.length - MAX_FILES))) {
      try {
        import_node_fs.default.rmSync(import_node_path.default.join(this.deps.dir, name), { force: true });
      } catch {
      }
    }
  }
  async headers(json) {
    let caller = {};
    try {
      caller = await this.deps.callerHeaders();
    } catch {
    }
    const h = { ...caller };
    if (json) h["content-type"] = "application/json";
    const id = this.deps.installId();
    if (id) h["x-install-id"] = id;
    return h;
  }
  /** Send what is due. Consent is re-checked first: withdrawn means nothing goes out. */
  async flush() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      if (!this.deps.access().uploads) return;
      const fetchImpl = this.deps.fetchImpl ?? fetch;
      for (const name of this.files()) {
        const file = import_node_path.default.join(this.deps.dir, name);
        let entry;
        try {
          entry = JSON.parse(import_node_fs.default.readFileSync(file, "utf8"));
        } catch {
          import_node_fs.default.rmSync(file, { force: true });
          continue;
        }
        if (entry.nextAt > this.now()) continue;
        let status = 0;
        for (; ; ) {
          const payload = JSON.stringify(entry.body);
          try {
            const res = await fetchImpl(`${this.deps.apiBase()}${TRAINING_UPLOAD_PATH}`, {
              method: "POST",
              headers: await this.headers(true),
              body: payload,
              signal: AbortSignal.timeout(uploadTimeoutMs(Buffer.byteLength(payload, "utf8")))
            });
            status = res.status;
          } catch {
            status = 0;
          }
          if (status !== 413 || entry.body.turns.length <= MIN_TURNS_AFTER_413) break;
          entry.body = { ...entry.body, turns: entry.body.turns.slice(0, Math.ceil(entry.body.turns.length / 2)) };
          try {
            import_node_fs.default.writeFileSync(file, JSON.stringify(entry));
          } catch {
          }
          this.log(`server said 413: retrying with the first ${entry.body.turns.length} lines`);
        }
        if (status >= 200 && status < 300) {
          import_node_fs.default.rmSync(file, { force: true });
          this.log("sent");
          continue;
        }
        if (status === 400 || status === 413 || status === 422) {
          import_node_fs.default.rmSync(file, { force: true });
          this.log(`dropped (server said ${status})`);
          continue;
        }
        entry.attempts += 1;
        entry.nextAt = this.now() + Math.min(24 * 36e5, 6e4 * 2 ** Math.min(entry.attempts, 10));
        try {
          import_node_fs.default.writeFileSync(file, JSON.stringify(entry));
        } catch {
        }
      }
    } finally {
      this.flushing = false;
    }
  }
  /** Consent withdrawn: nothing queued leaves this device. */
  withdraw() {
    for (const name of this.files()) {
      try {
        import_node_fs.default.rmSync(import_node_path.default.join(this.deps.dir, name), { force: true });
      } catch {
      }
    }
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MAX_BODY_BYTES,
  MAX_TURNS,
  MAX_TURN_CHARS,
  TRAINING_SCHEMA_VERSION,
  TRAINING_UPLOAD_PATH,
  TrainingTranscriptUploader,
  bodyBytes,
  buildTrainingBody,
  fitBody,
  offerTrainingMeeting,
  setTrainingMeetingSink,
  splitLine,
  uploadTimeoutMs
});
