import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import asar from '@electron/asar';
import semver from 'semver';

const exec = promisify(execFile);
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const releases = path.join(homedir(), 'natively-releases');
export const baselinePath = path.join(root, 'docs', 'parity', 'BASELINE.json');
const versionPattern = /^v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i;
export const validVersion = (value) => typeof value === 'string' && versionPattern.test(value) && semver.valid(value);
export const compareVersions = semver.compare;

export function latestTag(tags, prerelease = false) {
  return tags.filter((tag) => tag.startsWith('v') && validVersion(tag)
    && (prerelease || !semver.prerelease(tag))).sort(semver.rcompare)[0];
}

export function installedPaths(platform, override, env = process.env) {
  let paths;
  let location;
  let resources;
  let executable;
  switch (platform) {
    case 'win32':
      paths = path.win32;
      location = paths.join(env.ProgramW6432 ?? env.ProgramFiles ?? 'C:\\Program Files', 'audiodg', 'Natively');
      resources = ['resources'];
      executable = ['Natively.exe'];
      break;
    case 'darwin':
      paths = path.posix;
      location = paths.join('/', 'Applications', 'Natively.app');
      resources = ['Contents', 'Resources'];
      executable = ['Contents', 'MacOS', 'Natively'];
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
  const selected = paths.resolve(override ?? env.NATIVELY_INSTALLED_PATH ?? location);
  const install = paths.basename(selected).toLowerCase() === 'app.asar'
    ? paths.resolve(paths.dirname(selected), ...resources.map(() => '..'))
    : selected;
  const archive = paths.join(install, ...resources, 'app.asar');
  if (paths.basename(selected).toLowerCase() === 'app.asar' && paths.relative(selected, archive)) {
    throw new Error('The ASAR path must use the installed application layout');
  }
  return { install, asar: archive, executable: paths.join(install, ...executable) };
}

export function run(file, args, options) {
  return exec(file, args, {
    cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    windowsHide: true, shell: false, ...options,
  });
}

export function git(args, options) {
  return run(process.platform === 'win32' ? 'git.exe' : 'git', args, options);
}

export function npm(args, options) {
  if (process.platform !== 'win32') return run('npm', args, options);
  // Batch files require a command shell. Resolve npm.cmd's JavaScript entry instead.
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const launcher = dirs.map((dir) => path.join(dir, 'npm.cmd')).find(existsSync);
  const candidates = [
    process.env.npm_execpath,
    launcher && path.join(path.dirname(launcher), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const entry = candidates.find((file) => file && path.extname(file) === '.js' && existsSync(file));
  if (!entry) throw new Error('Could not resolve npm-cli.js from npm.cmd or the Node installation');
  return run(process.execPath, [entry, ...args], options);
}

export const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
export const writeJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
export const readAsarFile = (file, member) => asar.extractFile(file, member);
export const readAppPackage = (file) => JSON.parse(readAsarFile(file, 'package.json').toString('utf8'));
export const extractAsar = (file, destination) => asar.extractAll(file, destination);

export async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export function fail(error) {
  console.error(error.message);
  process.exitCode = 1;
}
