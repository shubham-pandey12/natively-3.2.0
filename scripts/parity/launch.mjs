import { spawn, execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { copyFile, mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { createServer, connect } from 'node:net';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import electronPath from 'electron';
import { electronArgs, isReservedPort, killPlan } from '../devAgentSupport.mjs';
import { connectBrowser, discover, endpoint, pageWindow, waitFor } from './cdp.mjs';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const expectedWindows = ['launcher', 'model-selector', 'settings', 'overlay-toggle', 'overlay-pill', 'overlay', 'cropper'];

export function platformPaths(platform, env = process.env, home = homedir()) {
  switch (platform) {
    case 'win32':
      if (!env.APPDATA) throw new Error('APPDATA is required to locate the licence files');
      return {
        executable: path.win32.join(env.ProgramW6432 ?? env.ProgramFiles ?? 'C:\\Program Files', 'audiodg', 'Natively', 'Natively.exe'),
        licenceSource: path.win32.join(env.APPDATA, 'Natively'),
      };
    case 'darwin':
      return {
        executable: path.posix.join('/Applications', 'Natively.app', 'Contents', 'MacOS', 'Natively'),
        licenceSource: path.posix.join(home, 'Library', 'Application Support', 'Natively'),
      };
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

export function isolatedPaths(platform, home) {
  switch (platform) {
    case 'win32': {
      const appData = path.win32.join(home, 'AppData', 'Roaming');
      const localData = path.win32.join(home, 'AppData', 'Local');
      const temp = path.win32.join(home, 'Temp');
      return {
        appData, profile: path.win32.join(appData, 'Natively'),
        directories: [localData, temp, path.win32.join(home, 'Documents')],
        env: { USERPROFILE: home, HOME: home, APPDATA: appData, LOCALAPPDATA: localData, TEMP: temp, TMP: temp },
      };
    }
    case 'darwin': {
      const appData = path.posix.join(home, 'Library', 'Application Support');
      const temp = path.posix.join(home, 'tmp');
      return {
        appData, profile: path.posix.join(appData, 'Natively'), directories: [temp, path.posix.join(home, 'Documents')],
        env: { HOME: home, CFFIXED_USER_HOME: home, TMPDIR: temp },
      };
    }
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

async function choosePort(ports) {
  const port = await new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port: number } = server.address();
      server.close((error) => error ? reject(error) : resolve(number));
    });
  });
  if (isReservedPort(port) || ports.has(port)) return choosePort(ports);
  ports.add(port);
  return port;
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1');
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(500, () => finish(true));
  });
}

export function dotenvKeys(text) {
  const keys = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    if (match) keys.push(match[1]);
  }
  return keys;
}

async function dotenvBlanks() {
  const text = await readFile(path.join(root, '.env'), 'utf8').catch(() => '');
  return Object.fromEntries(dotenvKeys(text).map((key) => [key, '']));
}

function pidExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

