import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { waitFor } from '../cdp.mjs';
import { resetSettingsScroll } from './settings-view.mjs';

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

  async function capture(name, prepare, beforeShot) {
    try {
      await prepare();
      await delay(500, undefined, { signal });
      await beforeShot?.();
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
  // Built-in modes (including Sales) lock their type. Add an editable Sales
  // fixture to the isolated profile before the manager loads its mode list.
  let fixtureId;
  await capture('modes-manager', async () => {
    const fixture = await page.evaluate(() => window.electronAPI.modesCreate({
      name: 'Parity Sales', templateType: 'sales',
    }));
    if (!fixture?.success || !fixture.mode?.id) throw new Error('Could not create an editable Sales mode');
    fixtureId = fixture.mode.id;
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

  async function selectMode(name) {
    const selected = await waitFor(() => page.evaluate((text) => {
      const tab = [...document.querySelectorAll('[aria-label="Modes"][role="tablist"] [role="tab"]')]
        .find((item) => item.querySelector('[title="Double-click to rename"]')?.textContent.trim() === text
          || item.textContent.trim() === text);
      if (!tab) return false;
      if (tab.getAttribute('aria-selected') === 'true') return true;
      tab.click();
      return false;
    }, name), signal, 5_000);
    if (!selected) throw new Error('Mode did not open: ' + name);
  }

  async function openMenu(trigger, menu) {
    const clicked = await waitFor(() => page.evaluate((selector) => {
      const button = document.querySelector(selector);
      if (!button?.getClientRects().length) return false;
      button.scrollIntoView({ block: 'center', behavior: 'instant' });
      if (button.getAttribute('aria-expanded') !== 'true') button.click();
      return true;
    }, trigger), signal, 5_000);
    if (!clicked || !await waitFor(() => page.evaluate((selector) =>
      Boolean(document.querySelector(selector)?.getClientRects().length), menu), signal, 5_000)) {
      throw new Error('Modes menu did not open: ' + menu);
    }
  }

  await capture('modes-sales', () => selectMode('Sales'));
  await capture('modes-template-type', async () => {
    await selectMode('Parity Sales');
    await openMenu('.mm-tp-trigger', '.mm-tp-menu');
  });
  await capture('modes-note-template', async () => {
    await page.evaluate(() => {
      document.querySelector('.mm-tp-trigger[aria-expanded="true"]')?.click();
    });
    await openMenu('.mm-nt-trigger', '.mm-nt-menu');
  });

  for (const tab of tabs) {
    await capture(`settings-${tab}`, async () => {
      await page.evaluate((id) => window.electronAPI.openSettingsTab(id), tab);
      const visible = await waitFor(() => page.evaluate((id) => {
        const panel = document.querySelector('#settings-panel');
        return panel?.dataset.genieView === id && Boolean(panel.getClientRects().length);
      }, tab), signal, 5_000);
      if (!visible) throw new Error(`Settings did not show tab "${tab}"`);
    }, () => resetSettingsScroll(page));
  }
  if (fixtureId) {
    const deleted = await page.evaluate((modeId) => window.electronAPI.modesDelete(modeId), fixtureId);
    if (!deleted?.success) throw new Error('Could not clean up the editable Sales mode');
  }
  return { captures, skipped };
}
