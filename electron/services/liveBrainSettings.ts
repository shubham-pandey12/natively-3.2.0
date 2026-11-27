import { randomUUID } from 'node:crypto';
import type { DirectAssistDispatchRequest, DirectAssistSelection } from '../direct-assist/types';
import { CredentialsManager } from './CredentialsManager';
import { SettingsManager, type AppSettings } from './SettingsManager';
import type { AppState } from '../main';
import { loadLiveBrainPremium, type DeepgramThinkConfig } from '../premium/liveBrain';
import curl2Json from '@bany/curl-to-json';
import {
    AMAZON_SONIC_MODELS,
    AMAZON_SONIC_REGIONS,
    DEFAULT_AMAZON_SONIC_MODEL,
    DEFAULT_DEEPGRAM_FLUX_MODEL,
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
    FluxAiRouteStatus,
    FluxAiRouteTestStatus,
    LiveBrainConfig,
    LiveBrainKeyProvider,
    LiveBrainModel,
    LiveBrainModelsResult,
    LiveBrainProvider,
    LiveBrainSettingsResult,
} from '../../src/types/liveBrainSettings';

const settingsUnavailable = 'Settings store is unavailable; the change was not saved.';

type CredentialsReader = Pick<
    CredentialsManager,
    'getLiveBrainGeminiKey' | 'getLiveBrainOpenaiKey' | 'getLiveBrainElevenlabsKey' | 'getLiveBrainDeepgramKey' | 'getLiveBrainDeepgramFluxKey' | 'getAllCredentials' | 'getElevenLabsApiKey' | 'getDeepgramApiKey' | 'getLiveBrainDeepgramEndpoint' | 'getAllCustomProviders'
> & Partial<Pick<CredentialsManager, 'getCodexOAuthTokens' | 'getAntigravityOAuthTokens'>>;

export interface FluxLlmHelper {
    getCurrentProvider(): string;
    getCurrentModelId(): string;
    getCurrentModelDisplayName(): string;
    getCodexSelectionAuthError?(): string | null;
    getDirectAssistSelection?(): DirectAssistSelection;
    streamDirectAssist?(request: DirectAssistDispatchRequest, signal: AbortSignal): AsyncIterable<string>;
}

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

