import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { TurnCallBudget, ProviderCircuitBreaker, guardProviderOpen } = require('../../../dist-electron/electron/llm/providerCallBudget.js');

test('failed calls exhaust a turn and open the provider circuit', async () => {
  const key = {}, budget = new TurnCallBudget(), breaker = new ProviderCircuitBreaker({ now: () => 1000 });
  const open = guardProviderOpen({ family: 'test', name: 'Test', turnKey: key, budget, breaker,
    open: async function* () { throw new Error('offline'); } });
  for (let i = 0; i < 3; i++) await assert.rejects(async () => { for await (const _ of open(new AbortController().signal)) {} }, /offline/);
  assert.equal(budget.remaining(key), 0);
  assert.equal(breaker.isOpen('test'), true);
});
