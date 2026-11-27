const FOLLOW_UP_OPENERS = /^(?:what if|how about|what about|and\b|but\b|so\b|or\b|why did you choose|how come|can it|does it|will it|would it|could it|what happens if|in that case|otherwise|instead)\b/i;
const ANAPHORIC_REFERENT = /\b(?:it|its|that|this|they|them|their|those|these|there|such|the same)\b/i;
const SELF_CONTAINED_NEW_TOPIC = /^(?:design|build|architect|explain|compare|what is the difference between|how does|tell me about|walk me through)\b/i;
const CORRECTION_MARKER = /\b(?:actually|instead|correction|never mind|scratch that|not allowed|no longer|without|rather than|forget|change that)\b/i;

const MAX_PREVIOUS_ANSWER_CHARS = 900;

export interface FluxConfirmedTurn {
    question: string;
    answer?: string;
}

export interface FluxPendingClarification {
    originalQuestion: string;
    clarification: string;
}

export interface FluxTurnContextInput {
    question: string;
    replacesAutomaticAnswer: boolean;
    lastConfirmedTurn?: FluxConfirmedTurn;
    pendingClarification?: FluxPendingClarification;
    constraints?: readonly string[];
    baseNotebook?: string;
}

function truncate(text: string, maxChars: number): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= maxChars) return clean;
    return `${clean.slice(0, maxChars - 1).trimEnd()}…`;
}

export function isCorrectionTurn(question: string): boolean {
    return CORRECTION_MARKER.test(question.trim());
}

export function isFollowUpTurn(question: string): boolean {
    const clean = question.trim();
    if (!clean) return false;
    if (FOLLOW_UP_OPENERS.test(clean)) return true;
    return ANAPHORIC_REFERENT.test(clean);
}

export function isUnrelatedNewTopicForClarification(question: string): boolean {
    const clean = question.trim();
    if (!clean) return false;
    if (isFollowUpTurn(clean) || isCorrectionTurn(clean)) return false;
    return SELF_CONTAINED_NEW_TOPIC.test(clean)
        || /^(?:what|how|why|when|where|who|which|can you|could you|do you)\b/i.test(clean);
}

/**
 * Builds focused turn context for Deepgram Flux + My AI Provider at the AI route
 * boundary:
 *  - Pending clarification reply: original question + clarification + reply.
 *  - Correction: earlier confirmed question + active constraints + correction.
 *  - Follow-up: relevant previous question + previous answer + follow-up.
 *  - Unrelated new topic: returns '' so prior topics do not leak into new questions.
 */
export function buildFluxTurnContext(input: FluxTurnContextInput): string {
    const question = input.question.trim();
    const base = input.baseNotebook?.trim() ?? '';

    if (input.pendingClarification && !isUnrelatedNewTopicForClarification(question)) {
        const block = [
            '<turn_context kind="clarification_reply">',
            `Original question: ${input.pendingClarification.originalQuestion}`,
            `Pending clarification asked: ${input.pendingClarification.clarification}`,
            `Interviewer reply: ${question}`,
            'Answer the original question incorporating this clarification reply directly.',
            '</turn_context>',
        ].join('\n');
        return base ? `${block}\n\n${base}` : block;
    }

    if ((isCorrectionTurn(question) || (input.replacesAutomaticAnswer && isFollowUpTurn(question))) && input.lastConfirmedTurn) {
        const constraints = (input.constraints ?? []).filter(Boolean);
        const lines = [
            '<turn_context kind="correction">',
            `Original confirmed question: ${input.lastConfirmedTurn.question}`,
            ...(constraints.length ? [`Active constraints (newest overrides conflicting earlier rules): ${constraints.join(' | ')}`] : []),
            `Interviewer correction: ${question}`,
            'Preserve the original goal and all unchanged constraints; apply this correction.',
            '</turn_context>',
        ];
        const block = lines.join('\n');
        return base ? `${block}\n\n${base}` : block;
    }

    if (isFollowUpTurn(question) && input.lastConfirmedTurn) {
        const lines = [
            '<turn_context kind="follow_up">',
            `Relevant previous question: ${input.lastConfirmedTurn.question}`,
            ...(input.lastConfirmedTurn.answer ? [`Relevant previous answer: ${truncate(input.lastConfirmedTurn.answer, MAX_PREVIOUS_ANSWER_CHARS)}`] : []),
            `Current follow-up: ${question}`,
            'Ground any pronouns or implicit references in the relevant previous turn above.',
            '</turn_context>',
        ];
        const block = lines.join('\n');
        return base ? `${block}\n\n${base}` : block;
    }

    return '';
}
