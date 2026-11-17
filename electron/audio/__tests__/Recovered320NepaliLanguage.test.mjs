import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const base = '../../../dist-electron/electron';
const languages = require(`${base}/config/languages.js`);
const support = require(`${base}/audio/sttLanguageSupport.js`);
const { SonioxStreamingSTT } = require(`${base}/audio/SonioxStreamingSTT.js`);

test('Nepali is offered except on providers that reject it', () => {
  assert.equal(languages.RECOGNITION_LANGUAGES.nepali?.bcp47, 'ne-NP');
  assert.ok(languages.AUTO_DETECT_ALTERNATES.includes('ne-NP'));
  assert.ok(languages.AI_RESPONSE_LANGUAGES.some((item) => item.code === 'Nepali'));
  assert.equal(languages.isRecognitionLanguageOffered('nepali', null, null, 'soniox'), false);
  assert.equal(languages.isRecognitionLanguageOffered('nepali', null, null, 'natively'), false);
  assert.equal(languages.isRecognitionLanguageOffered('nepali', null, null, 'google'), true);
});

test('Soniox uses auto detect for unsupported pinned languages', () => {
  const stt = new SonioxStreamingSTT('test-key');
  stt.setRecognitionLanguage('maltese');
  assert.equal(stt.languageCode, undefined);
});

test('failover does not choose a provider that rejects Nepali', () => {
  const deps = { modelFor: () => undefined, isEnglishOnlyModel: () => false };
  assert.equal(support.sttCandidateSupportsLanguage('soniox', 'nepali', deps), false);
  assert.equal(support.sttCandidateSupportsLanguage('natively', 'nepali', deps), false);
  assert.equal(support.sttCandidateSupportsLanguage('google', 'nepali', deps), true);
});
