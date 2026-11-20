import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { waitFor } from '../cdp.mjs';

export const id = 'premium-auto-answer';

const sharingControl = '[role="switch"][aria-label="Share transcripts to improve Auto Answer"]';
const consentDialog = '[aria-labelledby="auto-answer-access-title"]';

export async function run(app) {
  const page = app.windows.get('launcher');
  const { signal } = app;
  const readAccess = () => page.evaluate(async () => {
    const { available, allowed, basis, uploads, consent, enabled } = await window.electronAPI.getAutoAnswerAccess();
    return { available, allowed, basis, uploads, consentVersion: consent?.version ?? null, enabled };
  });
  const access = await readAccess();
  if (!access.available || !access.allowed || access.basis !== 'pro' || access.uploads || access.consentVersion !== null) {
    throw new Error('Auto Answer consent preview requires a fresh Pro profile with sharing off');
  }

  await page.evaluate(() => window.electronAPI.openSettingsTab('intelligence'));
  const opened = await waitFor(() => page.evaluate((selector) => {
    const control = document.querySelector(selector);
    if (!control || !control.getClientRects().length || control.disabled) return false;
    if (control.getAttribute('aria-checked') !== 'false') throw new Error('Sharing switch is already on');
    control.scrollIntoView({ block: 'center' });
    control.click();
    return true;
  }, sharingControl), signal);
  if (!opened) throw new Error('Auto Answer sharing switch did not render');

  const disclosure = await waitFor(() => page.evaluate((selector) => {
    const dialog = document.querySelector(selector);
    if (!dialog?.getClientRects().length) return null;
    const facts = Object.fromEntries([...dialog.querySelectorAll('dt')].map((label) => [
      label.textContent.trim(), label.nextElementSibling?.textContent.trim(),
    ]));
    return Object.keys(facts).length ? facts : null;
  }, consentDialog), signal);
  if (!disclosure) throw new Error('Auto Answer consent disclosure did not render');

  await delay(500, undefined, { signal });
  const output = path.join(app.runDir, 'screenshots', 'auto-answer-consent');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, app.name + '.png'), await page.screenshot());

  const termsInteraction = await page.evaluate((selector) => {
    const dialog = document.querySelector(selector);
    const terms = dialog?.querySelector('dl');
    if (!terms) throw new Error('Expected the disclosure terms');
    const share = [...dialog.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Share transcripts');
    if (!share) throw new Error('Expected the share action');
    const actionTop = share.getBoundingClientRect().top;
    const scrollable = terms.scrollHeight > terms.clientHeight + 1;
    terms.scrollTop = terms.scrollHeight;
    const reachable = !scrollable || (terms.tabIndex === 0 && terms.scrollTop > 0);
    const actionStayedInPlace = share.getBoundingClientRect().top === actionTop;
    terms.scrollTop = 0;
    return { scrollable, reachable, actionStayedInPlace };
  }, consentDialog);
  if (!termsInteraction.reachable || !termsInteraction.actionStayedInPlace) {
    throw new Error('Auto Answer disclosure did not keep scrollable terms and actions independently accessible');
  }

  const dismissed = await page.evaluate((selector) => {
    const dialog = document.querySelector(selector);
    const close = dialog?.querySelector('button[aria-label="Not now"]');
    close?.click();
    return Boolean(close);
  }, consentDialog);
  if (!dismissed) throw new Error('Auto Answer consent preview could not be dismissed');

  const after = await readAccess();
  if (after.uploads || after.consentVersion !== null) throw new Error('Opening the preview changed consent');
  return { access, disclosure, termsInteraction, after, captures: { 'auto-answer-consent': 'captured' } };
}
