import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLauncher } from './launch.mjs';
import { normalize } from './normalize.mjs';
import { compare, summary } from './compare.mjs';
import * as api from './scenarios/api-surface.mjs';
import * as licence from './scenarios/licence.mjs';
import * as modes from './scenarios/modes.mjs';
import * as settings from './scenarios/settings-defaults.mjs';
import * as screenshots from './scenarios/screenshots.mjs';
import * as consoleErrors from './scenarios/console-errors.mjs';
import { pageWindow } from './cdp.mjs';

const scenarios = [api, licence, modes, settings, screenshots, consoleErrors];
const root = fileURLToPath(new URL('../../', import.meta.url));
const runs = path.join(root, '.parity', 'runs');

async function json(dir, name, value) {
  await writeFile(path.join(dir, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

function block(value) {
  // Indent each line so diagnostic values cannot create Markdown fences or headings.
  return JSON.stringify(value, null, 2).split('\n').map((line) => `    ${line}`).join('\n');
}

function textValue(value) {
  return value === undefined ? '(missing)' : value;
}

async function report(dir, raw, normalized, diagnostics, failure) {
  const rows = compare(scenarios.map(({ id }) => id), normalized.installed, normalized.local);
  const lines = ['# Natively parity run', '', 'Screenshot status compares capture availability. PNGs are available for visual review.', ''];
  if (failure) lines.push('## Incomplete run', '', block(failure), '');
  lines.push(summary(rows), '');
  for (const { id, differences } of rows) {
    if (!differences.length) continue;
    lines.push(`## ${id}`, '');
    for (const { path: pointer, installed, local } of differences) {
      lines.push(block({ path: pointer, installed: textValue(installed), local: textValue(local) }), '');
    }
  }
  for (const [name, result] of Object.entries(raw)) {
    lines.push(`## ${name} console errors`, '', block(result['console-errors'] ?? {}), '',
      `## ${name} skipped or unavailable`, '', block({
        windows: diagnostics[name]?.missingWindows,
        captureIssues: diagnostics[name]?.captureIssues,
        ...Object.fromEntries(Object.entries(result).filter(([, value]) => value.skipped)
          .map(([id, value]) => [id, value.skipped])),
      }), '');
  }
  const shots = new Set(Object.values(raw).flatMap((result) => Object.keys(result.screenshots?.captures ?? {})));
  if (shots.size) {
    lines.push('## Screenshot pairs', '', '| View | Installed | Local |', '| --- | --- | --- |');
    for (const shot of shots) {
      const cell = (app) => raw[app].screenshots?.captures?.[shot] === 'captured'
        ? `![${app} ${shot}](screenshots/${shot}/${app}.png)` : 'Unavailable';
      lines.push(`| ${shot} | ${cell('installed')} | ${cell('local')} |`);
    }
  }
  await writeFile(path.join(dir, 'report.md'), `${lines.join('\n')}\n`);
  console.log(summary(rows));
}

async function main() {
  await mkdir(runs, { recursive: true });
  const runDir = await mkdtemp(path.join(runs, `${new Date().toISOString().replaceAll(':', '-')}-`));
  const abort = new AbortController();
  const handlers = new Map(['SIGINT', 'SIGTERM'].map((name) => [name, () => {
    process.exitCode = name === 'SIGINT' ? 130 : 143;
    abort.abort(new Error(`Interrupted by ${name}`));
  }]));
  for (const [name, handler] of handlers) process.on(name, handler);
  const launcher = createLauncher(runDir, abort.signal);
  const raw = { installed: {}, local: {} };
  const normalized = { installed: {}, local: {} };
  const diagnostics = {};
  let failure;

  try {
    const apps = await launcher.launch();
    for (const app of Object.values(apps)) Object.assign(app, { runDir, signal: abort.signal });
    for (const scenario of scenarios) {
      const jobs = ['installed', 'local'].map(async (name) => {
        const app = apps[name];
        try {
          raw[name][scenario.id] = await scenario.run(app);
        } catch (error) {
          raw[name][scenario.id] = { harnessError: error.message };
        }
        normalized[name][scenario.id] = normalize(scenario.id, raw[name][scenario.id], [app.profile, app.home, root]);
      });
      await Promise.all(jobs);
      abort.signal.throwIfAborted();
    }
    for (const [name, app] of Object.entries(apps)) {
      diagnostics[name] = {
        isolatedProfileVerified: true,
        missingWindows: app.missingWindows,
        captureIssues: app.browser.issues,
        network: [...app.browser.pages.values()].map((page) => ({ window: pageWindow(page), events: page.network })),
      };
    }
  } catch (error) {
    failure = error.message;
    abort.abort(error);
  } finally {
    try {
      const cleanup = await launcher.teardown();
      diagnostics.cleanup = cleanup;
      console.log(`[parity] Cleanup verified: PIDs [${cleanup.trackedPids.join(', ')}] exited; ports [${cleanup.closedPorts.join(', ')}] closed`);
      await rm(path.join(runDir, 'profiles'), { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
    } catch (error) {
      failure = [failure, error.message].filter(Boolean).join('\n');
    } finally {
      for (const [name, handler] of handlers) process.off(name, handler);
    }
  }

  for (const name of Object.keys(raw)) {
    for (const { id } of scenarios) {
      raw[name][id] ??= { harnessError: 'Scenario did not run' };
      normalized[name][id] ??= raw[name][id];
    }
    await json(runDir, `${name}.raw`, raw[name]);
    await json(runDir, `${name}.normalized`, normalized[name]);
  }
  await json(runDir, 'diagnostics', diagnostics);
  await report(runDir, raw, normalized, diagnostics, failure);
  console.log(`[parity] Report: ${path.relative(root, path.join(runDir, 'report.md'))}`);
  if (failure) throw new Error(failure);
  if (Object.values(raw).some((result) => Object.values(result).some((entry) => entry.harnessError))) {
    throw new Error('A scenario failed to run. See the raw results.');
  }
}

main().catch((error) => {
  console.error(`[parity] ${error.message}`);
  process.exitCode ||= 1;
});
