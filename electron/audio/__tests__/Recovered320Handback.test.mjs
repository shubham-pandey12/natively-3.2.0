import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { SttFailover } = require('../../../dist-electron/electron/audio/sttFailover.js');
const { recoveredLineMayBeAnswered, repeatsLiveText } = require('../../../dist-electron/electron/audio/sttGapRecovery.js');

test('handback suppresses repeated buffered finals only during the recovered window', () => {
  let now = 1_000;
  class FakeStt extends EventEmitter {
    start() {}
    stop() {}
    setSampleRate() {}
    write() {}
  }
  let fallback;
  const failover = new SttFailover({
    source: 'system', primary: 'soniox', candidates: () => ['deepgram'],
    create: () => (fallback = new FakeStt()), onTranscript() {}, onStatus() {},
    restartPrimary() {}, now: () => now, setInterval: () => 1, clearInterval() {},
  });
  assert.equal(failover.engage(), true);
  fallback.emit('transcript', { text: 'the budget is twelve thousand', isFinal: true });
  assert.equal(failover.acceptPrimary({ text: 'new information', isFinal: true }), true);
  assert.equal(failover.acceptPrimary({ text: 'the budget is twelve thousand', isFinal: true }), false);
  now += 10_001;
  assert.equal(failover.acceptPrimary({ text: 'the budget is twelve thousand', isFinal: true }), true);
});

test('recovery dedupe requires every word and auto-answer accepts only recent system lines', () => {
  assert.equal(repeatsLiveText('budget is twelve thousand', ['budget is twelve']), false);
  assert.equal(repeatsLiveText('budget is twelve thousand', ['budget is twelve thousand']), true);
  const seg = { source: 'system', text: 'what is the budget', endTimestamp: 1_000 };
  assert.equal(recoveredLineMayBeAnswered(seg, 61_000), true);
  assert.equal(recoveredLineMayBeAnswered(seg, 61_001), false);
  assert.equal(recoveredLineMayBeAnswered({ ...seg, source: 'mic' }, 1_000), false);
  assert.equal(recoveredLineMayBeAnswered({ ...seg, text: ' ' }, 1_000), false);
  const main = fs.readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
  assert.match(main, /this\.isAutoAnswerActive\(\) && recoveredLineMayBeAnswered\(seg, Date\.now\(\)\)/);
  assert.match(main, /this\.simpleAutoAnswer\.ingest\(\{/);
});
