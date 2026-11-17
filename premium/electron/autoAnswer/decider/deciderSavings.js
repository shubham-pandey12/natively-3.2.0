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

// premium/electron/autoAnswer/decider/deciderSavings.ts
var deciderSavings_exports = {};
__export(deciderSavings_exports, {
  DeciderSavingsLedger: () => DeciderSavingsLedger,
  EXPECTED_LOCAL_SHARE: () => EXPECTED_LOCAL_SHARE,
  JUDGE_REFERENCE: () => JUDGE_REFERENCE
});
module.exports = __toCommonJS(deciderSavings_exports);
var import_fs = __toESM(require("fs"));
var JUDGE_REFERENCE = Object.freeze({ model: "Gemini 3.1 Flash-Lite", inPerM: 0.25, outPerM: 1.5, outTokensPerCall: 40, charsPerToken: 4 });
var EXPECTED_LOCAL_SHARE = 0.55;
var KEEP_DAYS = 60;
var WINDOW_DAYS = 7;
var dayKey = (t) => new Date(t).toISOString().slice(0, 10);
var usd = (tokensIn, calls) => (tokensIn * JUDGE_REFERENCE.inPerM + calls * JUDGE_REFERENCE.outTokensPerCall * JUDGE_REFERENCE.outPerM) / 1e6;
var DeciderSavingsLedger = class {
  constructor(opts) {
    this.opts = opts;
    this.data = this.read();
  }
  opts;
  data;
  writeTimer = null;
  now() {
    return this.opts.now?.() ?? Date.now();
  }
  read() {
    const empty = { schema: 1, installedAt: null, days: {} };
    if (!this.opts.file) return empty;
    try {
      const j = JSON.parse(import_fs.default.readFileSync(this.opts.file, "utf8"));
      if (j?.schema !== 1 || typeof j.days !== "object" || !j.days) return empty;
      const days = {};
      for (const [k, v] of Object.entries(j.days)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
        const n = (x) => Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0;
        days[k] = { judged: n(v?.judged), local: n(v?.local), judgeChars: n(v?.judgeChars) };
      }
      return { schema: 1, installedAt: typeof j.installedAt === "string" && !Number.isNaN(Date.parse(j.installedAt)) ? j.installedAt : null, days };
    } catch {
      return empty;
    }
  }
  day() {
    const k = dayKey(this.now());
    return this.data.days[k] ??= { judged: 0, local: 0, judgeChars: 0 };
  }
  save() {
    if (!this.opts.file || this.writeTimer) return;
    this.writeTimer = setTimeout(() => this.flush(), this.opts.writeDelayMs ?? 2e3);
    this.writeTimer?.unref?.();
  }
  flush() {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    if (!this.opts.file) return;
    const cutoff = dayKey(this.now() - KEEP_DAYS * 864e5);
    for (const k of Object.keys(this.data.days)) if (k < cutoff) delete this.data.days[k];
    try {
      const tmp = `${this.opts.file}.tmp`;
      import_fs.default.writeFileSync(tmp, JSON.stringify(this.data));
      import_fs.default.renameSync(tmp, this.opts.file);
    } catch {
    }
  }
  /** One judge call, with its prompt's length in characters. */
  recordJudgeCall(promptChars) {
    const d = this.day();
    d.judged++;
    d.judgeChars += Math.max(0, Math.floor(promptChars) || 0);
    this.save();
  }
  /** One moment the downloaded model decided without the judge. */
  recordLocalDecision() {
    this.day().local++;
    this.save();
  }
  markInstalled() {
    if (!this.data.installedAt) {
      this.data.installedAt = new Date(this.now()).toISOString();
      this.save();
    }
  }
  markRemoved() {
    this.data.installedAt = null;
    this.save();
  }
  summary() {
    const now = this.now();
    const installedAt = this.data.installedAt;
    const installDay = installedAt ? dayKey(Date.parse(installedAt)) : null;
    const days = Object.entries(this.data.days);
    const all = days.reduce((a, [, d]) => ({ calls: a.calls + d.judged, chars: a.chars + d.judgeChars }), { calls: 0, chars: 0 });
    const tokensPerCall = all.calls ? all.chars / all.calls / JUDGE_REFERENCE.charsPerToken : 0;
    const inTok = (chars) => chars / JUDGE_REFERENCE.charsPerToken;
    const outTok = (calls) => calls * JUDGE_REFERENCE.outTokensPerCall;
    const endKey = installDay ? dayKey(Date.parse(installDay) - 864e5) : dayKey(now);
    const startKey = dayKey(Date.parse(endKey) - (WINDOW_DAYS - 1) * 864e5);
    const b = days.filter(([k]) => k >= startKey && k <= endKey).reduce((a, [, d]) => ({ calls: a.calls + d.judged, chars: a.chars + d.judgeChars }), { calls: 0, chars: 0 });
    const before = { days: WINDOW_DAYS, judgeCalls: b.calls, tokens: Math.round(inTok(b.chars) + outTok(b.calls)), usd: usd(inTok(b.chars), b.calls) };
    let after = null;
    let projection = null;
    if (installDay) {
      const a = days.filter(([k]) => k >= installDay).reduce((x, [, d]) => ({ local: x.local + d.local, judged: x.judged + d.judged, chars: x.chars + d.judgeChars }), { local: 0, judged: 0, chars: 0 });
      const savedIn = a.local * tokensPerCall;
      after = {
        days: Math.max(1, Math.round((now - Date.parse(installedAt)) / 864e5)),
        moments: a.local + a.judged,
        local: a.local,
        judged: a.judged,
        tokensSaved: Math.round(savedIn + outTok(a.local)),
        usdSaved: usd(savedIn, a.local),
        tokensSpent: Math.round(inTok(a.chars) + outTok(a.judged)),
        usdSpent: usd(inTok(a.chars), a.judged)
      };
    } else {
      const saved = Math.round(b.calls * EXPECTED_LOCAL_SHARE);
      const savedIn = b.calls ? saved * (b.chars / b.calls) / JUDGE_REFERENCE.charsPerToken : 0;
      projection = { localShare: EXPECTED_LOCAL_SHARE, judgeCallsSaved: saved, tokensSaved: Math.round(savedIn + outTok(saved)), usdSaved: usd(savedIn, saved) };
    }
    return { installedAt, before, after, projection, reference: JUDGE_REFERENCE };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DeciderSavingsLedger,
  EXPECTED_LOCAL_SHARE,
  JUDGE_REFERENCE
});
