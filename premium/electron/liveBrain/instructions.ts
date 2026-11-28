import { SPOKEN_INTERVIEW_STYLE, SPOKEN_INTERVIEW_BACKGROUND, withSpokenInterviewRules } from '../../../electron/llm/answerStyle';
import {
    CONTEXT_INTELLIGENCE_LAYER,
    CORE_IDENTITY,
    EXECUTION_CONTRACT,
    HUMAN_SPOKEN_ANSWER_CONTRACT,
    MODE_TECHNICAL_INTERVIEW_PROMPT,
    UNIVERSAL_WHAT_TO_ANSWER_PROMPT,
} from '../../../electron/llm/prompts';
import type { DeepgramThinkMode } from '../../../src/types/liveBrainSettings';
import { ASK_SENTINEL } from './responseParser';
import type { LiveBrainId } from './types';

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
    standingSkills?: string;
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

// Keep the language exercised in the ElevenLabs Mini sentinel check.
const ELEVENLABS_TURN_OUTPUT = 'MANDATORY TURN OUTPUT: Never greet, acknowledge, or offer help. If a design question has multiple materially different scopes and no scope was supplied, begin with the exact prefix Ask: followed by a single short question, then stop and wait. Do not answer or assume a scope in that turn.';

// Live check 2026-11-26: a "Mm-hmm." during Gemini's open audio turn counted as
// an interruption, and Gemini then repeated its previous answer.
export const FILLER_TURN_RULE = 'MANDATORY FILLER RULE: If the entire interviewer turn is only an acknowledgment or filler (for example: mm-hmm, uh-huh, okay, right, yeah, sure, got it, thank you), is small talk, or is an unfinished question, output exactly No action. and nothing else. After an interruption, never repeat, continue, or rephrase your previous answer because of a filler turn. If you previously asked a clarification (Ask:) and the interviewer replies briefly (e.g. \'yes\', \'the second one\', \'Postgres\'), that reply is NOT filler — answer the original question using it.';

export const DEEPGRAM_MAX_MANAGED_PROMPT_CHARS = 25_000;

const CONTEXT_TRUNCATED = '\n\n[context truncated]';

export function buildDeepgramInstructions(ctx: AnswerContext): string {
    const base = [CORE_IDENTITY, EXECUTION_CONTRACT, HUMAN_SPOKEN_ANSWER_CONTRACT]
        .map(block => block.trim())
        .filter(Boolean)
        .join('\n\n');
    const core = `${LIVE_PREAMBLE}\n\n${base}\n\n${turnProtocol('spoken')}\n\n${FILLER_TURN_RULE}`;
    const blocks = [
        ctx.modePrompt?.trim(),
        contextBlocks({ modeName: ctx.modeName }).trim(),
        contextBlocks({ notebookText: ctx.notebookText }).trim(),
        contextBlocks({}, ctx.profileContext).trim(),
        ...modeContextBlocks(ctx.modeContext),
    ].filter((block): block is string => Boolean(block));
    return fitManagedPrompt(core, blocks);
}

function fitManagedPrompt(core: string, blocks: string[], closing = ''): string {
    const limit = DEEPGRAM_MAX_MANAGED_PROMPT_CHARS - closing.length;
    if (core.length > limit) throw new Error('Deepgram managed prompt rules exceed the character limit.');
    const fullLength = core.length + closing.length + blocks.reduce((length, block) => length + 2 + block.length, 0);
    if (fullLength <= DEEPGRAM_MAX_MANAGED_PROMPT_CHARS) return [core, ...blocks].join('\n\n') + closing;
    console.warn(`[LiveBrain] Deepgram managed prompt length (${fullLength}) exceeds ${DEEPGRAM_MAX_MANAGED_PROMPT_CHARS} chars; trimming runtime context.`);

    if (core.length + CONTEXT_TRUNCATED.length > limit) return core + closing;

    let prompt = core;
    for (const block of blocks) {
        const remaining = limit - prompt.length - CONTEXT_TRUNCATED.length - 2;
        if (block.length <= remaining) {
            prompt += `\n\n${block}`;
            continue;
        }
        if (!/<(?:reference_file|active_mode_custom_instructions|standing_skills)\b/u.test(block) && remaining > 0) {
            const newline = block.lastIndexOf('\n', remaining);
            if (newline > 0) prompt += `\n\n${block.slice(0, newline).trimEnd()}`;
        }
        break;
    }
    return prompt + CONTEXT_TRUNCATED + closing;
}

