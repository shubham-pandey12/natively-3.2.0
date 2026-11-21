import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { nativePaths } from '../archive.mjs';
import { check, notificationCommand } from '../check.mjs';
import { git, installedPaths, latestTag } from '../common.mjs';
import { mergeWithPremiumProtection, requireMatchingParity } from '../prepare.mjs';
import { schedulePlan } from '../schedule.mjs';

test('selects installed paths, overrides and bindings for both platforms', () => {
  const win = 'C:\\Program Files\\audiodg\\Natively';
  const mac = '/Applications/Natively.app';
  assert.equal(installedPaths('win32', undefined, {}).asar, win + '\\resources\\app.asar');
  assert.equal(installedPaths('darwin', undefined, {}).asar, mac + '/Contents/Resources/app.asar');
  assert.equal(installedPaths('darwin', mac + '/Contents/Resources/app.asar', {}).install, mac);
  assert.equal(installedPaths('win32', undefined, { NATIVELY_INSTALLED_PATH: 'D:\\Other Apps\\Natively' }).asar,
    'D:\\Other Apps\\Natively\\resources\\app.asar');
  assert.equal(installedPaths('win32', win, { NATIVELY_INSTALLED_PATH: 'D:\\Natively' }).install, win);
  assert.equal(path.basename(nativePaths('win32', 'x64')[0]), 'index.win32-x64-msvc.node');
  assert.equal(path.basename(nativePaths('darwin', 'x64')[0]), 'index.darwin-x64.node');
  assert.equal(path.basename(nativePaths('darwin', 'arm64')[0]), 'index.darwin-arm64.node');
  assert.throws(() => installedPaths('linux', '/somewhere'), /Unsupported platform/);
  assert.throws(() => nativePaths('linux', 'x64'), /Unsupported platform/);
});

test('plans a daily interactive Windows task with quoted absolute paths', () => {
  const options = { node: 'C:\\Program Files\\nodejs\\node.exe', repo: 'D:\\Dev Repo' };
  assert.deepEqual(schedulePlan('install', 'win32', options).commands, [['schtasks.exe', [
    '/Create', '/TN', 'Natively Update Check', '/TR',
    '"C:\\Program Files\\nodejs\\node.exe" "D:\\Dev Repo\\scripts\\update\\check.mjs" --notify',
    '/SC', 'DAILY', '/ST', '10:00', '/IT', '/F',
  ]]]);
  assert.equal(schedulePlan('status', 'win32', options).commands[0][1][0], '/Query');
  assert.equal(schedulePlan('uninstall', 'win32', options).commands[0][1][0], '/Delete');
  assert.equal(notificationCommand('win32', 'v3.2.1', { USERNAME: 'dev' })[0], 'msg.exe');
});

test('plans a daily macOS LaunchAgent with a user domain and XML escaping', () => {
  const options = { home: '/Users/Dev User', uid: 501, node: '/Tools/node', repo: '/Code/A & B', env: {} };
  const plan = schedulePlan('install', 'darwin', options);
  assert.equal(plan.plist, '/Users/Dev User/Library/LaunchAgents/com.natively.update-check.plist');
  assert.deepEqual(plan.commands, [
    ['launchctl', ['bootout', 'gui/501/com.natively.update-check']],
    ['launchctl', ['bootstrap', 'gui/501', plan.plist]],
  ]);
  assert.match(plan.contents, /<string>\/Code\/A &amp; B\/scripts\/update\/check\.mjs<\/string><string>--notify<\/string>/);
  assert.match(plan.contents, /<key>Hour<\/key><integer>10<\/integer><key>Minute<\/key><integer>0<\/integer>/);
  assert.equal(schedulePlan('status', 'darwin', options).commands[0][1][0], 'print');
  assert.equal(schedulePlan('uninstall', 'darwin', options).commands[0][1][0], 'bootout');
  assert.equal(notificationCommand('darwin', 'v3.2.1')[0], '/usr/bin/osascript');
  assert.throws(() => schedulePlan('status', 'linux'), /Unsupported platform/);
});

test('orders release tags by SemVer and opts in to prereleases', () => {
  const tags = ['v3.9.0', 'v3.10.0', 'v3.11.0-rc.2', 'v3.11.0-rc.10', 'v3.12', 'junk', '3.99.0'];
  assert.equal(latestTag(tags), 'v3.10.0');
  assert.equal(latestTag(tags, true), 'v3.11.0-rc.10');
  assert.equal(latestTag(['v3.11.0-rc.1']), undefined);
});

