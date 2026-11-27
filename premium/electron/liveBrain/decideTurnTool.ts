import type { LiveBrainEvent } from './types';

type DecisionKind = NonNullable<Extract<LiveBrainEvent, { type: 'decision' }>['kind']>;

/** @deprecated D12 superseded D10/D11; spike/tests only, not used at runtime. */
export type Decision =
    | { action: 'answer'; question: string; kind?: DecisionKind }
    | { action: 'ask'; clarification: string; question?: string; kind?: DecisionKind }
    | { action: 'wait'; kind?: DecisionKind };

const QUESTION_MAX_LENGTH = 2_000;
const CLARIFICATION_MAX_LENGTH = 300;
const ACTIONS = ['answer', 'ask', 'wait'] as const;
const KINDS = ['new', 'follow_up', 'correction'] as const;

/** @deprecated D12 superseded D10/D11; spike/tests only, not used at runtime. */
export const DECIDE_TURN_TOOL = {
    name: 'decide_turn',
    description: 'Decide what the candidate needs after an interviewer turn.',
    parameters: {
        type: 'object',
        properties: {
            action: { type: 'string', enum: ACTIONS },
            question: {
                type: 'string',
                description: 'For answer and ask, supply the self-contained interviewer question with follow-up context and corrections. Required for answer.',
                maxLength: QUESTION_MAX_LENGTH,
            },
            clarification: {
                type: 'string',
                description: 'Required for ask. One short question for the candidate to ask.',
                maxLength: CLARIFICATION_MAX_LENGTH,
            },
            kind: { type: 'string', enum: KINDS },
        },
        required: ['action'],
    },
} as const;

/** @deprecated D12 superseded D10/D11; spike/tests only, not used at runtime. */
export function toGeminiDecideTurnTool() {
    const { name, description, parameters } = DECIDE_TURN_TOOL;
    return { functionDeclarations: [{ name, description, parametersJsonSchema: parameters }] };
}

function limitedText(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return '';
    const text = value.trim().slice(0, maxLength);
    // Avoid splitting an astral character at the UTF-16 cap.
    return text.replace(/[\uD800-\uDBFF]$/, '').trimEnd();
}

/** @deprecated D12 superseded D10/D11; spike/tests only, not used at runtime. */
export function parseDecideTurnArgs(raw: unknown): Decision | null {
    let value: unknown = raw;
    if (typeof raw === 'string') {
        try { value = JSON.parse(raw); } catch { return null; }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, 'action')) return null;

    const { action, question, clarification, kind } = value as Record<string, unknown>;
    const parsedKind = KINDS.find(option => option === (typeof kind === 'string' ? kind.trim() : kind));
    const metadata = parsedKind ? { kind: parsedKind } : {};
    switch (typeof action === 'string' ? action.trim() : action) {
        case 'answer': {
            const text = limitedText(question, QUESTION_MAX_LENGTH);
            return text ? { action: 'answer', question: text, ...metadata } : null;
        }
        case 'ask': {
            const text = limitedText(clarification, CLARIFICATION_MAX_LENGTH);
            if (!text) return null;
            const askedQuestion = limitedText(question, QUESTION_MAX_LENGTH);
            return { action: 'ask', clarification: text, ...(askedQuestion ? { question: askedQuestion } : {}), ...metadata };
        }
        case 'wait':
            return { action: 'wait', ...metadata };
        default:
            return null;
    }
}
