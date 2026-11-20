import assert from 'node:assert/strict';
import test from 'node:test';
import { dotenvKeys, isolatedPaths, platformPaths } from '../launch.mjs';

test('reads .env key names only, across CRLF, export and comment lines', () => {
  const text = '# comment\r\nOPENAI_API_KEY=sk-x\r\nexport GROQ_KEY = "y"\r\n\r\n  SPACED=1\nnot a line\n=novalue\n';
  assert.deepEqual(dotenvKeys(text), ['OPENAI_API_KEY', 'GROQ_KEY', 'SPACED']);
});

test('resolves installed Windows path with spaces and the roaming licence source', () => {
  assert.deepEqual(platformPaths('win32', {
    ProgramW6432: 'C:\\Program Files',
    ProgramFiles: 'C:\\Program Files (x86)',
    APPDATA: 'C:\\Users\\Test User\\AppData\\Roaming',
  }), {
    executable: 'C:\\Program Files\\audiodg\\Natively\\Natively.exe',
    licenceSource: 'C:\\Users\\Test User\\AppData\\Roaming\\Natively',
  });
  assert.throws(() => platformPaths('win32', {}), /APPDATA/);
});

test('resolves the macOS app bundle and Application Support paths on any host', () => {
  assert.deepEqual(platformPaths('darwin', {}, '/Users/Test User'), {
    executable: '/Applications/Natively.app/Contents/MacOS/Natively',
    licenceSource: '/Users/Test User/Library/Application Support/Natively',
  });
  assert.throws(() => platformPaths('linux'), /Unsupported platform/);
});

test('redirects Windows known folders and the Natively profile into the same isolated home', () => {
  const home = 'C:\\repo\\.parity\\profiles\\home';
  const result = isolatedPaths('win32', home);
  assert.equal(result.env.USERPROFILE, home);
  assert.equal(result.env.APPDATA, result.appData);
  assert.equal(result.appData, `${home}\\AppData\\Roaming`);
  assert.equal(result.profile, `${result.appData}\\Natively`);
  assert.ok(result.directories.includes(result.env.LOCALAPPDATA));
});

test('redirects macOS home and Application Support under the isolated run', () => {
  const home = '/repo/.parity/profiles/home';
  const result = isolatedPaths('darwin', home);
  assert.equal(result.env.HOME, home);
  assert.equal(result.env.CFFIXED_USER_HOME, home);
  assert.equal(result.appData, `${home}/Library/Application Support`);
  assert.equal(result.profile, `${result.appData}/Natively`);
  assert.ok(result.directories.includes(result.env.TMPDIR));
});
