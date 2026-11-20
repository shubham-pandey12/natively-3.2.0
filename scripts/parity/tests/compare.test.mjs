import assert from 'node:assert/strict';
import test from 'node:test';
import { compare, diff } from '../compare.mjs';

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
