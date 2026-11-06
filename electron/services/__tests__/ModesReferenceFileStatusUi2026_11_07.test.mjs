import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const source = fs.readFileSync(path.join(repoRoot, 'premium/src/ModesSettings.tsx'), 'utf8');

test('Modes Manager reports semantic readiness and degraded reference-file states', () => {
  assert.match(source, /aria-label="Semantic search ready"[\s\S]{0,100}title="Semantic search ready"[\s\S]{0,500}INDEXED/);
  for (const status of ['indexing', 'lexical_only', 'failed', 'ocr_required', 'pending']) {
    assert.ok(source.includes(`fileStatuses[f.id] === '${status}'`), `missing visible ${status} state`);
  }
});
