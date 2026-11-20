import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { comparePngs, screenshotDiffPath } from '../pixels.mjs';

async function writeRgb(file, width, height, pixels) {
  await sharp(Buffer.from(pixels), { raw: { width, height, channels: 3 } }).png().toFile(file);
}

test('pixel distance is Euclidean RGB and must exceed 48', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'natively-pixels-'));
  try {
    const a = path.join(dir, 'a.png');
    const b = path.join(dir, 'b.png');
    await writeRgb(a, 3, 1, Array(9).fill(0));
    await writeRgb(b, 3, 1, [48, 0, 0, 35, 35, 0, 0, 0, 0]);
    const output = screenshotDiffPath(dir);
    assert.ok(Math.abs(await comparePngs(a, b, output) - 100 / 3) < 0.0001);
    const { width, height } = await sharp(output).metadata();
    assert.deepEqual({ width, height }, { width: 25, height: 1 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('counts pixels outside a smaller image without resizing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'natively-pixels-'));
  try {
    const a = path.join(dir, 'a.png');
    const b = path.join(dir, 'b.png');
    await writeRgb(a, 1, 1, [0, 0, 0]);
    await writeRgb(b, 2, 1, Array(6).fill(0));
    assert.equal(await comparePngs(a, b, screenshotDiffPath(dir)), 50);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
