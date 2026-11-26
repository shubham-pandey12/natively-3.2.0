export type LiveBrainKeyProvider = 'gemini-live' | 'openai-realtime' | 'elevenlabs-realtime';
export type LiveBrainProvider = LiveBrainKeyProvider | 'pipeline';
export type LiveBrainPromptVariant = 'full' | 'trimmed';
export const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
export const DEFAULT_OPENAI_REALTIME_MODEL = 'gpt-realtime-2.1';
export const DEFAULT_ELEVENLABS_REALTIME_MODEL = 'eleven_realtime_v1_mini';

export interface LiveBrainConfig {
    provider: LiveBrainProvider;
    hasKey: boolean;
    hasDedicatedKey: boolean;
    maskedSuffix: string | null;
    useAiProvidersKey: boolean;
    usingAiProvidersKey: boolean;
    /** Where the key in use comes from. 'env' is .env, in development builds only.
     *  'ai-providers' is the vendor's existing Natively key (AI Providers for
     *  Gemini/OpenAI; Speech Provider for ElevenLabs). */
    keySource: 'dedicated' | 'env' | 'ai-providers' | null;
    model: string;
    promptVariant: LiveBrainPromptVariant | null;
}

export type LiveBrainOptions =
    | { provider: LiveBrainKeyProvider; model: string }
    | { provider: LiveBrainKeyProvider; useAiProvidersKey: boolean }
    | { promptVariant: LiveBrainPromptVariant };

export type LiveBrainSettingsResult = { success: boolean; error?: string; message?: string };

export interface LiveBrainModel { id: string; label: string; description?: string }
export type LiveBrainModelsResult = { success: boolean; models: LiveBrainModel[]; error?: string };

export interface LiveBrainSettingsApi {
    getLiveBrainEnabled(): Promise<boolean>;
    setLiveBrainEnabled(enabled: boolean): Promise<LiveBrainSettingsResult>;
    getLiveBrainConfig(): Promise<LiveBrainConfig>;
    setLiveBrainProvider(provider: LiveBrainProvider): Promise<LiveBrainSettingsResult>;
    setLiveBrainKey(payload: { provider: LiveBrainKeyProvider; apiKey: string }): Promise<LiveBrainSettingsResult>;
    setLiveBrainOptions(options: LiveBrainOptions): Promise<LiveBrainSettingsResult>;
    testLiveBrainConnection(): Promise<LiveBrainSettingsResult>;
    listLiveBrainModels(): Promise<LiveBrainModelsResult>;
}
