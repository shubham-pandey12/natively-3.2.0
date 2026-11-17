// 3.2.0 parity: background LLM work runs in its own lane of the rate limiter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, runAsBackgroundLlmWork, isBackgroundLlmWork } from '../../../dist-electron/electron/services/RateLimiter.js';

test('the lane is visible only inside runAsBackgroundLlmWork', async () => {
  assert.equal(isBackgroundLlmWork(), false);
  await runAsBackgroundLlmWork(async () => {
    await Promise.resolve();
    assert.equal(isBackgroundLlmWork(), true);
  });
  assert.equal(isBackgroundLlmWork(), false);
});

test('background work takes a token when the bucket is full and live work is quiet', async () => {
  const rl = new RateLimiter(8, 1, { liveQuietMs: 0 });
  await runAsBackgroundLlmWork(() => rl.acquire());
  assert.equal(rl.tokens, 7);
  rl.destroy();
});

test('background work never takes the live reserve', async () => {
  const rl = new RateLimiter(4, 0.001, { liveQuietMs: 0 }); // reserve = 1
  for (let i = 0; i < 3; i++) await rl.acquire(); // live: 1 token left
  let done = false;
  const bg = runAsBackgroundLlmWork(() => rl.acquire()).then(() => { done = true; }, () => {});
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(done, false, 'background must wait, the last token is the live reserve');
  await rl.acquire(); // live still gets it
  rl.destroy();
  await bg;
});

test('background work waits while live answers are recent', async () => {
  const rl = new RateLimiter(10, 0.001, { liveQuietMs: 60_000 });
  await rl.acquire();
  let done = false;
  const bg = runAsBackgroundLlmWork(() => rl.acquire()).then(() => { done = true; }, () => {});
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(done, false);
  rl.destroy();
  await bg;
});

test('destroy rejects background waiters too', async () => {
  const rl = new RateLimiter(2, 0.001, { liveQuietMs: 60_000 });
  await rl.acquire();
  const bg = runAsBackgroundLlmWork(() => rl.acquire());
  rl.destroy();
  await assert.rejects(bg, /destroyed/);
});
