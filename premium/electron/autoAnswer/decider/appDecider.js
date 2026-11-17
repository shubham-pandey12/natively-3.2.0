"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
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

// premium/electron/autoAnswer/AutoAnswerText.ts
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
var init_AutoAnswerText = __esm({
  "premium/electron/autoAnswer/AutoAnswerText.ts"() {
    "use strict";
  }
});

// premium/electron/autoAnswer/AutoAnswerJudge.ts
function parseJudgeVerdict(raw, candidateText) {
  if (!raw) return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const isAsk = obj.is_ask;
  const directed = obj.directed_at_user;
  const complete = obj.complete;
  if (typeof isAsk !== "boolean" || typeof directed !== "boolean" || typeof complete !== "boolean") return null;
  const rawAns = obj.answerability;
  if (typeof rawAns !== "number" || Number.isNaN(rawAns)) return null;
  const answerability = Math.max(0, Math.min(1, rawAns));
  const act = JUDGE_ACTS[String(obj.act)] ?? (isAsk ? "general_question" : "statement");
  let questionText = null;
  if (typeof obj.question_text === "string" && obj.question_text.trim()) {
    const grounded = tokenContainment(obj.question_text, candidateText) >= JUDGE_CONTAINMENT_MIN;
    questionText = grounded ? obj.question_text.trim() : null;
  }
  const rawAction = String(obj.action ?? "").toLowerCase();
  const action = rawAction === "answer" || rawAction === "offer" ? "answer" : rawAction === "silent" ? "silent" : !isAsk || !directed ? "silent" : "answer";
  return { isAsk, directedAtUser: directed, complete, act, answerability, questionText, action };
}
function routeForVerdict(v) {
  if (!v.complete || v.act === "incomplete") return { route: "wait_incomplete" };
  if (!v.isAsk) return { route: "ignore", reason: "not_question" };
  if (v.act === "rhetorical") return { route: "ignore", reason: "rhetorical" };
  if (!v.directedAtUser) return { route: "ignore", reason: "not_question" };
  if (v.action === "silent") return { route: "ignore", reason: "low_answerability" };
  return { route: "evaluate", action: v.action, answerability: v.answerability, act: v.act, questionText: v.questionText };
}
var JUDGE_CONTAINMENT_MIN, JUDGE_CONTEXT_TURNS, JUDGE_TURN_CHAR_CAP, JUDGE_CANDIDATE_CHAR_CAP, JUDGE_ANSWERED_CHAR_CAP, JUDGE_PROMPT_MAX_VARIABLE_CHARS, NOT_A_NAME, NOT_A_VOCATIVE, JUDGE_ACTS;
var init_AutoAnswerJudge = __esm({
  "premium/electron/autoAnswer/AutoAnswerJudge.ts"() {
    "use strict";
    init_AutoAnswerText();
    JUDGE_CONTAINMENT_MIN = 0.65;
    JUDGE_CONTEXT_TURNS = 8;
    JUDGE_TURN_CHAR_CAP = 400;
    JUDGE_CANDIDATE_CHAR_CAP = 1e3;
    JUDGE_ANSWERED_CHAR_CAP = 250;
    JUDGE_PROMPT_MAX_VARIABLE_CHARS = JUDGE_CONTEXT_TURNS * JUDGE_TURN_CHAR_CAP + JUDGE_CANDIDATE_CHAR_CAP + JUDGE_ANSWERED_CHAR_CAP;
    NOT_A_NAME = /* @__PURE__ */ new Set([
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
    NOT_A_VOCATIVE = /* @__PURE__ */ new Set([
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
    JUDGE_ACTS = {
      question: "general_question",
      follow_up: "follow_up_question",
      coding_task: "coding_question",
      behavioral: "behavioral_question",
      technical: "technical_question",
      rhetorical: "rhetorical",
      statement: "statement",
      social: "social",
      incomplete: "incomplete"
    };
  }
});

// premium/electron/autoAnswer/decider/DecisionBackend.ts
function gateDecision(d, t) {
  if (d.truncated) return { action: "escalate", escalateReason: "truncated" };
  const need = t[d.choice];
  if (Number.isFinite(need) && d.answerConfidence >= need) return { action: d.choice };
  return { action: "escalate", escalateReason: "below_threshold" };
}
function labelOfJudgeReply(raw, candidateText) {
  const v = parseJudgeVerdict(raw, candidateText);
  if (!v) return null;
  const route = routeForVerdict(v);
  if (route.route === "wait_incomplete") return "wait";
  return route.route === "evaluate" && route.action === "answer" ? "answer" : "silent";
}
function judgeReplyFor(label) {
  if (label === "answer") {
    return JSON.stringify({ is_ask: true, directed_at_user: true, complete: true, act: "question", action: "answer", answerability: 0.95, question_text: null });
  }
  if (label === "wait") {
    return JSON.stringify({ is_ask: false, directed_at_user: false, complete: false, act: "incomplete", action: "silent", answerability: 0, question_text: null });
  }
  return JSON.stringify({ is_ask: false, directed_at_user: false, complete: true, act: "statement", action: "silent", answerability: 0, question_text: null });
}
var ESCALATE_ALL;
var init_DecisionBackend = __esm({
  "premium/electron/autoAnswer/decider/DecisionBackend.ts"() {
    "use strict";
    init_AutoAnswerJudge();
    ESCALATE_ALL = Object.freeze({ answer: Infinity, silent: Infinity, wait: Infinity });
  }
});

// premium/electron/autoAnswer/decider/deciderManifest.ts
var deciderManifest_exports = {};
__export(deciderManifest_exports, {
  DECIDER_MANIFEST_SCHEMA: () => DECIDER_MANIFEST_SCHEMA,
  parseDeciderManifest: () => parseDeciderManifest
});
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
var DECIDER_MANIFEST_SCHEMA, isNum, safeRel;
var init_deciderManifest = __esm({
  "premium/electron/autoAnswer/decider/deciderManifest.ts"() {
    "use strict";
    init_DecisionBackend();
    DECIDER_MANIFEST_SCHEMA = 1;
    isNum = (x) => typeof x === "number" && Number.isFinite(x);
    safeRel = (p) => typeof p === "string" && p.length > 0 && !/^([a-zA-Z]:)?[\\/]/.test(p) && !p.split(/[\\/]/).includes("..");
  }
});

// electron/utils/onnxThreadConfig.ts
var onnxThreadConfig_exports = {};
__export(onnxThreadConfig_exports, {
  __resetOnnxGateForTests: () => __resetOnnxGateForTests,
  __setAvailableMemoryProbesForTests: () => __setAvailableMemoryProbesForTests,
  acquireOnnxSlot: () => acquireOnnxSlot,
  acquireOnnxSlotWithin: () => acquireOnnxSlotWithin,
  checkMemoryForModelSize: () => checkMemoryForModelSize,
  checkMemoryForOnnxSession: () => checkMemoryForOnnxSession,
  describeModelMemoryShortfall: () => describeModelMemoryShortfall,
  describeOnnxGate: () => describeOnnxGate,
  getAvailableMemoryGB: () => getAvailableMemoryGB,
  getAvailableMemoryReading: () => getAvailableMemoryReading,
  getBoundedOnnxSessionOptions: () => getBoundedOnnxSessionOptions,
  getHighPriorityOnnxBudget: () => getHighPriorityOnnxBudget,
  getMaxConcurrentOnnxSessions: () => getMaxConcurrentOnnxSessions,
  getMinFreeGBForModelSize: () => getMinFreeGBForModelSize,
  getMinFreeGBForOnnxSession: () => getMinFreeGBForOnnxSession,
  hasEnoughMemoryForModelSize: () => hasEnoughMemoryForModelSize,
  hasEnoughMemoryForOnnxSession: () => hasEnoughMemoryForOnnxSession,
  isHighPriorityOnnxBudgetExhausted: () => isHighPriorityOnnxBudgetExhausted,
  measureAvailableMemory: () => measureAvailableMemory
});
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
function readMaxConcurrent() {
  return readIntEnv("NATIVELY_ONNX_MAX_CONCURRENT_SESSIONS", 2);
}
function readHighPriorityBudget() {
  return readIntEnv("NATIVELY_ONNX_HIGH_PRIORITY_SESSIONS", 2);
}
function readMinFreeGB() {
  const raw = process.env.NATIVELY_ONNX_MIN_FREE_GB;
  if (!raw) return 2;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}
function readExclusiveTimeoutMs() {
  return readIntEnv("NATIVELY_ONNX_EXCLUSIVE_TIMEOUT_MS", 15e3);
}
function canAcquireNow(priority, weight) {
  const cap = readMaxConcurrent();
  const current = _sem.inFlightNormal + _sem.inFlightHigh;
  if ((_sem.exclusiveInFlight ?? 0) > 0) return false;
  if (weight > cap) {
    return current === 0;
  }
  if (priority === "high") {
    return _sem.inFlightHigh + weight <= readHighPriorityBudget();
  }
  return _sem.inFlightNormal + weight <= cap;
}
function removeFromQueue(queue, resolver) {
  const idx = queue.indexOf(resolver);
  if (idx !== -1) queue.splice(idx, 1);
}
async function acquireOnnxSlot(priority = "normal", weight = 1) {
  const cap = readMaxConcurrent();
  const exclusive = weight > cap;
  const queue = priority === "high" ? _sem.waitersHigh : _sem.waitersNormal;
  const timeoutMs = readExclusiveTimeoutMs();
  const deadline = exclusive ? Date.now() + timeoutMs : null;
  while (!canAcquireNow(priority, weight)) {
    let resolveWaiter;
    const waiterP = new Promise((resolve) => {
      resolveWaiter = resolve;
      queue.push(resolve);
    });
    if (deadline === null) {
      await waiterP;
      continue;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      removeFromQueue(queue, resolveWaiter);
      throw new Error(
        `ONNX slot acquisition timed out after ${timeoutMs}ms \u2014 weight ${weight} exceeds the concurrency cap (${cap}), and another exclusive-mode session is already holding the gate for its full lifetime. This model cannot run concurrently with the session currently holding the ONNX gate.`
      );
    }
    const TIMEOUT = /* @__PURE__ */ Symbol("onnx-slot-acquire-timeout");
    const outcome = await Promise.race([
      waiterP.then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve(TIMEOUT), remaining))
    ]);
    if (outcome === TIMEOUT) {
      removeFromQueue(queue, resolveWaiter);
      throw new Error(
        `ONNX slot acquisition timed out after ${timeoutMs}ms \u2014 weight ${weight} exceeds the concurrency cap (${cap}), and another exclusive-mode session is already holding the gate for its full lifetime. This model cannot run concurrently with the session currently holding the ONNX gate.`
      );
    }
  }
  if (priority === "high") _sem.inFlightHigh += weight;
  else _sem.inFlightNormal += weight;
  if (exclusive) _sem.exclusiveInFlight = (_sem.exclusiveInFlight ?? 0) + 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (priority === "high") _sem.inFlightHigh -= weight;
    else _sem.inFlightNormal -= weight;
    if (exclusive) _sem.exclusiveInFlight = Math.max(0, (_sem.exclusiveInFlight ?? 0) - 1);
    const highWaiters = _sem.waitersHigh.splice(0);
    const normalWaiters = _sem.waitersNormal.splice(0);
    highWaiters.forEach((resolve) => resolve());
    normalWaiters.forEach((resolve) => resolve());
  };
}
function parseVmStatAvailableGB(out) {
  const pageSize = Number.parseInt(out.match(/page size of (\d+) bytes/)?.[1] || "4096", 10);
  const pages = (label) => {
    const m = out.match(new RegExp(`${label}:\\s+(\\d+)\\.`));
    return m ? Number.parseInt(m[1], 10) : 0;
  };
  const free = pages("Pages free");
  const inactive = pages("Pages inactive");
  const speculative = pages("Pages speculative");
  if (!Number.isFinite(pageSize) || pageSize <= 0) return null;
  const bytes = (free + inactive + speculative) * pageSize;
  return bytes / 1024 ** 3;
}
function parseMeminfoAvailableGB(meminfo) {
  const kb = Number.parseInt(meminfo.match(/^MemAvailable:\s+(\d+)\s+kB/m)?.[1] || "", 10);
  if (!Number.isFinite(kb)) return null;
  return kb * 1024 / 1024 ** 3;
}
function measureAvailableMemory(platform, probes = SYSTEM_MEMORY_PROBES) {
  let gb = null;
  let source = "freemem";
  try {
    if (platform === "darwin") {
      gb = parseVmStatAvailableGB(probes.vmStat());
      source = "vm_stat";
    } else if (platform === "linux") {
      gb = parseMeminfoAvailableGB(probes.meminfo());
      source = "meminfo";
    }
  } catch {
    gb = null;
  }
  if (gb != null && Number.isFinite(gb) && gb > 0) return { gb, source };
  let bytes;
  try {
    bytes = probes.freemem();
  } catch {
    return null;
  }
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  return { gb: bytes / 1024 ** 3, source: "freemem" };
}
function describeOnnxGate() {
  const cap = readMaxConcurrent();
  const budget = readHighPriorityBudget();
  return `${_sem.inFlightNormal}/${cap} background ONNX sessions and ${_sem.inFlightHigh}/${budget} high-priority (STT) sessions in use${(_sem.exclusiveInFlight ?? 0) > 0 ? ", an exclusive holder is running" : ""}; ${_sem.waitersHigh.length} high-priority + ${_sem.waitersNormal.length} normal-priority waiting`;
}
function acquireOnnxSlotWithin(priority, weight, timeoutMs, label = "onnx") {
  return new Promise((resolve, reject) => {
    let settled = false;
    const slowLog = setTimeout(() => {
      if (!settled) console.warn(`[OnnxGate] ${label} has waited ${Math.min(3e3, timeoutMs)}ms for an ONNX session \u2014 ${describeOnnxGate()}`);
    }, Math.min(3e3, timeoutMs));
    slowLog.unref?.();
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearTimeout(slowLog);
      reject(new Error(
        `${label}: no ONNX session slot became free within ${timeoutMs}ms \u2014 ${describeOnnxGate()}. Raise NATIVELY_ONNX_HIGH_PRIORITY_SESSIONS (STT channels) or NATIVELY_ONNX_MAX_CONCURRENT_SESSIONS (background models), or use a cloud STT provider.`
      ));
    }, timeoutMs);
    timer.unref?.();
    acquireOnnxSlot(priority, weight).then(
      (release) => {
        if (settled) {
          release();
          return;
        }
        settled = true;
        clearTimeout(timer);
        clearTimeout(slowLog);
        resolve(release);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(slowLog);
        reject(err);
      }
    );
  });
}
function getAvailableMemoryReading() {
  const override = process.env.NATIVELY_ONNX_AVAILABLE_MEM_GB;
  if (override) {
    const n = Number.parseFloat(override);
    if (Number.isFinite(n) && n >= 0) return { gb: n, source: "override" };
  }
  const now = Date.now();
  let reading;
  if (availMemCache && now - availMemCache.at < AVAIL_MEM_CACHE_TTL_MS) {
    reading = availMemCache.reading;
  } else {
    const platform = testMemoryPlatform ?? process.platform;
    reading = measureAvailableMemory(platform, testMemoryProbes ?? SYSTEM_MEMORY_PROBES);
    availMemCache = { reading, at: now };
    if (!reading && !availMemUnmeasured) {
      console.warn(`[OnnxGate] Available memory could not be measured on ${platform}; local models load without the memory check until it can be.`);
    }
    availMemUnmeasured = !reading;
  }
  if (!reading) throw new Error("available memory could not be measured");
  return reading;
}
function getAvailableMemoryGB() {
  return getAvailableMemoryReading().gb;
}
function hasEnoughMemoryForOnnxSession(extraGB = 0) {
  return checkMemoryForOnnxSession(extraGB).ok;
}
function checkMemoryForOnnxSession(extraGB = 0) {
  return checkAvailableMemoryAgainst(getMinFreeGBForOnnxSession(extraGB));
}
function getMinFreeGBForOnnxSession(extraGB = 0) {
  return readMinFreeGB() + sanitizeExtraGB(extraGB);
}
function getMinFreeGBForModelSize(modelSizeMb) {
  const shared = readMinFreeGB();
  if (typeof modelSizeMb !== "number" || !Number.isFinite(modelSizeMb) || modelSizeMb <= 0) return shared;
  const needed = MODEL_FLOOR_MARGIN_GB + modelSizeMb / 1024 * MODEL_FLOOR_SIZE_FACTOR;
  return Math.min(shared, Math.round(needed * 100) / 100);
}
function checkMemoryForModelSize(modelSizeMb) {
  return checkAvailableMemoryAgainst(getMinFreeGBForModelSize(modelSizeMb));
}
function checkAvailableMemoryAgainst(floorGB) {
  let reading;
  try {
    reading = getAvailableMemoryReading();
  } catch {
    return { ok: true, availableGB: null, source: null, floorGB };
  }
  return { ok: reading.gb >= floorGB, availableGB: reading.gb, source: reading.source, floorGB };
}
function describeModelMemoryShortfall(check) {
  const { availableGB, floorGB } = check;
  if (availableGB == null) return `this model needs ${floorGB}GB`;
  let shown = Math.floor(availableGB * 100 + 1e-6) / 100;
  if (availableGB < floorGB && shown >= floorGB) shown = Math.floor(availableGB * 100) / 100;
  if (availableGB < floorGB && shown >= floorGB) shown = Math.max(0, floorGB - 0.01);
  return `${shown.toFixed(2)}GB available, this model needs ${floorGB}GB`;
}
function hasEnoughMemoryForModelSize(modelSizeMb) {
  return checkMemoryForModelSize(modelSizeMb).ok;
}
function sanitizeExtraGB(extraGB) {
  return Number.isFinite(extraGB) && extraGB > 0 ? extraGB : 0;
}
function isHighPriorityOnnxBudgetExhausted(weight = 1) {
  return !canAcquireNow("high", weight);
}
function getHighPriorityOnnxBudget() {
  return readHighPriorityBudget();
}
function getMaxConcurrentOnnxSessions() {
  return readMaxConcurrent();
}
function __setAvailableMemoryProbesForTests(platform, probes) {
  testMemoryPlatform = platform;
  testMemoryProbes = probes;
  availMemCache = null;
  availMemUnmeasured = false;
}
function __resetOnnxGateForTests() {
  _sem.inFlightNormal = 0;
  _sem.inFlightHigh = 0;
  _sem.exclusiveInFlight = 0;
  _sem.waitersNormal.length = 0;
  _sem.waitersHigh.length = 0;
}
var import_os, import_child_process, import_fs, _sem, AVAIL_MEM_CACHE_TTL_MS, availMemCache, availMemUnmeasured, testMemoryPlatform, testMemoryProbes, SYSTEM_MEMORY_PROBES, MODEL_FLOOR_MARGIN_GB, MODEL_FLOOR_SIZE_FACTOR;
var init_onnxThreadConfig = __esm({
  "electron/utils/onnxThreadConfig.ts"() {
    "use strict";
    import_os = __toESM(require("os"));
    import_child_process = require("child_process");
    import_fs = __toESM(require("fs"));
    _sem = (() => {
      const g = globalThis;
      if (!g.__nativelyOnnxSemaphoreV1__) {
        g.__nativelyOnnxSemaphoreV1__ = { inFlightNormal: 0, inFlightHigh: 0, exclusiveInFlight: 0, waitersNormal: [], waitersHigh: [] };
      }
      return g.__nativelyOnnxSemaphoreV1__;
    })();
    AVAIL_MEM_CACHE_TTL_MS = 1e3;
    availMemCache = null;
    availMemUnmeasured = false;
    testMemoryPlatform = null;
    testMemoryProbes = null;
    SYSTEM_MEMORY_PROBES = {
      // execFileSync (no shell) — args are fixed literals, no injection surface.
      vmStat: () => (0, import_child_process.execFileSync)("vm_stat", [], { encoding: "utf8", timeout: 1e3 }),
      meminfo: () => import_fs.default.readFileSync("/proc/meminfo", "utf8"),
      freemem: () => import_os.default.freemem()
    };
    MODEL_FLOOR_MARGIN_GB = 0.5;
    MODEL_FLOOR_SIZE_FACTOR = 2;
  }
});

