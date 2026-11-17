import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const source = fs.readFileSync(path.join(repoRoot, 'premium/src/ModesSettings.tsx'), 'utf8');

test('Modes Manager reports semantic readiness and degraded reference-file states', () => {
  assert.match(source, /ready: \{ label: 'Indexed'[\s\S]*?title: 'Semantic search ready'/);
  for (const status of ['indexing', 'lexical_only', 'failed', 'pending']) {
    assert.ok(source.includes(`${status}: { label:`), `missing visible ${status} state`);
  }
  assert.doesNotMatch(source, /ocr_required: \{ label:/);
  assert.match(source, /<ReferenceFileStatus status=\{fileStatuses\[f.id\]\} fileName=\{f.fileName\}/);
});
