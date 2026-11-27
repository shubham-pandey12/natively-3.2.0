import { createResponseParser, type ResponseKind, type ResponseParserEvent } from './responseParser';
import {
    buildFluxTurnContext,
    isCorrectionTurn,
    isFollowUpTurn,
    isUnrelatedNewTopicForClarification,
    type FluxConfirmedTurn,
    type FluxPendingClarification,
} from './fluxTurnContext';
import type { LiveBrainEvent } from './types';

export type AnswerCompletion = 'completed' | 'cancelled' | 'failed';
export type OrchestratorDisposition =
    | { kind: 'answer' | 'ask'; text: string }
    | { kind: 'suppressed' | 'interviewer_already_recorded' };

export interface AnswerWriterPort {
    write(
        request: {
            question: string;
            replacesAutomaticAnswer: boolean;
            turnKey?: string;
        },
        options?: { suppressQuestionRow?: boolean; onFirstText?: (at: number) => void; liveBrainNotebook?: string; contextKey?: string },
    ): {
        generationId: number;
        done: Promise<AnswerCompletion>;
    };
    prepareDraft?(request: { turnKey: string; question: string; liveBrainNotebook?: string; contextKey?: string }): boolean;
    cancelDraft?(reason: string, turnKey?: string): boolean;
    cancel(reason: string): void;
}

export interface LiveBrainOverlayPort {
    showAsk(ask: { askId: string; clarification: string; askStreaming?: boolean }): void;
    setOutdated(generationId: number, outdated: boolean): void;
    setInterviewerSpeaking(generationId: number, speaking: boolean): void;
    /** D14: the interviewer bubble shown directly above its answer. */
    showQuestion?(question: { questionId: string; text: string; done: boolean; generationId?: number }): void;
    showText(response: {
        responseId: string;
        generationId: number;
        text: string;
        done: boolean;
        updated: boolean;
    }): void;
}

export interface ResponseClock<Timer> {
    now(): number;
    setTimeout(callback: () => void, delayMs: number): Timer;
    clearTimeout(timer: Timer): void;
}

interface CurrentAnswer {
    generationId: number;
    source: 'writer' | 'text';
    completedAt?: number;
    outdated: boolean;
    speaking: boolean;
    /** D14: the interviewer spoke while this answer's text was still streaming. */
    cutOff?: boolean;
    /** Superseded answer to fold when the replacement first shows text. */
    pendingOutdatedGenerationId?: number;
}

interface TextResponse {
    id: string;
    parser: ReturnType<typeof createResponseParser>;
    kind?: ResponseKind;
    text: string;
    generationId?: number;
    updated: boolean;
    lastTextAt?: number;
    /** D15: the answer to a filler-only interviewer turn, never shown. */
    suppressed?: boolean;
}

interface QuestionBubble {
    id: string;
    /** Finalized transcript pieces of this turn. */
    base: string;
    /** The provider's growing partial after `base`. */
    live: string;
    /** Still being spoken: more transcript may arrive. */
    open: boolean;
    source: 'provider' | 'stt';
    sttRecorded?: boolean;
    generationId?: number;
    /** Sent to the overlay at least once. */
    shown?: boolean;
}

interface AnswerTurn {
    responseId: string;
    bubble?: QuestionBubble;
    generationId?: number;
    /** The interviewer spoke again, so late transcripts belong to a new turn. */
    superseded: boolean;
}

const RECENT_ANSWER_MS = 20_000;
// D14: text that grew this recently is still streaming. Interviewer speech then
// cuts the answer off, so its replacement marks it outdated.
const MID_STREAM_MS = 1_500;
// An STT final this old is not used as the question of the next answer.
const STT_QUESTION_MAX_AGE_MS = 8_000;
// D15: an interviewer turn made only of these words is filler. An answer to it
// is not shown (the model sometimes repeats its previous answer after a filler
// interrupted its audio turn). Includes Flux/Gemini "MM." / "mm" / "M.M." / "M" variants.
const FILLER_WORD = String.raw`(?:m+-?h+m+|m+\.m+|m+|h+m+|u+h+[\s-]?h+u+h+|uh+|um+|okay|ok|right|yeah|yep|yes|sure|got it|i see|alright|all right|cool|nice|good|great|thank you|thanks)`;
const FILLER_ONLY = new RegExp(String.raw`^${FILLER_WORD}(?:[\s,.!?-]+${FILLER_WORD})*[\s,.!?-]*$`, 'i');

