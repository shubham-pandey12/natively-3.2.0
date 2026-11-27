import type { WhatToAnswerQuestionEvent } from '../../src/types/whatToAnswerQuestion';
import type {
    DeepgramManagedProvider,
    DeepgramThinkMode,
    LiveBrainKeyProvider,
    LiveBrainPromptVariant,
    LiveBrainProvider,
    LiveBrainSettingsResult,
} from '../../src/types/liveBrainSettings';
import type { AutoAnswerDispatchResult } from './autoAnswer';
export type { AutoAnswerDispatchResult };

export interface DeepgramThinkConfig {
    thinkMode: DeepgramThinkMode;
    managedProvider: DeepgramManagedProvider;
    managedModel: string;
    byoKeyProvider?: string;
    byoApiKey?: string;
    byoModel?: string;
    byoCustomUrl?: string;
    byoCustomHeader?: string;
}

export interface LiveBrainAnswerRequest {
    question: string;
    replacesAutomaticAnswer: boolean;
    signal: AbortSignal;
    onFirstText?: (at: number) => void;
    onComplete?: (text: string) => void;
    liveBrainNotebook?: string;
    speechStoppedAt?: number;
    suppressQuestionRow?: boolean;
    reuseGenerationId?: number;
}

export interface LiveBrainDraftRequest {
    sessionId: string;
    turnKey: string;
    question: string;
    liveBrainNotebook?: string;
    contextKey?: string;
}

export interface LiveBrainAdoptedDraft {
    generationId: number;
    done: Promise<AutoAnswerDispatchResult>;
    visibleTextShown: () => boolean;
}

export interface LiveBrainPrivateDraft {
    readonly draftId: number;
    readonly sessionId: string;
    readonly turnKey: string;
    readonly question: string;
    readonly routeKey: string;
    readonly contextKey?: string;
    canAdopt(): boolean;
    adopt(request: LiveBrainAnswerRequest): LiveBrainAdoptedDraft | null;
    cancel(reason: string): void;
}

export interface LiveBrainAnswerEngine {
    runLiveBrainAnswer(request: LiveBrainAnswerRequest): { generationId: number; done: Promise<AutoAnswerDispatchResult> };
    startLiveBrainDraft?(request: LiveBrainDraftRequest): LiveBrainPrivateDraft | null;
    getLiveBrainAiRouteKey?(): string;
}

export interface LiveBrainMeetingOptions {
    sessionId: string;
    apiKey?: string;
    provider?: LiveBrainProvider;
    resolveProvider?(provider: LiveBrainKeyProvider): { apiKey?: string; model: string; deepgramThink?: DeepgramThinkConfig };
    model?: string;
    deepgramThink?: DeepgramThinkConfig;
    promptVariant?: LiveBrainPromptVariant;
    profileContext?: string;
    modeName?: string;
    modeTemplate?: string;
    modePrompt?: string;
    modeContext?: string;
    engine: {
        setAutomaticAnswerOutdated(generationId: number, outdated: boolean): void;
        runLiveBrainAnswer?: LiveBrainAnswerEngine['runLiveBrainAnswer'];
        startLiveBrainDraft?: LiveBrainAnswerEngine['startLiveBrainDraft'];
        getLiveBrainAiRouteKey?: LiveBrainAnswerEngine['getLiveBrainAiRouteKey'];
    };
    pipeline?: { activate(): void; cancel(): void };
    summarize?(prompt: string, signal: AbortSignal): Promise<string | null>;
    emitQuestion(event: WhatToAnswerQuestionEvent): void;
    onFailure(code: string): void;
}

export interface LiveBrainMeetingSession {
    start(): void;
    stop(): void;
    acceptAudio(channel: 'system' | 'mic', pcm: Buffer, sampleRate: number, channels?: number): void;
    addCandidateText(text: string, at: number): void;
    noteSpeechStop(at: number): void;
    isPipeline?(): boolean;
    pipelineContext?(): string;
    observePipelineTranscript?(text: string, final: boolean, at: number): void;
    observePipelineOutput?(output: { generationId: number; type: 'token' | 'answer' | 'discard' | 'failed'; text?: string }): void;
    cancelAnswer(reason: 'manual_answer'): void;
}

/** Owns which path may dispatch for the current meeting. */
export class LiveBrainRouting {
    private owner: 'off' | 'gemini' | 'pipeline' = 'off';
    private session?: LiveBrainMeetingSession;

    get activeSession(): LiveBrainMeetingSession | undefined { return this.session; }
    get enabled(): boolean { return this.owner !== 'off'; }

    pipelineOverride(available: boolean): boolean | undefined {
        if (this.owner === 'off') return undefined;
        return available && (this.owner === 'pipeline' || this.session?.isPipeline?.() === true);
    }

    start(create: (onFailure: (code: string) => void) => LiveBrainMeetingSession | undefined, onFallback: (code?: string) => void): void {
        if (this.enabled) return;
        let session: LiveBrainMeetingSession | undefined;
        const fallback = (code?: string) => {
            if (this.session !== session) return;
            this.session = undefined;
            this.owner = 'pipeline';
            session?.stop();
            onFallback(code);
        };
        try {
            session = create(fallback);
            if (!session) { fallback(); return; }
            this.session = session;
            this.owner = 'gemini';
            session.start();
        } catch (error) {
            if (error instanceof Error && error.message.startsWith('Unsupported live brain:')) {
                this.stop();
                throw error;
            }
            fallback('protocol');
        }
    }

    stop(): void {
        const session = this.session;
        this.session = undefined;
        this.owner = 'off';
        session?.stop();
    }
}

interface LiveBrainPremium {
    createMeeting(options: LiveBrainMeetingOptions): LiveBrainMeetingSession;
    testConnection(options: {
        apiKey: string;
        model?: string;
        provider?: LiveBrainKeyProvider;
        deepgramThink?: DeepgramThinkConfig;
        testAiRoute?: () => Promise<import('../../src/types/liveBrainSettings').FluxAiRouteTestStatus>;
    }): Promise<LiveBrainSettingsResult>;
}

export function loadLiveBrainPremium(): LiveBrainPremium | null {
    try { return require('../../premium/electron/liveBrain/meeting').liveBrainPremium ?? null; }
    catch { return null; }
}
