import { createResponseParser, type ResponseKind, type ResponseParserEvent } from './responseParser';
import {
    buildFluxTurnContext,
    isCorrectionTurn,
    isUnrelatedNewTopicForClarification,
    type FluxConfirmedTurn,
    MAX_RECENT_TURNS,
    type FluxPendingClarification,
} from './fluxTurnContext';
import type { LiveBrainReplacement } from '../../../src/types/whatToAnswerQuestion';
import type { LiveBrainEvent } from './types';
import type { MeetingTurnIdentity } from '../../../electron/SessionTracker';

export type AnswerCompletion = 'completed' | 'cancelled' | 'failed';
export type OrchestratorDisposition =
    | { kind: 'answer' | 'ask'; text: string }
    | { kind: 'suppressed' }
    | { kind: 'interviewer_already_recorded' | 'interviewer_confirmed'; deferredAnswer?: string; deferredAsk?: boolean };

export interface AnswerWriterPort {
    write(
        request: {
            question: string;
            replacesAutomaticAnswer: boolean;
            turnKey?: string;
            meetingTurn?: MeetingTurnIdentity;
            replacesMeetingTurn?: MeetingTurnIdentity;
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
    discardAsk?(askId: string): void;
    replaceAnswer?(generationId: number, replacement: LiveBrainReplacement): void;
    setOutdated(generationId: number, outdated: boolean): void;
    setInterviewerSpeaking(generationId: number, speaking: boolean): void;
    /** D14: the interviewer bubble shown directly above its answer. */
    showQuestion?(question: { questionId: string; text: string; done: boolean; generationId?: number; discard?: boolean }): void;
    showText(response: {
        responseId: string;
        generationId: number;
        text: string;
        done: boolean;
        updated: boolean;
        interrupted?: boolean;
    }): void;
    discard?(generationId: number, reason: string): void;
}

export interface ResponseClock<Timer> {
    now(): number;
    setTimeout(callback: () => void, delayMs: number): Timer;
    clearTimeout(timer: Timer): void;
}

interface CurrentAnswer {
    meetingTurn?: MeetingTurnIdentity;
    visibleWriterText?: string;
    generationId: number;
    source: 'writer' | 'text';
    completedAt?: number;
    outdated: boolean;
    speaking: boolean;
    /** D14: the interviewer spoke while this answer's text was still streaming. */
    cutOff?: boolean;
    bubble?: QuestionBubble;
    askId?: string;
    lastTextAt?: number;
    /** Writer answer: its first text reached the overlay. */
    textShown?: boolean;
    /** Writer answer: stopped because the interviewer started a real new turn. */
    interrupted?: boolean;
}

interface TextResponse {
    id: string;
    parser: ReturnType<typeof createResponseParser>;
    kind?: ResponseKind;
    text: string;
    cleanup?: { offset: number; prefix: string };
    generationId?: number;
    updated: boolean;
    lastTextAt?: number;
    /** D15: the answer to a filler-only interviewer turn, never shown. */
    suppressed?: boolean;
    previous?: CurrentAnswer;
    previousWasOutdated?: boolean;
    askGenerationId?: number;
    replaced?: boolean;
    finished?: boolean;
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
    transcriptFinal?: boolean;
    generationId?: number;
    /** Sent to the overlay at least once. */
    shown?: boolean;
    mergedPrefix?: string;
    notebookMerged?: boolean;
    retired?: boolean;
}

interface SpeechTurn {
    itemId?: string;
    startedAt: number;
    stoppedAt?: number;
    capturedStopAt?: number;
    bubble?: QuestionBubble;
    stt?: { text: string; at: number };
    answer?: AnswerTurn;
}

interface AnswerTurn {
    meetingTurn?: MeetingTurnIdentity;
    responseId: string;
    bubble?: QuestionBubble;
    generationId?: number;
    response?: TextResponse;
    awaitsTranscript?: boolean;
    acceptsShortReply?: boolean;
    pendingAnswer?: string;
    /** The interviewer spoke again, so late transcripts belong to a new turn. */
    superseded: boolean;
}

const RECENT_ANSWER_MS = 20_000;
// D14: text that grew this recently is still streaming. Interviewer speech then
// cuts the answer off, so its replacement marks it outdated.
export const MID_STREAM_MS = 1_500;
// An STT final this old is not used as the question of the next answer.
const STT_QUESTION_MAX_AGE_MS = 8_000;
// D15: an interviewer turn made only of these words is filler. An answer to it
// is not shown (the model sometimes repeats its previous answer after a filler
// interrupted its audio turn). Includes Flux/Gemini "MM." / "mm" / "M.M." / "M" variants.
const FILLER_WORD = String.raw`(?:m+-?h+m+|m+\.m+|m+|h+m+|u+h+[\s-]?h+u+h+|uh+|um+|okay|ok|k|right|yeah|yep|yes|sure|got it|i see|alright|all right|cool|nice|good|great|thank you|thanks|take your time|go ahead|no worries|no problem|of course|that makes sense|makes sense|fair enough)`;
const FILLER_ONLY = new RegExp(String.raw`^${FILLER_WORD}(?:[\s,.!?-]+${FILLER_WORD})*[\s,.!?-]*$`, 'i');
// A lone word with no question mark ("I", "So.") is a speech fragment, not a
// question. "Redis?" and multi-word turns still pass.
const SINGLE_WORD_FRAGMENT = /^[\p{L}\p{N}'’-]+[\s.,!…-]*$/u;
// Like a realtime brain, a streaming writer answer stops as soon as the
// interviewer says something that is not filler. Two words, not one: a lone
// "Nice." or "Hmm?" would otherwise kill the answer with nothing to replace it.
const INTERRUPT_MIN_WORDS = 2;
const FILLER_PHRASE = new RegExp(String.raw`(?<![\p{L}\p{N}])${FILLER_WORD}(?![\p{L}\p{N}])`, 'giu');

export function isFillerOnly(text: string): boolean {
    const clean = text.trim();
    return /^a\.?$/i.test(clean) || FILLER_ONLY.test(clean);
}

/** A turn that never gets an automatic answer unless an Ask is waiting:
 *  filler, or a lone word with no question mark ("I", "So."). Kept out of
 *  isFillerOnly, which the notebook also uses for clarification replies ("Tokyo."). */
export function isNonQuestionTurn(text: string): boolean {
    const clean = text.trim();
    return isFillerOnly(clean) || SINGLE_WORD_FRAGMENT.test(clean);
}
const CLARIFICATION_MS = 10_000;
// The overlay can keep earlier answers when Live Brain is disabled and
// re-enabled in the same meeting. Never reuse a text generation across sessions.
let nextTextGeneration = -1;
let nextOrchestratorSession = 0;

export class ResponseOrchestrator<Timer> {
    private current?: CurrentAnswer;
    private replacedWriterTurn?: MeetingTurnIdentity;
    private response?: TextResponse;
    private readonly seenResponseIds = new Set<string>();
    private clarification?: { timer: Timer };
    private question?: QuestionBubble;
    private answerTurn?: AnswerTurn;
    private readonly speechTurns: SpeechTurn[] = [];
    private sttPending?: { text: string; at: number };
    private questionSequence = 0;
    private readonly questionNamespace: string;
    /** An Ask is waiting for the interviewer: a short "yes" may answer it. */
    private askPending = false;
    private realtimeAsk?: { id: string; listening: boolean };
    /** Answered (or abandoned) turns, oldest first, capped at MAX_RECENT_TURNS. */
    private recentTurns: FluxConfirmedTurn[] = [];
    /** The turn being answered now; joins recentTurns once answered or replaced. */
    private openTurn?: FluxConfirmedTurn;
    private pendingClarification?: FluxPendingClarification;
    private writerClarificationHeardSpeech = false;
    private manualCancelPending = false;
    private pendingDraftContext?: { turnKey: string; groundingKey?: string; conversationalKey: string; liveBrainNotebook: string };

    constructor(private readonly ports: {
        sessionId?: string;
        answerWriter?: AnswerWriterPort;
        requestClarificationAnswer?: () => void;
        getContextSnapshot?: (question: string) => { baseNotebook: string; constraints: readonly string[]; groundingKey?: string; historyRevision?: number };
        cleanupText?: (text: string) => string;
        shouldCleanupText?: () => boolean;
        overlay: LiveBrainOverlayPort;
        clock: ResponseClock<Timer>;
        recordSttQuestion?(text: string, at: number): void;
        recordDeferredAnswer?(text: string, isClarification?: boolean): void;
        identifyInterviewTurn?(question: string, at: number): MeetingTurnIdentity | undefined;
        recordInterviewAnswer?(turn: MeetingTurnIdentity, text: string, status: 'completed' | 'interrupted', replaces?: MeetingTurnIdentity): void;
        recordMergedQuestion?(previous: string, next: string, at: number): void;
    }) {
        this.questionNamespace = `${ports.sessionId ?? 'lb'}:${++nextOrchestratorSession}`;
    }

    handleEvent(event: LiveBrainEvent): OrchestratorDisposition | undefined {
        switch (event.type) {
            case 'interviewer_barge_in_candidate':
                this.interruptActiveWriter(event.text);
                break;
            case 'interviewer_transcript':
                if (event.final && (!event.itemId || this.findSpeechTurn(event.itemId) === this.speechTurns.at(-1))) {
                    this.noteClarificationTranscript(event.text);
                }
                return this.noteProviderTranscript(event.text, event.final, event.itemId);
            case 'interviewer_speech_started':
                if (this.answerTurn) this.answerTurn.superseded = true;
                this.startSpeechTurn(event.at, event.itemId);
                this.noteCutOff();
                if (this.pendingClarification) this.writerClarificationHeardSpeech = true;
                else if (this.realtimeAsk) this.realtimeAsk.listening = true;
                else this.clearClarification();
                if (this.current && this.isRecent(this.current)) this.setSpeaking(this.current, true);
                break;
            case 'interviewer_speech_stopped': {
                const turn = this.findSpeechTurn(event.itemId);
                if (turn) turn.stoppedAt = event.at;
                break;
            }
            case 'eager_end_of_turn': {
                if (!this.ports.answerWriter) return;
                const question = event.question?.trim();
                if (!question) return;
                if (!this.askPending && isNonQuestionTurn(question)) return;
                const replacesAutomaticAnswer = this.current?.source === 'writer' && this.current.completedAt === undefined;
                const turnCtx = this.buildContextForTurn(question, replacesAutomaticAnswer, event.turnKey, true);
                this.ports.answerWriter.prepareDraft?.({
                    turnKey: event.turnKey,
                    question,
                    ...(turnCtx ? { liveBrainNotebook: turnCtx.liveBrainNotebook, contextKey: turnCtx.contextKey } : {}),
                });
                break;
            }
            case 'turn_resumed':
                this.pendingDraftContext = undefined;
                this.ports.answerWriter?.cancelDraft?.('turn_resumed', event.turnKey);
                break;
            case 'decision':
                if (this.ports.answerWriter) this.handleDecision(event);
                break;
            case 'response_silent':
                this.pendingDraftContext = undefined;
                this.ports.answerWriter?.cancelDraft?.('silent_turn');
                if (!this.realtimeAsk) {
                    this.clearClarification();
                    this.askPending = false;
                    this.pendingClarification = undefined;
                }
                this.settleFiller();
                this.closeQuestion();
                this.answerTurn = undefined;
                break;
            case 'response_started':
                if (this.seenResponseIds.has(event.responseId)) return;
                this.seenResponseIds.add(event.responseId);
                this.closeTextResponse();
                this.startAnswerTurn(event.responseId);
                this.response = {
                    id: event.responseId, parser: createResponseParser(), text: '', updated: false,
                    ...(this.ports.cleanupText && (this.ports.shouldCleanupText?.() ?? true)
                        ? { cleanup: { offset: 0, prefix: '' } } : {}),
                };
                if (this.answerTurn) this.answerTurn.response = this.response;
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
                if (event.status === 'cancelled') {
                    const manual = this.manualCancelPending;
                    this.manualCancelPending = false;
                    if (!manual && (event.cancelReason === undefined || event.cancelReason === 'interviewer_barge_in')) {
                        this.noteCutOff();
                    } else if (this.current) {
                        this.current.cutOff = false;
                        this.setSpeaking(this.current, false);
                    }
                } else if (event.status === 'failed' && this.current) {
                    this.setSpeaking(this.current, false);
                }
                if (event.status === 'completed' && event.finalText === undefined) {
                    this.readTextEvents(response, response.parser.finish());
                    if (!response.kind && this.current) this.setSpeaking(this.current, false);
                }
                return this.closeTextResponse(event.status === 'completed', event.status === 'cancelled', event.finalText, event.status === 'failed');
            }
        }
    }

    /** Backup question text from the existing STT (D14). Used only for a turn
     *  the provider left without a transcript. */
    noteCapturedSpeechStop(at: number): void {
        const turn = this.speechTurns.at(-1);
        if (turn && turn.capturedStopAt === undefined) turn.capturedStopAt = at;
    }

    noteSttTranscript(text: string, at: number, capturedAt?: number): void {
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!clean || (capturedAt === undefined && this.speechTurns.length > 1)) return;
        const speechAt = capturedAt ?? at;
        if (at - speechAt > STT_QUESTION_MAX_AGE_MS) return;
        const speech = this.speechTurns.findLast(turn => turn.capturedStopAt === speechAt)
            ?? this.speechTurns.findLast(turn =>
                turn.startedAt <= speechAt && (turn.stoppedAt === undefined || speechAt <= turn.stoppedAt));
        if (speech) {
            if (speech === this.speechTurns.at(-1)) this.noteClarificationTranscript(clean);
            if (speech.bubble?.source === 'provider' || speech.answer?.bubble
                || (speech === this.speechTurns.at(-1) && this.question?.open)) return;
            if (speech.answer) this.attachSttToTurn(speech.answer, clean, at);
            else speech.stt = { text: clean, at };
            return;
        }
        if (capturedAt !== undefined || this.question?.open) return;
        const turn = this.answerTurn;
        if (turn && !turn.bubble && !turn.superseded) {
            this.attachSttToTurn(turn, clean, at);
            return;
        }
        if (!turn || !this.speechTurns.length) this.sttPending = { text: clean, at };
    }

    reset(): void {
        this.clearClarification();
        this.closeTextResponse();
        this.closeQuestion();
        this.answerTurn = undefined;
        this.closeSpeechQuestions();
        this.sttPending = undefined;
        this.askPending = false;
        this.realtimeAsk = undefined;
        this.recentTurns = [];
        this.openTurn = undefined;
        this.pendingClarification = undefined;
        this.writerClarificationHeardSpeech = false;
        this.pendingDraftContext = undefined;
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
        this.realtimeAsk = undefined;
        this.pendingClarification = undefined;
        this.pendingDraftContext = undefined;
        this.ports.answerWriter?.cancelDraft?.('external_answer');
        if (this.current) this.setSpeaking(this.current, false);
        this.current = undefined;
    }

    noteManualCancel(): void {
        if (this.response) this.manualCancelPending = true;
        if (this.current) this.current.cutOff = false;
    }

    interruptTextResponse(): void {
        this.closeTextResponse(false, false, undefined, true);
    }

    resetTurnState(): void {
        this.clearClarification();
        this.pendingDraftContext = undefined;
        if (this.current) this.setSpeaking(this.current, false);
        this.closeQuestion();
        this.answerTurn = undefined;
        this.closeSpeechQuestions();
        this.sttPending = undefined;
        this.askPending = false;
        this.realtimeAsk = undefined;
        this.pendingClarification = undefined;
        this.writerClarificationHeardSpeech = false;
        this.replacedWriterTurn = undefined;
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
                // Clear filler is dropped here; anything else goes to the model, which
                // replies No action when the turn needs no answer. A lone word while an
                // answer is still streaming is also dropped, so "Nice." cannot cancel it.
                if (!this.askPending && (isFillerOnly(question) || (isNonQuestionTurn(question) && this.hasStreamingWriter()))) {
                    this.ports.answerWriter?.cancelDraft?.('filler_turn', event.turnKey);
                    this.settleFiller();
                    this.closeQuestion();
                    return;
                }
                this.clearClarification();
                this.noteCutOff();
                const previous = this.current;
                const deferWriterOutdated = previous?.source === 'writer' && previous.completedAt === undefined;
                const completedWriterCorrection = previous?.source === 'writer'
                    && previous.completedAt !== undefined
                    && isCorrectionTurn(question)
                    && this.isRecent(previous);
                if (completedWriterCorrection) this.replacedWriterTurn = previous.meetingTurn;
                const replacesAutomaticAnswer = deferWriterOutdated
                    ? this.cancelActiveWriterForCorrection()
                    : completedWriterCorrection
                        ? (this.setSpeaking(previous, false), this.current = undefined, true)
                        : this.supersedeForNewTurn(true);
                // An answer cut off before its first word has nothing to keep:
                // marking it outdated only left an empty "Outdated answer" row.
                const interrupted = previous?.cutOff && (previous.source === 'text' || previous.textShown) ? previous : undefined;
                const turnCtx = this.buildContextForTurn(question, replacesAutomaticAnswer, event.turnKey, false);
                const clarification = this.pendingClarification;
                const answeringClarification = clarification && !isUnrelatedNewTopicForClarification(question);
                this.pendingClarification = undefined;
                this.askPending = false;
                // An Ask's original question folds into its reply; any other
                // still-open turn (interrupted, or answered with No action)
                // stays in history so a follow-up can refer to it.
                const interruptedQuestion = interrupted ? this.openTurn?.question : undefined;
                if (this.openTurn && !answeringClarification && !interruptedQuestion) this.archiveTurn(this.openTurn);
                this.openTurn = answeringClarification
                    ? { question: `${clarification.originalQuestion}\nClarification: ${clarification.clarification} ${question}` }
                    : { question: joinText(interruptedQuestion ?? '', question) };
                this.closeTextResponse();
                this.write(
                    question,
                    replacesAutomaticAnswer,
                    event.turnKey,
                    interrupted,
                    turnCtx?.liveBrainNotebook,
                    turnCtx?.contextKey,
                    event.at,
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
        if (this.current) this.setSpeaking(this.current, false);
        this.ports.overlay.showAsk({ askId, clarification, ...(askStreaming === undefined ? {} : { askStreaming }) });
        if (askStreaming) return;
        this.clearClarification();
        this.askPending = true;
        this.realtimeAsk = askStreaming === false ? { id: askId, listening: false } : undefined;
        const requestAnswer = this.ports.requestClarificationAnswer;
        if (!question && !requestAnswer) return;

        const onTimeout = () => {
            if (this.clarification !== pending) return;
            if (this.realtimeAsk?.id === askId && this.realtimeAsk.listening) {
                pending.timer = this.ports.clock.setTimeout(onTimeout, 1_000);
                return;
            }
            this.clarification = undefined;
            if (requestAnswer) {
                requestAnswer();
                return;
            }
            this.replaceCurrent();
            this.closeTextResponse();
            this.write(`${question}\n\nThe interviewer did not clarify; state a reasonable assumption first, then answer.`, false);
        };
        const pending = { timer: this.ports.clock.setTimeout(onTimeout, CLARIFICATION_MS) };
        this.clarification = pending;
    }

    private noteClarificationTranscript(text: string): void {
        if (!this.realtimeAsk?.listening || !text.trim()) return;
        this.realtimeAsk.listening = false;
        if (!this.isBackchannel(text, true)) this.clearClarification();
    }

    private isBackchannel(text: string, acceptsShortReply = this.askPending): boolean {
        return isFillerOnly(text) && (!acceptsShortReply || !/^yes[.!?]*$/i.test(text.trim()));
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

    commitMergedQuestion(bubble = this.current?.bubble): void {
        if (!bubble?.mergedPrefix || bubble.notebookMerged) return;
        bubble.notebookMerged = true;
        this.ports.recordMergedQuestion?.(bubble.mergedPrefix, joinText(bubble.base, bubble.live), this.ports.clock.now());
    }

    noteWriterAnswer(answer: string): void {
        const turn = this.openTurn;
        if (!turn || !answer.trim()) return;
        turn.answer = answer.trim();
        this.openTurn = undefined;
        this.archiveTurn(turn);
    }

    private archiveTurn(turn: FluxConfirmedTurn): void {
        this.recentTurns.push(turn);
        if (this.recentTurns.length > MAX_RECENT_TURNS) this.recentTurns.splice(0, this.recentTurns.length - MAX_RECENT_TURNS);
    }

    /** History the next turn sees: archived turns plus a still-open one. */
    private historyTurns(): FluxConfirmedTurn[] {
        return this.openTurn ? [...this.recentTurns, this.openTurn] : [...this.recentTurns];
    }

    /**
     * Called by meeting.ts when the Flux provider is switching, reconnecting,
     * or failed fatally. Clears the in-flight writer turn so the new turn
     * starts clean. The caller is responsible for cancelling any active writer
     * stream and draft before calling this.
     */
    endProviderTurn(): void {
        this.resetTurnState();
    }

    private buildContextForTurn(
        question: string,
        replacesAutomaticAnswer: boolean,
        turnKey?: string,
        isDraft = false,
    ): { liveBrainNotebook: string; contextKey: string } | undefined {
        if (!this.ports.getContextSnapshot) return undefined;
        const { baseNotebook, constraints, groundingKey: sourceGroundingKey, historyRevision } = this.ports.getContextSnapshot(question);
        const groundingKey = historyRevision === undefined ? sourceGroundingKey : JSON.stringify([sourceGroundingKey, historyRevision]);
        // The current transcript is already keyed separately. Its final event can
        // add these same sentences to the notebook just before confirmation.
        const history = historyRevision === undefined ? this.historyTurns() : [];
        const currentSentences = new Set(question.split(/(?<=[.!?])\s+/u).map(sentence => sentence.slice(0, 170)));
        const conversationalKey = buildFluxTurnContext({
            question,
            replacesAutomaticAnswer,
            recentTurns: history,
            pendingClarification: this.pendingClarification,
            constraints: constraints.filter(constraint => !currentSentences.has(constraint)),
        });
        const contextKey = JSON.stringify([groundingKey, conversationalKey]);
        if (isDraft && turnKey) {
            const liveBrainNotebook = buildFluxTurnContext({
                question,
                replacesAutomaticAnswer,
                recentTurns: history,
                pendingClarification: this.pendingClarification,
                constraints,
                baseNotebook,
            });
            this.pendingDraftContext = { turnKey, groundingKey, conversationalKey, liveBrainNotebook };
            return { liveBrainNotebook, contextKey };
        }
        const stored = this.pendingDraftContext;
        this.pendingDraftContext = undefined;
        if (stored
            && (!turnKey || stored.turnKey === turnKey)
            && stored.groundingKey === groundingKey
            && stored.conversationalKey === conversationalKey) {
            return { liveBrainNotebook: stored.liveBrainNotebook, contextKey };
        }
        const liveBrainNotebook = buildFluxTurnContext({
            question,
            replacesAutomaticAnswer,
            recentTurns: history,
            pendingClarification: this.pendingClarification,
            constraints,
            baseNotebook,
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
        return Boolean(bubble && this.isBackchannel(joinText(bubble.base, bubble.live), this.answerTurn?.acceptsShortReply));
    }

    private noteCutOff(): void {
        const current = this.current;
        const response = this.response;
        if (!current || current.completedAt !== undefined) return;
        const lastTextAt = current.source === 'writer' ? current.lastTextAt
            : current.generationId === (response?.generationId ?? response?.askGenerationId) ? response?.lastTextAt : undefined;
        if (lastTextAt !== undefined && this.ports.clock.now() - lastTextAt <= MID_STREAM_MS) {
            if (!current.cutOff) {
                if (current.source === 'text' && response?.text.trim()) this.recordRealtimeAnswer(response, response.text, 'interrupted');
                if (current.meetingTurn && current.visibleWriterText) {
                    this.ports.recordInterviewAnswer?.(current.meetingTurn, current.visibleWriterText, 'interrupted');
                }
            }
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

    /**
     * D17 barge-in: the interviewer started a real new turn while a writer
     * answer is still streaming. Stop it now instead of letting it run until
     * the new turn is confirmed, which showed two answers at once. Filler and
     * very short partials ("Mm", "Take your time") never stop an answer, and
     * neither does a reply while an Ask is waiting.
     */
    noteWriterProgress(generationId: number, token?: string): void {
        if (this.current?.source === 'writer' && this.current.generationId === generationId) {
            this.current.lastTextAt = this.ports.clock.now();
            if (token) this.current.visibleWriterText = (this.current.visibleWriterText ?? '') + token;
        }
    }

    private hasStreamingWriter(): boolean {
        const current = this.current;
        return current?.source === 'writer' && current.completedAt === undefined && !current.interrupted;
    }

    private interruptActiveWriter(text: string): void {
        const current = this.current;
        if (current?.source !== 'writer' || current.completedAt !== undefined || current.interrupted) return;
        if (this.askPending || !this.ports.answerWriter) return;
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!clean || isFillerOnly(clean)) return;
        const words = clean.replace(FILLER_PHRASE, ' ').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
        if ((words?.length ?? 0) < INTERRUPT_MIN_WORDS) return;
        this.noteCutOff();
        current.interrupted = true;
        this.setSpeaking(current, false);
        this.ports.answerWriter.cancel('interviewer_interrupted');
    }

    private cancelActiveWriterForCorrection(): boolean {
        const previous = this.current;
        if (!previous) return false;
        this.noteCutOff();
        this.replacedWriterTurn = previous.meetingTurn;
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
        interrupted?: CurrentAnswer,
        liveBrainNotebook?: string,
        contextKey?: string,
        at = this.ports.clock.now(),
    ): void {
        const writer = this.ports.answerWriter;
        if (!writer) return;
        this.askPending = false;
        const bubble = this.question?.open ? this.question
            : interrupted?.bubble ? this.createBubble(question, 'provider', false, undefined, false, false) : undefined;
        if (this.question?.open) this.closeQuestion();
        const meetingTurn = this.ports.identifyInterviewTurn?.(question, at);
        const replacesMeetingTurn = interrupted?.meetingTurn ?? this.replacedWriterTurn;
        this.replacedWriterTurn = undefined;
        const request = { question, replacesAutomaticAnswer, ...(turnKey ? { turnKey } : {}),
            ...(meetingTurn ? { meetingTurn } : {}), ...(replacesMeetingTurn ? { replacesMeetingTurn } : {}) };
        const answer: CurrentAnswer = {
            generationId: 0,
            source: 'writer',
            outdated: false,
            speaking: false,
            bubble,
            meetingTurn,
        };
        const writeOptions: { suppressQuestionRow?: boolean; onFirstText?: (at: number) => void; liveBrainNotebook?: string; contextKey?: string } = {
            ...(bubble ? { suppressQuestionRow: true } : {}),
            ...(liveBrainNotebook !== undefined ? { liveBrainNotebook } : {}),
            ...(contextKey !== undefined ? { contextKey } : {}),
            onFirstText: () => {
                if (answer.generationId !== 0 && this.current !== answer) return;
                if (!answer.textShown && interrupted && answer.generationId !== 0) {
                    this.replaceInterrupted(interrupted, answer.generationId, bubble, { writer: true });
                }
                answer.textShown = true;
                answer.lastTextAt = this.ports.clock.now();
            },
        };
        const { generationId, done } = writer.write(request, writeOptions);
        answer.generationId = generationId;
        if (interrupted && answer.textShown) this.replaceInterrupted(interrupted, generationId, bubble, { writer: true });
        if (bubble) {
            bubble.generationId = generationId;
            if (!interrupted) this.emitQuestion(bubble);
            this.answerTurn = { responseId: turnKey ?? `writer:${generationId}`, bubble, generationId, superseded: false };
        }
        this.current = answer;
        const settle = (status: AnswerCompletion) => {
            if (this.current !== answer) return;
            this.setSpeaking(answer, false);
            if (status === 'completed') {
                answer.completedAt = this.ports.clock.now();
                return;
            }
            // An interrupted answer stays current until the interrupting turn
            // is confirmed, so that turn can fold (or drop) it.
            if (answer.interrupted) return;
            this.current = interrupted && !answer.textShown ? interrupted : undefined;
        };
        void done.then(settle, () => settle('failed'));
    }

    private readTextEvents(response: TextResponse, events: ResponseParserEvent[]): void {
        for (const event of events) {
            if (event.type === 'kind') {
                response.kind = event.kind;
                if (event.kind === 'wait') this.settleFiller();
            } else {
                response.text += event.text;
                response.lastTextAt = this.ports.clock.now();
            }
        }
        if (events.some(event => event.type === 'text')) this.revealText(response);
    }

    private revealText(response: TextResponse): void {
        if (response.suppressed || !response.text.trim()) return;
        const turn = this.answerTurn?.responseId === response.id ? this.answerTurn : undefined;
        if (this.current?.cutOff && turn?.awaitsTranscript) return;
        if (response.generationId === undefined && this.isFillerTurn(response)) {
            response.suppressed = true;
            this.settleFiller();
            return;
        }
        if (response.kind === 'ask' && response.text.trim()) {
            if (!response.previous && this.current) {
                response.previous = this.current;
                response.previousWasOutdated = this.current.outdated;
            }
            if (response.askGenerationId === undefined) {
                response.askGenerationId = nextTextGeneration--;
                const previous = this.current;
                if (previous?.cutOff) {
                    this.replaceInterrupted(previous, response.askGenerationId, turn?.bubble, { askId: response.id });
                    response.replaced = true;
                }
                else if (previous) this.setSpeaking(previous, false);
                this.current = { generationId: response.askGenerationId, source: 'text', askId: response.id, bubble: turn?.bubble, outdated: false, speaking: false };
            }
            this.showAsk(response.id, response.text.trimStart(), undefined, response.finished !== true);
            if (response.finished && this.current?.askId === response.id) this.current.completedAt = this.ports.clock.now();
            return;
        }
        if (response.kind !== 'answer') return;
        if (response.generationId === undefined) {
            this.askPending = false;
            this.realtimeAsk = undefined;
            this.clearClarification();
            response.previous = this.current;
            response.previousWasOutdated = this.current?.outdated;
            response.generationId = nextTextGeneration--;
            if (response.previous?.cutOff) {
                this.replaceInterrupted(response.previous, response.generationId, turn?.bubble);
                response.updated = true;
                response.replaced = true;
            } else if (response.previous) this.setSpeaking(response.previous, false);
            this.current = { generationId: response.generationId, source: 'text', bubble: turn?.bubble, outdated: false, speaking: false };
            if (turn?.responseId === response.id) {
                turn.generationId = response.generationId;
                if (turn.bubble) {
                    turn.bubble.generationId = response.generationId;
                    this.emitQuestion(turn.bubble);
                }
            }
        }
        this.showText(response, response.finished === true);
    }

    private startSpeechTurn(at: number, itemId?: string): void {
        const previous = this.speechTurns.at(-1);
        if (itemId && previous?.itemId === itemId) return;
        if (previous && previous.stoppedAt === undefined) previous.stoppedAt = at;
        this.closeBubble(previous?.bubble);
        this.speechTurns.push({ itemId, startedAt: at });
        if (this.speechTurns.length > 16) this.speechTurns.shift();
    }

    private findSpeechTurn(itemId?: string): SpeechTurn | undefined {
        return itemId ? this.speechTurns.findLast(turn => turn.itemId === itemId) : this.speechTurns.at(-1);
    }

    private noteProviderTranscript(text: string, final: boolean, itemId?: string): OrchestratorDisposition | undefined {
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!clean) return;
        if (itemId) {
            const speech = this.findSpeechTurn(itemId);
            if (!speech) return;
            const answer = speech.answer;
            if (answer && final && this.retractLateFiller(answer, clean)) return { kind: 'interviewer_already_recorded' };
            const open = speech === this.speechTurns.at(-1) && !answer && !final;
            let bubble = answer?.bubble ?? speech.bubble;
            if (!bubble) {
                bubble = this.createBubble(clean, 'provider', open, answer?.generationId, !final, false);
                speech.bubble = bubble;
                if (answer) answer.bubble = bubble;
            } else {
                bubble.transcriptFinal = final;
                bubble.base = final ? clean : '';
                bubble.live = final ? '' : clean;
                bubble.open = open;
                bubble.source = 'provider';
                this.emitQuestion(bubble);
            }
            if (answer && final) return this.confirmProviderTranscript(answer, bubble);
            return;
        }
        const open = this.question?.open ? this.question : undefined;
        if (open) {
            if (final) {
                open.base = joinText(open.base, clean);
                open.live = '';
                open.transcriptFinal = true;
                if (this.isBackchannel(open.base)) this.discardQuestion(open);
            } else open.live = clean;
            this.emitQuestion(open);
            return;
        }
        // A provider that transcribes after speech end (OpenAI Whisper) can
        // deliver the question after its answer started: put it above that answer.
        const turn = this.answerTurn;
        if (final && turn && !turn.superseded && (turn.bubble?.source !== 'provider' || !turn.bubble.transcriptFinal)) {
            if (this.retractLateFiller(turn, clean)) return { kind: 'interviewer_already_recorded' };
            if (turn.bubble) {
                turn.bubble.base = clean;
                turn.bubble.live = '';
                turn.bubble.source = 'provider';
                turn.bubble.transcriptFinal = true;
                this.emitQuestion(turn.bubble);
            } else {
                turn.bubble = this.createBubble(clean, 'provider', false, turn.generationId);
            }
            return this.confirmProviderTranscript(turn, turn.bubble);
        }
        this.sttPending = undefined;
        this.createBubble(clean, 'provider', true, undefined, !final);
    }

    /** `open` bubbles keep growing until their answer starts. */
    private createBubble(text: string, source: QuestionBubble['source'], open: boolean, generationId?: number, partial = false, makeCurrent = true): QuestionBubble {
        const bubble: QuestionBubble = {
            id: `${this.questionNamespace}:q${++this.questionSequence}`,
            base: partial ? '' : text,
            live: partial ? text : '',
            open,
            source,
            transcriptFinal: !partial,
            ...(generationId === undefined ? {} : { generationId }),
        };
        if (makeCurrent) this.question = bubble;
        this.emitQuestion(bubble);
        return bubble;
    }

    private attachSttToTurn(turn: AnswerTurn, text: string, at: number): void {
        if (this.retractLateFiller(turn, text)) return;
        turn.bubble = this.createSttBubble(text, at, turn.generationId, false);
        const deferredAnswer = this.confirmTranscript(turn);
        if (deferredAnswer !== undefined) this.ports.recordDeferredAnswer?.(deferredAnswer, turn.response?.kind === 'ask');
    }

    private retractLateFiller(turn: AnswerTurn, text: string): boolean {
        const response = turn.response;
        if (!response || !this.isBackchannel(text, turn.acceptsShortReply)) return false;
        response.suppressed = true;
        turn.pendingAnswer = undefined;
        if (turn.bubble && !turn.bubble.mergedPrefix) this.discardQuestion(turn.bubble);
        this.retractTextAnswer(response, 'filler_turn');
        if (response.previous) response.previous.cutOff = false;
        if (turn === this.answerTurn && !turn.superseded) this.settleFiller();
        return true;
    }

    private confirmProviderTranscript(turn: AnswerTurn, bubble: QuestionBubble): OrchestratorDisposition | undefined {
        const deferredAnswer = this.confirmTranscript(turn);
        if (bubble.sttRecorded || bubble.notebookMerged || deferredAnswer !== undefined) {
            return { kind: bubble.sttRecorded || bubble.notebookMerged ? 'interviewer_already_recorded' : 'interviewer_confirmed', deferredAnswer, deferredAsk: turn.response?.kind === 'ask' };
        }
    }

    private confirmTranscript(turn: AnswerTurn): string | undefined {
        turn.awaitsTranscript = false;
        if (turn === this.answerTurn && this.current && (this.current.generationId === turn.generationId || this.current.askId === turn.responseId)) {
            this.current.bubble = turn.bubble;
        }
        if (turn === this.answerTurn && turn.response && !turn.superseded && (turn.response.generationId === undefined && turn.response.askGenerationId === undefined)) {
            this.revealText(turn.response);
        }
        if (turn.response?.finished) this.commitMergedQuestion(turn.bubble);
        const text = turn.pendingAnswer;
        turn.pendingAnswer = undefined;
        if (text && turn.response) this.recordRealtimeAnswer(turn.response, text, 'completed', turn);
        return text;
    }

    private recordRealtimeAnswer(response: TextResponse, text: string, status: 'completed' | 'interrupted', associated?: AnswerTurn): void {
        const speech = this.speechTurns.findLast(candidate => candidate.answer?.responseId === response.id);
        const turn = associated ?? speech?.answer ?? (this.answerTurn?.responseId === response.id ? this.answerTurn : undefined);
        if (!turn?.bubble || turn.bubble.retired) return;
        const question = joinText(turn.bubble.base, turn.bubble.live);
        turn.meetingTurn ??= this.ports.identifyInterviewTurn?.(question, speech?.stt?.at ?? speech?.stoppedAt ?? this.ports.clock.now());
        if (!turn.meetingTurn) return;
        if (this.current && (this.current.generationId === response.generationId || this.current.askId === response.id)) {
            this.current.meetingTurn = turn.meetingTurn;
        }
        this.ports.recordInterviewAnswer?.(turn.meetingTurn, text, status, response.replaced ? response.previous?.meetingTurn : undefined);
    }

    private settleFiller(): void {
        if (this.realtimeAsk) this.realtimeAsk.listening = false;
        if (!this.current) return;
        this.current.cutOff = false;
        this.setSpeaking(this.current, false);
    }

    private createSttBubble(text: string, at: number, generationId?: number, makeCurrent = true): QuestionBubble {
        const bubble = this.createBubble(text, 'stt', false, generationId, false, makeCurrent);
        if (bubble.shown && this.ports.recordSttQuestion) {
            bubble.sttRecorded = true;
            this.ports.recordSttQuestion(text, at);
        }
        return bubble;
    }

    private startAnswerTurn(responseId: string): void {
        const speech = this.speechTurns.at(-1);
        const unassignedSpeech = speech && !speech.answer ? speech : undefined;
        const openQuestion = this.question?.open ? this.question : undefined;
        let bubble = unassignedSpeech?.bubble ?? openQuestion;
        if (openQuestion) this.closeQuestion();
        this.closeBubble(bubble);
        if (!bubble) {
            const pending = unassignedSpeech?.stt ?? this.sttPending;
            if (pending && this.ports.clock.now() - pending.at <= STT_QUESTION_MAX_AGE_MS) {
                bubble = this.createSttBubble(pending.text, pending.at);
            }
        }
        this.sttPending = undefined;
        this.answerTurn = {
            responseId, superseded: false, acceptsShortReply: this.askPending,
            awaitsTranscript: Boolean(unassignedSpeech && !bubble?.transcriptFinal),
            ...(bubble ? { bubble } : {}),
        };
        if (unassignedSpeech) unassignedSpeech.answer = this.answerTurn;
    }

    private closeQuestion(): void {
        this.closeBubble(this.question);
        this.question = undefined;
    }

    private closeSpeechQuestions(): void {
        for (const turn of this.speechTurns) this.closeBubble(turn.bubble);
        this.speechTurns.length = 0;
    }

    private closeBubble(bubble?: QuestionBubble): void {
        if (!bubble?.open) return;
        bubble.open = false;
        bubble.base = joinText(bubble.base, bubble.live);
        bubble.live = '';
        this.emitQuestion(bubble);
    }

    private discardQuestion(bubble: QuestionBubble): void {
        if (!bubble.shown) return;
        this.ports.overlay.showQuestion?.({ questionId: bubble.id, text: '', done: true, discard: true });
        bubble.shown = false;
        // The overlay closes a discarded id for good. If the interviewer keeps
        // talking in this turn ("Okay. So how would you…"), show it as a new row.
        bubble.id = `${this.questionNamespace}:q${++this.questionSequence}`;
    }

    private emitQuestion(bubble: QuestionBubble): void {
        const text = joinText(bubble.mergedPrefix ?? '', joinText(bubble.base, bubble.live));
        if (!text || bubble.retired || (this.current?.cutOff && bubble !== this.current.bubble && bubble.generationId === undefined)) return;
        // D15: filler-only speech ("Mm-hmm.", "Okay.") stays out of the chat. A
        // bubble appears once its text is more than filler ("Okay, short one…"),
        // and a short reply to a waiting Ask ("Yes.") is still shown.
        if (!bubble.shown && (this.realtimeAsk ? this.isBackchannel(text) : !this.askPending && isFillerOnly(text))) return;
        bubble.shown = true;
        this.ports.overlay.showQuestion?.({
            questionId: bubble.id, text, done: !bubble.open,
            ...(bubble.generationId === undefined ? {} : { generationId: bubble.generationId }),
        });
    }

    private retractTextAnswer(response: TextResponse, reason: string): void {
        const generationId = response.generationId ?? response.askGenerationId;
        if (generationId === undefined) return;
        if (response.replaced && response.previous && this.current?.generationId === generationId) {
            const previous = response.previous;
            const oldBubble = previous.bubble;
            const bubble = this.current.bubble;
            const restored = nextTextGeneration--;
            previous.generationId = restored;
            previous.cutOff = reason === 'final_revision';
            this.current = previous;
            this.ports.overlay.replaceAnswer?.(restored, {
                previousGenerationId: generationId, previousAskId: this.response?.id, restore: true,
            });
            if (bubble && bubble !== oldBubble && bubble.mergedPrefix) {
                bubble.mergedPrefix = undefined;
                bubble.id = `${this.questionNamespace}:q${++this.questionSequence}`;
                bubble.shown = false;
                bubble.generationId = undefined;
            }
            if (oldBubble) {
                oldBubble.retired = false;
                oldBubble.generationId = restored;
                this.emitQuestion(oldBubble);
            }
            response.replaced = false;
        } else if (response.generationId !== undefined) {
            this.ports.overlay.discard?.(generationId, reason);
        } else {
            this.ports.overlay.discardAsk?.(response.id);
        }
        if (this.current?.generationId === generationId) this.current = response.previous;
        this.restorePreviousAnswer(response);
        response.generationId = undefined;
        response.askGenerationId = undefined;
    }

    private replaceInterrupted(previous: CurrentAnswer, generationId: number, bubble?: QuestionBubble, flags?: Partial<LiveBrainReplacement>): void {
        this.setSpeaking(previous, false);
        const oldBubble = previous.bubble;
        if (bubble && oldBubble && bubble !== oldBubble) {
            const before = joinText(oldBubble.mergedPrefix ?? '', joinText(oldBubble.base, oldBubble.live));
            this.discardQuestion(bubble);
            oldBubble.retired = true;
            bubble.id = oldBubble.id;
            bubble.shown = oldBubble.shown;
            bubble.mergedPrefix = before;
            bubble.generationId = generationId;

        }
        this.ports.overlay.replaceAnswer?.(generationId, {
            previousGenerationId: previous.generationId, previousAskId: previous.askId, ...flags,
        });
        if (bubble) this.emitQuestion(bubble);
    }

    private restorePreviousAnswer(response: TextResponse): void {
        const previous = response.previous;
        if (previous?.outdated && !response.previousWasOutdated) {
            previous.outdated = false;
            this.ports.overlay.setOutdated(previous.generationId, false);
        }
    }

    private closeTextResponse(completed = false, cancelled = false, finalText?: string, interrupted = false): OrchestratorDisposition {
        const response = this.response;
        this.response = undefined;
        if (response?.suppressed) return { kind: 'suppressed' };
        if (completed && finalText !== undefined && response) {
            const parser = createResponseParser();
            const events = [...parser.push(finalText), ...parser.finish()];
            const kind = events.find(event => event.type === 'kind')?.kind;
            if (kind !== response.kind) {
                this.retractTextAnswer(response, 'final_revision');
                response.kind = undefined;
                response.text = '';
                if (response.cleanup) response.cleanup = { offset: 0, prefix: '' };
                this.readTextEvents(response, events);
            } else if (kind === 'ask') {
                response.text = events.flatMap(event => event.type === 'text' ? [event.text] : []).join('');
            } else if (kind === 'answer') {
                const cleanup = response.cleanup;
                if (cleanup && !finalText.startsWith(response.text.slice(0, cleanup.offset))) {
                    // Sonic can supply an authoritative revision of its speculative transcript.
                    response.cleanup = { offset: 0, prefix: '' };
                }
                response.text = finalText;
            }
        }
        if (response?.suppressed) return { kind: 'suppressed' };
        if (response?.kind === 'ask' && response.text.trim() && response.askGenerationId === undefined
            && completed && this.answerTurn?.awaitsTranscript) {
            response.finished = true;
            this.answerTurn.pendingAnswer = response.text.trim();
            return { kind: 'suppressed' };
        }
        if (response?.kind === 'ask' && response.text.trim() && response.askGenerationId !== undefined) {
            if (this.current?.askId === response.id) this.current.completedAt = this.ports.clock.now();
            const clarification = response.text.trim();
            if (completed) {
                this.commitMergedQuestion(this.answerTurn?.bubble);
                this.showAsk(response.id, clarification, undefined, false);
                this.recordRealtimeAnswer(response, clarification, 'completed');
                return { kind: 'ask', text: clarification };
            }
            this.ports.overlay.showAsk({ askId: response.id, clarification, askStreaming: false });
            return { kind: 'suppressed' };
        }
        const answerTurn = this.answerTurn?.responseId === response?.id ? this.answerTurn : undefined;
        if (response && completed && response.kind === 'answer' && answerTurn?.awaitsTranscript && response.generationId === undefined) {
            response.finished = true;
            answerTurn.pendingAnswer = this.showText(response, true);
        }
        if (response?.generationId === undefined) return { kind: 'suppressed' };
        if (this.current?.generationId === response.generationId) {
            this.current.completedAt = this.ports.clock.now();
        }
        const text = this.showText(response, true, interrupted);
        if (interrupted) this.recordRealtimeAnswer(response, text, 'interrupted');
        if (cancelled || !completed || response.kind !== 'answer') return { kind: 'suppressed' };
        const turn = this.answerTurn;
        if (turn?.responseId === response.id && turn.awaitsTranscript) {
            turn.pendingAnswer = text;
            return { kind: 'suppressed' };
        }
        this.commitMergedQuestion(turn?.bubble);
        this.recordRealtimeAnswer(response, text, 'completed');
        return { kind: 'answer', text };
    }

    private showText(response: TextResponse, done: boolean, interrupted = false): string {
        const cleanup = response.cleanup;
        const text = cleanup && this.ports.cleanupText
            ? cleanStreamingText(response.text, cleanup, this.ports.cleanupText, done)
            : response.text;
        if (response.generationId === undefined) return text;
        this.ports.overlay.showText({
            responseId: response.id,
            generationId: response.generationId,
            text,
            done,
            updated: response.updated,
            ...(interrupted ? { interrupted } : {}),
        });
        return text;
    }
}

const sentences = new Intl.Segmenter('en', { granularity: 'sentence' });
// Keep sentence boundaries out of fenced/inline code, math, and URLs. An open
// fence or math block stays opaque even if the response ends mid-block.
const STREAM_PROTECTED = /```[\s\S]*?```|^[ \t]*~{3,}[^\n]*\n[\s\S]*?^[ \t]*~{3,}[ \t]*(?=\r?$)|\$\$[\s\S]*?\$\$|`[^`\n]+`|\$(?=[^$\n]*[\\^_{}])[^$\n]+\$|https?:\/\/[^\s<>]+|^(?: {4}|\t)[^\n]*|(?<open>```[\s\S]*|^[ \t]*~{3,}[\s\S]*|\$\$[\s\S]*|`[^`\n]*$)/gm;

function cleanStreamingText(
    text: string,
    state: NonNullable<TextResponse['cleanup']>,
    cleanup: (text: string) => string,
    done: boolean,
): string {
    const tail = text.slice(state.offset);
    let safeEnd = tail.length;
    const masked = tail.replace(STREAM_PROTECTED, (...args) => {
        const [span, open, index] = args as [string, string | undefined, number];
        if (open) safeEnd = index;
        return 'X'.repeat(span.length);
    });
    let consumed = 0;
    const append = (end: number) => {
        const part = tail.slice(consumed, end);
        const body = part.trim();
        let cleaned = body;
        if (body && !/^(?: {4}|\t)\S/m.test(part)) {
            try { cleaned = cleanup(body).trim() || body; } catch { /* keep the delivered text */ }
        }
        state.prefix += body
            ? part.slice(0, part.length - part.trimStart().length) + cleaned + part.slice(part.trimEnd().length)
            : part;
        consumed = end;
    };
    for (const { segment, index } of sentences.segment(masked)) {
        const end = index + segment.length;
        if (end > safeEnd || !/[.!?…。！？]["'”’)}\]]*\s+$/u.test(segment)) break;
        append(end);
    }
    if (done) append(safeEnd);
    state.offset += consumed;
    return state.prefix + tail.slice(consumed);
}

function joinText(a: string, b: string): string {
    return [a, b].filter(Boolean).join(' ');
}
