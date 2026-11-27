import type { LiveBrainProvider } from './liveBrainSettings';

export const LIVE_BRAIN_REASONING_EFFORTS = [
    'default',
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
] as const;

export type LiveBrainReasoningEffort = typeof LIVE_BRAIN_REASONING_EFFORTS[number];
export type LiveBrainExplicitReasoningEffort = Exclude<LiveBrainReasoningEffort, 'default'>;

export const LIVE_BRAIN_REASONING_LABELS: Readonly<Record<LiveBrainReasoningEffort, string>> = {
    default: 'Provider default',
    none: 'Off',
    minimal: 'Minimal',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    xhigh: 'Very high',
};

const CODEX_REASONING_SETS: ReadonlyArray<readonly [string, readonly LiveBrainExplicitReasoningEffort[]]> = [
    ['gpt-5-2025-08-07', ['low', 'medium', 'high']],
    ['gpt-5-mini', ['low', 'medium', 'high']],
    ['gpt-5-nano', ['low', 'medium', 'high']],
    ['gpt-5', ['low', 'medium', 'high']],
    ['gpt-5.1', ['none', 'low', 'medium', 'high']],
    ['gpt-5.2', ['none', 'low', 'medium', 'high', 'xhigh']],
    ['gpt-5.4', ['none', 'low', 'medium', 'high', 'xhigh']],
    ['gpt-5.5', ['none', 'low', 'medium', 'high', 'xhigh']],
    ['gpt-5.6', ['low', 'medium', 'high', 'xhigh']],
    ['gpt-6', ['low', 'medium', 'high', 'xhigh']],
    ['gpt-5.5-codex', ['low', 'medium', 'high', 'xhigh']],
    ['gpt-5.4-codex', ['low', 'medium', 'high', 'xhigh']],
    ['gpt-5.3-codex-spark', ['low', 'medium', 'high']],
    ['gpt-5.3-codex', ['low', 'medium', 'high']],
    ['gpt-5.2-codex', ['low', 'medium', 'high', 'xhigh']],
    ['gpt-5.1-codex', ['low', 'medium', 'high']],
    ['gpt-5-codex', ['low', 'medium', 'high']],
];

function getCodexSupportedReasoningEfforts(modelId?: string): readonly LiveBrainExplicitReasoningEffort[] {
    const id = (modelId || '').trim().toLowerCase();
    if (!id) return [];
    let bestKey = '';
    let bestSet: readonly LiveBrainExplicitReasoningEffort[] | undefined;
    for (const [key, set] of CODEX_REASONING_SETS) {
        if ((id === key || id.startsWith(`${key}-`) || id.startsWith(`${key}/`)) && key.length > bestKey.length) {
            bestKey = key;
            bestSet = set;
        }
    }
    return bestSet ?? [];
}

function getOpenAiChatSupportedReasoningEfforts(modelId?: string): readonly LiveBrainExplicitReasoningEffort[] {
    const id = (modelId || '').trim().toLowerCase();
    if (!id) return [];
    if (/\bo[1-9]\b/.test(id) || /\bo[1-9]-/.test(id)) return ['low', 'medium', 'high'];
    if (!/\bgpt-5/.test(id)) return [];
    if (id.includes('gpt-5-pro') || id.includes('gpt-5.1-pro') || id.includes('gpt-5.2-pro')) return ['high'];
    if (/^gpt-5(?:-(?:mini|nano)|-\d{4}-\d{2}-\d{2})?$/.test(id)) return ['minimal', 'low', 'medium', 'high'];
    if (id.includes('codex')) {
        if (/^gpt-5\.(?:2|4|5)-codex/.test(id)) return ['low', 'medium', 'high', 'xhigh'];
        return ['low', 'medium', 'high'];
    }
    if (/^gpt-5\.1\b/.test(id)) return ['none', 'low', 'medium', 'high'];
    if (/^gpt-5\.(?:2|4|5)\b/.test(id) || id.startsWith('gpt-5.6-luna')) return ['none', 'low', 'medium', 'high', 'xhigh'];
    return ['low', 'medium', 'high'];
}

function getGeminiChatSupportedReasoningEfforts(modelId?: string): readonly LiveBrainExplicitReasoningEffort[] {
    const id = (modelId || '').replace(/^models\//, '').trim().toLowerCase();
    if (!id) return [];
    if (id === 'gemini-3.1-flash-lite' || id === 'gemini-3.6-flash'
        || id.startsWith('gemini-3.1-flash-lite-') || id.startsWith('gemini-3.6-flash-')) {
        return ['minimal', 'low', 'medium', 'high'];
    }
    if (id.startsWith('gemini-3')) return ['low', 'medium', 'high'];
    if (id.startsWith('gemini-2.5-pro')) return ['low', 'medium', 'high'];
    if (id.startsWith('gemini-2.5-')) return ['none', 'low', 'medium', 'high'];
    return [];
}

export function getSupportedAiProviderReasoningEfforts(
    provider?: string,
    model?: string,
): readonly LiveBrainExplicitReasoningEffort[] {
    switch (provider) {
        case 'openai':
            return getOpenAiChatSupportedReasoningEfforts(model);
        case 'gemini':
            return getGeminiChatSupportedReasoningEfforts(model);
        case 'codex-cli':
            return getCodexSupportedReasoningEfforts(model);
        case 'groq':
            return /(?:^|\/)gpt-oss-/i.test((model || '').trim()) ? ['low', 'medium', 'high'] : [];
        case 'ninerouter':
            return ['none', 'low', 'medium', 'high', 'xhigh'];
        default:
            return [];
    }
}

export function getSupportedLiveBrainReasoningEfforts(params: {
    provider: LiveBrainProvider;
    model?: string;
    fluxAiProvider?: string;
    fluxAiModel?: string;
}): readonly LiveBrainExplicitReasoningEffort[] {
    const model = (params.model || '').replace(/^models\//, '').trim().toLowerCase();
    switch (params.provider) {
        case 'gemini-live':
            if (model === 'gemini-3.1-flash-live-preview') return ['minimal', 'low', 'medium', 'high'];
            if (model === 'gemini-3.8-live-extended-thinking') return ['low', 'medium', 'high'];
            return [];
        case 'openai-realtime':
            if (/^gpt-realtime-2(?:[.-]|$)/.test(model)) return ['minimal', 'low', 'medium', 'high', 'xhigh'];
            return [];
        case 'deepgram-flux':
            return getSupportedAiProviderReasoningEfforts(params.fluxAiProvider, params.fluxAiModel);
        case 'elevenlabs-realtime':
        case 'deepgram-voice-agent':
        case 'amazon-sonic':
        case 'pipeline':
            return [];
    }
}

export function isValidLiveBrainReasoningEffort(value: unknown): value is LiveBrainReasoningEffort {
    return typeof value === 'string' && (LIVE_BRAIN_REASONING_EFFORTS as readonly string[]).includes(value);
}

export function resolveEffectiveLiveBrainReasoningEffort(
    saved: unknown,
    supported: readonly LiveBrainExplicitReasoningEffort[],
): LiveBrainReasoningEffort {
    if (typeof saved === 'string' && supported.includes(saved as LiveBrainExplicitReasoningEffort)) {
        return saved as LiveBrainExplicitReasoningEffort;
    }
    return 'default';
}
