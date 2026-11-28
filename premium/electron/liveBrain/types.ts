import type { LiveBrainProvider } from '../../../src/types/liveBrainSettings';

export type { LiveBrainProvider, LiveBrainKeyProvider } from '../../../src/types/liveBrainSettings';
export type LiveBrainId = LiveBrainProvider;

export interface LiveBrainStartContext {
    sessionId: string;
    responseNamespace?: string;
    instructions: string;
    notebook: NotebookSnapshot;
    recentTurns: ConversationTurn[];
    needsFreshContext?(): boolean;
    refreshContext?(): Pick<LiveBrainStartContext, 'instructions' | 'notebook' | 'recentTurns'>;
    signal: AbortSignal;
}

export interface ConversationTurn {
    role: 'interviewer' | 'candidate' | 'assistant';
    text: string;
    at: number; // Epoch milliseconds.
}

export type LiveBrainEvent =
    | { type: 'status'; status: 'connecting' | 'ready' | 'degraded' | 'closed'; detail?: string }
    | { type: 'interviewer_speech_started'; at: number; itemId?: string }
    | { type: 'interviewer_speech_stopped'; at: number; itemId?: string }
    | { type: 'interviewer_transcript'; text: string; final: boolean; at: number; itemId?: string }
    | { type: 'interviewer_barge_in_candidate'; text: string; at: number }
    | { type: 'eager_end_of_turn'; turnKey: string; question: string; at: number }
    | { type: 'turn_resumed'; turnKey: string; at: number }
    | {
        type: 'decision';
        decisionId: string;
        action: 'answer' | 'ask' | 'wait';
        question?: string;
        turnKey?: string;
        clarification?: string;
        kind?: 'new' | 'follow_up' | 'correction';
        at: number;
    }
    | { type: 'provider_response_progress' }
    | { type: 'response_started'; responseId: string; at: number }
    | { type: 'response_delta'; responseId: string; text: string }
    | { type: 'response_done'; responseId: string; status: 'completed' | 'cancelled' | 'failed'; finalText?: string; cancelReason?: 'interviewer_barge_in' | 'manual' | 'rollover' | 'context_revoked' }
    | { type: 'response_silent' }
    | { type: 'session_expiring'; inMs: number; resumable?: false }
    | { type: 'error'; code: LiveBrainErrorCode; fatal: boolean; detail?: string };

export type LiveBrainErrorCode =
    | 'auth' | 'quota' | 'rate_limited' | 'network' | 'protocol' | 'timeout' | 'unsupported';

export interface LiveBrain {
    readonly id: LiveBrainId;
    start(ctx: LiveBrainStartContext): Promise<void>;
    /** 16-bit mono PCM from the interviewer channel. The brain resamples as needed. */
    pushInterviewerAudio(pcm: Int16Array, sampleRate: number): void;
    /** Final candidate utterance, supplied as labelled text. */
    addCandidateText(text: string, at: number): void;
    /** Ask a text-writing provider to continue the interview with a stated assumption. */
    requestClarificationAnswer?(): void;
    requestSessionRollover?(inMs: number): boolean;
    addHistoryContext?(history: string): void;
    /** Ask the provider to cancel the in-flight response. Safe to repeat. */
    cancelResponse(reason: string): void;
    stop(): Promise<void>;
    onEvent(listener: (e: LiveBrainEvent) => void): () => void;
}

export interface NotebookSnapshot {
    topics: string[];
    currentTopic: string | null;
    requirements: string[];
    constraints: string[];
    clarifications: { asked: string; answer: string | null }[];
    decisions: string[];
    answered: string[];
    summary: string;
    updatedAt: number;
}
