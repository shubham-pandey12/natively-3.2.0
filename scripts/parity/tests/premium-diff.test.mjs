import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBundle } from '../premium-diff.mjs';

test('normalizes esbuild helpers and import identifiers without changing string values', () => {
  const source = [
    "if (process.env.NATIVELY_UI_EVAL) console.log('eval');",
    '"use strict";',
    'var __create = Object.create;',
    '// premium/electron/services/Example.ts',
    'var import_example2 = require("example");',
    'const description2 = "import_example2";',
    'import_example2.run(description2);',
    '//# sourceMappingURL=Example.js.map',
  ].join('\r\n');
  assert.equal(normalizeBundle(source, 'services/Example.js'), [
    '// premium/electron/services/Example.ts',
    'var import_example = require("example");',
    'const description2 = "import_example2";',
    'import_example.run(description2);',
    '',
  ].join('\n'));
});

test('keeps every owned source section and preserves runtime code in unmarked files', () => {
  const source = [
    '// premium/electron/services/Example.ts',
    'var service_exports = {};',
    '// electron/services/dependency.ts',
    'const dependency = 1;',
    '// premium/electron/services/Example.ts',
    'const answer = dependency;',
  ].join('\n');
  const owned = normalizeBundle(source, 'services/Example.js', true);
  assert.match(owned, /service_exports/);
  assert.match(owned, /const answer = dependency/);
  assert.doesNotMatch(owned, /const dependency = 1/);
  assert.equal(normalizeBundle('const answer = 1;', 'services/Example.js', true), 'const answer = 1;\n');
});
