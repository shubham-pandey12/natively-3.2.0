import { CredentialsManager } from './CredentialsManager';
import { SettingsManager } from './SettingsManager';
import type { AppState } from '../main';
import type { LiveBrainConfig, LiveBrainKeyProvider, LiveBrainSettingsResult } from '../../src/types/liveBrainSettings';

const settingsUnavailable = 'Settings store is unavailable; the change was not saved.';
const connectionUnavailable = 'Connection testing is not available yet — brain arrives in Phase 4.';

function isKeyProvider(value: unknown): value is LiveBrainKeyProvider {
    return value === 'gemini-live' || value === 'openai-realtime';
}

// Local shape check only. Authentication is deferred until provider sessions exist.
function isWellFormed(provider: LiveBrainKeyProvider, key: string): boolean {
    return provider === 'gemini-live'
        ? /^AIza[A-Za-z0-9_-]{35}$/.test(key)
        : /^sk-[A-Za-z0-9_-]{16,}$/.test(key);
}

function inspectConfig(settings: SettingsManager, credentials: CredentialsManager): {
    config: LiveBrainConfig;
    keyIsWellFormed: boolean;
} {
    const provider = settings.get('liveBrainProvider') ?? 'gemini-live';
    const promptVariant = settings.get('liveBrainPromptVariant') ?? null;
    if (!isKeyProvider(provider)) {
        return {
            keyIsWellFormed: false,
            config: {
                provider, promptVariant, hasKey: false, hasDedicatedKey: false,
                maskedSuffix: null, useAiProvidersKey: false, usingAiProvidersKey: false, model: '',
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
    const usingAiProvidersKey = !dedicated && useAiProvidersKey && Boolean(aiProvidersKey);
    const key = dedicated || (usingAiProvidersKey ? aiProvidersKey : undefined);
    const keyIsWellFormed = key !== undefined && isWellFormed(provider, key);
    return {
        keyIsWellFormed,
        config: {
            provider,
            hasKey: Boolean(key),
            hasDedicatedKey: Boolean(dedicated),
            maskedSuffix: keyIsWellFormed ? `••••••••${key.slice(-4)}` : null,
            useAiProvidersKey,
            usingAiProvidersKey,
            model: settings.get(gemini ? 'liveBrainGeminiModel' : 'liveBrainOpenaiModel') ?? '',
            promptVariant,
        },
    };
}

export function registerLiveBrainSettingsIpc(
    appState: Pick<AppState, 'getLiveBrainEnabled' | 'setLiveBrainEnabled'>,
    safeHandle: (channel: string, listener: (event: unknown, payload?: unknown) => unknown) => void,
    broadcastChanged: () => void,
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

    safeHandle('live-brain:test-connection', () => {
        const { config: { provider, hasKey }, keyIsWellFormed } = inspect();
        if (isKeyProvider(provider)) {
            if (!hasKey) return { success: false, error: 'Add an API key first.' };
            if (!keyIsWellFormed) return { success: false, error: 'The API key format is invalid.' };
        }
        return { success: false, error: 'not_available_yet', message: connectionUnavailable };
    });
}