export function isFillerOnly(text: string): boolean {
    const clean = text.trim();
    return /^a\.?$/i.test(clean) || FILLER_ONLY.test(clean);
}
const CLARIFICATION_MS = 10_000;
// The overlay can keep earlier answers when Live Brain is disabled and
// re-enabled in the same meeting. Never reuse a text generation across sessions.
let nextTextGeneration = -1;

export class ResponseOrchestrator<Timer> {
    private current?: CurrentAnswer;
    private response?: TextResponse;
    private readonly seenResponseIds = new Set<string>();
    private clarification?: { timer: Timer };
    private question?: QuestionBubble;
    private answerTurn?: AnswerTurn;
    private sttPending?: { text: string; at: number };
    private questionSequence = 0;
    /** An Ask is waiting for the interviewer: a short "yes" may answer it. */
    private askPending = false;
    private lastConfirmedTurn?: FluxConfirmedTurn;
    private pendingClarification?: FluxPendingClarification;
    private writerClarificationHeardSpeech = false;

    constructor(private readonly ports: {
        answerWriter?: AnswerWriterPort;
        requestClarificationAnswer?: () => void;
        getContextSnapshot?: () => { baseNotebook: string; constraints: readonly string[] };
        cleanupText?: (text: string) => string;
        overlay: LiveBrainOverlayPort;
        clock: ResponseClock<Timer>;
        recordSttQuestion?(text: string, at: number): void;
    }) { }

    handleEvent(event: LiveBrainEvent): OrchestratorDisposition | undefined {
        switch (event.type) {
            case 'interviewer_transcript':
                if (this.noteProviderTranscript(event.text, event.final)) return { kind: 'interviewer_already_recorded' };
                break;
            case 'interviewer_speech_started':
                if (this.answerTurn) this.answerTurn.superseded = true;
                this.noteCutOff();
                if (this.pendingClarification) this.writerClarificationHeardSpeech = true;
                else this.clearClarification();
                if (this.current && this.isRecent(this.current)) this.setSpeaking(this.current, true);
                break;
            case 'eager_end_of_turn': {
                if (!this.ports.answerWriter) return;
                const question = event.question?.trim();
                if (!question) return;
                if (!this.askPending && isFillerOnly(question)) return;
                const replacesAutomaticAnswer = this.current?.source === 'writer' && this.current.completedAt === undefined;
                const turnCtx = this.buildContextForTurn(question, replacesAutomaticAnswer);
                this.ports.answerWriter.prepareDraft?.({
                    turnKey: event.turnKey,
                    question,
                    ...(turnCtx ? { liveBrainNotebook: turnCtx.liveBrainNotebook, contextKey: turnCtx.contextKey } : {}),
                });
                break;
            }
            case 'turn_resumed':
                this.ports.answerWriter?.cancelDraft?.('turn_resumed', event.turnKey);
                break;
            case 'decision':
                if (this.ports.answerWriter) this.handleDecision(event);
                break;
            case 'response_silent':
                this.ports.answerWriter?.cancelDraft?.('silent_turn');
                this.clearClarification();
                this.askPending = false;
                this.pendingClarification = undefined;
                if (this.current) this.setSpeaking(this.current, false);
                this.closeQuestion();
                this.answerTurn = undefined;
                break;
            case 'response_started':
                if (this.seenResponseIds.has(event.responseId)) return;
                this.seenResponseIds.add(event.responseId);
                this.closeTextResponse();
                this.startAnswerTurn(event.responseId);
                this.response = { id: event.responseId, parser: createResponseParser(), text: '', updated: false };
                break;
            case 'response_delta': {
                const response = this.response;
                if (response?.id !== event.responseId) return;
                this.readTextEvents(response, response.parser.push(event.text));
                break;
            }
            case 'response_done': {
                const response = this.response;
                if (response?.id !== event.responseId) return { kind: 'suppressed' };
                // Gemini reports the barge-in cancel before the speech start.
                if (event.status === 'cancelled') this.noteCutOff();
                if (event.status === 'completed') {
                    this.readTextEvents(response, response.parser.finish());
                    if (!response.kind && this.current) this.setSpeaking(this.current, false);
                }
                return this.closeTextResponse(event.status === 'completed', event.status === 'cancelled');
            }
        }
    }