// electron/utils/onnxWorkerShutdown.ts
var onnxWorkerShutdown_exports = {};
__export(onnxWorkerShutdown_exports, {
  ONNX_WORKER_SHUTDOWN_MESSAGE: () => ONNX_WORKER_SHUTDOWN_MESSAGE,
  __resetOnnxWorkerRegistryForTests: () => __resetOnnxWorkerRegistryForTests,
  liveOnnxWorkerCount: () => liveOnnxWorkerCount,
  retireAllOnnxWorkers: () => retireAllOnnxWorkers,
  retireOnnxWorker: () => retireOnnxWorker,
  retireOnnxWorkerAndWait: () => retireOnnxWorkerAndWait,
  trackOnnxWorker: () => trackOnnxWorker
});
function registry() {
  const g = globalThis;
  if (!g.__nativelyOnnxWorkerRegistryV1__) {
    g.__nativelyOnnxWorkerRegistryV1__ = { live: /* @__PURE__ */ new Set(), exited: /* @__PURE__ */ new WeakSet() };
  }
  return g.__nativelyOnnxWorkerRegistryV1__;
}
function canObserve(worker) {
  return !!worker && typeof worker.once === "function" && typeof worker.postMessage === "function";
}
function trackOnnxWorker(worker) {
  if (!canObserve(worker)) return worker;
  const reg = registry();
  if (reg.live.has(worker) || reg.exited.has(worker)) return worker;
  reg.live.add(worker);
  worker.once("exit", () => {
    reg.live.delete(worker);
    reg.exited.add(worker);
  });
  return worker;
}
function liveOnnxWorkerCount() {
  return registry().live.size;
}
function retireOnnxWorker(worker) {
  if (!worker) return;
  try {
    worker.postMessage(ONNX_WORKER_SHUTDOWN_MESSAGE);
  } catch {
  }
}
function retireOnnxWorkerAndWait(worker, maxWaitMs) {
  if (!worker) return Promise.resolve(true);
  if (!canObserve(worker)) {
    retireOnnxWorker(worker);
    return Promise.resolve(true);
  }
  const reg = registry();
  if (reg.exited.has(worker)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (gone) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(gone);
    };
    const timer = setTimeout(() => finish(false), Math.max(0, maxWaitMs));
    timer.unref?.();
    worker.once("exit", () => {
      reg.live.delete(worker);
      reg.exited.add(worker);
      finish(true);
    });
    retireOnnxWorker(worker);
  });
}
async function retireAllOnnxWorkers(maxWaitMs) {
  const workers = [...registry().live];
  if (workers.length === 0) return { asked: 0, stillAlive: 0 };
  const gone = await Promise.all(workers.map((w) => retireOnnxWorkerAndWait(w, maxWaitMs).catch(() => false)));
  return { asked: workers.length, stillAlive: gone.filter((g) => !g).length };
}
function __resetOnnxWorkerRegistryForTests() {
  const g = globalThis;
  g.__nativelyOnnxWorkerRegistryV1__ = void 0;
}
var ONNX_WORKER_SHUTDOWN_MESSAGE;
var init_onnxWorkerShutdown = __esm({
  "electron/utils/onnxWorkerShutdown.ts"() {
    "use strict";
    ONNX_WORKER_SHUTDOWN_MESSAGE = Object.freeze({ type: "shutdown" });
  }
});

