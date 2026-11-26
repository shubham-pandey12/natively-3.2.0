/** Metadata carried by the existing What to Answer question event. */
export type LiveBrainStatus = 'Listening' | 'Thinking' | 'Answer ready' | 'Reconnecting' | 'Backup brain';

export type WhatToAnswerQuestionEvent = {
    generationId?: number;
    question?: string;
    overlayQuestionId?: string;
    pending?: boolean;
    failed?: boolean;
    outdated?: boolean;
    updated?: boolean;
    askId?: string;
    clarification?: string;
    askStreaming?: boolean;
    interviewerSpeaking?: boolean;
    responseText?: { text: string; done: boolean };
    liveBrainStatus?: LiveBrainStatus | null;
} & ({ generationId: number } | { askId: string; clarification: string } | { liveBrainStatus: LiveBrainStatus | null });
