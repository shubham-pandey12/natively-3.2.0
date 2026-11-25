import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { toPcm16kMono } = require('../../../../dist-electron/premium/electron/liveBrain/interviewerAudio.js');

const pcm = (values) => {
    const buffer = Buffer.alloc(values.length * 2);
    values.forEach((value, i) => buffer.writeInt16LE(value, i * 2));
    return buffer;
};

test('16 kHz mono passes through unchanged', () => {
    const input = pcm([1, -2, 3, -4]);
    assert.deepEqual(toPcm16kMono(input, 16_000, 1), input);
});

test('stereo is averaged to mono', () => {
    assert.deepEqual(toPcm16kMono(pcm([100, 300, -100, -300]), 16_000, 2), pcm([200, -200]));
});

test('48 kHz is downsampled to a third of the frames', () => {
    const out = toPcm16kMono(pcm(new Array(4_800).fill(1_000)), 48_000, 1);
    assert.ok(Math.abs(out.length / 2 - 1_600) <= 2, `got ${out.length / 2} frames`);
});

test('full-scale audio is clamped instead of throwing', () => {
    const loud = pcm(Array.from({ length: 4_800 }, (_, i) => (i % 2 ? 32_767 : -32_768)));
    assert.doesNotThrow(() => toPcm16kMono(loud, 48_000, 1));
    assert.doesNotThrow(() => toPcm16kMono(pcm(new Array(4_410).fill(32_767)), 44_100, 2));
});

test('invalid formats produce no audio', () => {
    assert.equal(toPcm16kMono(pcm([1]), 0, 1).length, 0);
    assert.equal(toPcm16kMono(pcm([1]), 16_000, 0).length, 0);
});