// electron/utils/onnxLoadSentinel.ts
var onnxLoadSentinel_exports = {};
__export(onnxLoadSentinel_exports, {
  ONNX_LOAD_SENTINEL_TTL_MS: () => ONNX_LOAD_SENTINEL_TTL_MS,
  __simulateNewLaunchForTests: () => __simulateNewLaunchForTests,
  clearAllOnnxLoadSentinels: () => clearAllOnnxLoadSentinels,
  clearLoadSentinel: () => clearLoadSentinel,
  consumePoisonedOnnxLoad: () => consumePoisonedOnnxLoad,
  isSentinelWithinTtl: () => isSentinelWithinTtl,
  writeLoadSentinel: () => writeLoadSentinel
});
function processState() {
  const g = globalThis;
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      launchId: `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      previousLaunchRecord: /* @__PURE__ */ new Map()
    };
  }
  return g[STATE_KEY];
}
function __simulateNewLaunchForTests() {
  const st = processState();
  st.launchId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  st.previousLaunchRecord.clear();
}
function isFromPreviousLaunch(record) {
  return record.launchId !== processState().launchId;
}
function sentinelEnabled() {
  return process.env.NATIVELY_ONNX_SENTINEL_DISABLED !== "1";
}
function sentinelPath(family) {
  return import_path.default.join(import_electron.app.getPath("userData"), `onnx-load-sentinel-${family}.json`);
}
function readSentinel(family) {
  if (!sentinelEnabled()) return null;
  try {
    const parsed = JSON.parse(import_fs2.default.readFileSync(sentinelPath(family), "utf-8"));
    if (typeof parsed.modelId === "string" && parsed.modelId.length > 0 && typeof parsed.startedAt === "number" && typeof parsed.attempt === "number" && parsed.family === family) {
      return {
        family,
        modelId: parsed.modelId,
        startedAt: parsed.startedAt,
        attempt: Math.max(1, Math.floor(parsed.attempt)),
        ...typeof parsed.launchId === "string" ? { launchId: parsed.launchId } : {}
      };
    }
  } catch {
  }
  return null;
}
function writeLoadSentinel(family, modelId) {
  if (!sentinelEnabled()) return;
  try {
    const previous = readSentinel(family);
    const stash = processState().previousLaunchRecord;
    if (previous && isFromPreviousLaunch(previous) && !stash.has(family)) {
      stash.set(family, previous);
    }
    const next = {
      family,
      modelId,
      startedAt: Date.now(),
      attempt: previous && previous.modelId === modelId ? previous.attempt + 1 : 1,
      launchId: processState().launchId
    };
    const finalPath = sentinelPath(family);
    const tmpPath = `${finalPath}.tmp`;
    import_fs2.default.writeFileSync(tmpPath, JSON.stringify(next), "utf-8");
    import_fs2.default.renameSync(tmpPath, finalPath);
  } catch (e) {
    console.warn(`[OnnxLoadSentinel] write failed for ${family}/${modelId}:`, e?.message || e);
  }
}
function clearLoadSentinel(family, modelId) {
  if (!sentinelEnabled()) return;
  try {
    if (modelId) {
      const current = readSentinel(family);
      if (current && current.modelId !== modelId) return;
    }
    import_fs2.default.unlinkSync(sentinelPath(family));
  } catch {
  }
}
function clearAllOnnxLoadSentinels(family) {
  clearLoadSentinel(family);
}
function consumePoisonedOnnxLoad(family) {
  if (!sentinelEnabled()) return null;
  const stash = processState().previousLaunchRecord;
  const stashed = stash.get(family) ?? null;
  stash.delete(family);
  const onDisk = readSentinel(family);
  if (onDisk && isFromPreviousLaunch(onDisk)) {
    clearLoadSentinel(family);
    return onDisk;
  }
  return stashed;
}
function isSentinelWithinTtl(sentinel, now = Date.now()) {
  return now - sentinel.startedAt < ONNX_LOAD_SENTINEL_TTL_MS;
}
var import_fs2, import_path, import_electron, ONNX_LOAD_SENTINEL_TTL_MS, STATE_KEY;
var init_onnxLoadSentinel = __esm({
  "electron/utils/onnxLoadSentinel.ts"() {
    "use strict";
    import_fs2 = __toESM(require("fs"));
    import_path = __toESM(require("path"));
    import_electron = require("electron");
    ONNX_LOAD_SENTINEL_TTL_MS = 5 * 60 * 1e3;
    STATE_KEY = "__nativelyOnnxLoadSentinelState";
  }
});

// premium/electron/autoAnswer/decider/deciderUtilityHost.ts
var deciderUtilityHost_exports = {};
__export(deciderUtilityHost_exports, {
  STOP_GRACE_MS: () => STOP_GRACE_MS,
  forkDeciderUtility: () => forkDeciderUtility,
  wrapDeciderUtility: () => wrapDeciderUtility
});
function wrapDeciderUtility(child, timers = { setTimeout, clearTimeout }) {
  const listeners = { message: [], error: [], exit: [] };
  let ready = false;
  let gone = false;
  let queue = [];
  let killTimer = null;
  child.on("message", (msg) => {
    if (msg?.type === "hello") {
      ready = true;
      const q = queue;
      queue = [];
      for (const m of q) child.postMessage(m);
      return;
    }
    for (const fn of listeners.message) fn(msg);
  });
  child.on("exit", (code) => {
    gone = true;
    queue = [];
    if (killTimer) {
      timers.clearTimeout(killTimer);
      killTimer = null;
    }
    for (const fn of listeners.exit) fn(code);
  });
  child.on("error", (type, location) => {
    for (const fn of listeners.error) fn(new Error(`decider utility process fatal error (${type} at ${location})`));
  });
  const send = (m) => {
    if (gone) throw new Error("decider utility process is gone");
    if (ready) child.postMessage(m);
    else queue.push(m);
  };
  return {
    utility: true,
    postMessage: send,
    on(event, fn) {
      listeners[event].push(fn);
      return this;
    },
    stop() {
      if (gone) return;
      try {
        send({ type: "shutdown" });
      } catch {
      }
      killTimer = timers.setTimeout(() => {
        try {
          child.kill();
        } catch {
        }
      }, STOP_GRACE_MS);
      killTimer?.unref?.();
    }
  };
}
function forkDeciderUtility(workerScript) {
  const { utilityProcess } = require("electron");
  const child = utilityProcess.fork(workerScript, [], {
    serviceName: "Natively Auto Answer",
    // Inherited so the worker's runtime errors land in the app log; it never logs transcript text.
    stdio: "inherit"
  });
  return wrapDeciderUtility(child);
}
var STOP_GRACE_MS;
var init_deciderUtilityHost = __esm({
  "premium/electron/autoAnswer/decider/deciderUtilityHost.ts"() {
    "use strict";
    STOP_GRACE_MS = 3e3;
  }
});

// premium/electron/autoAnswer/decider/appDecider.ts
var appDecider_exports = {};
__export(appDecider_exports, {
  createAppDecider: () => createAppDecider
});
module.exports = __toCommonJS(appDecider_exports);

// premium/electron/autoAnswer/decider/AutoAnswerDecider.ts
init_DecisionBackend();
var HOSTED_DEADLINE_MS = 600;
var LOCAL_DEADLINE_MS = 900;
var AutoAnswerDecider = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  /** Drop-in for the engine host's `judgeCandidate`. */
  async judge(req, signal) {
    const mode = this.deps.mode();
    if (mode === "off") return this.deps.llmJudge ? this.deps.llmJudge(req, signal) : null;
    if (mode === "shadow") return this.shadow(req, signal);
    return this.authoritative(req, signal);
  }
  /** Backends only, no LLM: the first one that answers in time, gated. */
  async decide(req, signal) {
    const start = this.deps.clock.now();
    const available = this.safeBackends().filter((b) => {
      try {
        return b.isAvailable();
      } catch {
        return false;
      }
    });
    if (!available.length) return { action: "escalate", escalateReason: "no_backend", choice: null, probabilities: null, answerConfidence: null, backend: "none", ms: 0 };
    for (const backend of available) {
      if (signal?.aborted) break;
      const d = await this.withDeadline(backend, req, signal);
      if (!d) continue;
      const gated = gateDecision(d, this.deps.thresholds(backend.kind));
      return { ...gated, choice: d.choice, probabilities: d.probabilities, answerConfidence: d.answerConfidence, backend: backend.kind, ms: this.deps.clock.now() - start };
    }
    return { action: "escalate", escalateReason: "backends_failed", choice: null, probabilities: null, answerConfidence: null, backend: "none", ms: this.deps.clock.now() - start };
  }
  async shadow(req, signal) {
    if (!this.safeBackends().some((b) => {
      try {
        return b.isAvailable();
      } catch {
        return false;
      }
    })) {
      return this.deps.llmJudge ? this.deps.llmJudge(req, signal) : null;
    }
    const decided = this.decide(req, signal).catch(() => null);
    let raw = null;
    let judgeErr = null;
    try {
      raw = this.deps.llmJudge ? await this.deps.llmJudge(req, signal) : null;
    } catch (e) {
      judgeErr = e;
    }
    void decided.then((d) => {
      if (!d || signal?.aborted) return;
      const judgeLabel = judgeErr ? void 0 : labelOfJudgeReply(raw, req.candidateText) ?? void 0;
      this.emit(req, "shadow", d, {
        ...judgeLabel ? { judgeLabel } : {},
        ...judgeLabel && d.choice ? { shadowAgree: judgeLabel === d.choice } : {}
      });
    });
    if (judgeErr) throw judgeErr;
    return raw;
  }
  async authoritative(req, signal) {
    const d = await this.decide(req, signal);
    if (d.action !== "escalate") {
      this.emit(req, "on", d);
      return judgeReplyFor(d.action);
    }
    let raw = null;
    let judgeErr = null;
    try {
      raw = this.deps.llmJudge ? await this.deps.llmJudge(req, signal) : null;
    } catch (e) {
      judgeErr = e;
    }
    if (!judgeErr && labelOfJudgeReply(raw, req.candidateText) !== null) {
      this.emit(req, "on", d);
      return raw;
    }
    if (d.choice === "answer" && !signal?.aborted) {
      this.emit(req, "on", d, { doubtAnswered: true });
      return judgeReplyFor("answer");
    }
    this.emit(req, "on", d);
    if (judgeErr) throw judgeErr;
    return raw;
  }
  safeBackends() {
    try {
      return this.deps.backends() ?? [];
    } catch {
      return [];
    }
  }
  /** One backend under its deadline. Null on timeout, error, abort or a malformed decision. */
  withDeadline(backend, req, outer) {
    const ms = this.deps.deadlineMs?.(backend.kind) ?? (backend.kind === "hosted" ? HOSTED_DEADLINE_MS : LOCAL_DEADLINE_MS);
    const ctl = new AbortController();
    const onOuter = () => ctl.abort();
    outer?.addEventListener("abort", onOuter, { once: true });
    let timer = null;
    const cleanup = () => {
      if (timer !== null) this.deps.clock.clearTimeout(timer);
      outer?.removeEventListener("abort", onOuter);
    };
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(v);
      };
      timer = this.deps.clock.setTimeout(() => {
        ctl.abort();
        done(null);
      }, ms);
      ctl.signal.addEventListener("abort", () => done(null), { once: true });
      Promise.resolve().then(() => backend.decide(req, ctl.signal)).then((d) => done(isDecision(d) ? d : null), () => done(null));
    });
  }
  emit(req, mode, d, extra = {}) {
    if (!this.deps.telemetry) return;
    try {
      this.deps.telemetry({
        name: "auto_answer_decided",
        questionId: req.questionId,
        decisionMode: mode,
        decisionBackend: d.backend,
        decisionAction: d.action,
        ...d.choice ? { decisionChoice: d.choice } : {},
        ...typeof d.answerConfidence === "number" ? { decisionConfidence: Math.round(d.answerConfidence * 1e4) / 1e4 } : {},
        decisionMs: d.ms,
        escalated: d.action === "escalate",
        ...d.escalateReason ? { escalateReason: d.escalateReason } : {},
        ...extra
      });
    } catch {
    }
  }
};
function isDecision(d) {
  const x = d;
  return !!x && (x.choice === "answer" || x.choice === "silent" || x.choice === "wait") && typeof x.answerConfidence === "number" && Number.isFinite(x.answerConfidence);
}

// premium/electron/autoAnswer/decider/LocalLayaBackend.ts
var import_path2 = __toESM(require("path"));
var import_fs3 = __toESM(require("fs"));
init_DecisionBackend();
init_deciderManifest();

// premium/electron/autoAnswer/decider/deciderPlatform.ts
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
function deciderIntraOpThreads(logicalCores, env = {}) {
  const override = Number.parseInt(env.NATIVELY_DECIDER_THREADS ?? "", 10);
  if (Number.isFinite(override) && override > 0) return override;
  return Math.max(1, Math.min(4, Math.floor((logicalCores || 2) / 2)));
}

// premium/electron/autoAnswer/decider/LocalLayaBackend.ts
var DECIDER_ONNX_FAMILY = "decider";
var DECIDER_LOAD_TIMEOUT_MS = 15e3;
var LocalLayaBackend = class {
  constructor(deps) {
    this.deps = deps;
    try {
      this.eps = executionProvidersFor(deps.platform, deps.env ?? {});
    } catch {
      this.eps = null;
    }
  }
  deps;
  kind = "local";
  worker = null;
  pending = /* @__PURE__ */ new Map();
  seq = 0;
  loaded = false;
  busy = false;
  disabled = false;
  poisonChecked = false;
  eps;
  /** The EP the session actually came up on (status message), for telemetry and the bench. */
  activeEp = null;
  exists(p) {
    try {
      return (this.deps.exists ?? import_fs3.default.existsSync)(p);
    } catch {
      return false;
    }
  }
  manifestCache = null;
  /** The model's parsed manifest, or null when it is missing or invalid (then nothing decides). */
  manifest() {
    const dir = this.deps.modelDir();
    if (!dir) return null;
    if (this.manifestCache?.dir === dir) return this.manifestCache.m;
    let m = null;
    try {
      const read = this.deps.readFile ?? ((p) => import_fs3.default.readFileSync(p, "utf8"));
      m = parseDeciderManifest(JSON.parse(read(import_path2.default.join(dir, "manifest.json"))));
    } catch {
      m = null;
    }
    this.manifestCache = { dir, m };
    return m;
  }
  /** Per-label thresholds fitted on calib and shipped in the manifest; ESCALATE_ALL without one. */
  thresholds() {
    return this.manifest()?.thresholds ?? ESCALATE_ALL;
  }
  isAvailable() {
    if (this.disabled || !this.eps) return false;
    const dir = this.deps.modelDir();
    if (!dir || !this.exists(import_path2.default.join(dir, "manifest.json"))) return false;
    const m = this.manifest();
    if (!m || !this.exists(import_path2.default.join(dir, m.graph))) return false;
    if (!this.poisonChecked && !this.worker) {
      this.poisonChecked = true;
      if (this.deps.sentinel?.poisoned()) {
        this.disabled = true;
        return false;
      }
    }
    return true;
  }
  warmUp() {
    if (!this.isAvailable() || this.loaded) return;
    this.post({ type: "init" }, DECIDER_LOAD_TIMEOUT_MS).then(() => {
      this.loaded = true;
    }, () => {
    });
  }
  async decide(req, signal) {
    if (!this.isAvailable()) throw new Error("local decider unavailable");
    if (this.deps.enoughMemory && !this.deps.enoughMemory()) throw new Error("local decider: low memory");
    if (this.busy) throw new Error("local decider busy");
    if (signal?.aborted) throw new Error("aborted");
    this.busy = true;
    let release = null;
    try {
      const budget = this.loaded ? 6e4 : DECIDER_LOAD_TIMEOUT_MS;
      if (this.deps.acquireSlot) {
        release = await this.deps.acquireSlot(budget);
        if (!release) throw new Error("local decider: no ONNX slot");
      }
      const result = await this.post({ type: "decide", req }, budget, signal);
      this.loaded = true;
      return result;
    } finally {
      release?.();
      this.busy = false;
    }
  }
  dispose() {
    const w = this.worker;
    this.worker = null;
    this.loaded = false;
    this.failAll(new Error("local decider disposed"));
    if (w) {
      try {
        (this.deps.retire ?? ((x) => x.postMessage({ type: "shutdown" })))(w);
      } catch {
      }
    }
  }
  modelId() {
    return `natively/auto-answer-decider@${this.deps.modelDir() ?? ""}`;
  }
  getWorker() {
    if (this.worker) return this.worker;
    if (!this.deps.createWorker) throw new Error("local decider: no worker factory");
    this.deps.sentinel?.write(this.modelId());
    const w = this.deps.createWorker();
    w.on("message", (msg) => {
      if (msg?.type === "status") {
        if (msg.status?.type === "ready") {
          this.deps.sentinel?.clear(this.modelId());
          this.activeEp = msg.ep ?? null;
        } else if (msg.status?.recoverable === false) {
          this.disabled = true;
        }
        return;
      }
      const p = this.pending.get(msg?.requestId);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.requestId);
      if (msg.type === "error") p.reject(new Error(msg.error));
      else p.resolve(msg.result ?? null);
    });
    const gone = () => {
      this.failAll(new Error("local decider worker gone"));
      this.worker = null;
      this.loaded = false;
    };
    w.on("error", gone);
    w.on("exit", gone);
    w.unref?.();
    this.worker = w;
    return w;
  }
  failAll(e) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
  }
  post(payload, timeoutMs, signal) {
    const requestId = ++this.seq;
    return new Promise((resolve, reject) => {
      const finish = () => {
        this.pending.delete(requestId);
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        const p = this.pending.get(requestId);
        if (p) {
          clearTimeout(p.timer);
          finish();
          reject(new Error("aborted"));
        }
      };
      const timer = setTimeout(() => {
        finish();
        reject(new Error("local decider timeout"));
      }, timeoutMs);
      this.pending.set(requestId, {
        resolve: (v) => {
          finish();
          resolve(v);
        },
        reject: (e) => {
          finish();
          reject(e);
        },
        timer
      });
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        this.getWorker().postMessage({
          ...payload,
          requestId,
          modelDir: this.deps.modelDir(),
          eps: this.eps,
          threads: deciderIntraOpThreads(this.deps.logicalCores ?? 2, this.deps.env ?? {})
        });
      } catch (e) {
        clearTimeout(timer);
        finish();
        reject(e);
      }
    });
  }
};
function createLocalLayaBackend(modelDir, platform = process.platform) {
  const os2 = require("os");
  const { Worker } = require("worker_threads");
  const cfg = (init_onnxThreadConfig(), __toCommonJS(onnxThreadConfig_exports));
  const sd = (init_onnxWorkerShutdown(), __toCommonJS(onnxWorkerShutdown_exports));
  const sen = (init_onnxLoadSentinel(), __toCommonJS(onnxLoadSentinel_exports));
  const workerPath = () => {
    const candidates = [
      import_path2.default.join(__dirname, "deciderWorker.js"),
      import_path2.default.join(__dirname, "decider", "deciderWorker.js"),
      // Bundled into dist-electron/electron/main.js: the worker is its own esbuild entry at
      // dist-electron/premium/electron/autoAnswer/decider/deciderWorker.js.
      import_path2.default.join(__dirname, "..", "premium", "electron", "autoAnswer", "decider", "deciderWorker.js"),
      import_path2.default.join(__dirname, "premium", "electron", "autoAnswer", "decider", "deciderWorker.js")
    ];
    let p = candidates.find((c) => import_fs3.default.existsSync(c)) ?? candidates[0];
    if (p.includes("app.asar") && !p.includes("app.asar.unpacked")) p = p.replace("app.asar", "app.asar.unpacked");
    return p;
  };
  const uh = (init_deciderUtilityHost(), __toCommonJS(deciderUtilityHost_exports));
  const man = (init_deciderManifest(), __toCommonJS(deciderManifest_exports));
  const runtimeOf = () => {
    const dir = modelDir();
    if (!dir) return "ort-1.22";
    try {
      return man.parseDeciderManifest(JSON.parse(import_fs3.default.readFileSync(import_path2.default.join(dir, "manifest.json"), "utf8"))).runtime;
    } catch {
      return "ort-1.22";
    }
  };
  return new LocalLayaBackend({
    modelDir,
    platform,
    env: process.env,
    logicalCores: os2.cpus()?.length ?? 2,
    createWorker: () => runtimeOf() === "ort-1.24" ? uh.forkDeciderUtility(workerPath()) : sd.trackOnnxWorker(new Worker(workerPath())),
    acquireSlot: (ms) => new Promise((resolve) => {
      let settled = false;
      const t = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, ms);
      cfg.acquireOnnxSlot("normal", 1).then(
        (rel) => {
          if (settled) {
            rel();
            return;
          }
          settled = true;
          clearTimeout(t);
          resolve(rel);
        },
        () => {
          if (!settled) {
            settled = true;
            clearTimeout(t);
            resolve(null);
          }
        }
      );
    }),
    enoughMemory: () => cfg.hasEnoughMemoryForOnnxSession(),
    sentinel: {
      write: (id) => sen.writeLoadSentinel(DECIDER_ONNX_FAMILY, id),
      clear: (id) => sen.clearLoadSentinel(DECIDER_ONNX_FAMILY, id),
      poisoned: () => {
        const s = sen.consumePoisonedOnnxLoad(DECIDER_ONNX_FAMILY);
        return !!s && sen.isSentinelWithinTtl(s);
      }
    },
    retire: (w) => w.utility ? w.stop() : sd.retireOnnxWorker(w)
  });
}

// premium/electron/autoAnswer/decider/appDecider.ts
init_DecisionBackend();
function createAppDecider(o) {
  const mode = resolveDeciderMode(o.env, o.isPackaged);
  if (mode === "off") {
    return { mode, judgeCandidate: (req, signal) => o.llmJudge(req, signal), warmUp() {
    }, dispose() {
    } };
  }
  let local = null;
  const modelDir = () => (o.env.NATIVELY_DECIDER_MODEL_DIR || "").trim() || o.installedModelDir?.() || null;
  const backends = o.backends ?? (() => {
    if (!modelDir()) return [];
    local ??= createLocalLayaBackend(modelDir, o.platform);
    return [local];
  });
  const decider = new AutoAnswerDecider({
    mode: () => mode,
    backends,
    llmJudge: o.llmJudge,
    thresholds: (kind) => {
      const b = backends().find((x) => x.kind === kind);
      return b?.thresholds?.() ?? ESCALATE_ALL;
    },
    clock: o.clock,
    telemetry: o.telemetry
  });
  return {
    mode,
    judgeCandidate: (req, signal) => decider.judge(req, signal),
    warmUp: () => {
      try {
        for (const b of backends()) b.warmUp?.();
      } catch {
      }
    },
    dispose: () => {
      try {
        local?.dispose();
      } catch {
      }
      local = null;
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createAppDecider
});
