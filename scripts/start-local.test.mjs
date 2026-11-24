import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { acquireProfileLock, profileLockPort, localProfilePath } from './start-local.mjs';

test('local launcher uses a separate profile on win32 and darwin', () => {
  assert.equal(
    localProfilePath('win32', { APPDATA: 'C:\\Users\\a b\\AppData\\Roaming' }),
    'C:\\Users\\a b\\AppData\\Roaming\\natively-local',
  );
  assert.equal(localProfilePath('darwin', {}, '/Users/a b'), '/Users/a b/Library/Application Support/natively-local');
  assert.throws(() => localProfilePath('win32', {}), /APPDATA/);
  assert.throws(() => localProfilePath('linux', {}), /Unsupported platform/);
});

test('one start:local per profile: atomic, released on close, foreign port reported', async (t) => {
  const { createServer } = await import('node:net');
  const dir = mkdtempSync(path.join(tmpdir(), 'start local lock '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const local = path.join(dir, 'natively-local');
  const port = 40000 + Math.floor(Math.random() * 5000);
  // Two launches racing: exactly one wins.
  const results = await Promise.allSettled([acquireProfileLock(local, { port }), acquireProfileLock(local, { port })]);
  const won = results.filter((r) => r.status === 'fulfilled');
  const lost = results.filter((r) => r.status === 'rejected');
  assert.equal(won.length, 1);
  assert.match(lost[0].reason.message, /already running/);
  won[0].value();
  await new Promise((r) => setTimeout(r, 50));
  const again = await acquireProfileLock(local, { port });
  again();
  again(); // releasing twice is harmless
  // Something else on the port is reported as such, never as "us".
  const foreign = createServer((s) => s.end('hello\n'));
  await new Promise((r) => foreign.listen(port, '127.0.0.1', r));
  t.after(() => foreign.close());
  await new Promise((r) => setTimeout(r, 50));
  await assert.rejects(acquireProfileLock(local, { port }), /in use by another program/);
});

test('lock port is stable per profile, case-insensitive, in the dynamic range', () => {
  const a = profileLockPort('C:\\Users\\A\\AppData\\Roaming\\natively-local');
  assert.equal(a, profileLockPort('c:\\users\\a\\appdata\\roaming\\NATIVELY-LOCAL'));
  assert.ok(a >= 49152 && a < 65152);
});
