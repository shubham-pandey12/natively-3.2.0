import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const warm = require('../../../dist-electron/electron/llm/answerPathWarmup.js');

test('answer path warmup schedules once and keeps going after a failed step', () => {
  warm.resetAnswerPathWarmupForTests();
  const jobs = [], ran = [];
  const schedule = fn => jobs.push(fn);
  assert.equal(warm.scheduleAnswerPathWarmup({ schedule, steps: [
    { name: 'bad', run: () => { throw Error('bad'); } },
    { name: 'good', run: () => ran.push('good') },
  ] }), true);
  assert.equal(warm.scheduleAnswerPathWarmup({ schedule }), false);
  while (jobs.length) jobs.shift()();
  assert.deepEqual(ran, ['good']);
});
