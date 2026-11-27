// electron/llm/__tests__/ResponseCleanupBaseline.test.mjs
//
// Phase 2 replay-set validation and Phase 1 rule-based cleanup baseline checks.
// Runs against tests/response-cleanup/replay-fixtures.json (30 sanitized examples).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeSentenceBoundaryWaitMs } from '../../../tests/response-cleanup/replay-timing.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');
const fixturesPath = path.join(repoRoot, 'tests', 'response-cleanup', 'replay-fixtures.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

const llmMod = await import(pathToFileURL(path.join(repoRoot, 'dist-electron', 'electron', 'llm', 'index.js')).href);
const { humanizeForAnswerType } = llmMod;

describe('Response cleanup replay set structure', () => {
  test('buffering starts at the first chunk and ignores an incomplete decimal', () => {
    assert.equal(computeSentenceBoundaryWaitMs([
      { text: 'It took 1.', delayMs: 200 },
      { text: '5 seconds. ', delayMs: 80 },
      { text: 'Then it stopped.', delayMs: 100 },
    ]), 80);
  });

  test('has 30 fixtures (10 per path: auto_answer, text_reply, live_brain)', () => {
    assert.equal(fixtures.length, 30);
    assert.equal(fixtures.filter((f) => f.path === 'auto_answer').length, 10);
    assert.equal(fixtures.filter((f) => f.path === 'text_reply').length, 10);
    assert.equal(fixtures.filter((f) => f.path === 'live_brain').length, 10);
  });

  test('every fixture labels its synthetic status and required fields', () => {
    const ids = new Set();
    for (const f of fixtures) {
      assert.ok(f.id && !ids.has(f.id), `duplicate or missing id: ${f.id}`);
      ids.add(f.id);
      assert.ok(typeof f.original === 'string' && f.original.length > 0);
      assert.ok(typeof f.reference === 'string' && f.reference.length > 0);
      assert.ok(f.sourceKind === 'synthetic' || f.sourceKind === 'synthetic_from_repro');
      assert.equal(typeof f.timingsSynthetic, 'boolean');
      assert.ok(Array.isArray(f.chunks) && f.chunks.length >= 2);
      for (const chunk of f.chunks) {
        assert.equal(typeof chunk.text, 'string', f.id);
        assert.ok(Number.isFinite(chunk.delayMs) && chunk.delayMs >= 0, f.id);
      }
      assert.equal(f.chunks.map((chunk) => chunk.text).join(''), f.original, f.id);
      assert.ok(Array.isArray(f.mustPreserve));
    }
  });
});

describe('Phase 1 cleanup baseline against replay fixtures', () => {
  for (const f of fixtures) {
    test(`${f.id} (${f.path}/${f.category}): preserves required facts & avoids regressions`, () => {
      const res = humanizeForAnswerType(f.answerType, f.original);

      for (const token of f.mustPreserve) {
        assert.ok(
          res.text.includes(token),
          `${f.id}: expected output to preserve "${token}", got: ${res.text}`,
        );
      }
      for (const forbidden of f.mustNotIntroduce ?? []) {
        assert.ok(
          !res.text.includes(forbidden),
          `${f.id}: output must not contain "${forbidden}", got: ${res.text}`,
        );
      }

      if (f.category === 'already_good' || f.category === 'control_message') {
        assert.equal(res.changed, false, `${f.id} (${f.category}) should remain unchanged`);
        assert.equal(res.text, f.original);
      }
    });
  }
});
