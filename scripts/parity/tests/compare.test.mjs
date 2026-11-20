import assert from 'node:assert/strict';
import test from 'node:test';
import { compare, diff } from '../compare.mjs';

test('installed-vs-dev wording is expected, but a flag difference on the same check is not', () => {
  const installed = { 'settings-defaults': { values: { getCanAutoUpdate: { canAutoUpdate: true },
    getLocalFallbackPreflight: { checks: [{ ok: true, message: 'Found app.asar.unpacked/x.node' }] } } } };
  const local = { 'settings-defaults': { values: { getCanAutoUpdate: { canAutoUpdate: false },
    getLocalFallbackPreflight: { checks: [{ ok: false, message: 'Dev mode: skipping unpacked check (x.node)' }] } } } };
  const [row] = compare(['settings-defaults'], installed, local);
  assert.deepEqual(row.expected.map(({ path }) => path).sort(),
    ['/values/getCanAutoUpdate/canAutoUpdate', '/values/getLocalFallbackPreflight/checks/0/message']);
  assert.deepEqual(row.differences.map(({ path }) => path), ['/values/getLocalFallbackPreflight/checks/0/ok']);
  assert.equal(row.status, 'DIFF');
});

test('a missing-file message locally is a real difference, not expected wording', () => {
  const at = (message) => ({ 'settings-defaults': { values: { getLocalFallbackPreflight: { checks: [{ message }] } } } });
  const [row] = compare(['settings-defaults'], at('Found C:/x/model.onnx'), at('Missing packaged model asset: model.onnx'));
  assert.equal(row.expected.length, 0);
  assert.equal(row.differences.length, 1);
});

test('compares object order without suppressing array order', () => {
  assert.deepEqual(diff({ a: true, b: false }, { b: false, a: true }), []);
  assert.deepEqual(diff({ a: ['x', 'y'] }, { a: ['y', 'x'] }).map(({ path }) => path), ['/a/0', '/a/1']);
});

test('reports exact escaped paths and distinguishes null from a missing key', () => {
  assert.deepEqual(diff({ 'a/b~': { value: null } }, { 'a/b~': {} }), [{
    path: '/a~1b~0/value', installed: null, local: undefined, installedPresent: true, localPresent: false,
  }]);
  assert.equal(diff([], {})[0].path, '');
});

test('summarizes scenario matches and differences', () => {
  const rows = compare(['match', 'diff'], { match: {}, diff: { enabled: true } },
    { match: {}, diff: { enabled: false } });
  assert.deepEqual(rows.map(({ status, differences }) => [status, differences.length]),
    [['MATCH', 0], ['DIFF', 1]]);
});
