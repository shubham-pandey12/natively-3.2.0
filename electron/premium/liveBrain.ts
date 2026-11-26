import type { WhatToAnswerQuestionEvent } from '../../src/types/whatToAnswerQuestion';
import type { LiveBrainPromptVariant, LiveBrainSettingsResult } from '../../src/types/liveBrainSettings';
import type { AutoAnswerDispatchResult } from './autoAnswer';

export interface LiveBrainAnswerRequest {
    question: string;
    replacesAutomaticAnswer: boolean;
    signal: AbortSignal;
    onFirstText?: (at: number) => void;
}

export interface LiveBrainAnswerEngine {
    runLiveBrainAnswer(request: LiveBrainAnswerRequest): { generationId: number; done: Promise<AutoAnswerDispatchResult> };
}

export interface LiveBrainMeetingOptions {
    sessionId: string;
    apiKey: string;
    model?: string;
    promptVariant?: LiveBrainPromptVariant;
    profileContext?: string;
    modeName?: string;
    modeTemplate?: string;
    modePrompt?: string;
    modeContext?: string;
    engine: { setAutomaticAnswerOutdated(generationId: number, outdated: boolean): void };
    emitQuestion(event: WhatToAnswerQuestionEvent): void;
    onFailure(code: string): void;
}

export interface LiveBrainMeetingSession {
    start(): void;
    stop(): void;
    acceptAudio(channel: 'system' | 'mic', pcm: Buffer, sampleRate: number, channels?: number): void;
    addCandidateText(text: string, at: number): void;
    noteSpeechStop(at: number): void;
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
        return this.owner === 'pipeline' && available;
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
        } catch {
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
    testConnection(options: { apiKey: string; model?: string }): Promise<LiveBrainSettingsResult>;
}

export function loadLiveBrainPremium(): LiveBrainPremium | null {
    try { return require('../../premium/electron/liveBrain/meeting').liveBrainPremium ?? null; }
    catch { return null; }
}
