import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { isEntryScript } from '../lib/is-entry-script.mjs';
import { fail, root, run } from './common.mjs';

const label = 'com.natively.update-check';
const taskName = 'Natively Update Check';
const xml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function schedulePlan(action, platform, {
  home = homedir(), uid = process.getuid?.(), node = process.execPath, repo = root, env = process.env,
} = {}) {
  if (!['install', 'uninstall', 'status'].includes(action)) throw new Error('Use install, uninstall or status');
  switch (platform) {
    case 'win32': {
      const script = path.win32.join(repo, 'scripts', 'update', 'check.mjs');
      const task = `"${node}" "${script}" --notify`;
      const args = {
        install: ['/Create', '/TN', taskName, '/TR', task, '/SC', 'DAILY', '/ST', '10:00', '/IT', '/F'],
        uninstall: ['/Delete', '/TN', taskName, '/F'],
        status: ['/Query', '/TN', taskName, '/V', '/FO', 'LIST'],
      };
      return { commands: [['schtasks.exe', args[action]]] };
    }
    case 'darwin': {
      const plist = path.posix.join(home, 'Library', 'LaunchAgents', label + '.plist');
      const domain = 'gui/' + uid;
      const service = domain + '/' + label;
      const program = [node, path.posix.join(repo, 'scripts', 'update', 'check.mjs'), '--notify'];
      const commands = {
        install: [['launchctl', ['bootout', service]], ['launchctl', ['bootstrap', domain, plist]]],
        uninstall: [['launchctl', ['bootout', service]]],
        status: [['launchctl', ['print', service]]],
      };
      const plan = { plist, commands: commands[action] };
      if (action === 'install') {
        const environment = {
          PATH: env.PATH ?? '/usr/bin:/bin',
          ...(env.NATIVELY_INSTALLED_PATH && { NATIVELY_INSTALLED_PATH: env.NATIVELY_INSTALLED_PATH }),
        };
        plan.contents = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
          '<plist version="1.0"><dict>',
          `<key>Label</key><string>${label}</string>`,
          '<key>ProgramArguments</key><array>' + program.map((arg) => `<string>${xml(arg)}</string>`).join('') + '</array>',
          '<key>EnvironmentVariables</key><dict>' + Object.entries(environment)
            .map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`).join('') + '</dict>',
          '<key>StartCalendarInterval</key><dict><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>',
          '</dict></plist>', '',
        ].join('\n');
      }
      return plan;
    }
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

function missing(error, platform) {
  const output = (error.stderr ?? '') + (error.stdout ?? '');
  return platform === 'win32'
    ? /cannot find the (file|path) specified/i.test(output)
    : /could not find (service|specified service)|no such process/i.test(output);
}

export async function schedule(action, dryRun, platform = process.platform) {
  const plan = schedulePlan(action, platform, { uid: userInfo().uid });
  if (dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  for (const [file, args] of plan.commands) {
    try {
      if (args[0] === 'bootstrap') {
        await mkdir(path.dirname(plan.plist), { recursive: true });
        await writeFile(plan.plist, plan.contents);
      }
      const { stdout } = await run(file, args);
      if (stdout.trim()) console.log(stdout.trim());
    } catch (error) {
      if (args[0] === 'bootstrap' || !missing(error, platform)) throw error;
      if (action !== 'install') console.log('Daily Natively update check is not registered.');
    }
  }
  if (plan.plist && action === 'uninstall') await rm(plan.plist, { force: true });
}

if (isEntryScript(import.meta.url)) {
  Promise.resolve().then(() => parseArgs({
    allowPositionals: true, options: { 'dry-run': { type: 'boolean' } },
  })).then(({ positionals, values }) => {
    if (positionals.length !== 1) throw new Error('Use install, uninstall or status');
    return schedule(positionals[0], values['dry-run']);
  }).catch(fail);
}
