import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, mkdtemp, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { FuseV1Options, getCurrentFuseWire } from '@electron/fuses';
import {
  compareVersions, extractAsar, installedPaths, readAppPackage, readAsarFile, readJson, run, sha256,
  validVersion, writeJson,
} from './common.mjs';

export function nativePaths(platform, arch) {
  let binding;
  switch (platform) {
    case 'win32':
      if (arch === 'x64') binding = 'index.win32-x64-msvc.node';
      break;
    case 'darwin':
      if (arch === 'x64' || arch === 'arm64') binding = `index.darwin-${arch}.node`;
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
  if (!binding) throw new Error(`Unsupported native module architecture: ${platform}/${arch}`);
  return [
    path.join('native-module', binding),
    path.join('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
    path.join('node_modules', 'keytar', 'build', 'Release', 'keytar.node'),
  ];
}

async function assertVersion(file, version) {
  const appVersion = readAppPackage(file).version;
  if (!validVersion(appVersion) || compareVersions(appVersion, version) !== 0) {
    throw new Error(`Expected installed release ${version}, found ${appVersion} in ${file}`);
  }
  return appVersion;
}

export async function archiveRelease({ directory, installed, platform, version, binaries, skip }) {
  const archived = installedPaths(platform, path.join(directory, 'install'));
  const extracted = path.join(directory, 'extracted');
  const manifestFile = path.join(directory, 'manifest.json');
  const manifest = await readJson(manifestFile).catch((error) => {
    if (error.code !== 'ENOENT' || skip) throw error;
  });
  if (manifest) {
    const appVersion = await assertVersion(archived.asar, version);
    const hash = String(manifest.appAsarSha256).toLowerCase();
    if (await sha256(archived.asar) !== hash || (!skip && await sha256(installed.asar) !== hash)) {
      throw new Error(`ASAR hash disagrees with the existing archive manifest at ${manifestFile}`);
    }
    const native = await sha256(path.join(extracted, binaries[0]));
    if (native !== String(manifest.nativeModuleSha256).toLowerCase()) {
      throw new Error(`Native module hash disagrees with ${manifestFile}`);
    }
    return { archived, extracted, hash, appVersion, reused: true };
  }
  const appVersion = await assertVersion(installed.asar, version);
  const hash = await sha256(installed.asar);
  const parent = path.dirname(directory);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(path.join(parent, '.update-'));
  try {
    const staged = installedPaths(platform, path.join(staging, 'install'));
    const stagedExtracted = path.join(staging, 'extracted');
    await cp(installed.install, staged.install, { recursive: true, verbatimSymlinks: true });
    if (await sha256(staged.asar) !== hash) throw new Error('Installed ASAR changed while archiving');
    extractAsar(staged.asar, stagedExtracted);
    const nativeModuleSha256 = await sha256(path.join(stagedExtracted, binaries[0]));
    await writeJson(path.join(staging, 'manifest.json'), {
      appAsarSha256: hash, nativeModuleSha256, source: installed.install, version: appVersion,
      archivedAt: new Date().toISOString(),
    });
    // Publish only a complete archive. An existing populated archive cannot be replaced.
    await rename(staging, directory);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { archived, extracted, hash, appVersion, reused: false };
}

export async function verifyElectron(app, platform, arch, expected) {
  const fuses = await getCurrentFuseWire(platform === 'darwin' ? app.install : app.executable);
  // Electron encodes an enabled fuse as the ASCII byte for '1'.
  if (fuses[FuseV1Options.RunAsNode] !== '1'.charCodeAt(0)) {
    throw new Error('Packaged Electron disables RunAsNode. Cannot read process.versions.electron for native compatibility.');
  }
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  delete env.NODE_OPTIONS;
  const { stdout } = await run(app.executable, [
    '-p', 'JSON.stringify({ electron: process.versions.electron, arch: process.arch })',
  ], { env, timeout: 15_000 });
  const { electron: actual, arch: packagedArch } = JSON.parse(stdout);
  if (!validVersion(actual) || actual !== expected) {
    throw new Error(`Packaged Electron version ${actual} does not equal the repository devDependency ${expected}`);
  }
  if (packagedArch !== arch) throw new Error(`Packaged Electron architecture ${packagedArch} does not match ${arch}`);
  return actual;
}

export async function stageBinaries(archive, destination, binaries) {
  return Promise.all(binaries.map(async (file) => {
    const target = path.join(destination, file);
    const source = path.join(archive.extracted, file);
    const before = await sha256(target).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    const expected = createHash('sha256').update(readAsarFile(archive.archived.asar, file)).digest('hex');
    if (await sha256(source) !== expected) throw new Error(`Extracted binary differs from the archived ASAR member ${file}`);
    return { file, source, target, before, expected };
  }));
}

export async function copyBinaries(plan) {
  for (const entry of plan) {
    const destination = path.dirname(entry.target);
    const module = entry.file.startsWith('node_modules' + path.sep)
      ? path.resolve(destination, '..', '..') : destination;
    if (!(await stat(module)).isDirectory()) {
      throw new Error(`Missing module directory for ${entry.file}`);
    }
    await mkdir(destination, { recursive: true });
  }
  for (const entry of plan) {
    await copyFile(entry.source, entry.target);
    entry.after = await sha256(entry.target);
    if (entry.after !== entry.expected) throw new Error(`Copied binary hash mismatch for ${entry.file}`);
  }
}
