// Recovered 3.2.0: a chain whose configured providers all failed reports the
// last provider's own failure instead of "No AI provider configured".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(path.resolve(__dirname, '../../../dist-electron/electron/llm/providerErrorClassifier.js')).href);
const { PROVIDERS_EXHAUSTED_CODE, isProvidersExhaustedError, providerFailureUserMessage } = mod;

const exhausted = (cause) => Object.assign(new Error('All configured AI providers failed to answer.'), { code: PROVIDERS_EXHAUSTED_CODE, cause });

test('the exhausted-chain error is recognised by its code', () => {
  assert.equal(PROVIDERS_EXHAUSTED_CODE, 'PROVIDERS_EXHAUSTED');
  assert.equal(isProvidersExhaustedError(exhausted(null)), true);
  assert.equal(isProvidersExhaustedError(new Error('x')), false);
  assert.equal(isProvidersExhaustedError(null), false);
});

test('the user sees the last provider\'s specific failure when there is one', () => {
  assert.match(providerFailureUserMessage(exhausted({ status: 429 })), /rate-limiting/);
  assert.match(providerFailureUserMessage(exhausted({ status: 401 })), /API key or permission/);
});

test('without a specific cause the user is told the provider is unreachable, not that none is configured', () => {
  const line = providerFailureUserMessage(exhausted(new Error('boom')));
  assert.match(line, /unreachable or overloaded/);
  assert.doesNotMatch(line, /No AI provider/);
  assert.match(providerFailureUserMessage(exhausted(exhausted(null))), /unreachable or overloaded/);
});
