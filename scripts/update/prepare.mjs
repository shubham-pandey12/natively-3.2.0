import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { isEntryScript } from '../lib/is-entry-script.mjs';
import { extractStyles } from '../parity/style-diff.mjs';
import { archiveRelease, copyBinaries, nativePaths, stageBinaries, verifyElectron } from './archive.mjs';
import {
  baselinePath, compareVersions, fail, git, installedPaths, npm, readJson,
  releases, root, run, sha256, validVersion, writeJson,
} from './common.mjs';

const asBlock = (text) => text.trimEnd().split(/\r?\n/).map((line) => '    ' + line).join('\n');
const parityDir = path.join(root, 'docs', 'parity');

export async function mergeWithPremiumProtection(commit, base, gitCommand = git) {
  let error;
  try {
    await gitCommand(['-c', 'submodule.recurse=false', 'merge', '--no-commit', '--no-ff', '--no-edit', commit]);
  } catch (failure) {
    error = failure;
  }
  // Our tree and upstream's gitlink have different types at premium/.
  // Restore the original tree and index even when unrelated paths conflict.
  await gitCommand(['restore', '--source=' + base, '--staged', '--worktree', '--', 'premium']);
  await gitCommand(['diff', '--cached', '--exit-code', base, '--', 'premium']);
  await gitCommand(['diff', '--exit-code', '--', 'premium']);
  // With premium/ as a directory here, git moves upstream's gitlink aside to
  // premium~<commit> (file/directory conflict). Drop that copy: premium/ is ours.
  const unmerged = async () => (await gitCommand(['diff', '--name-only', '--diff-filter=U', '-z']))
    .stdout.split('\0').filter(Boolean);
  for (const file of (await unmerged()).filter((name) => name.startsWith('premium~'))) {
    await gitCommand(['rm', '-q', '-f', '--ignore-unmatch', '--', file]);
  }
  // List conflicts only after the restore, so a premium/ gitlink conflict is not reported.
  const conflicts = await unmerged();
  // git merge exits non-zero for conflicts. If only premium/ conflicted and a merge is
  // in progress, the merge is clean now. Any other failure (no MERGE_HEAD) still stops.
  if (error && !conflicts.length) {
    const inProgress = await gitCommand(['rev-parse', '-q', '--verify', 'MERGE_HEAD'])
      .then(() => true, () => false);
    if (inProgress) error = undefined;
  }
  return { conflicts, error };
}

function updatePlan(version, installed, directory, skipArchive) {
  return [
    `Require a clean working tree and create update/upstream-${version} from HEAD.`,
    skipArchive
      ? `Validate and reuse the existing archive at ${directory}.`
      : `Archive ${installed.install} into ${directory}, or reuse the matching archive.`,
    `Merge refs/upstream/v${version} without committing. Restore premium/ from HEAD and report conflicts.`,
    'Verify the packaged Electron runtime matches the Electron devDependency. Record native binary hashes.',
    'Run npm install --ignore-scripts if package-lock.json changed, then copy and verify the three native binaries.',
    'Compare archived premium bundles and Modes Manager styles against the previous baseline archive.',
    'Run type checks, unit tests and parity. Require every parity scenario to be MATCH after expected differences.',
    'Write the update report and baseline, then commit on the update branch.',
  ];
}

async function renderer(extracted) {
  const assets = path.join(extracted, 'dist', 'assets');
  const matches = [];
  for (const name of await readdir(assets)) {
    // The Modes Manager chunk name varies by release (3.2.1: App-*.js), so scan every JS asset.
    if (path.extname(name) !== '.js') continue;
    const file = path.join(assets, name);
    const source = await readFile(file, 'utf8');
    try {
      extractStyles(source, file, 'uploadBtn');
      matches.push(file);
    } catch (error) {
      if (!error.message.includes('expected exactly one object containing uploadBtn')) throw error;
    }
  }
  if (matches.length !== 1) throw new Error(`Could not uniquely locate the Modes Manager styles in ${assets}`);
  return matches[0];
}

export async function premiumReport(previous, current, filename) {
  const bundle = (directory) => path.join(directory, 'dist-electron', 'premium', 'electron');
  const script = (name) => path.join(root, 'scripts', 'parity', name);
  const { stdout: changes } = await run(process.execPath, [
    script('premium-diff.mjs'), '--reference', bundle(previous), '--ours', bundle(current), '--own-module',
  ]);
  const [oldRenderer, newRenderer] = await Promise.all([renderer(previous), renderer(current)]);
  const { stdout: styles } = await run(process.execPath, [
    script('style-diff.mjs'), '--reference', oldRenderer, '--ours', newRenderer,
  ]);
  await writeFile(filename, [
    '# Premium release differences', '',
    'Review the changed behaviour and strings against the two archived production bundles before porting any premium changes.',
    'The style scan covers the Modes Manager object containing `uploadBtn`. Unresolved values require manual review.',
    'In the tool output, reference is the previous production release and ours is the new production release.', '',
    '## Premium Electron modules', '', asBlock(changes), '',
    '## Modes Manager styles', '', asBlock(styles), '',
  ].join('\n'));
}

