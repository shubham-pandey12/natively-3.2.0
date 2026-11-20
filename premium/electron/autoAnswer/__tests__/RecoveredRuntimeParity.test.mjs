import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
// The sources are TypeScript: load the esbuild output (npm run build:electron runs first).
const built = (rel) => require(path.join(root, 'dist-electron/premium/electron/autoAnswer', rel));
const premium = built('index.js').autoAnswerPremium;
const { newTrainingConsent } = built('autoAnswerAccess.js');
const { chooseDeciderRuntime } = built('decider/deciderRuntime.js');
const { executionProvidersFor } = built('decider/deciderPlatform.js');

test('recovered premium module satisfies the app loader contract', () => {
  assert.equal(premium.available, true);
  for (const key of ['createEngine', 'createDecider', 'createModelInstaller', 'createTrainingUploader']) {
    assert.equal(typeof premium[key], 'function', key);
  }
  assert.equal(premium.autoAnswerAccess({ proOrTrial: true, consent: null }).allowed, true);
  assert.equal(premium.autoAnswerAccess({ proOrTrial: false, consent: null }).allowed, false);
});

test('decider runtime and execution provider selection cover both supported platforms', () => {
  assert.equal(chooseDeciderRuntime('darwin', 'arm64', '23.0').variant, 'int8');
  assert.equal(chooseDeciderRuntime('darwin', 'x64', '22.4').variant, 'q4');
  assert.equal(chooseDeciderRuntime('win32', 'x64', '10.0').variant, 'int8');
  assert.deepEqual(executionProvidersFor('darwin', { NATIVELY_DECIDER_EP: 'coreml' }), ['coreml', 'cpu']);
  assert.deepEqual(executionProvidersFor('win32', { NATIVELY_DECIDER_EP: 'dml' }), ['dml', 'cpu']);
});

test('Auto Answer sharing requires renewed consent for the expanded transcript', () => {
  const now = new Date('2026-11-21T00:00:00.000Z');
  const oldConsent = { version: 1, grantedAt: now.toISOString() };
  assert.deepEqual(premium.autoAnswerAccess({ proOrTrial: false, consent: oldConsent }), {
    allowed: false, basis: 'none', uploads: false, error: 'auto_answer_access_required',
  });
  assert.deepEqual(premium.autoAnswerAccess({ proOrTrial: true, consent: oldConsent }), {
    allowed: true, basis: 'pro', uploads: false,
  });
  const consent = newTrainingConsent(now);
  assert.equal(consent.version, 2);
  assert.deepEqual(premium.autoAnswerAccess({ proOrTrial: false, consent }), {
    allowed: true, basis: 'sharing', uploads: true,
  });
});

test('the built app loader reaches premium and the decider worker starts and shuts down', async () => {
  const builtLoader = require(path.join(root, 'dist-electron/electron/premium/autoAnswer.js'));
  assert.equal(builtLoader.loadAutoAnswerPremium().available, true);

  const worker = new Worker(path.join(root, 'dist-electron/premium/electron/autoAnswer/decider/deciderWorker.js'));
  const within = (promise, what) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out`)), 5000);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
  try {
    const hello = await within(new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
    }), 'decider worker startup');
    assert.equal(hello.type, 'hello');
    const exit = new Promise((resolve) => worker.once('exit', resolve));
    worker.postMessage({ type: 'shutdown' });
    assert.equal(await within(exit, 'decider worker shutdown'), 0);
  } finally {
    await worker.terminate();
  }
});
