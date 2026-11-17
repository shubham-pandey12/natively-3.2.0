import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const length = require('../../../dist-electron/electron/llm/answerLength.js');
const speakability = require('../../../dist-electron/electron/llm/speakability.js');
const planner = require('../../../dist-electron/electron/llm/AnswerPlanner.js');

test('answer length defaults and Pro gate match 3.2', () => {
  assert.equal(length.effectiveAnswerLength('longer', false), 'smart');
  assert.equal(length.effectiveAnswerLength('shorter', true), 'shorter');
  assert.equal(length.effectiveAnswerLength('invalid', true), 'smart');
  assert.equal(length.profileAnswerWordCap(undefined, 'shorter'), 50);
  assert.equal(length.profileAnswerWordCap('detailed', 'longer'), 200);
  assert.equal(length.profileAnswerWordCap(undefined, 'longer', true), null);
  assert.equal(length.profileAnswerWordCap(undefined, 'longer', false, false), 90);
});

test('3.2 spoken limits and prompt bands follow selected answer length', () => {
  assert.deepEqual(speakability.spokenShortLimits('shorter'), { softMaxWords: 40, hardMaxWords: 50, hardMaxSeconds: 22 });
  assert.deepEqual(speakability.spokenShortLimits('longer'), { softMaxWords: 200, hardMaxWords: 230, hardMaxSeconds: 100 });
  const plan = { answerType: 'jd_fit_answer', answerStyle: 'default', question: 'Why should we hire you?' };
  assert.match(planner.renderLengthDirectiveForPlan(plan, { answerLength: 'shorter' }), /user chose Shorter answers/);
  assert.match(planner.renderLengthDirectiveForPlan(plan, { answerLength: 'longer' }), /user chose Longer answers/);
  assert.doesNotMatch(planner.renderLengthDirectiveForPlan(plan, { answerLength: 'smart' }), /user chose/);
});
