import { CredentialsManager } from './CredentialsManager';
import { SettingsManager, type AppSettings } from './SettingsManager';
import type { AppState } from '../main';
import { loadLiveBrainPremium, type DeepgramThinkConfig } from '../premium/liveBrain';
import curl2Json from '@bany/curl-to-json';
import {
    DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_MODEL,
    DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_PROVIDER,
    DEFAULT_ELEVENLABS_REALTIME_MODEL,
    DEFAULT_GEMINI_LIVE_MODEL,
    DEFAULT_OPENAI_REALTIME_MODEL,
} from '../../src/types/liveBrainSettings';
import type {
    DeepgramByoOption,
    DeepgramManagedProvider,
    DeepgramSettingsConfig,
    LiveBrainConfig,
    LiveBrainKeyProvider,
    LiveBrainModel,
    LiveBrainModelsResult,
    LiveBrainSettingsResult,
} from '../../src/types/liveBrainSettings';

const settingsUnavailable = 'Settings store is unavailable; the change was not saved.';

type CredentialsReader = Pick<
    CredentialsManager,
    'getLiveBrainGeminiKey' | 'getLiveBrainOpenaiKey' | 'getLiveBrainElevenlabsKey' | 'getLiveBrainDeepgramKey' | 'getAllCredentials' | 'getElevenLabsApiKey' | 'getDeepgramApiKey' | 'getLiveBrainDeepgramEndpoint' | 'getAllCustomProviders'
>;

