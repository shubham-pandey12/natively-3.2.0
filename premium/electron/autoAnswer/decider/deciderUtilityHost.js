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

// premium/electron/autoAnswer/decider/deciderUtilityHost.ts
var deciderUtilityHost_exports = {};
__export(deciderUtilityHost_exports, {
  STOP_GRACE_MS: () => STOP_GRACE_MS,
  forkDeciderUtility: () => forkDeciderUtility,
  wrapDeciderUtility: () => wrapDeciderUtility
});
module.exports = __toCommonJS(deciderUtilityHost_exports);
var STOP_GRACE_MS = 3e3;
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  STOP_GRACE_MS,
  forkDeciderUtility,
  wrapDeciderUtility
});
