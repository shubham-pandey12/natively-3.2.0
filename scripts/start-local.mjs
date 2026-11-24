#!/usr/bin/env node
/**
 * npm run start:local: run the dev build on its OWN profile, separate from the
 * installed Natively.
 *
 * Uses the same independent "natively-local" profile as npm start.
 * The app creates it on first launch without copying installed data.
 *
 * Dev only: Node APIs, arg arrays, no shell. Same main bundle + vite renderer as
 * dev:agent, but no CDP port.
 */
import { spawn, spawnSync } from 'node:child_process';
import { connect, createServer } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { childExitReport } from './devAgentSupport.mjs';
import { isEntryScript } from './lib/is-entry-script.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function localProfilePath(platform, env = process.env, home = homedir()) {
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
  return paths.join(base, 'natively-local');
}

/**
 * Prevent duplicate launcher builds before Electron takes its profile lock.
 *
 * The lock is a listening socket on a localhost port derived from the profile
 * path: binding is atomic, the OS releases it when the process exits (crash
 * included), and it behaves the same on Windows and macOS. A lock FILE had a
 * window between create and owner write in which a second launch read it as
 * stale and took it over. A connection to the port gets a banner naming the
 * profile, so a foreign program on that port is reported, not mistaken for us.
 * Resolves to a release function.
 */
export function profileLockPort(local) {
  // FNV-1a over the case-folded path (NTFS/APFS are case-insensitive).
  let h = 0x811c9dc5;
  for (const ch of path.resolve(local).toLowerCase()) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 49152 + (h % 16000);
}

export function acquireProfileLock(local, { port = profileLockPort(local) } = {}) {
  const banner = `natively-start-local ${path.resolve(local).toLowerCase()}\n`;
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => socket.end(banner));
    server.once('error', (error) => {
      if (error?.code !== 'EADDRINUSE') { reject(error); return; }
      const probe = connect(port, '127.0.0.1');
      let text = '';
      probe.setTimeout(2000);
      probe.on('data', (chunk) => { text += chunk; });
      probe.on('timeout', () => probe.destroy());
      probe.on('close', () => {
        reject(new Error(text === banner
          ? `start:local is already running on ${local}; close it first`
          : `port ${port} (the start:local lock for ${local}) is in use by another program`));
      });
      probe.on('error', () => { /* reported on close */ });
    });
    server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
      server.unref();
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        server.close();
      });
    });
  });
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
  if (process.argv.includes('--reseed')) {
    throw new Error('--reseed has been removed. The installed profile is kept separate.');
  }
  const local = localProfilePath(process.platform);
  // Held for this launcher's lifetime; the OS drops it when we exit.
  const releaseLock = await acquireProfileLock(local);
  process.on('exit', releaseLock);
  console.log(`[start:local] userData=${local}`);

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

  const env = {
    ...process.env,
    NODE_ENV: 'development',
    NATIVELY_RENDERER_PORT: String(rendererPort),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NATIVELY_AGENT_USER_DATA;
  const app = spawn(electronPath, [ROOT], {
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

if (isEntryScript(import.meta.url)) {
  main().catch((error) => {
    console.error('[start:local]', error?.message || error);
    process.exitCode = 1;
  });
}
