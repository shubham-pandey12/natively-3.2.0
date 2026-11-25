import type { WhatToAnswerQuestionEvent } from '../../../src/types/whatToAnswerQuestion';
import type { LiveBrainOverlayPort } from './ResponseOrchestrator';

/** Adapts the ports to the existing What to Answer bridge. The caller owns delivery. */
export function createLiveBrainOverlayPort(bridge: {
    emitQuestion(event: WhatToAnswerQuestionEvent): void;
    setAutomaticAnswerOutdated(generationId: number, outdated: boolean): void;
}): LiveBrainOverlayPort {
    return {
        showAsk: ({ askId, clarification }) => bridge.emitQuestion({ askId, clarification }),
        setOutdated: (generationId, outdated) => bridge.setAutomaticAnswerOutdated(generationId, outdated),
        setInterviewerSpeaking: (generationId, interviewerSpeaking) => bridge.emitQuestion({ generationId, interviewerSpeaking }),
        showText: ({ generationId, text, done, updated }) => bridge.emitQuestion({
            generationId,
            responseText: { text, done },
            updated,
        }),
    };
}
