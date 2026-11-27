import type {
    AutoAnswerDispatchResult,
    LiveBrainAnswerEngine,
    LiveBrainAnswerRequest,
    LiveBrainPrivateDraft,
} from '../../../electron/premium/liveBrain';
import type { AnswerCompletion, AnswerWriterPort } from './ResponseOrchestrator';

export interface DraftLifecycleEvent {
    action: 'started' | 'reused' | 'discarded';
    turnKey: string;
    reason?: string;
}

export interface AnswerWriterOptions {
    sessionId?: string;
    onDraftEvent?: (event: DraftLifecycleEvent) => void;
}

function toAnswerCompletion({ status }: AutoAnswerDispatchResult): AnswerCompletion {
    if (status === 'completed' || status === 'partial') return 'completed';
    return status === 'cancelled' ? 'cancelled' : 'failed';
}

export class AnswerWriter implements AnswerWriterPort {
    private active?: AbortController;
    private draft?: LiveBrainPrivateDraft;
    private readonly sessionId: string;
    private readonly onDraftEvent?: (event: DraftLifecycleEvent) => void;

    constructor(
        private readonly engine: LiveBrainAnswerEngine,
        options: AnswerWriterOptions = {},
    ) {
        this.sessionId = options.sessionId ?? 'default';
        this.onDraftEvent = options.onDraftEvent;
    }

    prepareDraft(request: { turnKey: string; question: string }): boolean {
        if (!this.engine.startLiveBrainDraft) return false;
        const question = request.question.trim();
        if (!question) return false;
        const currentRoute = this.engine.getLiveBrainAiRouteKey?.();
        if (this.draft
            && this.draft.sessionId === this.sessionId
            && this.draft.turnKey === request.turnKey
            && this.draft.question.trim() === question
            && (currentRoute === undefined || this.draft.routeKey === currentRoute)
            && this.draft.canAdopt()) {
            return false;
        }
        this.cancelDraft('superseded_eager');
        const created = this.engine.startLiveBrainDraft({
            sessionId: this.sessionId,
            turnKey: request.turnKey,
            question,
        });
        if (!created) return false;
        this.draft = created;
        this.onDraftEvent?.({ action: 'started', turnKey: request.turnKey });
        return true;
    }

    cancelDraft(reason: string, turnKey?: string): boolean {
        const current = this.draft;
        if (!current) return false;
        if (turnKey !== undefined && current.turnKey !== turnKey) return false;
        this.draft = undefined;
        current.cancel(reason);
        this.onDraftEvent?.({ action: 'discarded', turnKey: current.turnKey, reason });
        return true;
    }

    write(
        request: Parameters<AnswerWriterPort['write']>[0],
        optionsOrFirstText?: ((at: number) => void) | { suppressQuestionRow?: boolean; onFirstText?: (at: number) => void },
    ): ReturnType<AnswerWriterPort['write']> {
        this.cancel('answer_corrected');
        const controller = new AbortController();
        this.active = controller;
        const callerOnFirstText = typeof optionsOrFirstText === 'function'
            ? optionsOrFirstText
            : optionsOrFirstText?.onFirstText;
        const suppressQuestionRow = typeof optionsOrFirstText === 'object' ? optionsOrFirstText?.suppressQuestionRow : undefined;
        const { turnKey, ...answerFields } = request;
        const baseRequest: LiveBrainAnswerRequest = {
            ...answerFields,
            signal: controller.signal,
            ...(callerOnFirstText ? { onFirstText: callerOnFirstText } : {}),
            ...(suppressQuestionRow ? { suppressQuestionRow } : {}),
        };

        const draft = this.draft;
        if (draft) {
            const mismatchReason = this.draftMismatchReason(draft, request.question, turnKey);
            if (!mismatchReason) {
                this.draft = undefined;
                let writerSawFirstText = false;
                const adoptRequest: LiveBrainAnswerRequest = {
                    ...baseRequest,
                    onFirstText: at => {
                        writerSawFirstText = true;
                        callerOnFirstText?.(at);
                    },
                };
                const adopted = draft.adopt(adoptRequest);
                if (adopted) {
                    this.onDraftEvent?.({ action: 'reused', turnKey: draft.turnKey });
                    const done = adopted.done.then<AnswerCompletion>(async (result) => {
                        if (result.status === 'failed'
                            && !controller.signal.aborted
                            && !writerSawFirstText
                            && !adopted.visibleTextShown()) {
                            const fallback = this.engine.runLiveBrainAnswer({
                                ...baseRequest,
                                reuseGenerationId: adopted.generationId,
                            });
                            return toAnswerCompletion(await fallback.done);
                        }
                        return toAnswerCompletion(result);
                    }).catch((): AnswerCompletion => 'failed').finally(() => {
                        if (this.active === controller) this.active = undefined;
                    });
                    return { generationId: adopted.generationId, done };
                }
                draft.cancel('adopt_rejected');
                this.onDraftEvent?.({ action: 'discarded', turnKey: draft.turnKey, reason: 'adopt_rejected' });
            } else {
                this.cancelDraft(mismatchReason);
            }
        }

        const answer = this.engine.runLiveBrainAnswer(baseRequest);
        const done = answer.done.then<AnswerCompletion>(toAnswerCompletion)
            .catch((): AnswerCompletion => 'failed')
            .finally(() => {
                if (this.active === controller) this.active = undefined;
            });
        return { generationId: answer.generationId, done };
    }

    cancel(reason: string): void {
        this.active?.abort(reason);
        this.active = undefined;
    }

    private draftMismatchReason(draft: LiveBrainPrivateDraft, question: string, turnKey?: string): string | null {
        if (!turnKey || draft.turnKey !== turnKey) return 'turn_mismatch';
        if (draft.sessionId !== this.sessionId) return 'session_mismatch';
        if (draft.question.trim() !== question.trim()) return 'transcript_changed';
        const currentRoute = this.engine.getLiveBrainAiRouteKey?.();
        if (currentRoute !== undefined && draft.routeKey !== currentRoute) return 'route_changed';
        if (!draft.canAdopt()) return 'draft_unusable';
        return null;
    }
}
