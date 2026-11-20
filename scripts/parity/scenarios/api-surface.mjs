export const id = 'api-surface';

export async function run(app) {
  const windows = {};
  for (const [name, page] of app.windows) {
    windows[name] = await page.evaluate(() => Object.keys(window.electronAPI).sort());
  }
  return { windows };
}
