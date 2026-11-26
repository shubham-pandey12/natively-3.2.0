import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const compiled = '../../../dist-electron/electron/services/';
let packaged = true;

test('Live Brain settings persist and only the Gemini handshake receives the resolved key', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'natively-live-brain-'));
    const load = Module._load;
    const originalSettings = globalThis.__nativelySettingsManagerV1__;
    const originalCredentials = globalThis.__nativelyCredentialsManagerV1__;
    const originalGeminiEnv = process.env.GEMINI_API_KEY;
    Module._load = function (request, ...args) {
        if (request === 'electron') {
            return {
                // A packaged build: .env never supplies a key (see the dev-build test below).
                app: { getPath: () => userData, isReady: () => true, get isPackaged() { return packaged; }, getVersion: () => 'test' },
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
        const connections = [];
        let broadcasts = 0;
        require(`${compiled}liveBrainSettings.js`).registerLiveBrainSettingsIpc({
            getLiveBrainEnabled: () => settings.get('liveBrainEnabled') === true,
            setLiveBrainEnabled: (enabled) => settings.set('liveBrainEnabled', enabled),
        }, (channel, listener) => handlers.set(channel, listener), () => { broadcasts++; }, () => ({
            async testConnection(options) {
                connections.push(options);
                return { success: true, message: 'Connected' };
            },
        }));
        return {
            credentials,
            invoke: (channel, payload) => handlers.get(`live-brain:${channel}`)(null, payload),
            broadcasts: () => broadcasts,
            connections,
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
        assert.equal((await invoke('test-connection')).error, 'no_key');
        assert.equal(first.broadcasts(), 0);
        assert.equal(invoke('get-enabled'), false);

        credentials.setGeminiApiKey('malformed-fake-key');
        assert.equal((await invoke('test-connection')).error, 'invalid_key');
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
        assert.deepEqual(await invoke('test-connection'), { success: true, message: 'Connected' });
        assert.deepEqual(first.connections, [{ apiKey: fakeDedicated, model: '' }]);
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
        assert.equal((await restarted.invoke('test-connection')).success, true);
        assert.deepEqual(restarted.connections, [{ apiKey: fakeGemini, model: 'fake-gemini-model' }]);
        assert.equal(restarted.invoke('set-enabled', false).success, true);
        assert.equal(restarted.invoke('set-provider', 'pipeline').success, true);
        assert.equal(restarted.invoke('set-enabled', true).success, true);
        assert.equal((await restarted.invoke('test-connection')).error, 'not_available_yet');
    } finally {
        if (originalGeminiEnv === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = originalGeminiEnv;
        Module._load = load;
        globalThis.__nativelySettingsManagerV1__ = originalSettings;
        globalThis.__nativelyCredentialsManagerV1__ = originalCredentials;
        rmSync(userData, { recursive: true, force: true });
    }
});

test('in a development build the .env key comes after the Live Brain key and before AI Providers', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'natively-live-brain-dev-'));
    const load = Module._load;
    const originalSettings = globalThis.__nativelySettingsManagerV1__;
    const originalCredentials = globalThis.__nativelyCredentialsManagerV1__;
    const originalGeminiEnv = process.env.GEMINI_API_KEY;
    packaged = false;
    Module._load = function (request, ...args) {
        if (request === 'electron') {
            return {
                app: { getPath: () => userData, isReady: () => true, get isPackaged() { return packaged; }, getVersion: () => 'test' },
                safeStorage: { isEncryptionAvailable: () => false },
            };
        }
        return load.call(this, request, ...args);
    };
    try {
        delete globalThis.__nativelySettingsManagerV1__;
        delete globalThis.__nativelyCredentialsManagerV1__;
        for (const module of ['SettingsManager', 'CredentialsManager', 'liveBrainSettings']) {
            delete require.cache[require.resolve(`${compiled}${module}.js`)];
        }
        const credentials = require(`${compiled}CredentialsManager.js`).CredentialsManager.getInstance();
        credentials.init();
        const handlers = new Map();
        const connections = [];
        require(`${compiled}liveBrainSettings.js`).registerLiveBrainSettingsIpc({
            getLiveBrainEnabled: () => false, setLiveBrainEnabled: () => true,
        }, (channel, listener) => handlers.set(channel, listener), () => {}, () => ({
            async testConnection(options) { connections.push(options); return { success: false, error: 'auth', message: 'Rejected.' }; },
        }));
        const invoke = (channel, payload) => handlers.get(`live-brain:${channel}`)(null, payload);

        const envKey = 'AIza' + 'v'.repeat(31) + 'EnvK';
        const providersKey = 'AIza' + 'p'.repeat(31) + 'Prov';
        const dedicatedKey = 'AIza' + 'd'.repeat(31) + 'Dedi';
        process.env.GEMINI_API_KEY = envKey;
        credentials.setGeminiApiKey(providersKey);
        assert.equal(invoke('get-config').keySource, 'env');
        assert.equal(invoke('get-config').usingAiProvidersKey, false);
        // A failed test names the key it tried.
        assert.match((await invoke('test-connection')).message, /key from \.env/);
        assert.equal(connections.at(-1).apiKey, envKey);

        assert.equal(invoke('set-key', { provider: 'gemini-live', apiKey: dedicatedKey }).success, true);
        assert.equal(invoke('get-config').keySource, 'dedicated');
        await invoke('test-connection');
        assert.equal(connections.at(-1).apiKey, dedicatedKey);

        assert.equal(invoke('set-key', { provider: 'gemini-live', apiKey: '' }).success, true);
        delete process.env.GEMINI_API_KEY;
        assert.equal(invoke('get-config').keySource, 'ai-providers');
        await invoke('test-connection');
        assert.equal(connections.at(-1).apiKey, providersKey);
    } finally {
        packaged = true;
        if (originalGeminiEnv === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = originalGeminiEnv;
        Module._load = load;
        globalThis.__nativelySettingsManagerV1__ = originalSettings;
        globalThis.__nativelyCredentialsManagerV1__ = originalCredentials;
        rmSync(userData, { recursive: true, force: true });
    }
});

