import type { WhatToAnswerQuestionEvent } from '../../../src/types/whatToAnswerQuestion';
import type { LiveBrainOverlayPort } from './ResponseOrchestrator';

/** Adapts the ports to the existing What to Answer bridge. The caller owns delivery. */
export function createLiveBrainOverlayPort(bridge: {
    emitQuestion(event: WhatToAnswerQuestionEvent): void;
    setAutomaticAnswerOutdated(generationId: number, outdated: boolean): void;
    discard?(generationId: number, reason: string): void;
}): LiveBrainOverlayPort {
    return {
        showAsk: ask => bridge.emitQuestion(ask),
        showQuestion: liveBrainQuestion => bridge.emitQuestion({ liveBrainQuestion }),
        setOutdated: (generationId, outdated) => bridge.setAutomaticAnswerOutdated(generationId, outdated),
        setInterviewerSpeaking: (generationId, interviewerSpeaking) => bridge.emitQuestion({ generationId, interviewerSpeaking }),
        showText: ({ generationId, text, done, updated }) => bridge.emitQuestion({
            generationId,
            responseText: { text, done },
            updated,
        }),
        ...(bridge.discard ? { discard: (generationId, reason) => bridge.discard!(generationId, reason) } : {}),
    };
}
