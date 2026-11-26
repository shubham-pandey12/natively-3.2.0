export type LiveBrainKeyProvider = 'gemini-live' | 'openai-realtime' | 'elevenlabs-realtime' | 'deepgram-voice-agent';
export type LiveBrainProvider = LiveBrainKeyProvider | 'pipeline';
export type LiveBrainPromptVariant = 'full' | 'trimmed';
export type DeepgramThinkMode = 'managed' | 'byo';
export type DeepgramManagedProvider = 'open_ai' | 'anthropic' | 'google' | 'nvidia';
export const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
export const DEFAULT_OPENAI_REALTIME_MODEL = 'gpt-realtime-2.1';
export const DEFAULT_ELEVENLABS_REALTIME_MODEL = 'eleven_realtime_v1_mini';
export const DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_PROVIDER: DeepgramManagedProvider = 'open_ai';
export const DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_MODEL = 'gpt-4o-mini';

export interface DeepgramByoOption {
    id: string;
    label: string;
    configured: boolean;
    defaultModel?: string;
    customUrl?: string;
}

export interface DeepgramSettingsConfig {
    thinkMode: DeepgramThinkMode;
    managedProvider: DeepgramManagedProvider;
    managedModel: string;
    byoKeyProvider: string;
    byoModel?: string;
    byoCustomUrl: string;
    byoHasCustomHeader: boolean;
    byoOptions: DeepgramByoOption[];
}

export interface LiveBrainConfig {
    provider: LiveBrainProvider;
    hasKey: boolean;
    hasDedicatedKey: boolean;
    maskedSuffix: string | null;
    useAiProvidersKey: boolean;
    usingAiProvidersKey: boolean;
    /** Where the key in use comes from. 'env' is .env, in development builds only.
     *  'ai-providers' is the vendor's existing Natively key (AI Providers for
     *  Gemini/OpenAI; Speech Provider for ElevenLabs/Deepgram). */
    keySource: 'dedicated' | 'env' | 'ai-providers' | null;
    model: string;
    promptVariant: LiveBrainPromptVariant | null;
    deepgram?: DeepgramSettingsConfig;
}

export type LiveBrainOptions =
    | { provider: LiveBrainKeyProvider; model: string }
    | { provider: LiveBrainKeyProvider; useAiProvidersKey: boolean }
    | {
        provider: 'deepgram-voice-agent';
        thinkMode?: DeepgramThinkMode;
        managedProvider?: DeepgramManagedProvider;
        managedModel?: string;
        byoKeyProvider?: string;
        byoModel?: string;
        byoCustomUrl?: string;
        byoCustomHeader?: string;
    }
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
