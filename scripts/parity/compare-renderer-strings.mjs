#!/usr/bin/env node
// Compare string literals in the built renderer (dist/assets/*.js) with the
// recovered 3.2.0 renderer. Vite chunks are minified and hash-named, so this
// compares the set of literal strings rather than code. Node APIs only.
//
// Usage (run `npm run build` first):
//   node scripts/parity/compare-renderer-strings.mjs --filter "auto.?answer|Auto Answer|sharing"
//   [--recovered <app dir>]   (default: ~/Desktop/Natively-Recovered-Source/recovered/compiled/app)
// Prints strings only in 3.2.0 and strings only in this build. Exit 0 when both are empty.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const recoveredApp = opt('--recovered', process.env.NATIVELY_RECOVERED_APP
  || path.join(process.env.HOME || process.env.USERPROFILE || '', 'Desktop', 'Natively-Recovered-Source', 'recovered', 'compiled', 'app'));
const filter = new RegExp(opt('--filter', '.'), 'i');

const read = (dir) => {
  if (!fs.existsSync(dir)) { console.error(`missing: ${dir} (run npm run build)`); process.exit(2); }
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
};
// Only human-readable literals: skip fragments that contain minified code.
const literals = (txt) => new Set((txt.match(/"(?:[^"\\\n]|\\.){3,400}"/g) || [])
  .map((s) => s.slice(1, -1))
  .filter((s) => !/[{}();=]|=>|\$\{/.test(s) && filter.test(s)));

const rec = literals(read(path.join(recoveredApp, 'dist', 'assets')));
const loc = literals(read(path.resolve('dist', 'assets')));
const onlyRec = [...rec].filter((s) => !loc.has(s)).sort();
const onlyLoc = [...loc].filter((s) => !rec.has(s)).sort();
console.log(`only in 3.2.0 (${onlyRec.length}):`); for (const s of onlyRec) console.log(`  - ${s}`);
console.log(`only in this build (${onlyLoc.length}):`); for (const s of onlyLoc) console.log(`  + ${s}`);
process.exit(onlyRec.length || onlyLoc.length ? 1 : 0);
