import type { LiveBrainAnswerEngine } from '../../../electron/premium/liveBrain';
import type { AnswerCompletion, AnswerWriterPort } from './ResponseOrchestrator';

export class AnswerWriter implements AnswerWriterPort {
    private active?: AbortController;

    constructor(private readonly engine: LiveBrainAnswerEngine) {}

    write(
        request: Parameters<AnswerWriterPort['write']>[0],
        optionsOrFirstText?: ((at: number) => void) | { suppressQuestionRow?: boolean },
    ): ReturnType<AnswerWriterPort['write']> {
        this.cancel('answer_corrected');
        const controller = new AbortController();
        this.active = controller;
        const onFirstText = typeof optionsOrFirstText === 'function' ? optionsOrFirstText : undefined;
        const suppressQuestionRow = typeof optionsOrFirstText === 'object' ? optionsOrFirstText?.suppressQuestionRow : undefined;
        const answer = this.engine.runLiveBrainAnswer({
            ...request,
            signal: controller.signal,
            ...(onFirstText ? { onFirstText } : {}),
            ...(suppressQuestionRow ? { suppressQuestionRow } : {}),
        });
        const done = answer.done.then<AnswerCompletion>(({ status }) => {
            if (status === 'completed' || status === 'partial') return 'completed';
            return status === 'cancelled' ? 'cancelled' : 'failed';
        }).catch((): AnswerCompletion => 'failed').finally(() => {
            if (this.active === controller) this.active = undefined;
        });
        return { generationId: answer.generationId, done };
    }

    cancel(reason: string): void {
        this.active?.abort(reason);
        this.active = undefined;
    }
}