test('ElevenLabs Realtime: own key, Speech Provider key reuse, .env in dev, models, no raw key', async () => {
    const userData = mkdtempSync(join(tmpdir(), 'natively-live-brain-eleven-'));
    const load = Module._load;
    const originalSettings = globalThis.__nativelySettingsManagerV1__;
    const originalCredentials = globalThis.__nativelyCredentialsManagerV1__;
    const originalEnv = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
    Module._load = function (request, ...args) {
        if (request === 'electron') {
            return {
                app: { getPath: () => userData, isReady: () => true, get isPackaged() { return packaged; }, getVersion: () => 'test' },
                safeStorage: { isEncryptionAvailable: () => false },
            };
        }
        return load.call(this, request, ...args);
    };
    try {
        delete globalThis.__nativelySettingsManagerV1__;
        delete globalThis.__nativelyCredentialsManagerV1__;
        for (const module of ['SettingsManager', 'CredentialsManager', 'liveBrainSettings']) {
            delete require.cache[require.resolve(`${compiled}${module}.js`)];
        }
        const credentials = require(`${compiled}CredentialsManager.js`).CredentialsManager.getInstance();
        credentials.init();
        const handlers = new Map();
        const connections = [];
        let broadcasts = 0;
        require(`${compiled}liveBrainSettings.js`).registerLiveBrainSettingsIpc({
            getLiveBrainEnabled: () => false, setLiveBrainEnabled: () => true,
        }, (channel, listener) => handlers.set(channel, listener), () => { broadcasts++; }, () => ({
            async testConnection(options) { connections.push(options); return { success: true }; },
        }));
        const invoke = (channel, payload) => handlers.get(`live-brain:${channel}`)(null, payload);

        assert.equal(invoke('set-provider', 'elevenlabs-realtime').success, true);
        assert.equal(invoke('get-config').provider, 'elevenlabs-realtime');
        assert.equal(invoke('get-config').hasKey, false);
        assert.match(invoke('set-enabled', true).message, /Add your ElevenLabs key/);

        // The Speech Provider (Scribe) key is the reusable existing ElevenLabs key.
        const scribeKey = 'sk_' + 's'.repeat(40) + 'Scri';
        credentials.setElevenLabsApiKey(scribeKey);
        assert.equal(invoke('get-config').keySource, 'ai-providers');
        assert.equal(invoke('get-config').maskedSuffix, '••••••••Scri');

        const ownKey = 'sk_' + 'o'.repeat(40) + 'OwnK';
        assert.equal(invoke('set-key', { provider: 'elevenlabs-realtime', apiKey: 'short' }).success, false);
        assert.equal(invoke('set-key', { provider: 'elevenlabs-realtime', apiKey: ownKey }).success, true);
        assert.equal(invoke('get-config').keySource, 'dedicated');
        assert.equal(invoke('get-config').maskedSuffix, '••••••••OwnK');
        assert.equal(JSON.stringify(invoke('get-config')).includes(ownKey), false);
        assert.equal(readFileSync(join(userData, 'credentials.fallback.enc')).includes(Buffer.from(ownKey)), false);
        // The ElevenLabs key never reaches the Gemini handshake.
        const tested = await invoke('test-connection');
        assert.equal(tested.error, 'not_available_yet');
        assert.equal(connections.length, 0);

        assert.equal(invoke('set-options', { provider: 'elevenlabs-realtime', model: 'eleven_realtime_v1_max' }).success, true);
        assert.equal(invoke('get-config').model, 'eleven_realtime_v1_max');
        const models = await invoke('list-models');
        assert.deepEqual(models.models.map(m => m.id), ['eleven_realtime_v1_mini', 'eleven_realtime_v1_max']);

        // Development builds: .env sits between the Live Brain key and the reused key.
        packaged = false;
        const envKey = 'sk_' + 'e'.repeat(40) + 'EnvK';
        process.env.ELEVENLABS_API_KEY = envKey;
        assert.equal(invoke('get-config').keySource, 'dedicated');
        assert.equal(invoke('set-key', { provider: 'elevenlabs-realtime', apiKey: '' }).success, true);
        assert.equal(invoke('get-config').keySource, 'env');
        assert.equal(invoke('get-config').maskedSuffix, '••••••••EnvK');
        assert.ok(broadcasts >= 2);
    } finally {
        packaged = true;
        if (originalEnv === undefined) delete process.env.ELEVENLABS_API_KEY;
        else process.env.ELEVENLABS_API_KEY = originalEnv;
        Module._load = load;
        globalThis.__nativelySettingsManagerV1__ = originalSettings;
        globalThis.__nativelyCredentialsManagerV1__ = originalCredentials;
        rmSync(userData, { recursive: true, force: true });
    }
});

