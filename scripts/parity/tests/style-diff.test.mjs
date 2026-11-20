import assert from 'node:assert/strict';
import test from 'node:test';
import { extractStyles, styleDifferences } from '../style-diff.mjs';

test('compares data styles and resolves shared constants without executing code', () => {
  const base = 'const shared = 3, styles = { uploadBtn: { gap: shared+2, left: compute() }, other: { height: 1 } };';
  const own = 'const styles: Record<string, object> = { uploadBtn: { gap: 5, left: 0 }, added: {} };';
  assert.deepEqual(styleDifferences(extractStyles(base, 'bundle.js', 'uploadBtn'), extractStyles(own, 'styles.tsx', 'uploadBtn')), [
    { key: 'added', status: 'only-in-ours' },
    { key: 'other', status: 'only-in-reference' },
    { key: 'uploadBtn.left', status: 'unresolved' },
  ]);
});

test('reports changed properties and rejects ambiguous markers', () => {
  const get = (text) => extractStyles(text, 'bundle.js', 'uploadBtn');
  assert.deepEqual(styleDifferences(get('const s = {uploadBtn:{gap:1}}'), get('const s = {uploadBtn:{gap:2}}')),
    [{ key: 'uploadBtn.gap', status: 'changed' }]);
  assert.throws(() => get('const a = {uploadBtn:{}}, b = {uploadBtn:{}}'), /exactly one/);
});
