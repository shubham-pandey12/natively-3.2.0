import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { plainLiveSpeech } = require('../../../../dist-electron/premium/electron/liveBrain/plainSpeech.js');

test('strips announced thinking at the start of a sentence', () => {
    assert.equal(plainLiveSpeech('Thinking out loud, five seconds sounds slow.'), 'Five seconds sounds slow.');
    assert.equal(plainLiveSpeech('Briefly thinking, I would check the tenant first.'), 'I would check the tenant first.');
    assert.equal(plainLiveSpeech('So let me think, the cache is the issue.'), 'The cache is the issue.');
    assert.equal(plainLiveSpeech('I like thinking out loud with my team.'), 'I like thinking out loud with my team.');
});

test('swaps dramatic words for plain ones and keeps capitalisation', () => {
    assert.equal(plainLiveSpeech('Response times were skyrocketing, so I dove into the logs.'), 'Response times were going up a lot, so I looked into the logs.');
    assert.equal(plainLiveSpeech('It cut latency dramatically.'), 'It cut latency a lot.');
    assert.equal(plainLiveSpeech('Leveraging Redis, we ensured it was crucial.'), 'Using Redis, we made sure it was important.');
});

test('leaves code, control messages and empty text alone', () => {
    assert.equal(plainLiveSpeech('Call `ensure()` then I ensure it works.'), 'Call `ensure()` then I make sure it works.');
    assert.equal(plainLiveSpeech('Ask: Should I leverage caching?'), 'Ask: Should I leverage caching?');
    assert.equal(plainLiveSpeech('No action.'), 'No action.');
    assert.equal(plainLiveSpeech(''), '');
});
