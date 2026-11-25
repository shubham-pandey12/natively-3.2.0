/** Metadata carried by the existing What to Answer question event. */
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
    interviewerSpeaking?: boolean;
    responseText?: { text: string; done: boolean };
} & ({ generationId: number } | { askId: string; clarification: string });
