// Pin the packaged app's userData to the brand profile dir ("Natively"), BEFORE
// any module reads app.getPath('userData') at import time. First launch after
// the stealth revert migrates the 2.9.2 disguise folder (corespeechd/audiodg)
// back to "Natively" (atomic rename — cannot half-complete); every later launch
// is a no-op.
//
// WHY A SEPARATE MODULE (not an inline statement in main.ts): ES imports are
// hoisted and evaluated in source order, and several modules read
// app.getPath('userData') at MODULE SCOPE (CredentialsManager resolves five
// credential paths the instant it is imported). An inline pin in main.ts runs
// only after ALL imports have evaluated — too late for those readers, which
// would resolve against the pre-pin path. On the default case-insensitive
// volumes (APFS / NTFS) that is invisible; on a case-sensitive volume it splits
// the credential files from the rest of the profile. Importing this module
// first guarantees the pin lands before every import-time reader.
//
// Development must also pin its path here. Electron's default "natively"
// resolves to the installed app's "Natively" on case-insensitive volumes.
//
// Migration safety contract lives in ./migrateUserData.ts — read it before
// touching this file. Short version: atomic rename, never throws (aborts to the
// alias dir where 2.9.2 left the data), defers when a lingering 2.9.2 process is
// observed (path-aware, so the real OS process of the same name is not matched),
// never deletes anything.
import { app } from 'electron';
import fs from 'node:fs';
import path from 'path';
import { runProfileMigration } from './migrateUserData';

if (app && app.isPackaged === false) {
  const userData = path.resolve(
    process.env.NATIVELY_AGENT_USER_DATA || path.join(app.getPath('appData'), 'natively-local'),
  );
  const temp = path.join(userData, 'temp');
  fs.mkdirSync(temp, { recursive: true });
  app.setPath('userData', userData);
  app.setPath('sessionData', userData);
  app.setPath('temp', temp);
  if (process.platform === 'win32') {
    process.env.TEMP = temp;
    process.env.TMP = temp;
  } else {
    process.env.TMPDIR = temp;
  }
  process.env.NATIVELY_EXTENSIONS_ROOT ||= path.join(userData, 'extension-data');
}

if (app && app.isPackaged === true) {
  const { dir } = runProfileMigration({
    platform: process.platform,
    isPackaged: true,
    appDataDir: app.getPath('appData'),
    join: path.join,
    fs: {
      existsSync: (p) => fs.existsSync(p),
      readdirSync: (p) => fs.readdirSync(p).map(String),
      renameSync: (o, n) => fs.renameSync(o, n),
      rmdirSync: (p) => fs.rmdirSync(p),
      writeFileSync: (p, d) => fs.writeFileSync(p, d),
    },
  });
  if (dir) {
    app.setPath('userData', dir);
  }
}
