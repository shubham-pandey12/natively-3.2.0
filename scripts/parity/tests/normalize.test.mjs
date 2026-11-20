import assert from 'node:assert/strict';
import test from 'node:test';
import { normalize } from '../normalize.mjs';

test('turns each window API into a set', () => {
  assert.deepEqual(normalize('api-surface', { windows: { launcher: ['getZ', 'getA', 'getZ'] } }),
    { windows: { launcher: { getA: true, getZ: true } } });
});

test('normalizes renderer origins and owned paths while retaining meaningful values', () => {
  const result = normalize('settings-defaults', {
    values: {
      origin: 'file:///C:/Program%20Files/Natively/resources/app.asar/dist/index.html?window=launcher',
      devOrigin: 'http://127.0.0.1:53211/index.html?window=launcher',
      profilePath: 'C:\\Repo\\profile\\logs\\debug.log',
      expression: 'a\\b',
      models: ['z', 'a'],
      fetchedAt: 1,
      isPremium: false,
    },
    skipped: { getKey: 'credential data' },
  }, ['C:\\Repo\\profile']);
  assert.deepEqual(result, {
    values: {
      origin: 'app:///index.html?window=launcher',
      devOrigin: 'app:///index.html?window=launcher',
      profilePath: '<workspace>/logs/debug.log',
      expression: 'a\\b',
      models: ['z', 'a'],
      isPremium: false,
    },
  });
});

test('compares mode content independently of generated IDs and retains displayed and note order', () => {
  const a = { id: 'mode_a', name: 'A', templateType: 'general', createdAt: 'today', isActive: true };
  const b = { id: 'mode_b', name: 'B', templateType: 'lecture', createdAt: 'yesterday' };
  const sections = [{ modeId: a.id, notes: [
    { id: 'ns_generated', modeId: a.id, title: 'Z', sortOrder: 0 },
    { id: 'ns_other', modeId: a.id, title: 'A', sortOrder: 1 },
  ] }];
  const expected = normalize('modes', { all: [a, b], active: a, sections });
  const reordered = normalize('modes', { all: [b, a], active: a, sections });
  assert.deepEqual(expected.all, reordered.all);
  assert.deepEqual(reordered.order, [...expected.order].reverse());
  assert.deepEqual(expected.active, expected.all['general: A']);
  assert.deepEqual(expected.sections['general: A'].notes.map(({ title }) => title), ['Z', 'A']);
  assert.equal(expected.sections['general: A'].notes[0].id, undefined);
  assert.equal(expected.sections['general: A'].notes[0].modeId, 'general: A');
  const renamedId = { ...a, id: 'mode_new', createdAt: 'tomorrow' };
  assert.deepEqual(normalize('modes', { all: [renamedId, b], active: renamedId, sections: [] }).all, expected.all);
});

test('compares console errors as a multiset and preserves occurrence counts', () => {
  const single = { type: 'error', message: 'error' };
  const exception = { type: 'exception', message: 'Error: issue\n    at http://127.0.0.1:5180/file.js:34:10', timestamp: 1 };
  assert.deepEqual(normalize('console-errors', { launcher: [single, exception, single] }),
    { launcher: [single, single, { type: 'exception', message: 'Error: issue' }] });
});
