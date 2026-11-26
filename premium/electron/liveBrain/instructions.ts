import {
    CONTEXT_INTELLIGENCE_LAYER,
    CORE_IDENTITY,
    EXECUTION_CONTRACT,
    HUMAN_SPOKEN_ANSWER_CONTRACT,
    MODE_TECHNICAL_INTERVIEW_PROMPT,
    UNIVERSAL_WHAT_TO_ANSWER_PROMPT,
} from '../../../electron/llm/prompts';
import { ASK_SENTINEL, NO_ACTION_SENTINEL } from './responseParser';

interface LiveContext {
    modeName?: string;
    notebookText?: string;
}

interface DeciderContext extends LiveContext {
    profileSummary?: string;
}

interface AnswerContext extends LiveContext {
    profileContext?: string;
    modePrompt?: string;
    modeContext?: string;
    /**
     * The active mode's TEMPLATE id (e.g. 'technical-interview', see
     * electron/context-intelligence/policies/mode-policy-registry.ts). Not the
     * mode's name: names are user-chosen labels ("My Google interview") and
     * cannot select a prompt.
     */
    modeTemplate?: string;
}

const LIVE_PREAMBLE = 'You are listening to a live interview. The audio is the interviewer. Text lines beginning “Candidate said:” are the candidate.';
const CLARIFICATION_RULE = 'Ask for clarification only when missing information materially changes the answer. Ask one short question. Never repeat a clarification or ask for information already supplied.';
const CORRECTION_RULE = 'The newest interviewer instruction overrides earlier requirements.';
export const CLARIFICATION_ASSUMPTION = 'The interviewer did not clarify; state a reasonable assumption first, then answer the original interviewer question.';

function contextBlocks(ctx: LiveContext, profile?: string): string {
    const fields = [
        ['Interview mode', ctx.modeName],
        ['Candidate profile context', profile],
        ['Interview notebook', ctx.notebookText],
    ] as const;
    return fields.reduce((result, [label, value]) => {
        const content = value?.trim();
        return content ? `${result}\n\n${label}:\n${content}` : result;
    }, '');
}

export function buildDeciderInstructions(ctx: DeciderContext): string {
    return `${LIVE_PREAMBLE}
At every end of an interviewer turn, call decide_turn exactly once. Never speak an answer or a clarification.
- answer: a real question or request. Put the self-contained question in question, folding in corrections and relevant follow-up context.
- ask: put the one short clarification in clarification and the self-contained interviewer question it clarifies in question. ${CLARIFICATION_RULE}
- wait: small talk, filler, or the interviewer has not finished.
${CORRECTION_RULE}
In question, the interviewer's latest correction replaces earlier conflicting constraints. Drop the replaced constraint and never carry both.${contextBlocks(ctx, ctx.profileSummary)}`;
}

export function buildAnswerInstructions(ctx: AnswerContext, variant: 'full' | 'trimmed', output: 'text' | 'spoken' = 'text'): string {
    const technicalInterview = ctx.modeTemplate?.trim().toLowerCase() === 'technical-interview';
    // Trimmed omits the universal prompt's intent-by-scenario, discovery, and
    // closing examples, its shared coding rules, and the Technical Interview
    // mode's dedicated hierarchy and coding/system-design formats. It keeps
    // the core identity, execution, context, and both spoken style contracts.
    const base = variant === 'full'
        ? [UNIVERSAL_WHAT_TO_ANSWER_PROMPT, technicalInterview ? MODE_TECHNICAL_INTERVIEW_PROMPT : HUMAN_SPOKEN_ANSWER_CONTRACT,
            technicalInterview ? '' : ctx.modePrompt ?? '']
        : [CORE_IDENTITY, EXECUTION_CONTRACT, CONTEXT_INTELLIGENCE_LAYER, HUMAN_SPOKEN_ANSWER_CONTRACT];

    const format = output === 'spoken'
        ? `Speak only what the candidate should say next, without reading formatting aloud.
For filler, small talk, or an unfinished interviewer question, say nothing or say exactly "No action."
For a clarification, start with "Ask:" and say only the clarification question.
Otherwise, speak the answer directly without a sentinel.`
        : `Write what the candidate should say next. Output text only.
For small talk, filler, or an unfinished interviewer turn, output only ${NO_ACTION_SENTINEL}.
For a clarification, start with ${ASK_SENTINEL} and write only the clarification question.
Otherwise, write the answer directly without a sentinel.`;
    const protocol = `${format}
${CLARIFICATION_RULE} If the interviewer moves on without clarifying, answer with a stated assumption.
${CORRECTION_RULE}
If an earlier instruction conflicts with this live turn protocol, follow the live turn protocol.`;

    const modeContext = ctx.modeContext?.trim();
    return `${LIVE_PREAMBLE}\n\n${base.map(block => block.trim()).filter(Boolean).join('\n\n')}\n\n${protocol}${contextBlocks(ctx, ctx.profileContext)}${modeContext ? `\n\n${modeContext}` : ''}`;
}
