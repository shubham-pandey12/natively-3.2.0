import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const compiled = '../../../dist-electron/electron/services/';

test('Live Brain settings persist and IPC resolves keys without exposing them or connecting', () => {
    const userData = mkdtempSync(join(tmpdir(), 'natively-live-brain-'));
    const load = Module._load;
    const originalSettings = globalThis.__nativelySettingsManagerV1__;
    const originalCredentials = globalThis.__nativelyCredentialsManagerV1__;
    const originalGeminiEnv = process.env.GEMINI_API_KEY;
    Module._load = function (request, ...args) {
        if (request === 'electron') {
            return {
                app: { getPath: () => userData, isReady: () => true, isPackaged: false, getVersion: () => 'test' },
                safeStorage: { isEncryptionAvailable: () => false },
            };
        }
        return load.call(this, request, ...args);
    };

    const fresh = () => {
        delete globalThis.__nativelySettingsManagerV1__;
        delete globalThis.__nativelyCredentialsManagerV1__;
        for (const module of ['SettingsManager', 'CredentialsManager', 'liveBrainSettings']) {
            delete require.cache[require.resolve(`${compiled}${module}.js`)];
        }
        const settings = require(`${compiled}SettingsManager.js`).SettingsManager.getInstance();
        const credentials = require(`${compiled}CredentialsManager.js`).CredentialsManager.getInstance();
        credentials.init();
        const handlers = new Map();
        let broadcasts = 0;
        require(`${compiled}liveBrainSettings.js`).registerLiveBrainSettingsIpc({
            getLiveBrainEnabled: () => settings.get('liveBrainEnabled') === true,
            setLiveBrainEnabled: (enabled) => settings.set('liveBrainEnabled', enabled),
        }, (channel, listener) => handlers.set(channel, listener), () => { broadcasts++; });
        return {
            credentials,
            invoke: (channel, payload) => handlers.get(`live-brain:${channel}`)(null, payload),
            broadcasts: () => broadcasts,
        };
    };

    try {
        process.env.GEMINI_API_KEY = 'AIza' + 'e'.repeat(35);
        const first = fresh();
        const { invoke, credentials } = first;
        assert.equal(invoke('get-enabled'), false);
        assert.equal(invoke('get-config').provider, 'gemini-live');
        assert.equal(invoke('get-config').useAiProvidersKey, false);
        for (const value of [1, 'true', null, undefined, {}]) assert.equal(invoke('set-enabled', value).success, false);
        assert.equal(invoke('set-provider', 'unknown').success, false);
        assert.equal(invoke('set-enabled', true).error, 'live_brain_key_required');
        assert.equal(invoke('test-connection').error, 'Add an API key first.');
        assert.equal(first.broadcasts(), 0);
        assert.equal(invoke('get-enabled'), false);

        credentials.setGeminiApiKey('malformed-fake-key');
        assert.equal(invoke('test-connection').error, 'The API key format is invalid.');
        assert.match(invoke('set-enabled', true).message, /doesn't look valid/);
        assert.equal(invoke('get-config').maskedSuffix, null);
        assert.equal(invoke('set-key', { provider: 'gemini-live', apiKey: 'malformed-fake-key' }).success, false);
        // Real Gemini keys are not all `AIza` + 35: a 53-char key without that prefix
        // worked against Gemini Live (Phase 0 spike). It must be accepted.
        assert.equal(invoke('set-key', { provider: 'gemini-live', apiKey: 'AQ.' + 'k'.repeat(50) }).success, true);
        assert.equal(invoke('set-key', { provider: 'gemini-live', apiKey: '' }).success, true);

        const fakeGemini = 'AIza' + 'g'.repeat(31) + 'Fake';
        const fakeDedicated = 'AIza' + 'd'.repeat(31) + 'Demo';
        const fakeOpenai = 'sk-' + 'a'.repeat(16) + 'Mock';
        credentials.setGeminiApiKey(fakeGemini);
        credentials.setOpenaiApiKey(fakeOpenai);
        assert.equal(invoke('get-config').usingAiProvidersKey, true);
        assert.equal(invoke('get-config').maskedSuffix, '••••••••Fake');
        assert.equal(invoke('set-options', { provider: 'gemini-live', useAiProvidersKey: false }).success, true);
        assert.equal(invoke('get-config').hasKey, false);
        assert.equal(invoke('set-options', { provider: 'gemini-live', useAiProvidersKey: true }).success, true);
        assert.equal(invoke('set-key', { provider: 'gemini-live', apiKey: fakeDedicated }).success, true);
        assert.equal(invoke('get-config').usingAiProvidersKey, false);
        assert.equal(invoke('get-config').maskedSuffix, '••••••••Demo');
        assert.equal(invoke('test-connection').error, 'not_available_yet');
        assert.equal(invoke('set-enabled', true).success, true);
        assert.equal(invoke('set-options', { provider: 'gemini-live', model: 'fake-gemini-model' }).success, true);
        assert.equal(invoke('set-options', { promptVariant: 'trimmed' }).success, true);
        assert.equal(invoke('set-provider', 'openai-realtime').success, true);
        assert.equal(invoke('get-config').maskedSuffix, '••••••••Mock');
        // Key writes and the reuse switch broadcast; model, variant, provider and the
        // switch itself do not (credentials-changed reloads other settings screens).
        assert.equal(first.broadcasts(), 5);

        const restarted = fresh();
        assert.equal(restarted.invoke('get-enabled'), true);
        assert.equal(restarted.invoke('get-config').provider, 'openai-realtime');
        assert.equal(restarted.invoke('get-config').promptVariant, 'trimmed');
        assert.equal(restarted.invoke('set-provider', 'gemini-live').success, true);
        const config = restarted.invoke('get-config');
        assert.equal(config.maskedSuffix, '••••••••Demo');
        assert.equal(config.model, 'fake-gemini-model');
        const settingsJson = readFileSync(join(userData, 'settings.json'), 'utf8');
        const encrypted = readFileSync(join(userData, 'credentials.fallback.enc'));
        for (const key of [fakeGemini, fakeDedicated, fakeOpenai]) {
            assert.equal(JSON.stringify(config).includes(key), false);
            assert.equal(settingsJson.includes(key), false);
            assert.equal(encrypted.includes(Buffer.from(key)), false);
        }
        assert.equal(restarted.invoke('set-key', { provider: 'gemini-live', apiKey: '' }).success, true);
        assert.equal(restarted.invoke('get-config').maskedSuffix, '••••••••Fake');
        assert.equal(restarted.invoke('set-enabled', false).success, true);
        assert.equal(restarted.invoke('set-provider', 'pipeline').success, true);
        assert.equal(restarted.invoke('set-enabled', true).success, true);
        assert.equal(restarted.invoke('test-connection').error, 'not_available_yet');
    } finally {
        if (originalGeminiEnv === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = originalGeminiEnv;
        Module._load = load;
        globalThis.__nativelySettingsManagerV1__ = originalSettings;
        globalThis.__nativelyCredentialsManagerV1__ = originalCredentials;
        rmSync(userData, { recursive: true, force: true });
    }
});