test('check reports current, available and failed checks through the exit code', async () => {
  let available = 'v3.2.1';
  const commands = [];
  const records = [];
  const output = [];
  let notifications = 0;
  const dependencies = {
    platform: 'darwin',
    gitCommand: async (args) => {
      commands.push(args);
      return { stdout: available + '\r\n' };
    },
    readPackage: async (file) => {
      assert.equal(file, '/Alternate/Natively.app/Contents/Resources/app.asar');
      return { version: '3.2.1' };
    },
    readBaseline: async () => ({ upstreamTag: 'v3.2.1' }),
    log: async (result) => records.push(result),
    output: (line) => output.push(JSON.parse(line)),
    human: () => {},
    notify: async () => {
      notifications++;
      throw new Error('desktop unavailable');
    },
  };
  const values = { 'installed-path': '/Alternate/Natively.app', notify: true };
  assert.equal(await check(values, dependencies), 0);
  assert.deepEqual(output[0], {
    upToDate: true, latestUpstream: 'v3.2.1', ourBaseline: 'v3.2.1', installedVersion: '3.2.1', actions: [],
  });
  assert.ok(commands[0].includes('--no-tags'));
  assert.ok(commands[0].includes('+refs/tags/v*:refs/upstream/v*'));
  assert.equal(notifications, 0);
  available = 'v3.10.0';
  assert.equal(await check(values, dependencies), 10);
  assert.equal(notifications, 1);
  assert.equal(output[1].upToDate, false);
  assert.equal(output[1].actions.length, 2);
  for (const key of ['gitCommand', 'readPackage']) {
    assert.equal(await check(values, {
      ...dependencies, [key]: async () => { throw new Error(key + ' failed'); },
    }), 1);
    assert.equal(records.at(-1).error, key + ' failed');
  }
});

test('restores premium from the starting commit when the merge reports conflicts', async () => {
  const calls = [];
  const error = new Error('merge conflict');
  const result = await mergeWithPremiumProtection('incoming', 'start', async (args) => {
    calls.push(args);
    if (args.includes('merge')) throw error;
    return { stdout: args.includes('--diff-filter=U') ? 'file with spaces\0' : '' };
  });
  assert.deepEqual(result, { conflicts: ['file with spaces'], error });
  assert.deepEqual(calls[1], ['restore', '--source=start', '--staged', '--worktree', '--', 'premium']);
  const restoreAt = calls.findIndex((args) => args[0] === 'restore');
  const listAt = calls.findIndex((args) => args.includes('--diff-filter=U'));
  assert.ok(listAt > restoreAt, 'conflicts must be listed after premium/ is restored');
});

test('treats a merge whose only conflict was premium as clean once a merge is in progress', async () => {
  const result = await mergeWithPremiumProtection('incoming', 'start', async (args) => {
    if (args.includes('merge')) throw new Error('merge conflict');
    return { stdout: '' };
  });
  assert.deepEqual(result, { conflicts: [], error: undefined });
});

test('keeps the merge error when no merge is in progress', async () => {
  const error = new Error('untracked files would be overwritten');
  const result = await mergeWithPremiumProtection('incoming', 'start', async (args) => {
    if (args.includes('merge') || args.includes('MERGE_HEAD')) throw error;
    return { stdout: '' };
  });
  assert.deepEqual(result, { conflicts: [], error });
});

test('keeps tracked premium when upstream updates its gitlink and leaves other conflicts for review', async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'natively update test '));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const command = (args) => git(args, { cwd });
  await command(['init', '-b', 'upstream']);
  await command(['config', 'user.name', 'Update Tests']);
  await command(['config', 'user.email', 'update-tests@example.invalid']);
  await command(['config', 'commit.gpgsign', 'false']);
  await command(['config', 'core.autocrlf', 'false']);
  const ref = async () => (await command(['rev-parse', 'HEAD'])).stdout.trim();
  await writeFile(path.join(cwd, 'shared.txt'), 'base\n');
  await command(['add', 'shared.txt']);
  await command(['commit', '-m', 'fixture']);
  const fixture = await ref();
  await command(['update-index', '--add', '--cacheinfo', '160000,' + fixture + ',premium']);
  await command(['commit', '-m', 'upstream base']);
  const ancestor = await ref();
  await command(['switch', '-c', 'fork']);
  await command(['update-index', '--force-remove', '--', 'premium']);
  await mkdir(path.join(cwd, 'premium'), { recursive: true });
  await writeFile(path.join(cwd, 'premium', 'owned.txt'), 'fork premium\n');
  await writeFile(path.join(cwd, 'shared.txt'), 'fork\n');
  await command(['add', '--', 'premium', 'shared.txt']);
  await command(['commit', '-m', 'fork premium directory']);
  const base = await ref();
  await command(['switch', 'upstream']);
  await command(['update-index', '--cacheinfo', '160000,' + ancestor + ',premium']);
  await writeFile(path.join(cwd, 'shared.txt'), 'upstream\n');
  await command(['add', 'shared.txt']);
  await command(['commit', '-m', 'update gitlink']);
  const incoming = await ref();
  await command(['switch', 'fork']);

  const result = await mergeWithPremiumProtection(incoming, base, command);
  assert.ok(result.error);
  assert.ok(result.conflicts.includes('shared.txt'));
  assert.equal(await readFile(path.join(cwd, 'premium', 'owned.txt'), 'utf8'), 'fork premium\n');
  const unresolved = (await command(['diff', '--name-only', '--diff-filter=U'])).stdout;
  assert.ok(unresolved.includes('shared.txt'));
});