test('the Gemini model list keeps only Live-capable models', async () => {
    const { listGeminiLiveModels } = require(`${compiled}liveBrainSettings.js`);
    const seen = [];
    const ok = await listGeminiLiveModels('k'.repeat(39), async (url, init) => {
        seen.push({ url, key: init.headers['x-goog-api-key'] });
        return { ok: true, status: 200, json: async () => ({ models: [
            { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/gemini-3.8-live', displayName: 'Gemini 3.8 Live', supportedGenerationMethods: ['bidiGenerateContent'] },
            { name: 'models/gemini-3.1-flash-live-preview', displayName: 'Gemini 3.1 Flash Live', supportedGenerationMethods: ['bidiGenerateContent', 'countTokens'] },
        ] }) };
    });
    assert.equal(ok.success, true);
    assert.deepEqual(ok.models.map(m => m.id), ['gemini-3.1-flash-live-preview', 'gemini-3.8-live']);
    assert.equal(seen[0].key, 'k'.repeat(39));
    assert.equal(seen[0].url.includes('key='), false, 'the key travels in a header, never the URL');

    const rejected = await listGeminiLiveModels('bad', async () => ({ ok: false, status: 403, json: async () => ({}) }));
    assert.equal(rejected.success, false);
    assert.equal(rejected.error, 'Gemini rejected the API key.');
    assert.deepEqual(rejected.models.map(m => m.id), ['gemini-3.1-flash-live-preview', 'gemini-3.8-live']);

    const offline = await listGeminiLiveModels('k', async () => { throw new Error('offline'); });
    assert.equal(offline.success, false);
    assert.deepEqual(offline.models.map(m => m.id), ['gemini-3.1-flash-live-preview', 'gemini-3.8-live']);
});
