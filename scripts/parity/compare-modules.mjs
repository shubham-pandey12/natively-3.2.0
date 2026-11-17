#!/usr/bin/env node
// Compare compiled esbuild modules between the recovered 3.2.0 build and this
// checkout's build, module by module (split on `// <source path>` banners,
// numeric identifier suffixes normalized). Cross-platform: Node APIs only.
//
// Usage:
//   node scripts/parity/compare-modules.mjs [--recovered <app dir>] [--module <source path>]
//   (run `npm run build:electron` first)
// Without --module: prints every module whose normalized code differs.
// With --module: prints a line diff of that module (recovered vs local).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const recoveredApp = opt('--recovered', process.env.NATIVELY_RECOVERED_APP
  || path.join(process.env.HOME || process.env.USERPROFILE || '', 'Desktop', 'Natively-Recovered-Source', 'recovered', 'compiled', 'app'));
const onlyModule = opt('--module', null);
const R = path.join(recoveredApp, 'dist-electron');
const L = path.resolve('dist-electron');

const banner = /^\/\/ ((?:node_modules|electron|premium|src|shared|natively-api|worker-script|native-module|scripts|\.\.?)[^\s]*\.(?:ts|tsx|js|mjs|cjs|json|mts|cts))$/;
const split = (txt) => {
  const mods = new Map(); let cur = null; let buf = [];
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(banner);
    if (m) { if (cur) mods.set(cur, buf.join('\n')); cur = m[1]; buf = []; } else buf.push(line);
  }
  if (cur) mods.set(cur, buf.join('\n'));
  return mods;
};
// Comments are not behavior: drop block comments and whole-line // comments.
// esbuild hoists `var x` differently per bundle (lazy vs eager): ignore bare
// declaration lists and the leading var keyword.
const stripComments = (s) => s.replace(/^\s*var [A-Za-z_$][\w$]*(?:, [A-Za-z_$][\w$]*)*;\s*$/gm, '').replace(/^(\s*)var /gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
const normLines = (s) => stripComments(s).split('\n').map((l) => l.replace(/\b([A-Za-z_$][A-Za-z_$]*?)\d+\b/g, '$1').trim()).filter(Boolean);
const key = (s) => crypto.createHash('sha1').update(stripComments(s).replace(/\b([A-Za-z_$][A-Za-z_$]*?)\d+\b/g, '$1').replace(/\s+/g, ' ').trim()).digest('hex');

const walk = (d, out = []) => {
  if (!fs.existsSync(d)) return out;
  for (const f of fs.readdirSync(d)) { const p = path.join(d, f); fs.statSync(p).isDirectory() ? walk(p, out) : /\.(m?js|cjs)$/.test(f) && out.push(p); }
  return out;
};
const collect = (root) => {
  // module -> Map(bundle relative path -> code)
  const all = new Map();
  for (const f of walk(root)) { const rel = path.relative(root, f).split(path.sep).join("/");
    for (const [k, v] of split(fs.readFileSync(f, "utf8"))) { const e = all.get(k) || new Map(); e.set(rel, v); all.set(k, e); } }
  return all;
};
// A module matches when, in every bundle that exists in both builds, the
// normalized code is equal (esbuild emits lazy/eager shapes per bundle).
const mismatches = (a, b) => [...b.keys()].filter((bundle) => a.has(bundle) && key(a.get(bundle)) !== key(b.get(bundle)));

if (!fs.existsSync(R)) { console.error(`recovered build not found: ${R}`); process.exit(2); }
if (!fs.existsSync(L)) { console.error('local dist-electron missing: run npm run build:electron'); process.exit(2); }
const rec = collect(R); const loc = collect(L);

if (onlyModule) {
  const a = rec.get(onlyModule); const b = loc.get(onlyModule);
  if (!a || !b) { console.log(`${onlyModule}: ${!a ? 'not in recovered' : ''} ${!b ? 'not in local' : ''}`); process.exit(1); }
  const bad = mismatches(a, b);
  if (bad.length === 0) { console.log(`${onlyModule}: IDENTICAL to 3.2.0`); process.exit(0); }
  const ra = normLines(a.get(bad[0])); const lb = normLines(b.get(bad[0]));
  console.log(`bundle: ${bad[0]} (${bad.length} bundle(s) differ)`);
  // simple LCS diff
  const n = ra.length, m = lb.length; const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = ra[i] === lb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, diffs = 0;
  while (i < n || j < m) {
    if (i < n && j < m && ra[i] === lb[j]) { i++; j++; }
    else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { console.log(`+ local    | ${lb[j++]}`); diffs++; }
    else { console.log(`- recovered| ${ra[i++]}`); diffs++; }
  }
  console.log(diffs === 0 ? `${onlyModule}: IDENTICAL to 3.2.0` : `${onlyModule}: ${diffs} differing lines`);
  process.exit(diffs === 0 ? 0 : 1);
}

const rows = [];
for (const k of new Set([...rec.keys(), ...loc.keys()])) {
  const a = rec.get(k), b = loc.get(k);
  if (!a) rows.push(['LOCAL_ONLY', k]);
  else if (!b) rows.push(['RECOVERED_ONLY', k]);
  else if (mismatches(a, b).length) rows.push(['DIFF', k]);
}
rows.sort((x, y) => x[1].localeCompare(y[1]));
for (const [s, k] of rows) if (!k.startsWith('node_modules/')) console.log(`${s}\t${k}`);
console.log(`non-identical modules (excluding node_modules): ${rows.filter((r) => !r[1].startsWith('node_modules/')).length}`);
