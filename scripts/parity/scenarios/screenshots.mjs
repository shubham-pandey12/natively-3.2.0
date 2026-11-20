import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { waitFor } from '../cdp.mjs';

export const id = 'screenshots';

const modesControl = 'button[data-testid="open-modes-manager"], button[title="Modes"]';

async function settingsTabs() {
  const source = await readFile(new URL('../../../src/components/SettingsOverlay.tsx', import.meta.url), 'utf8');
  const body = source.match(/const SETTINGS_NAV_ORDER = \[([\s\S]*?)\];/)?.[1];
  const tabs = [...(body ?? '').matchAll(/'([a-z-]+)'/g)].map(([, id]) => id);
  if (!tabs.length) throw new Error('Could not read SETTINGS_NAV_ORDER');
  return tabs;
}

async function clickLabel(page, label, signal) {
  return waitFor(() => page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')].find(
      (element) => element.getClientRects().length && element.innerText.trim() === text,
    );
    button?.click();
    return Boolean(button);
  }, label), signal, 5_000);
}

export async function run(app) {
  const page = app.windows.get('launcher');
  const { signal } = app;
  const captures = {};
  const skipped = {};
  const tabs = await settingsTabs();

  async function capture(name, prepare) {
    try {
      await prepare();
      await delay(500, undefined, { signal });
      const output = path.join(app.runDir, 'screenshots', name);
      await mkdir(output, { recursive: true });
      await writeFile(path.join(output, `${app.name}.png`), await page.screenshot());
      captures[name] = 'captured';
    } catch (error) {
      signal.throwIfAborted();
      captures[name] = 'unavailable';
      skipped[name] = error.message;
    }
  }

  async function enterLauncher() {
    const ready = await waitFor(() => page.evaluate((selector) =>
      Boolean(document.querySelector(selector)) ||
      [...document.querySelectorAll('button')].some((el) => el.innerText.trim() === 'Get started'),
    modesControl), signal, 12_000);
    if (!ready) throw new Error('Launcher or welcome screen did not render');
    if (!await page.evaluate((selector) => Boolean(document.querySelector(selector)), modesControl)) {
      // Advance the same first-run UI on either build, after collecting defaults.
      if (!await clickLabel(page, 'Get started', signal) || !await clickLabel(page, 'Skip', signal)) {
        throw new Error('Modes control was blocked and the welcome flow could not be skipped');
      }
    }
    const loaded = await waitFor(() => page.evaluate((selector) =>
      Boolean(document.querySelector(selector)), modesControl), signal, 8_000);
    if (!loaded) throw new Error('Launcher did not show its Modes control');
  }

  await capture('launcher', enterLauncher);
  await capture('modes-manager', async () => {
    const clicked = await waitFor(() => page.evaluate((selector) => {
      const button = document.querySelector(selector);
      button?.click();
      return Boolean(button);
    }, modesControl), signal, 8_000);
    if (!clicked) throw new Error('Modes control was not found');
    const open = await waitFor(() => page.evaluate(() =>
      Boolean(document.querySelector('[aria-label="Modes Manager"]'))), signal, 8_000);
    if (!open) throw new Error('Modes Manager did not open');
  });

  for (const tab of tabs) {
    await capture(`settings-${tab}`, async () => {
      await page.evaluate((id) => window.electronAPI.openSettingsTab(id), tab);
      const visible = await waitFor(() => page.evaluate((id) => {
        const panel = document.querySelector('#settings-panel');
        return panel?.dataset.genieView === id && Boolean(panel.getClientRects().length);
      }, tab), signal, 5_000);
      if (!visible) throw new Error(`Settings did not show tab "${tab}"`);
    });
  }
  return { captures, skipped };
}