export function requireMatchingParity(stdout, report) {
  const rows = [...stdout.matchAll(/^\| ([\w-]+) \| (MATCH|DIFF) \| (\d+) \| \d+ \|\r?$/gm)];
  const required = [
    'api-surface', 'licence', 'modes', 'settings-defaults', 'settings-roundtrip',
    'screenshots', 'premium-auto-answer', 'console-errors',
  ];
  if (rows.length !== required.length || required.some((id) => !rows.some((row) => row[1] === id
    && row[2] === 'MATCH' && row[3] === '0'))) {
    throw new Error(`Parity did not match in every scenario. Review ${report}.`);
  }
}

export async function prepare(input, values, platform = process.platform, arch = process.arch) {
  if (!validVersion(input)) throw new Error('Pass a release version such as 3.2.1');
  const version = input.replace(/^v/, '');
  const ref = 'refs/upstream/v' + version;
  const branch = 'update/upstream-' + version;
  const installed = installedPaths(platform, values['installed-path']);
  const directory = path.join(releases, version);
  const binaries = nativePaths(platform, arch);
  if (values['dry-run']) {
    await git(['rev-parse', '--verify', ref + '^{commit}']);
    const existing = (await git(['branch', '--list', branch])).stdout.trim();
    const plan = updatePlan(version, installed, directory, values['skip-archive'])
      .map((step, index) => `${index + 1}. ${step}`);
    if (existing) plan.push(`Existing branch ${branch} would prevent creating a new branch.`);
    console.log([`Dry run for v${version}`, ...plan].join('\n'));
    return;
  }

  if ((await git(['status', '--porcelain=v1', '--untracked-files=all'])).stdout) {
    throw new Error('The working tree is dirty. Commit or set aside changes before preparing an update.');
  }
  const base = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  const commit = (await git(['rev-parse', '--verify', ref + '^{commit}'])).stdout.trim();
  const baseline = await readJson(baselinePath);
  if (!validVersion(baseline.upstreamTag) || compareVersions(version, baseline.upstreamTag) <= 0) {
    throw new Error(`Expected a release newer than baseline ${baseline.upstreamTag}`);
  }
  await git(['switch', '-c', branch, base]);

  const reportFile = path.join(parityDir, `UPDATE_${version}_REPORT.md`);
  const premiumFile = path.join(parityDir, `UPDATE_${version}_PREMIUM.md`);
  const conflictFile = path.join(parityDir, `UPDATE_${version}_CONFLICTS.md`);
  const report = [
    `# Upstream v${version} preparation`, '', `Branch ${branch} created from ${base}.`, '',
  ];
  let step;
  function start(title) {
    step = title;
    console.log(`[update] ${title}`);
    report.push(`## ${title}`, '');
  }
  async function validation(label, invoke) {
    start(label);
    try {
      const { stdout, stderr } = await invoke();
      report.push('Exit code 0.', '', asBlock(stdout + stderr), '');
      return stdout;
    } catch (error) {
      report.push(`Exit code ${error.code ?? 'unavailable'}.`, '', asBlock(
        (error.stdout ?? '') + (error.stderr ?? '') || error.message), '');
      throw error;
    }
  }

  try {
    start('Archive the installed release');
    const archive = await archiveRelease({
      directory, installed, platform, version, binaries, skip: values['skip-archive'],
    });
    if (values['skip-archive'] && await sha256(installed.asar) !== archive.hash) {
      throw new Error(`Install the archived v${version} release before preparing parity.`);
    }
    report.push(`${archive.reused ? 'Reused' : 'Created'} ${directory}. ASAR SHA-256 ${archive.hash}.`, '');

    start('Merge upstream and restore premium');
    const merged = await mergeWithPremiumProtection(commit, base);
    console.log('[update] Restored premium/ from the pre-merge HEAD');
    report.push(`Merged or attempted ${ref} at ${commit}. Restored and verified premium/ from ${base}.`, '');
    if (merged.conflicts.length) {
      await writeFile(conflictFile, [
        `# Upstream v${version} merge conflicts`, '', 'Protected premium/ was restored from the pre-merge HEAD.', '',
        ...merged.conflicts.map((file) => '    ' + JSON.stringify(file)), '',
      ].join('\n'));
      throw new Error(`Merge conflicted. Review ${conflictFile}.`);
    }
    if (merged.error) throw merged.error;
    const { stdout: mergedFiles } = await git(['diff', '--cached', '--stat', base]);
    report.push('No merge conflicts.', '', asBlock(mergedFiles), '');

    start('Verify Electron and stage the native replacements');
    const { devDependencies } = await readJson(path.join(root, 'package.json'));
    const electron = await verifyElectron(archive.archived, platform, arch, devDependencies?.electron);
    const sources = await stageBinaries(archive, root, binaries);
    report.push(`Packaged Electron runtime ${electron} matches package.json.`, '');

    const lockChanges = (await git(['diff', '--cached', '--name-only', base, '--', 'package-lock.json'])).stdout;
    if (lockChanges.trim()) {
      await validation('Install dependencies with scripts disabled', () => npm(['install', '--ignore-scripts']));
    }

    start('Copy and verify native binaries');
    try {
      await copyBinaries(sources);
    } finally {
      for (const { file, before, after } of sources) {
        report.push(`- \`${file}\` from ${before ?? 'absent'} to ${after ?? 'copy incomplete'}`);
      }
      report.push('');
    }

    start('Compare archived premium bundles');
    // The prior archive may be on a different OS from the one that wrote BASELINE.json.
    // Verify the local prior release against its own manifest and embedded version.
    const previousVersion = baseline.upstreamTag.replace(/^v/, '');
    const previous = await archiveRelease({
      directory: path.join(releases, previousVersion), platform, version: previousVersion, binaries, skip: true,
    });
    report.push(`Previous archive ${previousVersion} ASAR SHA-256 ${previous.hash}.`, '');
    await premiumReport(previous.extracted, archive.extracted, premiumFile);
    report.push(`Review [the premium changes](UPDATE_${version}_PREMIUM.md) before porting behaviour or styles.`, '');

    await validation('Renderer type check', () => npm(['run', 'typecheck:ts7']));
    await validation('Electron type check', () => npm(['run', 'typecheck:electron']));
    await validation('Premium type check', () => npm(['run', 'typecheck:premium']));
    await validation('Unit tests', () => npm(['test']));
    start('Confirm the live parity reference');
    if (await sha256(installed.asar) !== archive.hash) {
      throw new Error(`Install the archived v${version} release before running parity.`);
    }
    const parity = await validation('Parity harness', () => npm(['run', 'parity'], {
      env: { ...process.env, NATIVELY_PARITY_INSTALLED_EXECUTABLE: installed.executable },
    }));
    const parityReport = /^\[parity\] Report: (.+)\r?$/m.exec(parity)?.[1];
    requireMatchingParity(parity, parityReport ?? 'the parity run output');
    report.push('Every scenario matched after applying EXPECTED_DIFFERENCES.', '');

    start('Update baseline and commit');
    await writeJson(baselinePath, {
      upstreamTag: 'v' + version, installedVersion: archive.appVersion,
      appAsarSha256: archive.hash, updatedAt: new Date().toISOString(),
    });
    report.push('Prepared for review on the update branch.', '');
    await saveReport();
    await git(['add', '--', baselinePath, reportFile, premiumFile, 'package-lock.json']);
    // Only track bindings that the fork already tracks. Dependency modules stay local.
    await git(['add', '-u', '--', 'native-module']);
    await git(['diff', '--cached', '--exit-code', base, '--', 'premium']);
    await git(['commit', '-m', `Prepare upstream Natively v${version}`]);
  } catch (error) {
    report.push(`Stopped during ${step}: ${error.message.split(/\r?\n/, 1)[0]}`, '');
    await saveReport();
    throw new Error(`${step} failed. See ${reportFile}. ${error.message.split(/\r?\n/, 1)[0]}`);
  }

  function saveReport() {
    return writeFile(reportFile, [...report, '## Physical verification still required', '',
      '- macOS: verify signed package launch, native audio, keychain and SQLite on supported architectures.',
      '- Windows: verify installed launch, native audio, Credential Manager and SQLite.',
      '- Review screenshot pairs and manually exercise any changed premium flows.', '',
    ].join('\n'));
  }
}

if (isEntryScript(import.meta.url)) {
  Promise.resolve().then(() => parseArgs({ allowPositionals: true, options: {
    'dry-run': { type: 'boolean' },
    'skip-archive': { type: 'boolean' },
    'installed-path': { type: 'string' },
  } })).then(({ positionals, values }) => {
    if (positionals.length !== 1) throw new Error('Pass exactly one release version');
    return prepare(positionals[0], values);
  }).catch(fail);
}
