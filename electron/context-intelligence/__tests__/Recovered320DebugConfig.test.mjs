import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const config = require('../../../dist-electron/electron/context-intelligence/debug/debug-config.js');

test('debug log helpers redact content unless explicitly enabled and keep only a file name', () => {
  assert.equal(config.logSafeText('secret'), '<6 chars>');
  assert.equal(config.logSafeFileName('C:\\Users\\A\\report.txt'), 'report.txt');
  assert.equal(config.logSafeFileName('/Users/A/report.txt'), 'report.txt');
});
