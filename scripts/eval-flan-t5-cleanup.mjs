// scripts/eval-flan-t5-cleanup.mjs
//
// Phase 3 evaluation-only harness: compares quantized FLAN-T5 Small (Xenova/flan-t5-small,
// q8 via @huggingface/transformers + onnxruntime-node) against the fixed Phase 1/3
// rule-based cleanup on the 30 fixtures in tests/response-cleanup/replay-fixtures.json.
//
// Weights are cached in os.tmpdir() — never inside the Git repository.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeSentenceBoundaryWaitMs } from '../tests/response-cleanup/replay-timing.mjs';
import { env, pipeline } from '@huggingface/transformers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const fixturesPath = path.join(repoRoot, 'tests', 'response-cleanup', 'replay-fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

const llmEntryUrl = pathToFileURL(path.join(repoRoot, 'dist-electron', 'electron', 'llm', 'index.js')).href;
const { humanizeForAnswerType } = await import(llmEntryUrl);

const cacheDir = path.join(os.tmpdir(), 'natively-flan-t5-eval-cache');
fs.mkdirSync(cacheDir, { recursive: true });
env.cacheDir = cacheDir;

const MODEL_ID = 'Xenova/flan-t5-small';
const DTYPE = 'q8';
const rulesFirst = process.argv.includes('--rules-first');

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

const tCold0 = performance.now();
const generator = await pipeline('text2text-generation', MODEL_ID, { dtype: DTYPE });
const coldLoadMs = performance.now() - tCold0;

// Warmup run (not counted in warm latency stats)
await generator('Rewrite in plain English while keeping all facts: The service is robust and scalable.', {
  max_new_tokens: 128,
  do_sample: false,
});

// List cached model files (outside git) for verification
const modelCacheDir = path.join(cacheDir, ...MODEL_ID.split('/'));
const cachedFiles = [];
function walkFiles(dir, prefix = '') {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walkFiles(path.join(dir, entry.name), rel);
    else cachedFiles.push({ file: rel, bytes: fs.statSync(path.join(dir, entry.name)).size });
  }
}
walkFiles(modelCacheDir);

const rows = [];
for (const f of fixtures) {
  const tRule0 = performance.now();
  const ruleRes = humanizeForAnswerType(f.answerType, f.original);
  const ruleMs = performance.now() - tRule0;
  const inputText = rulesFirst ? ruleRes.text : f.original;
  const prompt = f.mode === 'text'
    ? `Rewrite in plain English while preserving headings, lists, code, formulas, numbers, and names:\n${inputText}`
    : `Rewrite in plain spoken English while preserving all facts, numbers, names, code, formulas, and control prefixes:\n${inputText}`;

  const tModel0 = performance.now();
  const bypassModel = rulesFirst && f.category === 'control_message';
  const out = bypassModel ? undefined : await generator(prompt, { max_new_tokens: 160, do_sample: false });
  const modelMs = bypassModel ? 0 : performance.now() - tModel0;
  const modelText = bypassModel ? inputText : String(out?.[0]?.generated_text ?? '').trim();

  const ruleMissing = (f.mustPreserve ?? []).filter((t) => !ruleRes.text.includes(t));
  const ruleBad = (f.mustNotIntroduce ?? []).filter((t) => ruleRes.text.includes(t));
  const modelMissing = (f.mustPreserve ?? []).filter((t) => !modelText.includes(t));
  const modelBad = (f.mustNotIntroduce ?? []).filter((t) => modelText.includes(t));

  rows.push({
    id: f.id,
    path: f.path,
    mode: f.mode,
    category: f.category,
    sentenceBoundaryWaitMs: computeSentenceBoundaryWaitMs(f.chunks),
    ruleMs: Number(ruleMs.toFixed(3)),
    modelMs: Number(modelMs.toFixed(2)),
    bypassModel,
    ruleChanged: ruleRes.changed,
    modelChanged: modelText !== f.original,
    ruleExactRef: ruleRes.text === f.reference,
    modelExactRef: modelText === f.reference,
    rulePreserveOk: ruleMissing.length === 0 && ruleBad.length === 0,
    modelPreserveOk: modelMissing.length === 0 && modelBad.length === 0,
    mustStayUnchanged: f.category === 'already_good' || f.category === 'control_message',
    ruleMissing,
    modelMissing,
    modelBad,
    original: f.original,
    ruleText: ruleRes.text,
    modelText,
  });
}

const warmModelTimes = rows.filter((r) => !r.bypassModel).map((r) => r.modelMs).sort((a, b) => a - b);
const warmRuleTimes = rows.map((r) => r.ruleMs).sort((a, b) => a - b);

console.log(JSON.stringify({
  platform: `${process.platform}/${process.arch}`,
  nodeVersion: process.version,
  modelId: MODEL_ID,
  dtype: DTYPE,
  rulesFirst,
  cacheDir,
  cachedFiles,
  coldLoadMs: Number(coldLoadMs.toFixed(1)),
  summary: {
    total: rows.length,
    rules: {
      changedCount: rows.filter((r) => r.ruleChanged).length,
      preservePassCount: rows.filter((r) => r.rulePreserveOk).length,
      exactRefCount: rows.filter((r) => r.ruleExactRef).length,
      unexpectedChanges: rows.filter((r) => r.mustStayUnchanged && r.ruleChanged).map((r) => r.id),
      medianMs: percentile(warmRuleTimes, 50),
      p95Ms: percentile(warmRuleTimes, 95),
    },
    flanT5SmallQ8: {
      calls: warmModelTimes.length,
      addedReferenceMatches: rows.filter((r) => !r.ruleExactRef && r.modelExactRef).map((r) => r.id),
      lostReferenceMatches: rows.filter((r) => r.ruleExactRef && !r.modelExactRef).map((r) => r.id),
      changedCount: rows.filter((r) => r.modelChanged).length,
      preservePassCount: rows.filter((r) => r.modelPreserveOk).length,
      exactRefCount: rows.filter((r) => r.modelExactRef).length,
      unexpectedChanges: rows.filter((r) => r.mustStayUnchanged && r.modelChanged).map((r) => r.id),
      medianMs: percentile(warmModelTimes, 50),
      p95Ms: percentile(warmModelTimes, 95),
    },
    avgSyntheticSentenceBoundaryWaitMs: Number(
      (rows.reduce((s, r) => s + r.sentenceBoundaryWaitMs, 0) / rows.length).toFixed(1),
    ),
  },
  rows,
}, null, 2));