export function buildProviderInstructions(
    ctx: AnswerContext,
    variant: 'full' | 'trimmed',
    id: LiveBrainId,
    deepgramThinkMode?: DeepgramThinkMode,
): string {
    if (id === 'deepgram-flux') return '';
    if (id === 'pipeline') return `${buildAnswerInstructions(ctx, variant, 'spoken')}\n\n${FILLER_TURN_RULE}`;
    return buildLiveCandidateInstructions(ctx, id === 'openai-realtime' ? 'text' : 'spoken', {
        elevenLabs: id === 'elevenlabs-realtime',
        managedDeepgram: id === 'deepgram-voice-agent' && deepgramThinkMode !== 'byo',
    });
}

const LIVE_CANDIDATE_ROLE = `You are the candidate in a live job interview. You hear the interviewer. Text lines beginning 'Candidate said:' are things you already said. Say exactly what you would say out loud next, as yourself, in first person.`;
const LIVE_CANDIDATE_CLOSING = '\n\nRemember: you are talking, not writing. Simple Indian English, natural and real. Sound like yourself.';

export function buildLiveCandidateInstructions(
    ctx: AnswerContext,
    output: 'text' | 'spoken',
    options: { elevenLabs?: boolean; managedDeepgram?: boolean } = {},
): string {
    const core = [
        LIVE_CANDIDATE_ROLE, SPOKEN_INTERVIEW_STYLE, SPOKEN_INTERVIEW_BACKGROUND, turnProtocol(output), FILLER_TURN_RULE,
        options.elevenLabs ? ELEVENLABS_TURN_OUTPUT : '',
    ].filter(Boolean).join('\n\n');
    const skills = ctx.standingSkills?.trim();
    const blocks = [
        contextBlocks({ modeName: ctx.modeName }).trim(),
        contextBlocks({}, ctx.profileContext).trim(),
        contextBlocks({ notebookText: ctx.notebookText }).trim(),
        ...modeContextBlocks(ctx.modeContext),
        skills ? `Standing skills:\n<standing_skills>\n${skills}\n</standing_skills>` : '',
    ].filter(Boolean);
    return options.managedDeepgram
        ? fitManagedPrompt(core, blocks, LIVE_CANDIDATE_CLOSING)
        : [core, ...blocks].join('\n\n') + LIVE_CANDIDATE_CLOSING;
}

function modeContextBlocks(modeContext?: string): string[] {
    // ModesManager emits complete tagged blocks for custom instructions and each reference.
    return modeContext?.trim().split(/\n\n(?=<(?:reference_file|active_mode_custom_instructions)\b)/u).filter(Boolean) ?? [];
}

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

/** @deprecated D12 superseded D10/D11; spike/tests only, not used at runtime. */
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

    const modeContext = ctx.modeContext?.trim();
    return withSpokenInterviewRules(`${LIVE_PREAMBLE}\n\n${base.map(block => block.trim()).filter(Boolean).join('\n\n')}\n\n${turnProtocol(output)}${contextBlocks(ctx, ctx.profileContext)}${modeContext ? `\n\n${modeContext}` : ''}`);
}

function turnProtocol(output: 'text' | 'spoken'): string {
    const format = output === 'spoken'
        ? `Speak only what the candidate should say next, without reading formatting aloud.
For a clarification, start with "Ask:" and say only the clarification question.
Otherwise, speak the answer directly without a sentinel.`
        : `Write what the candidate should say next. Output text only.
For a clarification, start with ${ASK_SENTINEL} and write only the clarification question.
Otherwise, write the answer directly without a sentinel.`;
    return `${format}
${CLARIFICATION_RULE} If the interviewer moves on without clarifying, answer with a stated assumption.
${CORRECTION_RULE}
If an earlier instruction conflicts with this live turn protocol, follow the live turn protocol.`;
}
