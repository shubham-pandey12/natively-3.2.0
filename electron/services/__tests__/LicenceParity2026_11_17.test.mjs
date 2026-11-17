import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const scenario = process.argv[2];
if (scenario) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'natively-parity-'));
  process.env.NATIVELY_TEST_USERDATA = dir;
  const original = Module._resolveFilename;
  const nativePath = path.join(HERE, '__native_module_stub.cjs');
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'electron') return path.join(HERE, '__electron_license_stub.mjs');
    if (scenario !== 'replace' && typeof request === 'string' && request.endsWith('.node')) return nativePath;
    return original.call(this, request, ...rest);
  };
  const { LicenseManager, offlineTooLong } = await import('../../../dist-electron/premium/electron/services/LicenseManager.js');
  const file = path.join(dir, 'license.enc');
  const fresh = () => { delete globalThis.__nativelyLicenseManagerV1__; LicenseManager.instance = undefined; return LicenseManager.getInstance(); };
  const write = (data) => fs.writeFileSync(file, Buffer.from(`ENC:${JSON.stringify({ key: 'KEY', hwid: 'a'.repeat(64), activatedAt: new Date().toISOString(), provider: 'dodo', ...data })}`));
  try {
    if (scenario === 'refund') {
      const { control } = Module.createRequire(import.meta.url)(nativePath);
      control.verifyGumroad = 'OK';
      globalThis.fetch = async () => ({ status: 200, json: async () => ({ success: true, purchase: { refunded: true } }) });
      assert.deepEqual(await fresh().activateLicense('KEY'), { success: false, error: 'This Gumroad purchase was refunded or reversed, so it no longer unlocks Pro. Contact support@natively.software if this is wrong.' });
    } else if (scenario === 'replace') {
      write({ revokedAt: new Date().toISOString() });
      globalThis.fetch = async () => ({ status: 200, json: async () => ({ ok: true, has_pro: true, plan: 'ultra' }) });
      assert.equal((await fresh().activateWithApiKey('natively_sk_new')).success, true);
      assert.equal(JSON.parse(fs.readFileSync(file, 'utf8').slice(4)).provider, 'natively_api');
    } else if (scenario === 'grace') {
      const day = 86400000;
      const now = Date.now();
      assert.equal(offlineTooLong({ verifiedAt: new Date(now - 15 * day).toISOString() }, now), true);
      write({ verifiedAt: new Date(now - 15 * day).toISOString() });
      const { control } = Module.createRequire(import.meta.url)(nativePath);
      control.validateDodo = 'ERR:dodo:network:timeout';
      assert.equal(await fresh().isPremiumAsync(), false);
      assert.equal(fresh().storedLicenceState(), 'held');
      assert.equal(JSON.parse(fs.readFileSync(file, 'utf8').slice(4)).revokedAt, undefined);
      control.validateDodo = 'OK';
      assert.equal(await fresh().isPremiumAsync(), true);
      write({ revokedAt: new Date().toISOString() });
      assert.equal(await fresh().isPremiumAsync(), true);
      assert.equal(JSON.parse(fs.readFileSync(file, 'utf8').slice(4)).revokedAt, undefined);
    } else if (scenario === 'dev') {
      process.env.NODE_ENV = 'development';
      process.env.NATIVELY_DEV_PREMIUM = '1';
      const dev = await import('../../../dist-electron/electron/services/devPremiumOverride.js');
      assert.equal(dev.isDevPremiumOverrideEnabled(), true);
      assert.equal(dev.getDevPlanOverride(), 'ultra');
    }
  } finally {
    Module._resolveFilename = original;
    fs.rmSync(dir, { recursive: true, force: true });
  }
} else {
  for (const name of ['refund', 'replace', 'grace', 'dev']) {
    test(`3.2.0 licence parity: ${name}`, () => {
      const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), name], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr || result.stdout);
    });
  }
}
