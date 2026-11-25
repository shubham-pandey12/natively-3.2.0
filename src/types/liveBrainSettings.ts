export type LiveBrainKeyProvider = 'gemini-live' | 'openai-realtime';
export type LiveBrainProvider = LiveBrainKeyProvider | 'pipeline';
type PromptVariant = 'full' | 'trimmed';

export interface LiveBrainConfig {
    provider: LiveBrainProvider;
    hasKey: boolean;
    hasDedicatedKey: boolean;
    maskedSuffix: string | null;
    useAiProvidersKey: boolean;
    usingAiProvidersKey: boolean;
    model: string;
    promptVariant: PromptVariant | null;
}

export type LiveBrainOptions =
    | { provider: LiveBrainKeyProvider; model: string }
    | { provider: LiveBrainKeyProvider; useAiProvidersKey: boolean }
    | { promptVariant: PromptVariant };

export type LiveBrainSettingsResult = { success: boolean; error?: string; message?: string };

export interface LiveBrainSettingsApi {
    getLiveBrainEnabled(): Promise<boolean>;
    setLiveBrainEnabled(enabled: boolean): Promise<LiveBrainSettingsResult>;
    getLiveBrainConfig(): Promise<LiveBrainConfig>;
    setLiveBrainProvider(provider: LiveBrainProvider): Promise<LiveBrainSettingsResult>;
    setLiveBrainKey(payload: { provider: LiveBrainKeyProvider; apiKey: string }): Promise<LiveBrainSettingsResult>;
    setLiveBrainOptions(options: LiveBrainOptions): Promise<LiveBrainSettingsResult>;
    testLiveBrainConnection(): Promise<LiveBrainSettingsResult>;
}
