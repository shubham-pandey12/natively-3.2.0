import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isEntryScript } from '../lib/is-entry-script.mjs';
import { parseArgs } from 'node:util';
import ts from 'typescript';

const sourceBanner = /^\/\/ (\S+\/\S+\.(?:[mc]?[jt]s|[jt]sx|json))[ \t]*$/gm;
const bundleExtension = /\.[cm]?js$/;
const sourceExtension = /\.[cm]?[jt]sx?$/;

function collect(root, prefix = '') {
  const bundles = [];
  for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const name = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) bundles.push(...collect(root, name));
    else if (entry.isFile() && bundleExtension.test(name)) bundles.push(name);
  }
  return bundles;
}

export function normalizeBundle(source, name, ownModule = false) {
  let code = source.replace(/\r\n/g, '\n')
    .replace(/^(?:#![^\n]*\n)?(?=[^\n]*NATIVELY_UI_EVAL)[^\n]*\n/, '')
    .replace(/^\/\/[#@] sourceMappingURL=[^\n]*\n?/gm, '');
  const sections = [...code.matchAll(sourceBanner)];
  if (ownModule) {
    const stem = 'premium/electron/' + name.replace(bundleExtension, '');
    const owned = sections.flatMap((match, index) => match[1].replace(sourceExtension, '') === stem
      ? [code.slice(match.index, sections[index + 1]?.index ?? code.length)] : []);
    // Keep unmarked files in the audit rather than silently comparing blanks.
    if (owned.length) code = owned.join('\n');
  } else if (sections.length) {
    const preamble = code.slice(0, sections[0].index);
    // A helper-free bundle may place a real directive or import before its
    // first source marker. Only drop the prefix for an esbuild helper preamble.
    if (/^var __\w+\s*=/m.test(preamble)) code = code.slice(sections[0].index);
  }

  const file = ts.createSourceFile(name, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const replacements = [];
  function visit(node) {
    if (ts.isIdentifier(node) && /^import_[a-zA-Z_$][\w$]*?\d+$/.test(node.text)) {
      replacements.push([node.getStart(file), node.end, node.text.replace(/\d+$/, '')]);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  for (const [start, end, value] of replacements.reverse()) {
    code = code.slice(0, start) + value + code.slice(end);
  }
  return code.trimEnd() + '\n';
}

function unifiedDiff(scratch, name, reference, ours) {
  const oldFile = path.join(scratch, 'reference.js');
  const newFile = path.join(scratch, 'ours.js');
  writeFileSync(oldFile, reference);
  writeFileSync(newFile, ours);
  const result = spawnSync('git', [
    '-c', 'core.autocrlf=false', 'diff', '--no-index', '--no-ext-diff',
    '--no-color', '--no-renames', '--text', '--', oldFile, newFile,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 1) throw new Error(result.stderr || 'git diff did not return a unified diff');
  return result.stdout.split('\n').map((line) => {
    if (line.startsWith('diff --git ')) return 'diff --git a/' + name + ' b/' + name;
    if (line.startsWith('--- ')) return '--- reference/' + name;
    if (line.startsWith('+++ ')) return '+++ ours/' + name;
    // Packaged calendar integration can bake a client secret into an inlined
    // public module. Compare it normally, but keep the literal out of stdout.
    return line.replace(/(\bDEFAULT_CALENDAR_CLIENT_SECRET\s*=\s*)"(?:[^"\\]|\\.)+"/g, '$1"<redacted>"');
  }).join('\n').trimEnd();
}

export function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: {
    reference: { type: 'string' },
    ours: { type: 'string', default: 'dist-electron/premium/electron' },
    file: { type: 'string' },
    'own-module': { type: 'boolean' },
    'summary-only': { type: 'boolean' },
  } });
  const reference = values.reference ?? process.env.NATIVELY_PREMIUM_REFERENCE;
  if (!reference) throw new Error('Pass --reference <extracted dist-electron/premium/electron directory>');
  const roots = [path.resolve(reference), path.resolve(values.ours)];
  for (const root of roots) {
    if (!statSync(root).isDirectory()) throw new Error('Not a bundle directory: ' + root);
  }
  const [refFiles, ourFiles] = roots.map((root) => new Set(collect(root)));
  if (!refFiles.size || !ourFiles.size) throw new Error('Both directories must contain JavaScript bundles');
  const names = [...new Set([...refFiles, ...ourFiles])].sort().filter((name) => !values.file || name === values.file);
  if (!names.length) throw new Error('No matching bundle: ' + values.file);
  const counts = { identical: 0, changed: 0, 'only-in-reference': 0, 'only-in-ours': 0 };
  const scratch = mkdtempSync(path.join(tmpdir(), 'natively-premium-diff-'));
  try {
    for (const name of names) {
      let state;
      if (!refFiles.has(name)) state = 'only-in-ours';
      else if (!ourFiles.has(name)) state = 'only-in-reference';
      else {
        const [ref, ours] = roots.map((root) => normalizeBundle(
          readFileSync(path.join(root, name), 'utf8'), name, values['own-module'],
        ));
        state = ref === ours ? 'identical' : 'changed';
        console.log(state + '\t' + name);
        if (state === 'changed' && !values['summary-only']) console.log(unifiedDiff(scratch, name, ref, ours));
      }
      if (state.startsWith('only-in-')) console.log(state + '\t' + name);
      counts[state]++;
    }
    console.log('Summary: ' + Object.entries(counts).map(([key, value]) => key + '=' + value).join(' '));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (isEntryScript(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
