export async function resetSettingsScroll(page) {
  const found = await page.evaluate(() => {
    const pane = document.querySelector('#settings-panel .bg-bg-main.overflow-y-auto');
    if (!pane) return false;
    pane.scrollTo({ top: 0, behavior: 'instant' });
    return pane.scrollTop === 0;
  });
  if (!found) throw new Error('Could not reset Settings content to the top');
}
