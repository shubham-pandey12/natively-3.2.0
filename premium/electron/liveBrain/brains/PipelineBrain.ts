import type { LiveBrain, LiveBrainEvent, LiveBrainStartContext } from '../types';

export type PipelineOutput = {
    generationId: number;
    type: 'token' | 'answer' | 'discard' | 'failed';
    text?: string;
};

/** Observes the existing Auto Answer engine; the engine still delivers its native rows. */
export class PipelineBrain implements LiveBrain {
    readonly id = 'pipeline';
    private readonly listeners = new Set<(event: LiveBrainEvent) => void>();
    private active = false;
    private generation?: number;
    private text = '';
    private latestClosed = 0;

    constructor(private readonly cancel: () => void) {}

    async start(ctx: LiveBrainStartContext): Promise<void> {
        ctx.signal.throwIfAborted();
        this.active = true;
        this.emit({ type: 'status', status: 'ready' });
    }

    pushInterviewerAudio(): void { /* Existing STT owns pipeline transcripts. */ }
    addCandidateText(): void { /* Existing STT already adds candidate speech. */ }
    cancelResponse(): void { if (this.active) this.cancel(); }

    interviewerTranscript(text: string, final: boolean, at: number): void {
        if (this.active) this.emit({ type: 'interviewer_transcript', text, final, at });
    }

    observe(output: PipelineOutput): void {
        if (!this.active || output.generationId <= this.latestClosed
            || (this.generation !== undefined && output.generationId < this.generation)) return;
        if (output.type === 'discard' || output.type === 'failed') {
            if (this.generation === output.generationId) this.finish(output.type === 'failed' ? 'failed' : 'cancelled');
            this.latestClosed = Math.max(this.latestClosed, output.generationId);
            return;
        }
        if (!output.text?.trim()) return;
        const responseId = `pipeline:${output.generationId}`;
        if (this.generation !== output.generationId) {
            this.finish('cancelled');
            this.generation = output.generationId;
            this.emit({ type: 'response_started', responseId, at: Date.now() });
        }
        const delta = output.type === 'answer' && output.text.startsWith(this.text)
            ? output.text.slice(this.text.length) : output.type === 'token' ? output.text : '';
        if (delta) {
            this.text += delta.slice(0, Math.max(0, 16_000 - this.text.length));
            this.emit({ type: 'response_delta', responseId, text: delta });
        }
        if (output.type === 'answer') this.finish('completed', output.text);
    }

    async stop(): Promise<void> {
        this.active = false;
        this.finish('cancelled');
    }

    onEvent(listener: (event: LiveBrainEvent) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    private finish(status: 'cancelled' | 'completed' | 'failed', finalText?: string): void {
        if (this.generation === undefined) return;
        const responseId = `pipeline:${this.generation}`;
        this.latestClosed = this.generation;
        this.generation = undefined;
        this.text = '';
        this.emit({ type: 'response_done', responseId, status, ...(finalText ? { finalText } : {}) });
    }

    private emit(event: LiveBrainEvent): void {
        for (const listener of this.listeners) listener(event);
    }
}
