import { pageWindow } from '../cdp.mjs';

export const id = 'console-errors';

export function run(app) {
  const errors = {};
  for (const page of app.browser.pages.values()) {
    const name = pageWindow(page) ?? '(unnamed page)';
    errors[name] ??= [];
    errors[name].push(...page.console.filter(({ type }) => type === 'error' || type === 'exception' || type === 'assert'));
  }
  return errors;
}
