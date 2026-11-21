#!/usr/bin/env node
/**
 * npm run start:local: run the dev build on its OWN profile, separate from the
 * installed Natively.
 *
 * `npm start` uses the same userData folder as the installed app (the npm name
 * "natively" and the packaged pin "Natively" are one folder on case-insensitive
 * NTFS/APFS), so keys, settings and the meeting DB are shared and the two must
 * never run together. This launcher instead uses "natively-local" next to it.
 *
 * First launch seeds that folder from the real profile (keys, licence, settings,
 * modes, DB, models), skipping caches, so Pro and providers keep working. After
 * that the two profiles are independent. Pass --reseed to replace the local
 * profile with a fresh copy (the old one is renamed aside, never deleted).
 *
 * Dev only: Node APIs, arg arrays, no shell. Same main bundle + vite renderer as
 * dev:agent, but no CDP port.
 */
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, renameSync } from 'node:fs';
import { connect, createServer } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { childExitReport } from './devAgentSupport.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Chromium/GPU caches and live-instance markers: rebuilt on launch, never seeded.
export const SKIP_ON_SEED = new Set([
  'Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
  'blob_storage', 'Shared Dictionary', 'VideoDecodeStats', 'DevToolsActivePort',
  'lifecycle-marker.json', 'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'logs',
]);

export function profilePaths(platform, env = process.env, home = homedir()) {
  let base;
  let paths;
  switch (platform) {
    case 'win32':
      if (!env.APPDATA) throw new Error('APPDATA is not set');
      paths = path.win32;
      base = env.APPDATA;
      break;
    case 'darwin':
      paths = path.posix;
      base = paths.join(home, 'Library', 'Application Support');
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
  return { real: paths.join(base, 'Natively'), local: paths.join(base, 'natively-local') };
}

export function shouldCopy(real, source) {
  const top = path.relative(real, source).split(/[\\/]/)[0];
  return !SKIP_ON_SEED.has(top);
}

export function seedProfile({ real, local }, { reseed = false, now = Date.now(), log = console.log } = {}) {
  if (existsSync(local)) {
    if (!reseed) return 'kept';
    const aside = `${local}.old-${now}`;
    renameSync(local, aside);
    log(`[start:local] previous local profile moved to ${aside}`);
  }
  if (!existsSync(real)) {
    log('[start:local] no installed-app profile to copy; starting with an empty local profile');
    return 'empty';
  }
  log(`[start:local] copying ${real} -> ${local} (one time; close the installed app first)`);
  cpSync(real, local, { recursive: true, filter: (source) => shouldCopy(real, source) });
  return 'seeded';
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function waitForPort(port, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = connect(port, '127.0.0.1');
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`renderer did not start on ${port}`));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

async function main() {
  const reseed = process.argv.includes('--reseed');
  const profile = profilePaths(process.platform);
  seedProfile(profile, { reseed });
  console.log(`[start:local] userData=${profile.local}`);

  const built = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build-electron.js')], {
    cwd: ROOT, stdio: 'inherit', shell: false,
  });
  if (built.error) throw built.error;
  if (built.status !== 0) throw new Error(`build:electron failed (exit ${built.status})`);

  const { default: electronPath } = await import('electron');
  const rendererPort = await freePort();
  const children = [];
  let stopping = false;
  const stop = (code = 0) => {
    if (stopping) return;
    stopping = true;
    for (const child of children) if (child.exitCode === null) child.kill();
    process.exitCode = code;
  };
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));

  const vite = spawn(process.execPath, [
    path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
    '--host', '127.0.0.1', '--port', String(rendererPort), '--strictPort',
  ], { cwd: ROOT, stdio: 'inherit', shell: false });
  children.push(vite);
  vite.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(childExitReport('the renderer dev server', code, signal).message ?? '[start:local] renderer stopped');
    stop(1);
  });
  await waitForPort(rendererPort);

  // --user-data-dir lands before import-time readers (CredentialsManager);
  // NATIVELY_AGENT_USER_DATA keeps it pinned and skips the single-instance lock
  // that is per-profile anyway. Both are honoured only when !app.isPackaged.
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    NATIVELY_RENDERER_PORT: String(rendererPort),
    NATIVELY_AGENT_USER_DATA: profile.local,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = spawn(electronPath, [ROOT, `--user-data-dir=${profile.local}`], {
    cwd: ROOT, stdio: 'inherit', shell: false, env,
  });
  children.push(app);
  app.on('exit', (code, signal) => {
    if (stopping) return;
    const report = childExitReport('the app', code, signal);
    if (report.message) console.error(report.message);
    stop(report.exitCode ?? 0);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[start:local]', error?.message || error);
    process.exitCode = 1;
  });
}