    /** Backup question text from the existing STT (D14). Used only for a turn
     *  the provider left without a transcript. */
    noteSttTranscript(text: string, at: number): void {
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!clean || this.question?.open) return;
        const turn = this.answerTurn;
        if (turn && !turn.bubble && !turn.superseded) {
            turn.bubble = this.createSttBubble(clean, at, turn.generationId);
            return;
        }
        this.sttPending = { text: clean, at };
    }

    reset(): void {
        this.clearClarification();
        this.closeTextResponse();
        this.question = undefined;
        this.answerTurn = undefined;
        this.sttPending = undefined;
        this.askPending = false;
        this.lastConfirmedTurn = undefined;
        this.pendingClarification = undefined;
        this.ports.answerWriter?.cancelDraft?.('auto_disabled_or_meeting_ended');
        const previous = this.current;
        this.current = undefined;
        this.seenResponseIds.clear();
        if (!previous) return;
        this.setSpeaking(previous, false);
        if (previous.source === 'writer' && previous.completedAt === undefined) {
            this.ports.answerWriter?.cancel('auto_disabled_or_meeting_ended');
        }
    }

    replaceWithExternalAnswer(): void {
        this.clearClarification();
        this.askPending = false;
        this.pendingClarification = undefined;
        this.ports.answerWriter?.cancelDraft?.('external_answer');
        this.supersedeForNewTurn(true);
    }

    private handleDecision(event: Extract<LiveBrainEvent, { type: 'decision' }>): void {
        switch (event.action) {
            case 'answer': {
                const question = event.question?.trim();
                if (!question) {
                    this.ports.answerWriter?.cancelDraft?.('empty_decision', event.turnKey);
                    return;
                }
                // D15/D17: filler-only speech does not cancel or replace an active answer,
                // unless an Ask clarification is waiting for a short reply ("Yes.").
                if (!this.askPending && isFillerOnly(question)) {
                    this.ports.answerWriter?.cancelDraft?.('filler_turn', event.turnKey);
                    if (this.current) this.setSpeaking(this.current, false);
                    this.closeQuestion();
                    return;
                }
                this.clearClarification();
                const previous = this.current;
                const deferWriterOutdated = previous?.source === 'writer' && previous.completedAt === undefined;
                const replacesAutomaticAnswer = deferWriterOutdated
                    ? this.cancelActiveWriterForCorrection()
                    : this.supersedeForNewTurn(true);
                const pendingOutdatedGenerationId = replacesAutomaticAnswer
                    ? (previous?.pendingOutdatedGenerationId ?? previous?.generationId)
                    : undefined;
                const turnCtx = this.buildContextForTurn(question, replacesAutomaticAnswer);
                const priorTurn = this.lastConfirmedTurn;
                const correctionLike = isCorrectionTurn(question) || (replacesAutomaticAnswer && isFollowUpTurn(question));
                const clarification = this.pendingClarification;
                const answeringClarification = clarification && !isUnrelatedNewTopicForClarification(question);
                this.pendingClarification = undefined;
                this.askPending = false;
                this.lastConfirmedTurn = answeringClarification
                    ? { question: `${clarification.originalQuestion}\nClarification: ${clarification.clarification} ${question}` }
                    : correctionLike && priorTurn
                        ? { question: `${priorTurn.question}\n${question}`.slice(-2_000) }
                        : { question };
                this.closeTextResponse();
                this.write(
                    question,
                    replacesAutomaticAnswer,
                    event.turnKey,
                    pendingOutdatedGenerationId,
                    turnCtx?.liveBrainNotebook,
                    turnCtx?.contextKey,
                );
                break;
            }
            case 'ask': {
                const clarification = event.clarification?.trim();
                if (clarification) this.showAsk(event.decisionId, clarification, event.question?.trim());
                break;
            }
            case 'wait':
                if (this.current) this.setSpeaking(this.current, false);
                break;
        }
    }

    private showAsk(askId: string, clarification: string, question?: string, askStreaming?: boolean): void {
        this.clearClarification();
        this.supersedeForNewTurn(false);
        this.askPending = true;
        this.ports.overlay.showAsk({ askId, clarification, ...(askStreaming === undefined ? {} : { askStreaming }) });
        if (askStreaming) return;
        const requestAnswer = this.ports.requestClarificationAnswer;
        if (!question && !requestAnswer) return;

        const pending = {
            timer: this.ports.clock.setTimeout(() => {
                if (this.clarification !== pending) return;
                this.clarification = undefined;
                if (requestAnswer) {
                    requestAnswer();
                    return;
                }
                this.replaceCurrent();
                this.closeTextResponse();
                this.write(`${question}\n\nThe interviewer did not clarify; state a reasonable assumption first, then answer.`, false);
            }, CLARIFICATION_MS),
        };
        this.clarification = pending;
    }

    clearClarification(): void {
        if (!this.clarification) return;
        this.ports.clock.clearTimeout(this.clarification.timer);
        this.clarification = undefined;
    }

    /**
     * Called by meeting.ts after the AnswerWriter completes a turn whose text
     * starts with "Ask:" — the writer already streamed the clarification into
     * the overlay, so this only sets `askPending` and starts the timeout that
     * sends a stated-assumption answer if the interviewer does not reply.
     */
    noteWriterClarification(question?: string, clarificationText?: string): void {
        this.clearClarification();
        this.askPending = true;
        this.writerClarificationHeardSpeech = false;
        this.pendingClarification = question && clarificationText
            ? { originalQuestion: question, clarification: clarificationText }
            : undefined;
        if (!question) return;
        const pending = {
            timer: this.ports.clock.setTimeout(() => {
                if (this.clarification !== pending) return;
                this.clarification = undefined;
                this.askPending = false;
                this.pendingClarification = undefined;
                if (this.writerClarificationHeardSpeech) return;
                this.replaceCurrent();
                this.closeTextResponse();
                const context = [
                    `Original question: ${question}`,
                    ...(clarificationText ? [`Clarification asked: ${clarificationText}`] : []),
                    'The interviewer did not clarify; state a reasonable assumption first, then answer.',
                ].join('\n');
                this.write(question, false, undefined, undefined, context);
            }, CLARIFICATION_MS),
        };
        this.clarification = pending;
    }

    noteWriterAnswer(answer: string): void {
        if (this.lastConfirmedTurn && answer.trim()) {
            this.lastConfirmedTurn.answer = answer.trim();
        }
    }

    /**
     * Called by meeting.ts when the Flux provider is switching, reconnecting,
     * or failed fatally. Clears the in-flight writer turn so the new turn
     * starts clean. The caller is responsible for cancelling any active writer
     * stream and draft before calling this.
     */
    endProviderTurn(): void {
        this.clearClarification();
        if (this.current) this.setSpeaking(this.current, false);
        this.closeQuestion();
        this.answerTurn = undefined;
        this.sttPending = undefined;
        this.askPending = false;
        this.pendingClarification = undefined;
    }

    private buildContextForTurn(
        question: string,
        replacesAutomaticAnswer: boolean,
    ): { liveBrainNotebook: string; contextKey: string } | undefined {
        if (!this.ports.getContextSnapshot) return undefined;
        const { baseNotebook, constraints } = this.ports.getContextSnapshot();
        const liveBrainNotebook = buildFluxTurnContext({
            question,
            replacesAutomaticAnswer,
            lastConfirmedTurn: this.lastConfirmedTurn,
            pendingClarification: this.pendingClarification,
            constraints,
            baseNotebook,
        });
        // The current transcript is already keyed separately. Its final event can
        // add these same sentences to the notebook just before confirmation.
        const currentSentences = new Set(question.split(/(?<=[.!?])\s+/u).map(sentence => sentence.slice(0, 170)));
        const contextKey = buildFluxTurnContext({
            question,
            replacesAutomaticAnswer,
            lastConfirmedTurn: this.lastConfirmedTurn,
            pendingClarification: this.pendingClarification,
            constraints: constraints.filter(constraint => !currentSentences.has(constraint)),
        });
        return { liveBrainNotebook, contextKey };
    }

    private isRecent(answer: CurrentAnswer): boolean {
        return answer.completedAt === undefined || this.ports.clock.now() - answer.completedAt < RECENT_ANSWER_MS;
    }

    private setSpeaking(answer: CurrentAnswer, speaking: boolean): void {
        if (answer.speaking === speaking) return;
        answer.speaking = speaking;
        this.ports.overlay.setInterviewerSpeaking(answer.generationId, speaking);
    }

    private markCurrentOutdated(): boolean {
        const previous = this.current;
        if (!previous) return false;
        this.setSpeaking(previous, false);
        if (!this.isRecent(previous)) return false;
        if (!previous.outdated) {
            previous.outdated = true;
            this.ports.overlay.setOutdated(previous.generationId, true);
        }
        return true;
    }

    private isFillerTurn(response: TextResponse): boolean {
        const bubble = this.answerTurn?.responseId === response.id ? this.answerTurn.bubble : undefined;
        if (!bubble || this.askPending) return false;
        return isFillerOnly(joinText(bubble.base, bubble.live));
    }

    private noteCutOff(): void {
        const current = this.current;
        const response = this.response;
        if (current?.source !== 'text' || response?.generationId !== current.generationId) return;
        if (response.lastTextAt !== undefined && this.ports.clock.now() - response.lastTextAt < MID_STREAM_MS) {
            current.cutOff = true;
        }
    }

    /** D14 chat: a new realtime answer or Ask keeps the previous answer visible.
     *  Only an answer the interviewer cut off mid-stream is marked outdated.
     *  `clear` also ends the previous answer as the current one. */
    private supersedeForNewTurn(clear: boolean): boolean {
        const previous = this.current;
        if (previous?.source === 'text' && !previous.cutOff) {
            this.setSpeaking(previous, false);
            if (clear) this.current = undefined;
            return false;
        }
        if (previous?.source === 'writer' && previous.completedAt !== undefined && !previous.cutOff) {
            this.setSpeaking(previous, false);
            if (clear) this.current = undefined;
            return false;
        }
        return clear ? this.replaceCurrent() : this.markCurrentOutdated();
    }

    private cancelActiveWriterForCorrection(): boolean {
        const previous = this.current;
        if (!previous) return false;
        this.setSpeaking(previous, false);
        this.current = undefined;
        if (previous.source === 'writer' && previous.completedAt === undefined) {
            this.ports.answerWriter?.cancel('answer_corrected');
        }
        return true;
    }

    private replaceCurrent(): boolean {
        const replaced = this.markCurrentOutdated();
        const previous = this.current;
        this.current = undefined;
        if (previous?.source === 'writer' && previous.completedAt === undefined) {
            this.ports.answerWriter?.cancel('answer_corrected');
        }
        return replaced;
    }

    private write(
        question: string,
        replacesAutomaticAnswer: boolean,
        turnKey?: string,
        pendingOutdatedGenerationId?: number,
        liveBrainNotebook?: string,
        contextKey?: string,
    ): void {
        const writer = this.ports.answerWriter;
        if (!writer) return;
        this.askPending = false;
        const bubble = this.question && this.question.generationId === undefined ? this.question : undefined;
        if (bubble) this.closeQuestion();
        const request = { question, replacesAutomaticAnswer, ...(turnKey ? { turnKey } : {}) };
        const answer: CurrentAnswer = {
            generationId: 0,
            source: 'writer',
            outdated: false,
            speaking: false,
            ...(pendingOutdatedGenerationId !== undefined ? { pendingOutdatedGenerationId: pendingOutdatedGenerationId } : {}),
        };
        const writeOptions: { suppressQuestionRow?: boolean; onFirstText?: (at: number) => void; liveBrainNotebook?: string; contextKey?: string } = {
            ...(bubble ? { suppressQuestionRow: true } : {}),
            ...(liveBrainNotebook !== undefined ? { liveBrainNotebook } : {}),
            ...(contextKey !== undefined ? { contextKey } : {}),
            ...(pendingOutdatedGenerationId !== undefined ? {
                onFirstText: () => {
                    if (answer.generationId !== 0 && this.current !== answer) return;
                    const toFold = answer.pendingOutdatedGenerationId;
                    answer.pendingOutdatedGenerationId = undefined;
                    if (toFold !== undefined) {
                        this.ports.overlay.setOutdated(toFold, true);
                    }
                },
            } : {}),
        };
        const { generationId, done } = Object.keys(writeOptions).length > 0
            ? writer.write(request, writeOptions)
            : writer.write(request);
        answer.generationId = generationId;
        if (bubble) {
            bubble.generationId = generationId;
            this.emitQuestion(bubble);
        }
        this.current = answer;
        const settle = (status: AnswerCompletion) => {
            if (this.current !== answer) return;
            this.setSpeaking(answer, false);
            if (status === 'completed') {
                answer.completedAt = this.ports.clock.now();
                return;
            }
            this.current = undefined;
        };
        void done.then(settle, () => settle('failed'));
    }

    private readTextEvents(response: TextResponse, events: ResponseParserEvent[]): void {
        for (const event of events) {
            if (event.type === 'kind') {
                response.kind = event.kind;
                if (event.kind === 'wait' && this.current) this.setSpeaking(this.current, false);
            } else {
                response.text += event.text;
                response.lastTextAt = this.ports.clock.now();
            }
        }
        if (!events.some(event => event.type === 'text')) return;
        if (response.kind === 'ask' && response.text.trim()) {
            this.showAsk(response.id, response.text.trimStart(), undefined, true);
            return;
        }
        if (response.kind !== 'answer' || response.suppressed) return;
        if (response.generationId === undefined && this.isFillerTurn(response)) {
            response.suppressed = true;
            return;
        }
        if (response.generationId === undefined) {
            this.askPending = false;
            this.clearClarification();
            response.updated = this.supersedeForNewTurn(true);
            response.generationId = nextTextGeneration--;
            this.current = { generationId: response.generationId, source: 'text', outdated: false, speaking: false };
            const turn = this.answerTurn;
            if (turn?.responseId === response.id) {
                turn.generationId = response.generationId;
                if (turn.bubble) {
                    turn.bubble.generationId = response.generationId;
                    this.emitQuestion(turn.bubble);
                }
            }
        }
        this.showText(response, false);
    }

    private noteProviderTranscript(text: string, final: boolean): boolean | undefined {
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!clean) return;
        const open = this.question?.open ? this.question : undefined;
        if (open) {
            if (final) { open.base = joinText(open.base, clean); open.live = ''; }
            else open.live = clean;
            this.emitQuestion(open);
            return;
        }
        // A provider that transcribes after speech end (OpenAI Whisper) can
        // deliver the question after its answer started: put it above that answer.
        const turn = this.answerTurn;
        if (final && turn && !turn.superseded && turn.bubble?.source !== 'provider') {
            if (turn.bubble) {
                turn.bubble.base = clean;
                turn.bubble.live = '';
                turn.bubble.source = 'provider';
                this.emitQuestion(turn.bubble);
            } else {
                turn.bubble = this.createBubble(clean, 'provider', false, turn.generationId);
            }
            return turn.bubble.sttRecorded;
        }
        this.sttPending = undefined;
        this.createBubble(clean, 'provider', true, undefined, !final);
    }

    /** `open` bubbles keep growing until their answer starts. */
    private createBubble(text: string, source: QuestionBubble['source'], open: boolean, generationId?: number, partial = false): QuestionBubble {
        const bubble: QuestionBubble = {
            id: `q${++this.questionSequence}`,
            base: partial ? '' : text,
            live: partial ? text : '',
            open,
            source,
            ...(generationId === undefined ? {} : { generationId }),
        };
        this.question = bubble;
        this.emitQuestion(bubble);
        return bubble;
    }

    private createSttBubble(text: string, at: number, generationId?: number): QuestionBubble {
        const bubble = this.createBubble(text, 'stt', false, generationId);
        if (bubble.shown && this.ports.recordSttQuestion) {
            bubble.sttRecorded = true;
            this.ports.recordSttQuestion(text, at);
        }
        return bubble;
    }

    private startAnswerTurn(responseId: string): void {
        let bubble = this.question?.open ? this.question : undefined;
        if (bubble) this.closeQuestion();
        else {
            const pending = this.sttPending;
            if (pending && this.ports.clock.now() - pending.at <= STT_QUESTION_MAX_AGE_MS) {
                bubble = this.createSttBubble(pending.text, pending.at);
            }
        }
        this.sttPending = undefined;
        this.answerTurn = { responseId, superseded: false, ...(bubble ? { bubble } : {}) };
    }

    private closeQuestion(): void {
        const bubble = this.question;
        if (!bubble?.open) return;
        bubble.open = false;
        bubble.base = joinText(bubble.base, bubble.live);
        bubble.live = '';
        this.emitQuestion(bubble);
    }

    private emitQuestion(bubble: QuestionBubble): void {
        const text = joinText(bubble.base, bubble.live);
        if (!text) return;
        // D15: filler-only speech ("Mm-hmm.", "Okay.") stays out of the chat. A
        // bubble appears once its text is more than filler ("Okay, short one…"),
        // and a short reply to a waiting Ask ("Yes.") is still shown.
        if (!bubble.shown && !this.askPending && isFillerOnly(text)) return;
        bubble.shown = true;
        this.ports.overlay.showQuestion?.({
            questionId: bubble.id, text, done: !bubble.open,
            ...(bubble.generationId === undefined ? {} : { generationId: bubble.generationId }),
        });
    }

    private closeTextResponse(completed = false, cancelled = false): OrchestratorDisposition {
        const response = this.response;
        this.response = undefined;
        if (response?.kind === 'ask' && response.text.trim()) {
            const clarification = response.text.trim();
            if (completed) this.showAsk(response.id, clarification, undefined, false);
            else this.ports.overlay.showAsk({ askId: response.id, clarification, askStreaming: false });
            if (completed || cancelled) return { kind: 'ask', text: clarification };
        }
        if (response?.generationId === undefined) return { kind: 'suppressed' };
        if (completed && response.kind === 'answer' && !response.suppressed && this.ports.cleanupText && response.text.trim()) {
            try {
                const cleaned = this.ports.cleanupText(response.text);
                if (cleaned.trim()) response.text = cleaned;
            } catch { /* cleanup never blocks live delivery */ }
        }
        if (this.current?.generationId === response.generationId) {
            this.current.completedAt = this.ports.clock.now();
        }
        this.showText(response, true);
        return (completed || cancelled) && response.kind === 'answer' && !response.suppressed
            ? { kind: 'answer', text: response.text }
            : { kind: 'suppressed' };
    }

    private showText(response: TextResponse, done: boolean): void {
        if (response.generationId === undefined) return;
        this.ports.overlay.showText({
            responseId: response.id,
            generationId: response.generationId,
            text: response.text,
            done,
            updated: response.updated,
        });
    }
}

function joinText(a: string, b: string): string {
    return [a, b].filter(Boolean).join(' ');
}
