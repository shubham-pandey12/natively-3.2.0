export type BedrockApi = 'converse' | 'invoke' | 'runtime-chat' | 'runtime-responses' | 'runtime-messages'
    | 'mantle-chat' | 'mantle-responses' | 'mantle-messages';
export const BEDROCK_PREFIX = 'bedrock/';
export const isBedrockModel = (id: string | null | undefined): boolean => typeof id === 'string' && id.startsWith(BEDROCK_PREFIX);

export interface BedrockConnection {
    region: string;
    auth: 'aws' | 'bearer';
    apiKey?: string;
}

export interface BedrockModel {
    id: string;
    label: string;
    image?: boolean;
    streaming?: boolean;
    source: 'foundation' | 'profile' | 'mantle';
}

export interface BedrockModelOptions {
    api: BedrockApi;
    streaming?: boolean;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    systemInUserMessage?: boolean;
    mantleOpenAiPath?: boolean;
    parameters?: Record<string, unknown>;
    nativeInput?: Record<string, unknown>;
    nativeTextPath?: string;
}

export interface BedrockSettings {
    configured: boolean;
    region: string;
    auth: BedrockConnection['auth'];
    hasApiKey: boolean;
    models: BedrockModel[];
    options: Record<string, BedrockModelOptions>;
}

export function defaultBedrockOptions(model: string, metadata?: BedrockModel): BedrockModelOptions {
    if (model === 'mantle:xai.grok-4.3') return { api: 'mantle-responses', mantleOpenAiPath: true };
    if (model.startsWith('mantle:anthropic.')) return { api: 'mantle-messages' };
    if (model.startsWith('mantle:')) return { api: 'mantle-chat' };
    return { api: 'converse', streaming: metadata?.streaming };
}