// A short list of text chat models for the supported BYO endpoints.
const DEEPGRAM_BYO_MODELS = new Map<string, LiveBrainModel[]>([
    ['openai', [
        { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
        { id: 'gpt-5-nano', label: 'GPT-5 nano' },
        { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
        { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
        { id: 'gpt-4.1', label: 'GPT-4.1' },
    ]],
    ['google', [
        { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
        { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
        { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
        { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
        { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
    ]],
    ['anthropic', [
        { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
        { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
        { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    ]],
    ['groq', [
        { id: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
        { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
        { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
        { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
    ]],
    ['openrouter', [
        { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini' },
        { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite' },
        { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
        { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
    ]],
]);

import { isPublicHttpsUrl } from '../audio/realtimeTransport';
export { isPublicHttpsUrl };

/**
 * Everything that differs per realtime provider. Exhaustive over
 * LiveBrainKeyProvider: adding a provider without a row fails typecheck.
 */
const PROVIDERS: Record<LiveBrainKeyProvider, {
    vendor: string;
    /** A local shape check before any provider handshake. */
    keyPattern: RegExp;
    envNames: string[];
    modelSetting?: 'liveBrainGeminiModel' | 'liveBrainOpenaiModel' | 'liveBrainElevenlabsModel' | 'liveBrainDeepgramManagedModel';
    reuseSetting: 'liveBrainReuseGeminiKey' | 'liveBrainReuseOpenaiKey' | 'liveBrainReuseElevenlabsKey' | 'liveBrainReuseDeepgramKey' | 'liveBrainReuseDeepgramFluxKey';
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
    'deepgram-flux': {
        vendor: 'Deepgram',
        keyPattern: /^[A-Za-z0-9._-]{30,200}$/,
        envNames: ['DEFAULT_DEEPGRAM_KEY', 'DEEPGRAM_API_KEY'],
        reuseSetting: 'liveBrainReuseDeepgramFluxKey',
        dedicatedKey: c => c.getLiveBrainDeepgramFluxKey(),
        // Reuse the Deepgram Speech Provider key if the user saved one.
        existingKey: c => c.getDeepgramApiKey(),
        setKey: (c, key) => c.setLiveBrainDeepgramFluxKey(key),
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
            byoRecommendedModels: DEEPGRAM_BYO_MODELS.get(byoKeyProvider) ?? [],
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

const FLUX_AI_PROVIDER_LABELS: Record<string, string> = {
    bedrock: 'Amazon Bedrock',
    openai: 'OpenAI',
    claude: 'Anthropic (Claude)',
    gemini: 'Google Gemini',
    groq: 'Groq',
    deepseek: 'DeepSeek',
    nvidia_nim: 'NVIDIA NIM',
    openrouter: 'OpenRouter',
    fluxion: 'Fluxion',
    agentrouter: 'AgentRouter',
    litellm: 'LiteLLM',
    ninerouter: '9Router',
    'codex-cli': 'Codex CLI',
    antigravity: 'Antigravity',
    ollama: 'Ollama',
    custom: 'Custom Provider',
    curl: 'Custom cURL',
    natively: 'Natively AI',
};

/**
 * Inspects Natively's active AI Provider selection and credential readiness
 * without returning secrets or mutating configuration.
 */
export function inspectFluxAiRoute(
    llmHelper: FluxLlmHelper | undefined,
    credentials: CredentialsReader,
): FluxAiRouteStatus {
    if (!llmHelper) {
        return {
            provider: 'unknown',
            providerLabel: 'AI Provider',
            model: '',
            configured: false,
            reason: 'Open AI Providers in Settings to choose an answer model.',
        };
    }

    const creds = credentials.getAllCredentials();
    let provider = '';
    let model = '';
    let selectionError: string | undefined;

    try {
        if (typeof llmHelper.getDirectAssistSelection === 'function') {
            const selected = llmHelper.getDirectAssistSelection();
            provider = selected.provider;
            model = selected.model;
        } else {
            provider = llmHelper.getCurrentProvider();
            model = llmHelper.getCurrentModelId();
        }
    } catch {
        selectionError = 'Choose an active model supported by AI Providers.';
        provider = llmHelper.getCurrentProvider?.() || 'unknown';
        model = llmHelper.getCurrentModelId?.() || '';
    }

    const displayModel = (llmHelper.getCurrentModelDisplayName?.() || model || '').trim();
    const providerLabel = FLUX_AI_PROVIDER_LABELS[provider] ?? (provider || 'AI Provider');
    if (selectionError) {
        return { provider, providerLabel, model: displayModel, configured: false, reason: selectionError };
    }

    let configured = true;
    let reason: string | undefined;
    switch (provider) {
        case 'bedrock':
            configured = Boolean(creds.bedrock);
            if (!configured) reason = 'Configure Amazon Bedrock in AI Providers.';
            break;
        case 'openai':
            configured = Boolean(creds.openaiApiKey?.trim());
            if (!configured) reason = 'Add an OpenAI API key in AI Providers.';
            break;
        case 'claude':
            configured = Boolean(creds.claudeApiKey?.trim());
            if (!configured) reason = 'Add an Anthropic API key in AI Providers.';
            break;
        case 'gemini':
            configured = Boolean(creds.geminiApiKey?.trim());
            if (!configured) reason = 'Add a Gemini API key in AI Providers.';
            break;
        case 'groq':
            configured = Boolean(creds.groqApiKey?.trim());
            if (!configured) reason = 'Add a Groq API key in AI Providers.';
            break;
        case 'deepseek':
            configured = Boolean(creds.deepseekApiKey?.trim());
            if (!configured) reason = 'Add a DeepSeek API key in AI Providers.';
            break;
        case 'nvidia_nim':
            configured = Boolean(creds.nvidiaNimApiKey?.trim());
            if (!configured) reason = 'Add an NVIDIA NIM API key in AI Providers.';
            break;
        case 'openrouter':
            configured = Boolean(creds.openrouterApiKey?.trim());
            if (!configured) reason = 'Add an OpenRouter API key in AI Providers.';
            break;
        case 'fluxion':
            configured = Boolean(creds.fluxionApiKey?.trim());
            if (!configured) reason = 'Add a Fluxion API key in AI Providers.';
            break;
        case 'agentrouter':
            configured = Boolean(creds.agentrouterApiKey?.trim());
            if (!configured) reason = 'Add an AgentRouter API key in AI Providers.';
            break;
        case 'litellm':
            configured = Boolean(creds.litellmBaseURL?.trim());
            if (!configured) reason = 'Configure LiteLLM in AI Providers.';
            break;
        case 'ninerouter':
            configured = Boolean(creds.ninerouterBaseURL?.trim());
            if (!configured) reason = 'Configure 9Router in AI Providers.';
            break;
        case 'codex-cli': {
            const authErr = llmHelper.getCodexSelectionAuthError?.();
            if (authErr) {
                configured = false;
                reason = 'Sign in to ChatGPT Codex in AI Providers.';
            } else if (credentials.getCodexOAuthTokens) {
                // Codex CLI token or cached CLI auth status is checked cleanly without leaking secrets.
                const hasTokens = Boolean(credentials.getCodexOAuthTokens()?.accessToken);
                if (!hasTokens && llmHelper.getCodexSelectionAuthError) {
                    configured = llmHelper.getCodexSelectionAuthError() === null;
                }
            }
            break;
        }
        case 'antigravity': {
            const tokens = credentials.getAntigravityOAuthTokens?.();
            configured = Boolean(tokens?.refreshToken || tokens?.accessToken);
            if (!configured) reason = 'Sign in to Antigravity in AI Providers.';
            break;
        }
        case 'ollama':
            configured = Boolean(displayModel);
            if (!configured) reason = 'Select an Ollama model in AI Providers.';
            break;
        case 'natively':
            configured = Boolean(creds.nativelyApiKey?.trim());
            if (!configured) reason = 'Sign in or configure a provider in AI Providers.';
            break;
        case 'custom':
        case 'curl':
            configured = Boolean(model.trim());
            if (!configured) reason = 'Configure a custom provider in AI Providers.';
            break;
        default:
            configured = Boolean(displayModel);
            if (!configured) reason = 'Configure an active provider in AI Providers.';
            break;
    }

    return { provider, providerLabel, model: displayModel, configured, ...(reason ? { reason } : {}) };
}

/**
 * Separately probes the configured Natively AI route with a tiny prompt so Test
 * Connection distinguishes local configuration readiness from an actual reply.
 */
export async function testFluxAiRoute(
    llmHelper: FluxLlmHelper | undefined,
    credentials: CredentialsReader,
    timeoutMs = 10_000,
): Promise<FluxAiRouteTestStatus> {
    const route = inspectFluxAiRoute(llmHelper, credentials);
    if (!route.configured) {
        return {
            ...route,
            replied: false,
            detail: route.reason || `${route.providerLabel} needs setup in AI Providers.`,
        };
    }
    if (!llmHelper?.streamDirectAssist || !llmHelper.getDirectAssistSelection) {
        return {
            ...route,
            replied: false,
            detail: `${route.providerLabel} (${route.model}) is configured, but could not run a test reply in this context.`,
        };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);
    let reply = '';
    try {
        const stream = llmHelper.streamDirectAssist({
            requestId: randomUUID(),
            selection: llmHelper.getDirectAssistSelection(),
            userPrompt: 'Reply with OK.',
            systemPrompt: 'Reply with only the single word OK.',
            imagePaths: [],
        }, controller.signal);
        for await (const chunk of stream) {
            reply += chunk;
            if (reply.length > 32) break;
        }
        if (controller.signal.aborted || !/^OK[.!]?$/i.test(reply.trim())) {
            return {
                ...route,
                replied: false,
                detail: `${route.providerLabel} (${route.model}) is configured, but did not return a valid test reply.`,
            };
        }
        return {
            ...route,
            replied: true,
            detail: `${route.providerLabel} (${route.model}) replied.`,
        };
    } catch {
        return {
            ...route,
            replied: false,
            detail: `${route.providerLabel} (${route.model}) is configured, but the test request failed.`,
        };
    } finally {
        clearTimeout(timer);
        if (!controller.signal.aborted) controller.abort();
    }
}

function inspectConfig(settings: SettingsManager, credentials: CredentialsReader,
    envKey: (provider: LiveBrainKeyProvider) => string | undefined = devEnvKey,
    forProvider?: Exclude<LiveBrainProvider, 'pipeline'>,
    llmHelper?: FluxLlmHelper): {
        config: LiveBrainConfig;
        keyIsWellFormed: boolean;
        usableKey?: string;
        deepgramThink?: DeepgramThinkConfig;
        fluxAiRoute?: FluxAiRouteStatus;
    } {
    const provider = forProvider ?? settings.get('liveBrainProvider') ?? 'gemini-live';
    const promptVariant = settings.get('liveBrainPromptVariant') ?? null;
    if (provider === 'amazon-sonic') {
        const savedRegion = settings.get('liveBrainSonicRegion');
        const sonicRegion = typeof savedRegion === 'string'
            ? AMAZON_SONIC_REGIONS.find(region => region === savedRegion.trim())
            : undefined;
        const savedModel = settings.get('liveBrainSonicModel');
        const model = AMAZON_SONIC_MODELS.find(entry => entry.id === savedModel)?.id ?? DEFAULT_AMAZON_SONIC_MODEL;
        return { keyIsWellFormed: Boolean(sonicRegion), config: {
            provider, promptVariant, sonicRegion, hasKey: false, hasDedicatedKey: false,
            maskedSuffix: null, useAiProvidersKey: false, usingAiProvidersKey: false, keySource: null,
            model,
        } };
    }
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
    let model = (spec.modelSetting ? settings.get(spec.modelSetting) : undefined) ?? '';
    const staticModels = staticRealtimeModels(provider);
    if (staticModels && !staticModels.some(entry => entry.id === model)) {
        model = provider === 'openai-realtime' ? DEFAULT_OPENAI_REALTIME_MODEL : DEFAULT_ELEVENLABS_REALTIME_MODEL;
    }
    const dedicated = spec.dedicatedKey(credentials);
    const aiProvidersKey = spec.existingKey(credentials)?.trim();
    const useAiProvidersKey = settings.get(spec.reuseSetting) ?? Boolean(aiProvidersKey);
    // Order: the Live Brain key, then (development builds only) .env, then the reused AI Providers key.
    const fromEnv = dedicated ? undefined : envKey(provider);
    const usingAiProvidersKey = !dedicated && !fromEnv && useAiProvidersKey && Boolean(aiProvidersKey);
    const key = dedicated || fromEnv || (usingAiProvidersKey ? aiProvidersKey : undefined);
    const keyIsWellFormed = key !== undefined && isWellFormed(provider, key);
    const deepgramInfo = provider === 'deepgram-voice-agent' ? inspectDeepgramSettings(settings, credentials) : undefined;
    const fluxAiRoute = provider === 'deepgram-flux' ? inspectFluxAiRoute(llmHelper, credentials) : undefined;
    return {
        keyIsWellFormed,
        usableKey: keyIsWellFormed ? key : undefined,
        deepgramThink: deepgramInfo?.runtime,
        fluxAiRoute,
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
                : provider === 'deepgram-flux'
                    ? DEFAULT_DEEPGRAM_FLUX_MODEL
                    : model,
            promptVariant,
            ...(deepgramInfo ? { deepgram: deepgramInfo.ui } : {}),
            ...(fluxAiRoute ? { fluxAiRoute } : {}),
        },
    };
}

/** Main-process only. IPC exposes inspectConfig().config, never usableKey or byoApiKey. */
export function resolveLiveBrainRuntime(forProvider?: Exclude<LiveBrainProvider, 'pipeline'>): Pick<LiveBrainConfig, 'provider' | 'model' | 'promptVariant'> & { apiKey?: string; deepgramThink?: DeepgramThinkConfig; sonicRegion?: string } {
    const { config, usableKey, deepgramThink } = inspectConfig(SettingsManager.getInstance(), CredentialsManager.getInstance(), devEnvKey, forProvider);
    if (config.provider !== 'pipeline' && config.provider !== 'amazon-sonic' && !isKeyProvider(config.provider)) {
        throw new Error(`Unsupported live brain: ${String(config.provider)}`);
    }
    return { provider: config.provider, model: config.model, promptVariant: config.promptVariant, apiKey: usableKey,
        ...(config.sonicRegion ? { sonicRegion: config.sonicRegion } : {}), ...(deepgramThink ? { deepgramThink } : {}) };
}

export function registerLiveBrainSettingsIpc(
    appState: Pick<AppState, 'getLiveBrainEnabled' | 'setLiveBrainEnabled'> & {
        getIsMeetingActive?(): boolean;
        processingHelper?: { getLLMHelper(): FluxLlmHelper };
    },
    safeHandle: (channel: string, listener: (event: unknown, payload?: unknown) => unknown) => void,
    broadcastChanged: () => void,
    loadPremium = loadLiveBrainPremium,
): void {
    const settings = () => SettingsManager.getInstance();
    const credentials = () => CredentialsManager.getInstance();
    const llmHelper = () => appState.processingHelper?.getLLMHelper?.();
    const inspect = () => inspectConfig(settings(), credentials(), devEnvKey, undefined, llmHelper());
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

    safeHandle('live-brain:get-enabled', () => {
        try {
            return appState.getLiveBrainEnabled();
        } catch {
            return false;
        }
    });
    safeHandle('live-brain:set-enabled', (_, enabled) => {
        try {
            if (typeof enabled !== 'boolean') return { success: false, error: 'Expected a boolean.' };
            if (enabled && !loadPremium()) {
                return { success: false, error: 'live_brain_unavailable', message: 'Live Brain is not available in this build.' };
            }
            if (enabled) {
                const { config: { provider, hasKey }, keyIsWellFormed, deepgramThink } = inspect();
                if (provider === 'amazon-sonic' && !keyIsWellFormed) {
                    return { success: false, error: 'sonic_region_required', message: 'Save an AWS Region for Amazon Sonic first.' };
                }
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
                if (!isKeyProvider(provider) && provider !== 'pipeline' && provider !== 'amazon-sonic') {
                    return { success: false, error: 'unsupported_provider', message: 'The saved Live Brain provider is not supported. Select a provider in settings.' };
                }
                if (provider === 'deepgram-voice-agent' && deepgramThink?.thinkMode === 'byo'
                    && !deepgramThink.byoApiKey && !deepgramThink.byoCustomUrl) {
                    return { success: false, error: 'live_brain_key_required', message: 'The selected Think provider key is missing. Add it in AI Providers.' };
                }
            }
            return saved(appState.setLiveBrainEnabled(enabled));
        } catch {
            return { success: false, error: 'internal_error', message: 'Could not update Live Brain.' };
        }
    });

    safeHandle('live-brain:get-config', () => {
        try {
            return {
                ...inspect().config,
                available: Boolean(loadPremium()),
                ...(typeof appState.getIsMeetingActive === 'function' ? { meetingActive: appState.getIsMeetingActive() } : {}),
            };
        } catch {
            return {
                provider: 'gemini-live',
                hasKey: false,
                hasDedicatedKey: false,
                maskedSuffix: null,
                useAiProvidersKey: false,
                usingAiProvidersKey: false,
                keySource: null,
                model: '',
                promptVariant: null,
                available: false,
            };
        }
    });
    safeHandle('live-brain:set-provider', (_, provider) => {
        try {
            if (!isKeyProvider(provider) && provider !== 'pipeline' && provider !== 'amazon-sonic') {
                return { success: false, error: 'Unknown Live Brain provider.' };
            }
            return saved(settings().set('liveBrainProvider', provider));
        } catch {
            return { success: false, error: 'internal_error', message: 'Could not save Live Brain settings.' };
        }
    });

    safeHandle('live-brain:set-key', (_, payload) => {
        try {
            if (!payload || typeof payload !== 'object' || !('provider' in payload) || !isKeyProvider(payload.provider)
                || !('apiKey' in payload) || typeof payload.apiKey !== 'string') {
                return { success: false, error: 'Invalid Live Brain key request.' };
            }
            const { provider } = payload;
            const key = payload.apiKey.trim();
            if (key && !isWellFormed(provider, key)) {
                return { success: false, error: 'The API key format is invalid.' };
            }
            const persisted = PROVIDERS[provider].setKey(credentials(), key);
            return saved(persisted, 'Could not save the Live Brain API key.', true);
        } catch {
            return { success: false, error: 'internal_error', message: 'Could not save the Live Brain API key.' };
        }
    });

    safeHandle('live-brain:set-options', (_, options) => {
        try {
            if (!options || typeof options !== 'object' || Array.isArray(options)) {
                return { success: false, error: 'Invalid Live Brain options.' };
            }

            const st = settings();
            const cm = credentials();
            const change: Partial<AppSettings> = {};
            let handled = false;
            let credentialChange = false;
            let endpointToSave: { url: string; authHeader?: string } | undefined;

            if ('promptVariant' in options) {
                if (options.promptVariant !== 'full' && options.promptVariant !== 'trimmed') {
                    return { success: false, error: 'Invalid instruction variant.' };
                }
                change.liveBrainPromptVariant = options.promptVariant;
                handled = true;
            }

            if ('provider' in options) {
                if (options.provider === 'amazon-sonic') {
                    if (!('region' in options) || typeof options.region !== 'string'
                        || !AMAZON_SONIC_REGIONS.some(region => region === options.region)
                        || !('model' in options) || typeof options.model !== 'string'
                        || !AMAZON_SONIC_MODELS.some(model => model.id === options.model)) {
                        return { success: false, error: 'Select a supported AWS Region and Sonic model.' };
                    }
                    change.liveBrainSonicRegion = options.region;
                    change.liveBrainSonicModel = options.model;
                    handled = true;
                } else if (isKeyProvider(options.provider)) {
                    const spec = PROVIDERS[options.provider];
                    if ('useAiProvidersKey' in options) {
                        if (typeof options.useAiProvidersKey !== 'boolean') {
                            return { success: false, error: 'useAiProvidersKey must be a boolean.' };
                        }
                        change[spec.reuseSetting] = options.useAiProvidersKey;
                        credentialChange = true;
                        handled = true;
                    }
                    if (options.provider !== 'deepgram-voice-agent') {
                        if ('model' in options) {
                            if (typeof options.model !== 'string' || !spec.modelSetting) {
                                return { success: false, error: 'Select a supported model.' };
                            }
                            const model = options.model.trim();
                            if (!model || model.length > 200) {
                                return { success: false, error: 'Select a supported model.' };
                            }
                            const staticModels = staticRealtimeModels(options.provider);
                            if (staticModels && !staticModels.some(entry => entry.id === model)) {
                                return { success: false, error: 'Select a supported model.' };
                            }
                            change[spec.modelSetting] = model;
                            handled = true;
                        }
                    } else {
                        const current = inspectDeepgramSettings(st, cm).ui;
                        if ('thinkMode' in options && options.thinkMode !== 'managed' && options.thinkMode !== 'byo') {
                            return { success: false, error: 'Invalid Deepgram thinkMode.' };
                        }
                        if ('managedProvider' in options && !isDeepgramManagedProvider(options.managedProvider)) {
                            return { success: false, error: 'Select a supported Deepgram provider.' };
                        }
                        if ('managedModel' in options && typeof options.managedModel !== 'string') {
                            return { success: false, error: 'Select a supported model for this Deepgram provider.' };
                        }
                        if ('model' in options && typeof options.model !== 'string') {
                            return { success: false, error: 'Select a supported model for this Deepgram provider.' };
                        }
                        if ('byoCustomUrl' in options && typeof options.byoCustomUrl !== 'string') {
                            return { success: false, error: 'byoCustomUrl must be a string.' };
                        }
                        if ('byoCustomHeader' in options && typeof options.byoCustomHeader !== 'string') {
                            return { success: false, error: 'byoCustomHeader must be a string.' };
                        }
                        if ('byoModel' in options && typeof options.byoModel !== 'string') {
                            return { success: false, error: 'byoModel must be a string.' };
                        }

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
                            endpointToSave = { url, authHeader };
                            handled = true;
                        }

                        if ('thinkMode' in options && (options.thinkMode === 'managed' || options.thinkMode === 'byo')) {
                            change.liveBrainDeepgramThinkMode = options.thinkMode;
                            handled = true;
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
                            handled = true;
                        } else if (!validModels.some(entry => entry.id === current.managedModel)) {
                            change.liveBrainDeepgramManagedModel = validModels[0].id;
                            handled = true;
                        }
                        if (managedProvider !== current.managedProvider) {
                            change.liveBrainDeepgramManagedProvider = managedProvider;
                            handled = true;
                        }

                        const byoProvider = 'byoKeyProvider' in options ? options.byoKeyProvider : current.byoKeyProvider;
                        if ('byoKeyProvider' in options) {
                            if (typeof byoProvider !== 'string'
                                || !current.byoOptions.some(entry => entry.id === byoProvider && (entry.configured || entry.id === 'custom'))) {
                                return { success: false, error: 'Select a configured Deepgram Think provider.' };
                            }
                            change.liveBrainDeepgramByoKeyProvider = byoProvider;
                            handled = true;
                        }
                        if ('byoModel' in options && typeof options.byoModel === 'string' && typeof byoProvider === 'string') {
                            change.liveBrainDeepgramByoModels = { ...st.get('liveBrainDeepgramByoModels'), [byoProvider]: options.byoModel.trim() };
                            handled = true;
                        }
                    }
                } else {
                    return { success: false, error: 'Invalid Live Brain options.' };
                }
            }

            if (!handled) return { success: false, error: 'Invalid Live Brain options.' };
            if (endpointToSave && !cm.setLiveBrainDeepgramEndpoint(endpointToSave.url, endpointToSave.authHeader)) {
                return { success: false, error: 'Could not save the Deepgram Think endpoint.' };
            }
            return Object.keys(change).length ? saved(st.setValues(change), settingsUnavailable, credentialChange) : { success: true };
        } catch {
            return { success: false, error: 'internal_error', message: 'Could not save Live Brain settings.' };
        }
    });

    safeHandle('live-brain:test-connection', async () => {
        try {
            const { config: { provider, hasKey, model, keySource, sonicRegion }, usableKey, deepgramThink } = inspect();
            if (provider === 'amazon-sonic') {
                if (!sonicRegion) return { success: false, error: 'no_region', message: 'Save an AWS Region for Amazon Sonic first.' };
                return await (loadPremium()?.testConnection({ apiKey: '', provider, model, sonicRegion })
                    ?? Promise.resolve({ success: false, error: 'unavailable', message: 'Amazon Sonic is unavailable in this build.' }));
            }
            if (isKeyProvider(provider)) {
                if (provider === 'deepgram-flux') {
                    const routeTest = () => testFluxAiRoute(llmHelper(), credentials());
                    if (!hasKey || !usableKey) {
                        const aiRoute = await routeTest();
                        const keyMsg = !hasKey ? 'Add a Deepgram API key first.' : "The Deepgram API key doesn't look valid.";
                        return {
                            success: false,
                            error: !hasKey ? 'no_key' : 'invalid_key',
                            message: `${keyMsg} · AI route: ${aiRoute.detail}`,
                            fluxResult: { connected: false, detail: keyMsg, aiRoute },
                        };
                    }
                    const premium = loadPremium();
                    const result = await (premium?.testConnection({
                        apiKey: usableKey,
                        model,
                        provider,
                        testAiRoute: routeTest,
                    }) ?? Promise.resolve({ success: false, error: 'unavailable', message: 'Deepgram Flux is unavailable in this build.' }));
                    if (!result.success && result.error === 'auth' && keySource) {
                        const source = keySource === 'ai-providers' ? 'Speech Provider' : KEY_SOURCE_LABEL[keySource];
                        return { ...result, message: `${result.message} (key from ${source})` };
                    }
                    return result;
                }
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
                }) ?? Promise.resolve({ success: false, error: 'unavailable', message: `${name} is unavailable in this build.` }));
                // Include the key source for an auth failure without exposing the key.
                if (!result.success && result.error === 'auth' && keySource) {
                    const source = keySource === 'ai-providers' && (provider === 'deepgram-voice-agent' || provider === 'elevenlabs-realtime')
                        ? 'Speech Provider' : KEY_SOURCE_LABEL[keySource];
                    return { ...result, message: `${result.message} (key from ${source})` };
                }
                return result;
            }
            return { success: false, error: 'not_available_yet', message: 'The existing pipeline needs no separate Live Brain connection.' };
        } catch {
            return { success: false, error: 'internal_error', message: 'Connection test failed.' };
        }
    });

    safeHandle('live-brain:list-models', async (): Promise<LiveBrainModelsResult> => {
        try {
            const { config: { provider, deepgram }, usableKey } = inspect();
            if (provider === 'amazon-sonic') return { success: true, models: [...AMAZON_SONIC_MODELS] };
            if (provider === 'openai-realtime') return { success: true, models: OPENAI_REALTIME_MODELS };
            if (provider === 'elevenlabs-realtime') return { success: true, models: ELEVENLABS_REALTIME_MODELS };
            if (provider === 'deepgram-voice-agent') {
                if (deepgram?.thinkMode === 'byo') return { success: true, models: deepgram.byoRecommendedModels };
                const mp = deepgram?.managedProvider ?? DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_PROVIDER;
                return { success: true, models: DEEPGRAM_MANAGED_MODELS[mp] };
            }
            if (provider === 'deepgram-flux') {
                return { success: true, models: [{ id: DEFAULT_DEEPGRAM_FLUX_MODEL, label: 'Flux General Multilingual', description: 'Fixed STT + turn detector' }] };
            }
            if (provider !== 'gemini-live') return { success: true, models: [] };
            if (!usableKey) return { success: false, models: GEMINI_LIVE_FALLBACK_MODELS, error: 'Add an API key to load the model list.' };
            return await listGeminiLiveModels(usableKey);
        } catch {
            return { success: false, models: [], error: 'Could not load the model list.' };
        }
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

function staticRealtimeModels(provider: LiveBrainKeyProvider): LiveBrainModel[] | undefined {
    if (provider === 'openai-realtime') return OPENAI_REALTIME_MODELS;
    if (provider === 'elevenlabs-realtime') return ELEVENLABS_REALTIME_MODELS;
    return undefined;
}

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