export function createLauncher(runDir, signal) {
  const children = [];
  const apps = [];
  const ports = new Set();
  const platform = process.platform;

  function start(label, command, args, env = process.env, output = 'ignore') {
    signal.throwIfAborted();
    const child = spawn(command, args, {
      cwd: root, env, detached: true, windowsHide: true, shell: false, stdio: ['ignore', output, output],
    });
    const result = new Promise((resolve) => {
      child.once('error', (error) => resolve(error.message));
      child.once('exit', (code, exitSignal) => resolve(exitSignal ?? code));
    });
    const entry = { label, child, result, stopped: false, pids: new Set() };
    result.then((reason) => {
      entry.stopped = true;
      entry.reason = reason;
    });
    if (child.pid) entry.pids.add(child.pid);
    children.push(entry);
    return entry;
  }

  async function rememberProcesses(app) {
    const { processInfo } = await app.browser.processInfo();
    const browser = processInfo.find(({ type }) => type === 'browser');
    if (browser?.id !== app.process.child.pid) {
      app.browser.close();
      throw new Error(`${app.name} CDP browser PID does not match the launched process`);
    }
    for (const { id } of processInfo) app.process.pids.add(id);
  }

  async function attach(app) {
    const version = await waitFor(async () => {
      if (app.process.stopped) throw new Error(`${app.name} exited during launch (${app.process.reason})`);
      return discover(app.port, signal);
    }, signal, 55_000, 50);
    const ws = version?.webSocketDebuggerUrl;
    if (!ws?.startsWith(`ws://127.0.0.1:${app.port}/devtools/browser/`)) {
      throw new Error(`${app.name} did not expose the expected loopback CDP endpoint`);
    }
    app.browser = await connectBrowser(ws, signal, app.process.child.pid);
    await rememberProcesses(app);
    app.cdp = endpoint(app.port);
  }

  async function waitForWindows(app) {
    app.windows = new Map();
    await waitFor(async () => {
      if (app.process.stopped) throw new Error(`${app.name} exited while loading windows (${app.process.reason})`);
      for (const page of app.browser.pages.values()) {
        const name = pageWindow(page);
        if (!name || !page.enabled || page.detached || app.windows.get(name) === page) continue;
        const ready = await page.evaluate(() => Boolean(window.electronAPI) && document.readyState === 'complete')
          .catch(() => false);
        if (ready) app.windows.set(name, page);
      }
      return expectedWindows.every((name) => app.windows.has(name));
    }, signal, 30_000, 150);
    if (!app.windows.has('launcher')) throw new Error(`${app.name} launcher never loaded`);
    app.missingWindows = expectedWindows.filter((name) => !app.windows.has(name));
    await rememberProcesses(app);
  }

  async function verifyAppData(app) {
    // The packaged app explicitly pins userData to appData/Natively. A loose
    // Electron process checks the OS path resolution without loading any app
    // code, so a redirected/reconfigured known folder fails before launch.
    const probe = path.join(path.dirname(app.home), 'probe.cjs');
    const output = path.join(path.dirname(app.home), 'app-data.json');
    await writeFile(probe, `
      const { app } = require('electron');
      try {
        require('node:fs').writeFileSync(${JSON.stringify(output)}, JSON.stringify(app.getPath('appData')));
      } finally {
        app.exit(0);
      }
    `);
    const entry = start(`${app.name} appData probe`, electronPath, [
      probe, `--user-data-dir=${app.profile}`,
    ], app.env);
    const complete = await waitFor(() => entry.stopped, signal, 12_000);
    const resolved = await readFile(output, 'utf8').then(JSON.parse).catch(() => undefined);
    if (!complete || entry.reason !== 0 || resolved !== app.appData) {
      throw new Error(`${app.name} Electron appData did not resolve to the isolated home. App launch blocked.`);
    }
  }

  async function launch() {
    const { executable, licenceSource } = platformPaths(platform);
    const profiles = path.join(runDir, 'profiles');
    for (const name of ['installed', 'local']) {
      const home = path.join(profiles, name, 'home');
      const { appData, profile, directories, env: isolatedEnv } = isolatedPaths(platform, home);
      const env = { ...process.env, ...isolatedEnv };
      delete env.ELECTRON_RUN_AS_NODE;
      delete env.NATIVELY_AGENT_USER_DATA;
      delete env.NATIVELY_DEV_PREMIUM;
      delete env.NATIVELY_DEV_PLAN;
      await Promise.all([profile, ...directories].map((dir) => mkdir(dir, { recursive: true })));
      const app = { name, home, appData, profile, env };
      await verifyAppData(app);
      for (const file of ['license.enc', 'Local State']) {
        await copyFile(path.join(licenceSource, file), path.join(profile, file), constants.COPYFILE_EXCL);
      }
      apps.push(app);
    }

    const buildLog = await open(path.join(runDir, 'build.log'), 'w');
    let build;
    try {
      build = start('Electron build', process.execPath, [path.join(root, 'scripts', 'build-electron.js')], process.env, buildLog.fd);
    } finally {
      await buildLog.close();
    }
    const built = await waitFor(() => build.stopped, signal, 120_000);
    if (!built || build.reason !== 0) throw new Error(`Electron build failed (${build.reason ?? 'timeout'}). See build.log.`);

    const rendererPort = await choosePort(ports);
    const vite = start('Vite', process.execPath, [
      path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--host', '127.0.0.1', '--port', String(rendererPort), '--strictPort',
    ]);
    const ready = await waitFor(() => {
      if (vite.stopped) throw new Error(`Vite exited (${vite.reason})`);
      return portOpen(rendererPort);
    }, signal, 30_000);
    if (!ready) throw new Error('Vite startup timed out');

    // Reserve both ports before starting either app so nothing delays CDP attachment.
    for (const app of apps) app.port = await choosePort(ports);
    const launched = await Promise.allSettled(apps.map(async (app) => {
      const { env } = app;
      if (app.name === 'local') {
        // main.ts loads .env only when unpackaged, so the local app would see
        // provider keys the installed app never does (an embedding provider
        // shows as available, for one). dotenv never overrides a variable that
        // is already set, so blanking every .env key here makes the two start
        // from the same environment. Key names only; values are never read.
        Object.assign(env, await dotenvBlanks());
        Object.assign(env, {
          NODE_ENV: 'development',
          NATIVELY_RENDERER_PORT: String(rendererPort),
          NATIVELY_AGENT_USER_DATA: app.profile,
          NATIVELY_AGENT_WELCOME: '1',
        });
      }
      const args = electronArgs(root, app.port, app.profile);
      if (app.name === 'installed') args.shift();
      app.process = start(app.name, app.name === 'installed' ? executable : electronPath, args, env);
      console.log(`[parity] ${app.name} PID ${app.process.child.pid}, CDP ${app.port}`);
      await attach(app);
      await waitForWindows(app);
      const logDirectory = await app.windows.get('launcher').evaluate(async () =>
        (await window.electronAPI.getContextDebugConfig?.())?.logDirectory);
      if (typeof logDirectory !== 'string' ||
          path.relative(app.profile, logDirectory) !== path.join('logs', 'context-debug')) {
        throw new Error(`${app.name} did not confirm its isolated app profile`);
      }
    }));
    const failures = launched.filter(({ status }) => status === 'rejected').map(({ reason }) => reason.message);
    if (failures.length) throw new Error(failures.join('\n'));
    return Object.fromEntries(apps.map((app) => [app.name, app]));
  }

  async function teardown() {
    await Promise.allSettled(apps.filter((app) => app.browser).map(async (app) => {
      try {
        if (!signal.aborted) await rememberProcesses(app);
      } finally {
        app.browser.close();
      }
    }));
    const checkSignal = AbortSignal.timeout(20_000);
    // Keep the Windows root alive until taskkill enumerates the tree. CDP-observed
    // children also cover renderers that outlive a crashed root.
    for (const entry of children.toReversed()) {
      const { pid } = entry.child;
      if (!pid) continue;
      if (platform === 'win32') {
        const live = [...entry.pids].filter((id) => (id !== pid || !entry.stopped) && pidExists(id));
        for (const id of live) {
          const plan = killPlan(platform, id);
          if (pidExists(id)) await exec(plan.command, plan.args, { windowsHide: true, timeout: 2_500 }).catch(() => {});
        }
      } else if (pidExists(-pid)) {
        process.kill(-pid, 'SIGTERM');
        if (!await waitFor(() => !pidExists(-pid), checkSignal, 1_500)) process.kill(-pid, 'SIGKILL');
      }
    }

    const tracked = children.flatMap(({ pids }) => [...pids]);
    const remaining = () => [...new Set(tracked)].filter(pidExists);
    const verified = await waitFor(async () =>
      remaining().length === 0 &&
      (platform === 'win32' || children.every(({ child }) => !child.pid || !pidExists(-child.pid))) &&
      (await Promise.all([...ports].map(portOpen))).every((open) => !open), checkSignal, 5_000);
    if (!verified) throw new Error(`Cleanup could not verify PIDs [${remaining().join(', ')}] and closed ports`);
    return { trackedPids: [...new Set(tracked)], remainingPids: [], closedPorts: [...ports] };
  }

  return { launch, teardown };
}
