import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const bridge = fs.readFileSync(path.resolve('electron/context-intelligence/orchestration/engine-bridge.ts'), 'utf8');
const { applyModeSourceContract, resolveModePolicy } = await import(pathToFileURL(path.resolve('dist-electron/electron/context-intelligence/policies/mode-policy-registry.js')).href);

test('bridge reads the persisted mode contract lazily and passes it into the request', () => {
  assert.match(bridge, /if \(input\.modeUniqueId\) \{[\s\S]*?require\('\.\.\/\.\.\/services\/ModesManager'\)[\s\S]*?getModes\(\)\.find\([\s\S]*?typeof c\.sourceAuthority === 'string' && typeof c\.origin === 'string'/);
  assert.match(bridge, /extraAllowedSourceTypes: input\.extraAllowedSourceTypes,\s*modeSourceContract,\s*keepConversationState:/);
  assert.match(bridge, /if \(input\.modeUniqueId\) \{[\s\S]*?\} catch \{\s*(?:\/\*[^*]*\*\/\s*)?\}/);
});

test('a reference-files-only contract promotes reference files in recruiting mode', () => {
  const base = resolveModePolicy('recruiting');
  const policy = applyModeSourceContract(base, { sourceAuthority: 'reference_files_only', origin: 'user_selected' });
  assert.equal(policy.attachedMaterialIsPrimary, true);
  assert.ok(policy.allowedSourceTypes.includes('REFERENCE_FILE'));
  assert.equal(base.attachedMaterialIsPrimary, false);
});

test('unknown, absent, throwing, and incomplete modes leave the contract null', () => {
  const start = bridge.indexOf('    let modeSourceContract:');
  const end = bridge.indexOf('    const req: AnswerRequest', start);
  assert.ok(start > 0 && end > start);
  const snippet = bridge.slice(start, end).replace(/: \{ sourceAuthority: string; origin: string \} \| null/, '').replace(/\(m: \{[^()]*\}\)/, '(m)');
  const read = (modeUniqueId, getModes) => vm.runInNewContext(`(() => { const input = { modeUniqueId }; ${snippet} return modeSourceContract; })()`, {
    modeUniqueId, require: () => ({ ModesManager: { getInstance: () => ({ getModes }) } }),
  });
  assert.equal(read(null, () => { throw new Error('must not read'); }), null);
  assert.equal(read('unknown', () => []), null);
  assert.equal(read('throws', () => { throw new Error('database unavailable'); }), null);
  assert.equal(read('incomplete', () => [{ id: 'incomplete', sourceContract: { origin: 'user_selected' } }]), null);
  assert.deepEqual({ ...read('known', () => [{ id: 'known', sourceContract: { sourceAuthority: 'reference_files_only', origin: 'user_selected' } }]) },
    { sourceAuthority: 'reference_files_only', origin: 'user_selected' });
});
