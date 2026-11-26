import { CredentialsManager } from './CredentialsManager';
import { SettingsManager } from './SettingsManager';
import type { AppState } from '../main';
import { loadLiveBrainPremium } from '../premium/liveBrain';
import type { LiveBrainConfig, LiveBrainKeyProvider, LiveBrainModel, LiveBrainModelsResult, LiveBrainSettingsResult } from '../../src/types/liveBrainSettings';

const settingsUnavailable = 'Settings store is unavailable; the change was not saved.';

function isKeyProvider(value: unknown): value is LiveBrainKeyProvider {
    return value === 'gemini-live' || value === 'openai-realtime';
}

// A local shape check is useful before making the provider handshake.
// Gemini: deliberately loose. Classic AI Studio keys are `AIza` + 35 chars, but a
// working 53-character key without that prefix authenticated against Gemini Live
// on 2026-11-25 (Phase 0 spike), so a prefix/length rule would reject real keys.
function isWellFormed(provider: LiveBrainKeyProvider, key: string): boolean {
    return provider === 'gemini-live'
        ? /^[A-Za-z0-9._-]{30,200}$/.test(key)
        : /^sk-[A-Za-z0-9_-]{16,}$/.test(key);
}

/**
 * Development only: GEMINI_API_KEY / OPENAI_API_KEY from .env (main.ts loads
 * dotenv only when !app.isPackaged). A packaged build never reads the
 * environment, matching CredentialsManager's env-fallback scope.
 */
function devEnvKey(provider: LiveBrainKeyProvider): string | undefined {
    try {
        const { app } = require('electron') as typeof import('electron');
        if (!app || app.isPackaged) return undefined;
    } catch { return undefined; }
    const value = provider === 'gemini-live'
        ? process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
        : process.env.OPENAI_API_KEY;
    return value?.trim() || undefined;
}

function inspectConfig(settings: SettingsManager, credentials: CredentialsManager,
    envKey: (provider: LiveBrainKeyProvider) => string | undefined = devEnvKey): {
    config: LiveBrainConfig;
    keyIsWellFormed: boolean;
    usableKey?: string;
} {
    const provider = settings.get('liveBrainProvider') ?? 'gemini-live';
    const promptVariant = settings.get('liveBrainPromptVariant') ?? null;
    if (!isKeyProvider(provider)) {
        return {
            keyIsWellFormed: false,
            config: {
                provider, promptVariant, hasKey: false, hasDedicatedKey: false,
                maskedSuffix: null, useAiProvidersKey: false, usingAiProvidersKey: false, keySource: null, model: '',
            },
        };
    }

    const gemini = provider === 'gemini-live';
    const dedicated = gemini ? credentials.getLiveBrainGeminiKey() : credentials.getLiveBrainOpenaiKey();
    // Match the AI Providers settings screen, which shows stored credentials.
    const { geminiApiKey, openaiApiKey } = credentials.getAllCredentials();
    const aiProvidersKey = (gemini ? geminiApiKey : openaiApiKey)?.trim();
    const useAiProvidersKey = settings.get(gemini ? 'liveBrainReuseGeminiKey' : 'liveBrainReuseOpenaiKey')
        ?? Boolean(aiProvidersKey);
    // Order: the Live Brain key, then (development builds only) .env, then the reused AI Providers key.
    const fromEnv = dedicated ? undefined : envKey(provider);
    const usingAiProvidersKey = !dedicated && !fromEnv && useAiProvidersKey && Boolean(aiProvidersKey);
    const key = dedicated || fromEnv || (usingAiProvidersKey ? aiProvidersKey : undefined);
    const keyIsWellFormed = key !== undefined && isWellFormed(provider, key);
    return {
        keyIsWellFormed,
        usableKey: keyIsWellFormed ? key : undefined,
        config: {
            provider,
            hasKey: Boolean(key),
            hasDedicatedKey: Boolean(dedicated),
            maskedSuffix: keyIsWellFormed ? `••••••••${key.slice(-4)}` : null,
            useAiProvidersKey,
            usingAiProvidersKey,
            keySource: dedicated ? 'dedicated' : fromEnv ? 'env' : usingAiProvidersKey ? 'ai-providers' : null,
            model: settings.get(gemini ? 'liveBrainGeminiModel' : 'liveBrainOpenaiModel') ?? '',
            promptVariant,
        },
    };
}

