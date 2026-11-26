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
}

interface TextResponse {
    id: string;
    parser: ReturnType<typeof createResponseParser>;
    kind?: ResponseKind;
    text: string;
    generationId?: number;
    updated: boolean;
}

const RECENT_ANSWER_MS = 20_000;
const CLARIFICATION_MS = 10_000;
// The overlay can keep earlier answers when Live Brain is disabled and
// re-enabled in the same meeting. Never reuse a text generation across sessions.
let nextTextGeneration = -1;

export class ResponseOrchestrator<Timer> {
    private current?: CurrentAnswer;
    private response?: TextResponse;
    private readonly seenResponseIds = new Set<string>();
    private clarification?: { timer: Timer };

    constructor(private readonly ports: {
        answerWriter?: AnswerWriterPort;
        requestClarificationAnswer?: () => void;
        overlay: LiveBrainOverlayPort;
        clock: ResponseClock<Timer>;
    }) {}

    handleEvent(event: LiveBrainEvent): void {
        switch (event.type) {
            case 'interviewer_speech_started':
                this.clearClarification();
                if (this.current && this.isRecent(this.current)) this.setSpeaking(this.current, true);
                break;
            case 'decision':
                if (this.ports.answerWriter) this.handleDecision(event);
                break;
            case 'response_silent':
                if (this.current) this.setSpeaking(this.current, false);
                break;
            case 'response_started':
                if (this.seenResponseIds.has(event.responseId)) return;
                this.seenResponseIds.add(event.responseId);
                this.closeTextResponse();
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
                if (event.status === 'completed') {
                    this.readTextEvents(response, response.parser.finish());
                    if (!response.kind && this.current) this.setSpeaking(this.current, false);
                }
                this.closeTextResponse(event.status === 'completed');
                break;
            }
        }
    }

    reset(): void {
        this.clearClarification();
        this.closeTextResponse();
        const previous = this.current;
        this.current = undefined;
        this.seenResponseIds.clear();
        if (!previous) return;
        this.setSpeaking(previous, false);
        if (previous.source === 'writer' && previous.completedAt === undefined) {
            this.ports.answerWriter?.cancel('auto_disabled_or_meeting_ended');
        }
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
        this.markCurrentOutdated();
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
            }
        }
        if (!events.some(event => event.type === 'text')) return;
        if (response.kind === 'ask' && response.text.trim()) {
            this.showAsk(response.id, response.text.trimStart(), undefined, true);
            return;
        }
        if (response.kind !== 'answer') return;
        if (response.generationId === undefined) {
            this.clearClarification();
            response.updated = this.replaceCurrent();
            response.generationId = nextTextGeneration--;
            this.current = { generationId: response.generationId, source: 'text', outdated: false, speaking: false };
        }
        this.showText(response, false);
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
