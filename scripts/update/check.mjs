import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { isEntryScript } from '../lib/is-entry-script.mjs';
import {
  baselinePath, compareVersions, fail, git, installedPaths, latestTag,
  readAppPackage, readJson, releases, run, validVersion,
} from './common.mjs';

async function logCheck(record) {
  await mkdir(releases, { recursive: true });
  await appendFile(path.join(releases, 'update-check.log'),
    JSON.stringify({ checkedAt: new Date().toISOString(), ...record }) + '\n');
}

export function notificationCommand(platform, tag, env = process.env) {
  if (!validVersion(tag)) throw new Error('Invalid upstream version for notification');
  const message = `Natively upstream ${tag} is available.`;
  switch (platform) {
    case 'win32':
      if (!env.USERNAME) throw new Error('No Windows user available for notification');
      return ['msg.exe', [env.USERNAME, '/TIME:15', message]];
    case 'darwin':
      return ['/usr/bin/osascript', ['-e', `display notification "${message}" with title "Natively update"`]];
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

export async function check(values = {}, {
  platform = process.platform, gitCommand = git, readPackage = readAppPackage,
  readBaseline = () => readJson(baselinePath), log = logCheck,
  output = console.log, human = console.error, notify = run,
} = {}) {
  try {
    const installed = installedPaths(platform, values['installed-path']);
    const { upstreamTag: ourBaseline } = await readBaseline();
    const { version: installedVersion } = await readPackage(installed.asar);
    if (!validVersion(ourBaseline) || !validVersion(installedVersion)) {
      throw new Error('Baseline or installed app has an invalid version');
    }
    // Suppress implicit tag following and the configured heads refmap.
    await gitCommand(['fetch', '--no-tags', '--refmap=', '--no-write-fetch-head',
      '--no-recurse-submodules', '--no-prune', '--no-prune-tags', '--no-auto-maintenance',
      'upstream', '+refs/tags/v*:refs/upstream/v*']);
    const { stdout } = await gitCommand(['for-each-ref', '--format=%(refname:strip=2)', 'refs/upstream/']);
    const latestUpstream = latestTag(stdout.trim().split(/\r?\n/), values.prerelease);
    if (!latestUpstream) throw new Error('No upstream release tags found in refs/upstream/');

    const upToDate = compareVersions(latestUpstream, ourBaseline) <= 0;
    const actions = [];
    if (!upToDate) {
      if (compareVersions(installedVersion, latestUpstream) !== 0) {
        actions.push(`Install upstream ${latestUpstream} before preparing it.`);
      }
      actions.push(`Review and prepare ${latestUpstream} with npm run update:prepare -- ${latestUpstream.slice(1)}.`);
    }
    const result = { upToDate, latestUpstream, ourBaseline, installedVersion, actions };
    await log(result);
    output(JSON.stringify(result));
    human(upToDate
      ? `The branch baseline (${ourBaseline}) is current. Installed app: ${installedVersion}.`
      : actions.join(' '));
    if (!upToDate && values.notify) {
      try {
        const [file, args] = notificationCommand(platform, latestUpstream);
        await notify(file, args, { timeout: 5_000 });
      } catch (error) {
        human(`Desktop notification unavailable: ${error.message}`);
      }
    }
    return upToDate ? 0 : 10;
  } catch (error) {
    await log({ error: error.message }).catch(() => {});
    human(`Update check failed: ${error.message}`);
    return 1;
  }
}

if (isEntryScript(import.meta.url)) {
  Promise.resolve().then(() => parseArgs({ options: {
    'installed-path': { type: 'string' },
    prerelease: { type: 'boolean' },
    notify: { type: 'boolean' },
  } })).then(({ values }) => check(values)).then((code) => { process.exitCode = code; }).catch(fail);
}