/** Main-process only. IPC exposes inspectConfig().config, never usableKey. */
export function resolveLiveBrainRuntime(): { provider: LiveBrainConfig['provider']; model: string; apiKey?: string } {
    const { config, usableKey } = inspectConfig(SettingsManager.getInstance(), CredentialsManager.getInstance());
    return { provider: config.provider, model: config.model, apiKey: usableKey };
}

export function registerLiveBrainSettingsIpc(
    appState: Pick<AppState, 'getLiveBrainEnabled' | 'setLiveBrainEnabled'>,
    safeHandle: (channel: string, listener: (event: unknown, payload?: unknown) => unknown) => void,
    broadcastChanged: () => void,
    loadPremium = loadLiveBrainPremium,
): void {
    const settings = () => SettingsManager.getInstance();
    const credentials = () => CredentialsManager.getInstance();
    const inspect = () => inspectConfig(settings(), credentials());
    // Only key changes (and the AI-Providers-key reuse switch, which changes which
    // key resolves) are broadcast as credentials-changed. Plain preferences are not:
    // that event makes AI Providers and the app shell reload their credential state.
    const saved = (persisted: boolean, error = settingsUnavailable, credentialChange = false): LiveBrainSettingsResult => {
        if (!persisted) return { success: false, error };
        if (credentialChange) broadcastChanged();
        return { success: true };
    };

    safeHandle('live-brain:get-enabled', () => appState.getLiveBrainEnabled());
    safeHandle('live-brain:set-enabled', (_, enabled) => {
        if (typeof enabled !== 'boolean') return { success: false, error: 'Expected a boolean.' };
        if (enabled) {
            const { config: { provider, hasKey }, keyIsWellFormed } = inspect();
            if (isKeyProvider(provider) && !keyIsWellFormed) {
                const vendor = provider === 'gemini-live' ? 'Gemini' : 'OpenAI';
                return {
                    success: false,
                    error: 'live_brain_key_required',
                    // A present-but-malformed key (e.g. a reused AI Providers key) needs a
                    // different fix than a missing one.
                    message: hasKey
                        ? `The ${vendor} key doesn't look valid. Check it in Audio → Live Brain Provider.`
                        : `Add a ${vendor} key in Audio → Live Brain Provider.`,
                };
            }
        }
        return saved(appState.setLiveBrainEnabled(enabled));
    });

    safeHandle('live-brain:get-config', () => inspect().config);
    safeHandle('live-brain:set-provider', (_, provider) => {
        if (!isKeyProvider(provider) && provider !== 'pipeline') {
            return { success: false, error: 'Unknown Live Brain provider.' };
        }
        return saved(settings().set('liveBrainProvider', provider));
    });

    safeHandle('live-brain:set-key', (_, payload) => {
        if (!payload || typeof payload !== 'object' || !('provider' in payload) || !isKeyProvider(payload.provider)
            || !('apiKey' in payload) || typeof payload.apiKey !== 'string') {
            return { success: false, error: 'Invalid Live Brain key request.' };
        }
        const { provider } = payload;
        const key = payload.apiKey.trim();
        if (key && !isWellFormed(provider, key)) {
            return { success: false, error: 'The API key format is invalid.' };
        }
        try {
            const store = credentials();
            const persisted = provider === 'gemini-live'
                ? store.setLiveBrainGeminiKey(key)
                : store.setLiveBrainOpenaiKey(key);
            return saved(persisted, 'Could not save the Live Brain API key.', true);
        } catch {
            return { success: false, error: 'Could not save the Live Brain API key.' };
        }
    });

    safeHandle('live-brain:set-options', (_, options) => {
        if (options && typeof options === 'object') {
            if ('promptVariant' in options && (options.promptVariant === 'full' || options.promptVariant === 'trimmed')) {
                return saved(settings().set('liveBrainPromptVariant', options.promptVariant));
            }
            if ('provider' in options && isKeyProvider(options.provider)) {
                const gemini = options.provider === 'gemini-live';
                if ('model' in options && typeof options.model === 'string') {
                    return saved(settings().set(gemini ? 'liveBrainGeminiModel' : 'liveBrainOpenaiModel', options.model.trim()));
                }
                if ('useAiProvidersKey' in options && typeof options.useAiProvidersKey === 'boolean') {
                    return saved(settings().set(gemini ? 'liveBrainReuseGeminiKey' : 'liveBrainReuseOpenaiKey', options.useAiProvidersKey), settingsUnavailable, true);
                }
            }
        }
        return { success: false, error: 'Invalid Live Brain options.' };
    });

    safeHandle('live-brain:test-connection', async () => {
        const { config: { provider, hasKey, model, keySource }, usableKey } = inspect();
        if (isKeyProvider(provider)) {
            if (!hasKey) return { success: false, error: 'no_key', message: 'Add an API key first.' };
            if (!usableKey) return { success: false, error: 'invalid_key', message: "The API key doesn't look valid." };
            if (provider === 'gemini-live') {
                const premium = loadPremium();
                const result = await (premium?.testConnection({ apiKey: usableKey, model })
                    ?? { success: false, error: 'unavailable', message: 'Gemini Live is unavailable in this build.' });
                // Name the key that was tried: a reused AI Providers key failing
                // otherwise reads exactly like the Live Brain key failing.
                if (!result.success && result.error === 'auth' && keySource) {
                    return { ...result, message: `${result.message} (key from ${KEY_SOURCE_LABEL[keySource]})` };
                }
                return result;
            }
        }
        const message = provider === 'pipeline' ? 'The existing pipeline needs no separate Live Brain connection.' : 'OpenAI Realtime connection testing is not available yet.';
        return { success: false, error: 'not_available_yet', message };
    });

    safeHandle('live-brain:list-models', async (): Promise<LiveBrainModelsResult> => {
        const { config: { provider }, usableKey } = inspect();
        if (provider === 'openai-realtime') return { success: true, models: OPENAI_REALTIME_MODELS };
        if (provider !== 'gemini-live') return { success: true, models: [] };
        if (!usableKey) return { success: false, models: GEMINI_LIVE_FALLBACK_MODELS, error: 'Add an API key to load the model list.' };
        return listGeminiLiveModels(usableKey);
    });
}