export const DEEPGRAM_MANAGED_MODELS: Record<DeepgramManagedProvider, LiveBrainModel[]> = {
    open_ai: [
        { id: 'gpt-4o-mini', label: 'GPT-4o mini', description: 'Default' },
        { id: 'gpt-4o', label: 'GPT-4o' },
        { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
        { id: 'gpt-4.1', label: 'GPT-4.1' },
    ],
    anthropic: [
        { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
        { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    ],
    google: [
        // Verified against https://agent.deepgram.com/v1/agent/settings/think/models (2026-11-26).
        // gemini-2.0-flash is rejected by Deepgram Voice Agent with INVALID_SETTINGS.
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
        { id: 'gemini-3-flash-preview', label: 'Gemini 3.0 Flash Preview' },
        { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    ],
    nvidia: [
        // Verified against https://agent.deepgram.com/v1/agent/settings/think/models (2026-11-26).
        // llama-3.3-70b-instruct is rejected by Deepgram Voice Agent with INVALID_SETTINGS.
        { id: 'nvidia/nemotron-3.5-lightning-30b-a3b', label: 'Nemotron 3.5 Lightning 30B A3B' },
    ],
};

function isDeepgramManagedProvider(value: unknown): value is DeepgramManagedProvider {
    return value === 'open_ai' || value === 'anthropic' || value === 'google' || value === 'nvidia';
}

/**
 * Deepgram's servers make outbound HTTPS requests to BYO think endpoints, so
 * loopback, link-local, RFC1918 private IPs, and non-HTTPS URLs cannot work.
 */
export function isPublicHttpsUrl(raw: string): boolean {
    try {
        const parsed = new URL(raw.trim());
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return false;
        const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
        if (!host || !host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || host === '[::1]') return false;
        if (/^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) return false;
        if (/^(?:fc|fd|fe80)/i.test(host.replace(/^\[|\]$/g, ''))) return false;
        return true;
    } catch {
        return false;
    }
}

/**
 * Everything that differs per realtime provider. Exhaustive over
 * LiveBrainKeyProvider: adding a provider without a row fails typecheck.
 */
const PROVIDERS: Record<LiveBrainKeyProvider, {
    vendor: string;
    /** A local shape check before any provider handshake. */
    keyPattern: RegExp;
    envNames: string[];
    modelSetting: 'liveBrainGeminiModel' | 'liveBrainOpenaiModel' | 'liveBrainElevenlabsModel' | 'liveBrainDeepgramManagedModel';
    reuseSetting: 'liveBrainReuseGeminiKey' | 'liveBrainReuseOpenaiKey' | 'liveBrainReuseElevenlabsKey' | 'liveBrainReuseDeepgramKey';
    dedicatedKey(credentials: CredentialsReader): string | undefined;
    /** The vendor key the user already stored elsewhere in Natively. */
    existingKey(credentials: CredentialsReader): string | undefined;
    setKey(credentials: CredentialsManager, key: string): boolean;
}> = {
    'gemini-live': {
        vendor: 'Gemini',
        // Deliberately loose. Classic AI Studio keys are `AIza` + 35 chars, but a
        // working 53-character key without that prefix authenticated against Gemini
        // Live on 2026-11-25 (Phase 0 spike), so a prefix/length rule would reject real keys.
        keyPattern: /^[A-Za-z0-9._-]{30,200}$/,
        envNames: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
        modelSetting: 'liveBrainGeminiModel',
        reuseSetting: 'liveBrainReuseGeminiKey',
        dedicatedKey: c => c.getLiveBrainGeminiKey(),
        // Match the AI Providers settings screen, which shows stored credentials.
        existingKey: c => c.getAllCredentials().geminiApiKey,
        setKey: (c, key) => c.setLiveBrainGeminiKey(key),
    },
    'openai-realtime': {
        vendor: 'OpenAI',
        keyPattern: /^sk-[A-Za-z0-9_-]{16,}$/,
        envNames: ['OPENAI_API_KEY'],
        modelSetting: 'liveBrainOpenaiModel',
        reuseSetting: 'liveBrainReuseOpenaiKey',
        dedicatedKey: c => c.getLiveBrainOpenaiKey(),
        existingKey: c => c.getAllCredentials().openaiApiKey,
        setKey: (c, key) => c.setLiveBrainOpenaiKey(key),
    },
    'elevenlabs-realtime': {
        vendor: 'ElevenLabs',
        // ElevenLabs keys have been both `sk_` + hex and bare 32-char hex; loose on purpose.
        keyPattern: /^[A-Za-z0-9_-]{20,200}$/,
        envNames: ['ELEVENLABS_API_KEY'],
        modelSetting: 'liveBrainElevenlabsModel',
        reuseSetting: 'liveBrainReuseElevenlabsKey',
        dedicatedKey: c => c.getLiveBrainElevenlabsKey(),
        // The ElevenLabs key saved for Speech Provider (Scribe).
        existingKey: c => c.getElevenLabsApiKey(),
        setKey: (c, key) => c.setLiveBrainElevenlabsKey(key),
    },
    'deepgram-voice-agent': {
        vendor: 'Deepgram',
        keyPattern: /^[A-Za-z0-9._-]{30,200}$/,
        envNames: ['DEFAULT_DEEPGRAM_KEY', 'DEEPGRAM_API_KEY'],
        modelSetting: 'liveBrainDeepgramManagedModel',
        reuseSetting: 'liveBrainReuseDeepgramKey',
        dedicatedKey: c => c.getLiveBrainDeepgramKey(),
        // Reuse the Deepgram Speech Provider key if the user saved one.
        existingKey: c => c.getDeepgramApiKey(),
        setKey: (c, key) => c.setLiveBrainDeepgramKey(key),
    },
};

function isKeyProvider(value: unknown): value is LiveBrainKeyProvider {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

function isWellFormed(provider: LiveBrainKeyProvider, key: string): boolean {
    return PROVIDERS[provider].keyPattern.test(key);
}

/**
 * Development only: GEMINI_API_KEY / OPENAI_API_KEY / ELEVENLABS_API_KEY from
 * .env (main.ts loads dotenv only when !app.isPackaged). A packaged build never
 * reads the environment, matching CredentialsManager's env-fallback scope.
 */
function devEnvKey(provider: LiveBrainKeyProvider): string | undefined {
    try {
        const { app } = require('electron') as typeof import('electron');
        if (!app || app.isPackaged) return undefined;
    } catch { return undefined; }
    for (const name of PROVIDERS[provider].envNames) {
        const value = process.env[name]?.trim();
        if (value) return value;
    }
    return undefined;
}

function extractPublicCustomProviders(credentials: CredentialsReader): Array<{ id: string; name: string; url: string; authHeader?: string; model?: string }> {
    const out: Array<{ id: string; name: string; url: string; authHeader?: string; model?: string }> = [];
    for (const custom of credentials.getAllCustomProviders()) {
        try {
            const parsed = curl2Json(custom.curlCommand) as {
                url?: string; method?: string; header?: Record<string, string>;
                data?: { model?: string; messages?: unknown; stream?: boolean };
            };
            const url = typeof parsed?.url === 'string' ? parsed.url.trim() : '';
            if (!isPublicHttpsUrl(url) || !new URL(url).pathname.endsWith('/chat/completions')) continue;
            if (parsed.method && parsed.method.toUpperCase() !== 'POST') continue;
            if (!Array.isArray(parsed.data?.messages) || parsed.data?.stream === false
                || Object.keys(parsed.data).some(key => !['model', 'messages', 'stream'].includes(key))) continue;
            const headers = Object.entries(parsed.header ?? {});
            const auth = headers.filter(([key]) => /^(authorization|x-api-key|api-key)$/i.test(key));
            if (auth.length > 1 || headers.some(([key, value]) =>
                /{{|[\r\n]/.test(value) || !/^(authorization|x-api-key|api-key|content-type)$/i.test(key)
                || (/^content-type$/i.test(key) && !/^application\/json(?:\s*;|$)/i.test(value)))) continue;
            const authEntry = auth[0];
            const model = typeof parsed.data.model === 'string' && !parsed.data.model.includes('{{') ? parsed.data.model.trim() : undefined;
            if (out.some(option => option.id === custom.id)) continue;
            out.push({
                id: custom.id,
                name: custom.name,
                url,
                authHeader: authEntry ? `${authEntry[0]}: ${authEntry[1]}` : undefined,
                model,
            });
        } catch {
            // Ignore unparseable custom cURL definitions.
        }
    }
    return out;
}

function inspectDeepgramSettings(settings: SettingsManager, credentials: CredentialsReader): {
    ui: DeepgramSettingsConfig;
    runtime: DeepgramThinkConfig;
} {
    const creds = credentials.getAllCredentials();
    const thinkMode = settings.get('liveBrainDeepgramThinkMode') === 'byo' ? 'byo' : 'managed';
    const rawManaged = settings.get('liveBrainDeepgramManagedProvider');
    const managedProvider: DeepgramManagedProvider = isDeepgramManagedProvider(rawManaged) ? rawManaged : DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_PROVIDER;
    const providerModels = DEEPGRAM_MANAGED_MODELS[managedProvider];
    const savedModel = settings.get('liveBrainDeepgramManagedModel')?.trim() || '';
    const managedModel = providerModels.some(m => m.id === savedModel)
        ? savedModel
        : (managedProvider === DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_PROVIDER ? DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_MODEL : providerModels[0].id);

    const endpoint = credentials.getLiveBrainDeepgramEndpoint();
    const legacyUrl = settings.get('liveBrainDeepgramByoCustomUrl')?.trim() || '';
    const byoCustomUrl = endpoint?.url ?? (isPublicHttpsUrl(legacyUrl) ? legacyUrl : '');
    const byoCustomHeader = endpoint?.authHeader ?? '';
    const publicCustoms = extractPublicCustomProviders(credentials);

    const byoOptions: DeepgramByoOption[] = [
        { id: 'openai', label: 'OpenAI', configured: Boolean(creds.openaiApiKey?.trim()), defaultModel: creds.openaiPreferredModel?.trim() || 'gpt-4o-mini' },
        { id: 'anthropic', label: 'Anthropic (Claude)', configured: Boolean(creds.claudeApiKey?.trim()), defaultModel: creds.claudePreferredModel?.trim() || 'claude-haiku-4-5' },
        { id: 'google', label: 'Google AI Studio', configured: Boolean(creds.geminiApiKey?.trim()), defaultModel: creds.geminiPreferredModel?.trim() || 'gemini-2.5-flash' },
        { id: 'groq', label: 'Groq', configured: Boolean(creds.groqApiKey?.trim()), defaultModel: creds.groqPreferredModel?.trim() || 'qwen/qwen3.8-27b' },
        { id: 'openrouter', label: 'OpenRouter', configured: Boolean(creds.openrouterApiKey?.trim()), defaultModel: creds.openrouterPreferredModel?.trim() || 'openai/gpt-4o-mini' },
        ...publicCustoms.map(p => ({ id: `custom:${p.id}`, label: p.name, configured: true, defaultModel: p.model, customUrl: p.url })),
        { id: 'custom', label: 'Custom endpoint', configured: isPublicHttpsUrl(byoCustomUrl), customUrl: byoCustomUrl || undefined },
    ];

    const savedByo = settings.get('liveBrainDeepgramByoKeyProvider')?.trim() || '';
    const byoKeyProvider = savedByo || (byoOptions.find(o => o.configured)?.id ?? 'openai');

    let byoApiKey: string | undefined;
    let byoModel: string | undefined;
    let resolvedCustomUrl = byoKeyProvider === 'custom' ? byoCustomUrl : '';
    let resolvedCustomHeader = byoKeyProvider === 'custom' ? byoCustomHeader : '';

    switch (byoKeyProvider) {
        case 'openai':
            byoApiKey = creds.openaiApiKey?.trim();
            byoModel = creds.openaiPreferredModel?.trim() || 'gpt-4o-mini';
            break;
        case 'anthropic':
            byoApiKey = creds.claudeApiKey?.trim();
            byoModel = creds.claudePreferredModel?.trim() || 'claude-haiku-4-5';
            break;
        case 'google':
            byoApiKey = creds.geminiApiKey?.trim();
            byoModel = creds.geminiPreferredModel?.trim() || 'gemini-2.5-flash';
            break;
        case 'groq':
            byoApiKey = creds.groqApiKey?.trim();
            byoModel = creds.groqPreferredModel?.trim() || 'qwen/qwen3.8-27b';
            break;
        case 'openrouter':
            byoApiKey = creds.openrouterApiKey?.trim();
            byoModel = creds.openrouterPreferredModel?.trim() || 'openai/gpt-4o-mini';
            break;
        default:
            if (byoKeyProvider.startsWith('custom:')) {
                const match = publicCustoms.find(p => `custom:${p.id}` === byoKeyProvider);
                if (match) {
                    resolvedCustomUrl = match.url;
                    resolvedCustomHeader = match.authHeader ?? '';
                    byoModel = match.model;
                }
            }
            break;
    }

    byoModel = settings.get('liveBrainDeepgramByoModels')?.[byoKeyProvider]?.trim() || byoModel;
    return {
        ui: {
            thinkMode,
            managedProvider,
            managedModel,
            byoKeyProvider,
            byoModel,
            byoCustomUrl,
            byoHasCustomHeader: Boolean(byoCustomHeader),
            byoOptions,
        },
        runtime: {
            thinkMode,
            managedProvider,
            managedModel,
            byoKeyProvider,
            byoApiKey,
            byoModel,
            byoCustomUrl: resolvedCustomUrl || undefined,
            byoCustomHeader: resolvedCustomHeader || undefined,
        },
    };
}

function inspectConfig(settings: SettingsManager, credentials: CredentialsReader,
    envKey: (provider: LiveBrainKeyProvider) => string | undefined = devEnvKey,
    forProvider?: LiveBrainKeyProvider): {
    config: LiveBrainConfig;
    keyIsWellFormed: boolean;
    usableKey?: string;
    deepgramThink?: DeepgramThinkConfig;
} {
    const provider = forProvider ?? settings.get('liveBrainProvider') ?? 'gemini-live';
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

    const spec = PROVIDERS[provider];
    const dedicated = spec.dedicatedKey(credentials);
    const aiProvidersKey = spec.existingKey(credentials)?.trim();
    const useAiProvidersKey = settings.get(spec.reuseSetting) ?? Boolean(aiProvidersKey);
    // Order: the Live Brain key, then (development builds only) .env, then the reused AI Providers key.
    const fromEnv = dedicated ? undefined : envKey(provider);
    const usingAiProvidersKey = !dedicated && !fromEnv && useAiProvidersKey && Boolean(aiProvidersKey);
    const key = dedicated || fromEnv || (usingAiProvidersKey ? aiProvidersKey : undefined);
    const keyIsWellFormed = key !== undefined && isWellFormed(provider, key);
    const deepgramInfo = provider === 'deepgram-voice-agent' ? inspectDeepgramSettings(settings, credentials) : undefined;
    return {
        keyIsWellFormed,
        usableKey: keyIsWellFormed ? key : undefined,
        deepgramThink: deepgramInfo?.runtime,
        config: {
            provider,
            hasKey: Boolean(key),
            hasDedicatedKey: Boolean(dedicated),
            maskedSuffix: keyIsWellFormed ? `••••••••${key.slice(-4)}` : null,
            useAiProvidersKey,
            usingAiProvidersKey,
            keySource: dedicated ? 'dedicated' : fromEnv ? 'env' : usingAiProvidersKey ? 'ai-providers' : null,
            model: deepgramInfo
                ? (deepgramInfo.ui.thinkMode === 'byo' ? deepgramInfo.runtime.byoModel ?? '' : deepgramInfo.ui.managedModel)
                : (settings.get(spec.modelSetting) ?? ''),
            promptVariant,
            ...(deepgramInfo ? { deepgram: deepgramInfo.ui } : {}),
        },
    };
}

/** Main-process only. IPC exposes inspectConfig().config, never usableKey or byoApiKey. */
export function resolveLiveBrainRuntime(forProvider?: LiveBrainKeyProvider): Pick<LiveBrainConfig, 'provider' | 'model' | 'promptVariant'> & { apiKey?: string; deepgramThink?: DeepgramThinkConfig } {
    const { config, usableKey, deepgramThink } = inspectConfig(SettingsManager.getInstance(), CredentialsManager.getInstance(), devEnvKey, forProvider);
    if (config.provider !== 'pipeline' && !isKeyProvider(config.provider)) {
        throw new Error(`Unsupported live brain: ${String(config.provider)}`);
    }
    return { provider: config.provider, model: config.model, promptVariant: config.promptVariant, apiKey: usableKey, ...(deepgramThink ? { deepgramThink } : {}) };
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
    // Legacy URL and header could have been saved independently. Discard the
    // old header rather than guessing which destination the user authorized.
    if (settings().get('liveBrainDeepgramByoCustomHeader') !== undefined
        && !settings().set('liveBrainDeepgramByoCustomHeader', undefined)) {
        console.warn('[LiveBrain] Could not remove the legacy Deepgram authorization header from settings.');
    }
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
                const { vendor } = PROVIDERS[provider];
                return {
                    success: false,
                    error: 'live_brain_key_required',
                    // A present-but-malformed key (e.g. a reused AI Providers key) needs a
                    // different fix than a missing one.
                    message: hasKey
                        ? `The ${vendor} key doesn't look valid. Check it in Audio → Live Brain Provider.`
                        : `Add your ${vendor} key in Audio → Live Brain Provider.`,
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
            const persisted = PROVIDERS[provider].setKey(credentials(), key);
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
                const spec = PROVIDERS[options.provider];
                if ('useAiProvidersKey' in options && typeof options.useAiProvidersKey === 'boolean') {
                    return saved(settings().set(spec.reuseSetting, options.useAiProvidersKey), settingsUnavailable, true);
                }
                if (options.provider !== 'deepgram-voice-agent') {
                    if ('model' in options && typeof options.model === 'string') {
                        return saved(settings().set(spec.modelSetting, options.model.trim()));
                    }
                } else {
                    const st = settings();
                    const cm = credentials();
                    const current = inspectDeepgramSettings(st, cm).ui;
                    if ('byoCustomUrl' in options || 'byoCustomHeader' in options) {
                        const url = 'byoCustomUrl' in options && typeof options.byoCustomUrl === 'string'
                            ? options.byoCustomUrl.trim() : current.byoCustomUrl;
                        if (url && !isPublicHttpsUrl(url)) {
                            return { success: false, error: 'Enter a public HTTPS endpoint without credentials or query parameters.' };
                        }
                        const previous = cm.getLiveBrainDeepgramEndpoint();
                        const authHeader = 'byoCustomHeader' in options && typeof options.byoCustomHeader === 'string'
                            ? options.byoCustomHeader.trim() || undefined
                            : previous?.url === url ? previous?.authHeader : undefined;
                        if (authHeader && (!url || /[\r\n]/.test(authHeader)
                            || !/^(?:Authorization|X-API-Key|API-Key):[^\r\n]+$/i.test(authHeader))) {
                            return { success: false, error: 'Enter a single Authorization, X-API-Key, or API-Key header for this endpoint.' };
                        }
                        return saved(cm.setLiveBrainDeepgramEndpoint(url, authHeader));
                    }

                    const change: Partial<AppSettings> = {};
                    if ('thinkMode' in options && (options.thinkMode === 'managed' || options.thinkMode === 'byo')) {
                        change.liveBrainDeepgramThinkMode = options.thinkMode;
                    }
                    const managedProvider = 'managedProvider' in options && isDeepgramManagedProvider(options.managedProvider)
                        ? options.managedProvider : current.managedProvider;
                    const managedModel = 'managedModel' in options ? options.managedModel : 'model' in options ? options.model : undefined;
                    const validModels = DEEPGRAM_MANAGED_MODELS[managedProvider];
                    if (typeof managedModel === 'string') {
                        if (!validModels.some(entry => entry.id === managedModel.trim())) {
                            return { success: false, error: 'Select a supported model for this Deepgram provider.' };
                        }
                        change.liveBrainDeepgramManagedModel = managedModel.trim();
                    } else if (!validModels.some(entry => entry.id === current.managedModel)) {
                        change.liveBrainDeepgramManagedModel = validModels[0].id;
                    }
                    if (managedProvider !== current.managedProvider) change.liveBrainDeepgramManagedProvider = managedProvider;

                    const byoProvider = 'byoKeyProvider' in options ? options.byoKeyProvider : current.byoKeyProvider;
                    if ('byoKeyProvider' in options) {
                        if (typeof byoProvider !== 'string'
                            || !current.byoOptions.some(entry => entry.id === byoProvider && (entry.configured || entry.id === 'custom'))) {
                            return { success: false, error: 'Select a configured Deepgram Think provider.' };
                        }
                        change.liveBrainDeepgramByoKeyProvider = byoProvider;
                    }
                    if ('byoModel' in options && typeof options.byoModel === 'string' && typeof byoProvider === 'string') {
                        change.liveBrainDeepgramByoModels = { ...st.get('liveBrainDeepgramByoModels'), [byoProvider]: options.byoModel.trim() };
                    }
                    return saved(st.setValues(change));
                }
            }
        }
        return { success: false, error: 'Invalid Live Brain options.' };
    });

    safeHandle('live-brain:test-connection', async () => {
        const { config: { provider, hasKey, model, keySource }, usableKey, deepgramThink } = inspect();
        if (isKeyProvider(provider)) {
            if (!hasKey) return { success: false, error: 'no_key', message: 'Add an API key first.' };
            if (!usableKey) return { success: false, error: 'invalid_key', message: "The API key doesn't look valid." };
            const premium = loadPremium();
            const name = provider === 'gemini-live' ? 'Gemini Live'
                : provider === 'deepgram-voice-agent' ? 'Deepgram Voice Agent'
                : `${PROVIDERS[provider].vendor} Realtime`;
            const result = await (premium?.testConnection({
                apiKey: usableKey,
                model,
                ...(provider === 'gemini-live' ? {} : { provider }),
                ...(deepgramThink ? { deepgramThink } : {}),
            }) ?? { success: false, error: 'unavailable', message: `${name} is unavailable in this build.` });
            // Include the key source for an auth failure without exposing the key.
            if (!result.success && result.error === 'auth' && keySource) {
                const source = keySource === 'ai-providers' && (provider === 'deepgram-voice-agent' || provider === 'elevenlabs-realtime')
                    ? 'Speech Provider' : KEY_SOURCE_LABEL[keySource];
                return { ...result, message: `${result.message} (key from ${source})` };
            }
            return result;
        }
        return { success: false, error: 'not_available_yet', message: 'The existing pipeline needs no separate Live Brain connection.' };
    });

    safeHandle('live-brain:list-models', async (): Promise<LiveBrainModelsResult> => {
        const { config: { provider, deepgram }, usableKey } = inspect();
        if (provider === 'openai-realtime') return { success: true, models: OPENAI_REALTIME_MODELS };
        if (provider === 'elevenlabs-realtime') return { success: true, models: ELEVENLABS_REALTIME_MODELS };
        if (provider === 'deepgram-voice-agent') {
            const mp = deepgram?.managedProvider ?? DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_PROVIDER;
            return { success: true, models: DEEPGRAM_MANAGED_MODELS[mp] };
        }
        if (provider !== 'gemini-live') return { success: true, models: [] };
        if (!usableKey) return { success: false, models: GEMINI_LIVE_FALLBACK_MODELS, error: 'Add an API key to load the model list.' };
        return listGeminiLiveModels(usableKey);
    });
}

const KEY_SOURCE_LABEL: Record<NonNullable<LiveBrainConfig['keySource']>, string> = {
    dedicated: 'Live Brain', env: '.env', 'ai-providers': 'AI Providers',
};

const GEMINI_LIVE_FALLBACK_MODELS: LiveBrainModel[] = [
    { id: DEFAULT_GEMINI_LIVE_MODEL, label: 'Gemini 3.1 Flash Live Preview', description: 'Default' },
    { id: 'gemini-3.8-live', label: 'Gemini 3.8 Live' },
];

const OPENAI_REALTIME_MODELS: LiveBrainModel[] = [
    { id: DEFAULT_OPENAI_REALTIME_MODEL, label: 'GPT Realtime 2.1', description: 'Default' },
];

const ELEVENLABS_REALTIME_MODELS: LiveBrainModel[] = [
    { id: DEFAULT_ELEVENLABS_REALTIME_MODEL, label: 'Eleven Realtime v1 Mini', description: 'Default · fastest' },
    { id: 'eleven_realtime_v1_max', label: 'Eleven Realtime v1 Max · slower (~3 s)' },
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
