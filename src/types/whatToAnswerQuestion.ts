/** Metadata carried by the existing What to Answer question event. */
export type LiveBrainStatus = 'Listening' | 'Thinking' | 'Answer ready' | 'Reconnecting' | 'Backup brain' | 'Context changed — reconnecting' | 'Backup brain unavailable';

/** D14: a Live Brain interviewer bubble, shown directly above its answer
 *  (`generationId`, once that answer exists). */
export type LiveBrainQuestion = { questionId: string; text: string; done: boolean; generationId?: number; discard?: boolean };

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
    liveBrainQuestion?: LiveBrainQuestion;
    liveBrainAnswerStart?: boolean;
    discard?: boolean;
} & ({ generationId: number } | { askId: string; clarification: string } | { liveBrainStatus: LiveBrainStatus | null } | { liveBrainQuestion: LiveBrainQuestion });
