// 3.2.0 F-LAT-03: the lone provider's hedge fires at a first-useful point, and
// a TurnCallBudget alias with no key is a no-op (recovered providerCallBudget).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { loneProviderHedgeDelayMs } = require('../../../dist-electron/electron/llm/liveDeadlines.js');
const { TurnCallBudget } = require('../../../dist-electron/electron/llm/providerCallBudget.js');

test('unmeasured: 4 s, capped at 85% of the budget', () => {
  assert.equal(loneProviderHedgeDelayMs(15_000, null), 4_000);
  assert.equal(loneProviderHedgeDelayMs(15_000, { count: 0, maxMs: 9_000 }), 4_000);
  assert.equal(loneProviderHedgeDelayMs(4_000, null), 3_400);
});

test('measured: slowest first token + 1.5 s, never below 2.5 s, never past 85%', () => {
  assert.equal(loneProviderHedgeDelayMs(15_000, { count: 3, maxMs: 500 }), 2_500);
  assert.equal(loneProviderHedgeDelayMs(15_000, { count: 3, maxMs: 3_000 }), 4_500);
  assert.equal(loneProviderHedgeDelayMs(15_000, { count: 3, maxMs: 20_000 }), 12_750);
});

test('the live answer path uses the lone-provider delay as default and floor', async () => {
  const { readFileSync } = await import('node:fs');
  const s = readFileSync(new URL('../../LLMHelper.ts', import.meta.url), 'utf8');
  assert.match(s, /hedgeDelayDefaultMs: loneHedgeMs,\s*hedgeDelayMinMs: loneHedgeMs,\s*hedgeDelayMaxMs: Math\.max\(loneHedgeMs, Math\.round\(budgetMs \* 0\.9\)\)/);
});

test('alias ignores a missing key instead of throwing', () => {
  const budget = new TurnCallBudget();
  const turn = {};
  assert.doesNotThrow(() => budget.alias(null, turn));
  assert.doesNotThrow(() => budget.alias(turn, turn));
});
