import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { profilePaths, seedProfile, shouldCopy } from './start-local.mjs';

test('separate profile paths for win32 and darwin, unsupported elsewhere', () => {
  assert.deepEqual(profilePaths('win32', { APPDATA: 'C:\\Users\\a b\\AppData\\Roaming' }), {
    real: 'C:\\Users\\a b\\AppData\\Roaming\\Natively',
    local: 'C:\\Users\\a b\\AppData\\Roaming\\natively-local',
  });
  assert.deepEqual(profilePaths('darwin', {}, '/Users/a b'), {
    real: '/Users/a b/Library/Application Support/Natively',
    local: '/Users/a b/Library/Application Support/natively-local',
  });
  assert.throws(() => profilePaths('win32', {}), /APPDATA/);
  assert.throws(() => profilePaths('linux', {}), /Unsupported platform/);
});

test('seeding copies keys and settings, skips caches, and never overwrites', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'start local '));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const real = path.join(dir, 'Natively');
  const local = path.join(dir, 'natively-local');
  mkdirSync(path.join(real, 'Cache'), { recursive: true });
  writeFileSync(path.join(real, 'Cache', 'x'), 'cache');
  writeFileSync(path.join(real, 'credentials.enc'), 'keys');
  writeFileSync(path.join(real, 'Local State'), 'state');
  const quiet = () => {};
  assert.equal(seedProfile({ real, local }, { log: quiet }), 'seeded');
  assert.equal(readFileSync(path.join(local, 'credentials.enc'), 'utf8'), 'keys');
  assert.ok(existsSync(path.join(local, 'Local State')));
  assert.ok(!existsSync(path.join(local, 'Cache')));
  assert.ok(!shouldCopy(real, path.join(real, 'GPUCache', 'a')));

  writeFileSync(path.join(local, 'credentials.enc'), 'local keys');
  assert.equal(seedProfile({ real, local }, { log: quiet }), 'kept');
  assert.equal(readFileSync(path.join(local, 'credentials.enc'), 'utf8'), 'local keys');

  assert.equal(seedProfile({ real, local }, { reseed: true, now: 1, log: quiet }), 'seeded');
  assert.equal(readFileSync(path.join(local, 'credentials.enc'), 'utf8'), 'keys');
  assert.ok(readdirSync(dir).includes('natively-local.old-1'), 'old profile is kept aside, not deleted');
});
