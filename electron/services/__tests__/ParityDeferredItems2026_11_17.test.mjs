// 3.2.0 parity: feature-gate absent flag, guide facts, screen-only words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPremiumAvailable, markPremiumAbsent, resetFeatureGate } from '../../../dist-electron/electron/premium/featureGate.js';
import { guideFactsFromSources } from '../../../dist-electron/electron/services/firstRunGuidePolicy.js';
import { isImageCodingAsk } from '../../../dist-electron/electron/llm/codingPromptSignals.js';

test('markPremiumAbsent makes the gate report premium unavailable until reset', () => {
  resetFeatureGate();
  markPremiumAbsent();
  assert.equal(isPremiumAvailable(), false);
  resetFeatureGate();
  assert.equal(globalThis.__nativelyPremiumAbsentV1__, undefined);
});

test('guide facts: the trial sentinel is not a purchased key', () => {
  const f = guideFactsFromSources({ nativelyKey: 'TRIAL', trialSentinel: 'TRIAL', licensed: 1, hasOwnAiKey: 0, hasMeetings: 'x' });
  assert.deepEqual(f, { hasOwnAiKey: false, hasMeetings: true, hasNativelyKey: false, isPremium: true, launchCount: 0 });
  assert.equal(guideFactsFromSources({ nativelyKey: 'nk_real', trialSentinel: 'TRIAL' }).hasNativelyKey, true);
  assert.equal(guideFactsFromSources().hasNativelyKey, false);
});

test('screen-only asks: both action and conversational phrasings count', () => {
  assert.equal(isImageCodingAsk(''), true);
  assert.equal(isImageCodingAsk('solve this'), true);
  assert.equal(isImageCodingAsk('what should I say about this'), true);
});
