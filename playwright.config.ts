import { defineConfig, devices } from '@playwright/test';

// The renderer dev server's port and host (vite.config.mts: 127.0.0.1:5180).
// IPv4 loopback, not `localhost`: Windows can resolve that to ::1 and never connect.
const rendererPort = Number(process.env.ELECTRON_APP_PORT) || 5180;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'electron-chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: undefined,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: `http://127.0.0.1:${rendererPort}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});