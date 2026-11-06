import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const source = fs.readFileSync(path.join(repoRoot, 'electron/ipcHandlers.ts'), 'utf8');
const preload = fs.readFileSync(path.join(repoRoot, 'electron/preload.ts'), 'utf8');
const ambientTypes = fs.readFileSync(path.join(repoRoot, 'src/types/electron.d.ts'), 'utf8');

test('Role Insight JD staging gives paste and URL imports distinct temp paths', () => {
  for (const channel of ['roleInsight:paste-jd', 'roleInsight:import-jd-url']) {
    const start = source.indexOf(`safeHandle('${channel}'`);
    assert.notEqual(start, -1, `${channel} handler exists`);
    const nextHandler = source.indexOf("safeHandle('roleInsight:", start + 1);
    const body = source.slice(start, nextHandler === -1 ? undefined : nextHandler);

    assert.match(body, /natively-jd-\$\{crypto\.randomUUID\(\)\}\.txt/);
    assert.doesNotMatch(body, /natively-jd-\$\{Date\.now\(\)\}\.txt/);
  }
});

test('Role Insight preload methods are part of the renderer ElectronAPI contract', () => {
  const sectionStart = preload.indexOf('// Role Insight — résumé × job-description requirement analysis.');
  const sectionEnd = preload.indexOf('// Tavily Search API', sectionStart);
  assert.notEqual(sectionStart, -1);
  assert.notEqual(sectionEnd, -1);
  const methods = [...preload.slice(sectionStart, sectionEnd).matchAll(/^\s*(roleInsight\w+|onRoleInsightProgress):/gm)]
    .map((match) => match[1]);

  assert.ok(methods.length > 0);
  for (const method of methods) assert.match(ambientTypes, new RegExp(`\\b${method}:`));
});
