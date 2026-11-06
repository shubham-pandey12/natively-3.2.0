import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { calculateDurationMonths } = await import(pathToFileURL(
  path.resolve(here, '../../../dist-electron/premium/electron/knowledge/DocumentChunker.js'),
).href);

test('calculateDurationMonths rejects out-of-range and fractional months', () => {
  assert.equal(calculateDurationMonths('2024-13', '2025-02'), 0);
  assert.equal(calculateDurationMonths('2024-01', '2025-00'), 0);
  assert.equal(calculateDurationMonths('2024-1.5', '2025-02'), 0);
});
