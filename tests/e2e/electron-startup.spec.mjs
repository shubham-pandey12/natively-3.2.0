import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('real Electron app starts and answers its gated test IPC', async () => {
  test.skip(process.env.NATIVELY_RUN_ELECTRON_E2E !== '1', 'run with npm run test:e2e:electron');

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'natively-electron-e2e-'));
  let app;
  try {
    app = await electron.launch({
      args: [path.join(repoRoot, 'dist-electron/electron/main.js'), `--user-data-dir=${userData}`],
      env: {
        ...process.env,
        NODE_ENV: 'development',
        NATIVELY_E2E: '1',
        NATIVELY_AGENT_USER_DATA: userData,
        NATIVELY_RENDERER_PORT: '5180',
      },
      timeout: 60_000,
    });
    await expect.poll(
      () => app.windows().find((window) => new URL(window.url()).searchParams.get('window') === 'launcher')?.url() ?? '',
      { timeout: 30_000 },
    ).toContain('window=launcher');
    const page = app.windows().find((window) => new URL(window.url()).searchParams.get('window') === 'launcher');
    expect(page).toBeTruthy();
    await page.waitForFunction(() => Boolean(window.electronAPI?.e2eInvoke), undefined, { timeout: 30_000 });

    const ipc = await page.evaluate(async () => {
      const reset = await window.electronAPI.e2eInvoke('__e2e__:reset-session');
      const active = await window.electronAPI.e2eInvoke('get-meeting-active');
      return { reset, active, location: location.search };
    });
    expect(ipc.reset.success).toBe(true);
    expect(ipc.active).toBe(false);
    expect(ipc.location).toContain('window=launcher');
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
