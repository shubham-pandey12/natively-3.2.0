const FOLLOW_UP_OPENERS = /^(?:what if|how about|what about|and\b|but\b|so\b|or\b|why did you choose|how come|can it|does it|will it|would it|could it|what happens if|in that case|otherwise|instead)\b/i;
const ANAPHORIC_REFERENT = /\b(?:it|its|that|this|they|them|their|those|these|there|such|the same)\b/i;
const SELF_CONTAINED_NEW_TOPIC = /^(?:design|build|architect|explain|compare|what is the difference between|how does|tell me about|walk me through)\b/i;
const WH_QUESTION = /^(?:what|how|why|when|where|who|which|can you|could you|do you)\b/i;
const STRONG_CORRECTION = /\b(?:actually|correction|never mind|scratch that|forget|change that)\b/i;
const WEAK_CORRECTION = /\b(?:without|instead|rather than|not allowed|no longer)\b/i;
const PRIOR_TURN_REFERENCE = /\b(?:the previous|that design)\b/i;

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
    /** Earlier answered turns, oldest first. */
    recentTurns?: readonly FluxConfirmedTurn[];
    /** @deprecated use recentTurns */
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
    const clean = question.trim();
    if (STRONG_CORRECTION.test(clean.split(/\s+/, 5).join(' '))) return true;
    return WEAK_CORRECTION.test(clean)
        && (!startsNewTopic(clean) || ANAPHORIC_REFERENT.test(clean) || PRIOR_TURN_REFERENCE.test(clean));
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
    return startsNewTopic(clean);
}

function startsNewTopic(question: string): boolean {
    return SELF_CONTAINED_NEW_TOPIC.test(question) || WH_QUESTION.test(question);
}

/** How many earlier answered turns the provider sees (oldest dropped first). */
export const MAX_RECENT_TURNS = 4;
const MAX_HISTORY_ANSWER_CHARS = 600;

/**
 * Builds turn context for Deepgram Flux + My AI Provider at the AI route
 * boundary, so the provider can behave like a realtime brain that heard the
 * whole conversation:
 *  - Pending clarification reply: original question + clarification + reply
 *    (this is app state, not a guess, so it stays explicit).
 *  - Otherwise, when there is history: the last few questions and answers, and
 *    the model itself decides whether the current turn is a follow-up, a
 *    correction, a new topic or filler. Regex labels guessed wrong (an
 *    interrupting follow-up labelled a correction made the model merge two
 *    questions into one answer), so the decision moved to the model.
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

    const turns = (input.recentTurns ?? (input.lastConfirmedTurn ? [input.lastConfirmedTurn] : []))
        .filter(turn => turn.question.trim())
        .slice(-MAX_RECENT_TURNS);
    if (!turns.length && !base) return '';

    const constraints = (input.constraints ?? []).filter(Boolean);
    const lines = [
        '<turn_context kind="conversation">',
        turns.length ? 'Recent interview turns, oldest first:' : 'Use the shared interview conversation below for prior turns.',
        ...turns.flatMap((turn, index) => [
            `Q${index + 1}: ${truncate(turn.question, MAX_HISTORY_ANSWER_CHARS)}`,
            `A${index + 1}: ${turn.answer?.trim() ? truncate(turn.answer, MAX_HISTORY_ANSWER_CHARS) : '(no answer was given; it may have been interrupted)'}`,
        ]),
        ...(constraints.length ? [`Active constraints (newest overrides conflicting earlier rules): ${constraints.join(' | ')}`] : []),
        `Current interviewer turn: ${question}`,
        'Decide yourself how the current turn relates to the turns above:',
        '- Follow-up: answer only the current turn; resolve pronouns and implicit references ("it", "that project") from the turns above.',
        '- Correction or changed requirement: re-answer the earlier question with the change applied, keeping every unchanged constraint.',
        '- New topic: answer it on its own and ignore the turns above.',
        'Never repeat or re-answer an earlier question unless the current turn asks for it, and do not reuse earlier wording.',
        '</turn_context>',
    ];
    const block = lines.join('\n');
    return base ? `${block}\n\n${base}` : block;
}
