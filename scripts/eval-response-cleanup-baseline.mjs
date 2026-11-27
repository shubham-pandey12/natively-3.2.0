// scripts/eval-response-cleanup-baseline.mjs
//
// Phase 2 baseline evaluator for Natively's shared plain-English response cleanup.
// Runs the fixed Phase 1 rules (dist-electron/electron/llm/index.js) against
// tests/response-cleanup/replay-fixtures.json and reports changed/unchanged counts,
// preservation checks, exact-reference matches, and sentence-boundary wait vs
// cleanup processing time.

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeSentenceBoundaryWaitMs } from '../tests/response-cleanup/replay-timing.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const fixturesPath = path.join(repoRoot, 'tests', 'response-cleanup', 'replay-fixtures.json');
const llmEntryUrl = pathToFileURL(path.join(repoRoot, 'dist-electron', 'electron', 'llm', 'index.js')).href;
const { humanizeForAnswerType } = await import(llmEntryUrl);

const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

const results = fixtures.map((f) => {
  const t0 = performance.now();
  const res = humanizeForAnswerType(f.answerType, f.original);
  const cleanupMs = performance.now() - t0;

  const missingPreserve = (f.mustPreserve ?? []).filter((token) => !res.text.includes(token));
  const introducedBad = (f.mustNotIntroduce ?? []).filter((token) => res.text.includes(token));
  const sentenceBoundaryWaitMs = computeSentenceBoundaryWaitMs(f.chunks);

  return {
    id: f.id,
    path: f.path,
    route: f.route,
    category: f.category,
    changed: res.changed,
    matchesReference: res.text === f.reference,
    missingPreserve,
    introducedBad,
    sentenceBoundaryWaitMs,
    cleanupMs,
    timingsSynthetic: Boolean(f.timingsSynthetic),
    output: res.text,
  };
});

const total = results.length;
const changedCount = results.filter((r) => r.changed).length;
const exactRefCount = results.filter((r) => r.matchesReference).length;
const preserveFailures = results.filter((r) => r.missingPreserve.length > 0);
const badIntroFailures = results.filter((r) => r.introducedBad.length > 0);
const avgSentenceWaitMs = results.reduce((s, r) => s + r.sentenceBoundaryWaitMs, 0) / total;
const avgCleanupMs = results.reduce((s, r) => s + r.cleanupMs, 0) / total;
const maxCleanupMs = Math.max(...results.map((r) => r.cleanupMs));

console.log(JSON.stringify({
  total,
  byPath: {
    auto_answer: results.filter((r) => r.path === 'auto_answer').length,
    text_reply: results.filter((r) => r.path === 'text_reply').length,
    live_brain: results.filter((r) => r.path === 'live_brain').length,
  },
  changedCount,
  unchangedCount: total - changedCount,
  exactReferenceMatches: exactRefCount,
  preserveFailureCount: preserveFailures.length,
  badIntroFailureCount: badIntroFailures.length,
  timing: {
    avgSyntheticSentenceBoundaryWaitMs: Number(avgSentenceWaitMs.toFixed(1)),
    avgMeasuredCleanupMs: Number(avgCleanupMs.toFixed(4)),
    maxMeasuredCleanupMs: Number(maxCleanupMs.toFixed(4)),
  },
  diffsFromReference: results
    .filter((r) => !r.matchesReference)
    .map((r) => ({ id: r.id, path: r.path, category: r.category, output: r.output })),
  failures: [...preserveFailures, ...badIntroFailures],
}, null, 2));

if (preserveFailures.length || badIntroFailures.length) process.exitCode = 1;