test('a merge where only the premium gitlink changed upstream completes without conflicts', async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'natively update test '));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const command = (args) => git(args, { cwd });
  await command(['init', '-b', 'upstream']);
  for (const [key, value] of [['user.name', 'Update Tests'], ['user.email', 'update-tests@example.invalid'],
    ['commit.gpgsign', 'false'], ['core.autocrlf', 'false']]) await command(['config', key, value]);
  const ref = async () => (await command(['rev-parse', 'HEAD'])).stdout.trim();
  await writeFile(path.join(cwd, 'shared.txt'), 'base\n');
  await command(['add', 'shared.txt']);
  await command(['commit', '-m', 'fixture']);
  const fixture = await ref();
  await command(['update-index', '--add', '--cacheinfo', '160000,' + fixture + ',premium']);
  await command(['commit', '-m', 'upstream base']);
  const ancestor = await ref();
  await command(['switch', '-c', 'fork']);
  await command(['update-index', '--force-remove', '--', 'premium']);
  await mkdir(path.join(cwd, 'premium'), { recursive: true });
  await writeFile(path.join(cwd, 'premium', 'owned.txt'), 'fork premium\n');
  await command(['add', '--', 'premium']);
  await command(['commit', '-m', 'fork premium directory']);
  const base = await ref();
  await command(['switch', 'upstream']);
  await command(['update-index', '--cacheinfo', '160000,' + ancestor + ',premium']);
  await writeFile(path.join(cwd, 'upstream-only.txt'), 'new\n');
  await command(['add', 'upstream-only.txt']);
  await command(['commit', '-m', 'update gitlink and add a file']);
  const incoming = await ref();
  await command(['switch', 'fork']);

  const result = await mergeWithPremiumProtection(incoming, base, command);
  assert.deepEqual(result, { conflicts: [], error: undefined });
  assert.equal(await readFile(path.join(cwd, 'premium', 'owned.txt'), 'utf8'), 'fork premium\n');
  assert.equal(await readFile(path.join(cwd, 'upstream-only.txt'), 'utf8'), 'new\n');
  await command(['commit', '-m', 'merge']);
  assert.equal((await command(['ls-tree', 'HEAD', 'premium'])).stdout.split(/\s/)[1], 'tree');
});

test('a zero exit from parity still requires matching rows for every scenario', () => {
  const scenarios = ['api-surface', 'licence', 'modes', 'settings-defaults', 'settings-roundtrip',
    'screenshots', 'premium-auto-answer', 'console-errors'];
  const table = scenarios.map((id) => `| ${id} | MATCH | 0 | 1 |`).join('\n');
  assert.doesNotThrow(() => requireMatchingParity(table, 'report.md'));
  assert.throws(() => requireMatchingParity(table.replace('MATCH | 0', 'DIFF | 1'), 'report.md'), /Parity did not match/);
  assert.throws(() => requireMatchingParity(table.split('\n').slice(1).join('\n'), 'report.md'), /Parity did not match/);
});

test('reads the Electron version and CPU type from binaries without executing them', async () => {
  const { embeddedElectronVersion, binaryArchitectures, electronBinary } = await import('../archive.mjs');
  assert.equal(embeddedElectronVersion(Buffer.from('xx Chrome/1 Electron/43.7.7 Safari Electron/43.7.7')), '43.7.7');
  assert.throws(() => embeddedElectronVersion(Buffer.from('none')), /found none/);
  assert.throws(() => embeddedElectronVersion(Buffer.from('Electron/1.0.0 Electron/2.0.0')), /exactly one/);
  const pe = Buffer.alloc(0x100); pe.writeUInt16LE(0x5a4d, 0); pe.writeUInt32LE(0x80, 0x3c); pe.writeUInt16LE(0x8664, 0x84);
  assert.deepEqual(binaryArchitectures(pe), ['x64']);
  const thin = Buffer.alloc(16); thin.writeUInt32LE(0xfeedfacf, 0); thin.writeUInt32LE(0x0100000c, 4);
  assert.deepEqual(binaryArchitectures(thin), ['arm64']);
  const fat = Buffer.alloc(64); fat.writeUInt32BE(0xcafebabe, 0); fat.writeUInt32BE(2, 4);
  fat.writeUInt32BE(0x01000007, 8); fat.writeUInt32BE(0x0100000c, 28);
  assert.deepEqual(binaryArchitectures(fat), ['x64', 'arm64']);
  assert.equal(electronBinary({ executable: 'C:\\A\\N.exe' }, 'win32'), 'C:\\A\\N.exe');
  assert.equal(electronBinary({ install: '/Applications/Natively.app' }, 'darwin'),
    '/Applications/Natively.app/Contents/Frameworks/Electron Framework.framework/Electron Framework');
  assert.throws(() => electronBinary({}, 'linux'), /Unsupported platform/);
});
