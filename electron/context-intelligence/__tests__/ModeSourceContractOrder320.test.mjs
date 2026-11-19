// 3.2.0 folds attachment extras into the allowlist BEFORE applying the mode
// source contract, so the contract sees the final allowlist.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const src = fs.readFileSync(path.resolve('electron/context-intelligence/orchestration/orchestrator.ts'), 'utf8');
const { applyModeSourceContract, resolveModePolicy } = await import(pathToFileURL(path.resolve('dist-electron/electron/context-intelligence/policies/mode-policy-registry.js')).href);

test('decide() applies the mode source contract after the attachment extras', () => {
  const body = src.slice(src.indexOf('export function decide('));
  const extras = body.indexOf('const extra = (req.extraAllowedSourceTypes');
  const contract = body.indexOf('policy = applyModeSourceContract(policy, req.modeSourceContract);');
  assert.ok(extras > 0 && contract > 0, 'both steps present');
  assert.ok(contract > extras, 'contract runs after extras');
  assert.equal(body.split('applyModeSourceContract(policy').length - 1, 1, 'contract applied once');
});

test('an extra REFERENCE_FILE is not appended a second time by the contract', () => {
  const base = resolveModePolicy('recruiting');
  const withExtra = base.allowedSourceTypes.includes('REFERENCE_FILE')
    ? base : { ...base, allowedSourceTypes: [...base.allowedSourceTypes, 'REFERENCE_FILE'] };
  const out = applyModeSourceContract(withExtra, { sourceAuthority: 'reference_files_only', origin: 'user_selected' });
  assert.equal(out.allowedSourceTypes.filter((s) => s === 'REFERENCE_FILE').length, 1);
  assert.deepEqual(out.allowedSourceTypes, withExtra.allowedSourceTypes);
});
