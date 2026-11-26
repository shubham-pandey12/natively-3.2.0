import type { LiveBrain, LiveBrainEvent, LiveBrainId, LiveBrainStartContext } from '../types';

export class FakeLiveBrain implements LiveBrain {
    readonly starts: LiveBrainStartContext[] = [];
    readonly audio: { pcm: Int16Array; sampleRate: number }[] = [];
    readonly candidateTurns: { text: string; at: number }[] = [];
    readonly cancellations: string[] = [];
    stopCalls = 0;
    clarificationRequests = 0;

    private active = false;
    private readonly listeners = new Set<(event: LiveBrainEvent) => void>();

    constructor(readonly id: LiveBrainId = 'gemini-live') {}

    async start(ctx: LiveBrainStartContext): Promise<void> {
        this.starts.push(ctx);
        ctx.signal.throwIfAborted();
        this.active = true;
    }

    pushInterviewerAudio(pcm: Int16Array, sampleRate: number): void {
        this.audio.push({ pcm: new Int16Array(pcm), sampleRate });
    }

    addCandidateText(text: string, at: number): void {
        this.candidateTurns.push({ text, at });
    }

    requestClarificationAnswer(): void {
        this.clarificationRequests++;
    }

    cancelResponse(reason: string): void {
        this.cancellations.push(reason);
    }

    async stop(): Promise<void> {
        if (!this.active) return;
        this.active = false;
        this.stopCalls++;
    }

    onEvent(listener: (event: LiveBrainEvent) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    emit(event: LiveBrainEvent): void {
        if (!this.active) return;
        for (const listener of [...this.listeners]) listener(event);
    }
}
