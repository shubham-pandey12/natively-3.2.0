import { createResponseParser, type ResponseKind, type ResponseParserEvent } from './responseParser';
import type { LiveBrainEvent } from './types';

export type AnswerCompletion = 'completed' | 'cancelled' | 'failed';

export interface AnswerWriterPort {
    write(request: { question: string; replacesAutomaticAnswer: boolean }): {
        generationId: number;
        done: Promise<AnswerCompletion>;
    };
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
    generationId?: number;
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
// interrupted its audio turn).
const FILLER_WORD = String.raw`(?:m+-?h+m+|h+m+|u+h+-?h+u+h+|uh+|um+|okay|ok|right|yeah|yep|yes|sure|got it|i see|alright|all right|cool|nice|good|great|thank you|thanks)`;
const FILLER_ONLY = new RegExp(String.raw`^(?:${FILLER_WORD}[\s,.!?-]*)+$`, 'i');

export function isFillerOnly(text: string): boolean {
    return FILLER_ONLY.test(text.trim());
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

    constructor(private readonly ports: {
        answerWriter?: AnswerWriterPort;
        requestClarificationAnswer?: () => void;
        overlay: LiveBrainOverlayPort;
        clock: ResponseClock<Timer>;
    }) {}

    handleEvent(event: LiveBrainEvent): void {
        switch (event.type) {
            case 'interviewer_transcript':
                this.noteProviderTranscript(event.text, event.final);
                break;
            case 'interviewer_speech_started':
                if (this.answerTurn) this.answerTurn.superseded = true;
                this.noteCutOff();
                this.clearClarification();
                if (this.current && this.isRecent(this.current)) this.setSpeaking(this.current, true);
                break;
            case 'decision':
                if (this.ports.answerWriter) this.handleDecision(event);
                break;
            case 'response_silent':
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
                if (response?.id !== event.responseId) return;
                // Gemini reports the barge-in cancel before the speech start.
                if (event.status === 'cancelled') this.noteCutOff();
                if (event.status === 'completed') {
                    this.readTextEvents(response, response.parser.finish());
                    if (!response.kind && this.current) this.setSpeaking(this.current, false);
                }
                this.closeTextResponse(event.status === 'completed');
                break;
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
            turn.bubble = this.createBubble(clean, 'stt', false, turn.generationId);
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
        this.replaceCurrent();
    }

    private handleDecision(event: Extract<LiveBrainEvent, { type: 'decision' }>): void {
        switch (event.action) {
            case 'answer': {
                const question = event.question?.trim();
                if (!question) return;
                this.clearClarification();
                const replacesAutomaticAnswer = this.replaceCurrent();
                this.closeTextResponse();
                this.write(question, replacesAutomaticAnswer);
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
        return clear ? this.replaceCurrent() : this.markCurrentOutdated();
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

    private write(question: string, replacesAutomaticAnswer: boolean): void {
        const writer = this.ports.answerWriter;
        if (!writer) return;
        const { generationId, done } = writer.write({ question, replacesAutomaticAnswer });
        const answer: CurrentAnswer = { generationId, source: 'writer', outdated: false, speaking: false };
        this.current = answer;
        const settle = (status: AnswerCompletion) => {
            if (this.current !== answer) return;
            if (status === 'completed') answer.completedAt = this.ports.clock.now();
            else {
                this.setSpeaking(answer, false);
                this.current = undefined;
            }
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

    private noteProviderTranscript(text: string, final: boolean): void {
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
            return;
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

    private startAnswerTurn(responseId: string): void {
        let bubble = this.question?.open ? this.question : undefined;
        if (bubble) this.closeQuestion();
        else {
            const pending = this.sttPending;
            if (pending && this.ports.clock.now() - pending.at <= STT_QUESTION_MAX_AGE_MS) {
                bubble = this.createBubble(pending.text, 'stt', false);
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
        this.ports.overlay.showQuestion?.({
            questionId: bubble.id, text, done: !bubble.open,
            ...(bubble.generationId === undefined ? {} : { generationId: bubble.generationId }),
        });
    }

    private closeTextResponse(completed = false): void {
        const response = this.response;
        this.response = undefined;
        if (response?.kind === 'ask' && response.text.trim()) {
            const clarification = response.text.trim();
            if (completed) this.showAsk(response.id, clarification, undefined, false);
            else this.ports.overlay.showAsk({ askId: response.id, clarification, askStreaming: false });
        }
        if (response?.generationId === undefined) return;
        if (this.current?.generationId === response.generationId) {
            this.current.completedAt = this.ports.clock.now();
        }
        this.showText(response, true);
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