const KEY_SOURCE_LABEL: Record<NonNullable<LiveBrainConfig['keySource']>, string> = {
    dedicated: 'Live Brain', env: '.env', 'ai-providers': 'AI Providers',
};

const GEMINI_LIVE_FALLBACK_MODELS: LiveBrainModel[] = [
    { id: 'gemini-3.8-live', label: 'Gemini 3.8 Live', description: 'Default' },
];

const OPENAI_REALTIME_MODELS: LiveBrainModel[] = [
    { id: 'gpt-realtime-2.1', label: 'GPT Realtime 2.1', description: 'Default' },
];

/** The models this key can open a Live session with (bidiGenerateContent). */
export async function listGeminiLiveModels(apiKey: string, fetchImpl: typeof fetch = fetch): Promise<LiveBrainModelsResult> {
    try {
        const response = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
            headers: { 'x-goog-api-key': apiKey },
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
            const error = response.status === 400 || response.status === 401 || response.status === 403
                ? 'Gemini rejected the API key.' : `Gemini returned ${response.status}.`;
            return { success: false, models: GEMINI_LIVE_FALLBACK_MODELS, error };
        }
        const body = await response.json() as { models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
        const models = (body.models ?? [])
            .filter(model => model.name && model.supportedGenerationMethods?.includes('bidiGenerateContent'))
            .map(model => {
                const id = model.name!.replace(/^models\//, '');
                return { id, label: model.displayName || id };
            })
            .sort((a, b) => a.label.localeCompare(b.label));
        return { success: true, models: models.length ? models : GEMINI_LIVE_FALLBACK_MODELS };
    } catch {
        return { success: false, models: GEMINI_LIVE_FALLBACK_MODELS, error: 'Could not reach Gemini to load the model list.' };
    }
}
