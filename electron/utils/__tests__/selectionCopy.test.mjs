// Selection copy (Ctrl+C over highlighted overlay text). Platform is injected,
// so both branches run on either OS.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const {
  SELECTION_COPY_ID,
  MAX_SELECTION_COPY_CHARS,
  selectionCopyStrategy,
  selectionCopyText,
} = require(path.join(repoRoot, 'dist-electron/electron/utils/selectionCopy.js'));

test('win32 copies through the keyboard hook', () => {
  assert.equal(selectionCopyStrategy('win32'), 'hook');
});

test('darwin copies through the Edit menu', () => {
  assert.equal(selectionCopyStrategy('darwin'), 'edit-menu');
});

test('other platforms are rejected, not routed through one of the two', () => {
  assert.throws(() => selectionCopyStrategy('linux'), /Unsupported platform/);
});

test('selection text: arms on real text, disarms otherwise', () => {
  assert.equal(selectionCopyText('Use a hash map.'), 'Use a hash map.');
  assert.equal(selectionCopyText('  keep spacing  '), '  keep spacing  ');
  assert.equal(selectionCopyText(''), null);
  assert.equal(selectionCopyText('   \n'), null);
  assert.equal(selectionCopyText(null), null);
  assert.equal(selectionCopyText(42), null);
  assert.equal(selectionCopyText('x'.repeat(MAX_SELECTION_COPY_CHARS + 1)), null);
});

test('chord id matches the native hook', () => {
  const rs = fs.readFileSync(path.join(repoRoot, 'native-module/src/edit_shortcut.rs'), 'utf8');
  assert.match(rs, new RegExp(`SELECTION_COPY_ID: &str = "${SELECTION_COPY_ID}"`));
});
