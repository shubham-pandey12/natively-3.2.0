import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { prepareDirectAssistPrompt } = require('../../../dist-electron/electron/direct-assist/requestBuilder.js');
const { LLMHelper } = require('../../../dist-electron/electron/LLMHelper.js');

function screenshots(t, count) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'natively-image-identity-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return Array.from({ length: count }, (_, i) => {
    const file = path.join(directory, `shot-${i}.png`);
    fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWQAAAABJRU5ErkJggg==', 'base64'));
    return file;
  });
}

async function dispatch(prepared) {
  const helper = Object.create(LLMHelper.prototype);
  helper.isLocalOnlyMode = false;
  helper.isProviderDisabled = () => false;
  helper.assertOutboundImagesAllowed = () => {};
  helper.getDeniedOutboundScopes = () => [];
  let seen;
  helper.streamWithGeminiModel = async function* (userPrompt, _model, imagePaths) {
    seen = { userPrompt, imagePaths: [...imagePaths] };
    yield 'current image answer';
  };
  const frozen = { ...prepared.request, ...prepared };
  for await (const _ of LLMHelper.prototype.streamDirectAssistFrozen.call(helper, frozen, null, null, undefined)) {}
  return seen;
}

function prepare(imagePaths, history = []) {
  return prepareDirectAssistPrompt({
    requestId: 'dispatch-image-identities',
    source: 'screenshot',
    selection: { provider: 'gemini', model: 'gemini-3.7-flash' },
    currentRequest: 'Analyze the current attached screenshot.',
    imagePaths,
    history,
  });
}

test('a history image deleted after preparation cannot relabel the surviving old screenshot', async (t) => {
  const [current, earlierA, earlierB] = screenshots(t, 3);
  const prepared = prepare([current], [
    { role: 'user', content: 'Old screen A', imagePaths: [earlierA] },
    { role: 'user', content: 'Old screen B', imagePaths: [earlierB] },
  ]);
  assert.deepEqual([...prepared.historyImagePaths], [earlierA, earlierB]);
  assert.match(prepared.userPrompt, /earlier screenshot 1\]: Old screen A/);
  assert.match(prepared.userPrompt, /earlier screenshot 2\]: Old screen B/);
  // The queue can evict A after the prompt is composed but before dispatch.
  fs.unlinkSync(earlierA);
  const seen = await dispatch(prepared);
  assert.deepEqual(seen.imagePaths, [current, earlierB]);
  const marker = '[DISPATCHED IMAGE IDENTITIES]';
  const start = seen.userPrompt.lastIndexOf(marker);
  assert.ok(start >= prepared.userPrompt.length, 'final identities must follow the prepared history');
  const finalMap = seen.userPrompt.slice(start);
  assert.equal(finalMap, `${marker}\nThis map supersedes earlier attachment counts and numbering notices.\nImage attachment 1: current request image 1.\nEarlier screenshot 1: not included in this request.\nImage attachment 2: earlier screenshot 2.\n[/DISPATCHED IMAGE IDENTITIES]`);
});

test('current-only requests preserve their prepared prompt and image payload', async (t) => {
  const [current] = screenshots(t, 1);
  const prepared = prepare([current]);
  assert.deepEqual([...prepared.historyImagePaths], []);
  const seen = await dispatch(prepared);
  assert.deepEqual(seen.imagePaths, [current]);
  assert.equal(seen.userPrompt, prepared.userPrompt);
  assert.doesNotMatch(seen.userPrompt, /DISPATCHED IMAGE IDENTITIES/);
});
