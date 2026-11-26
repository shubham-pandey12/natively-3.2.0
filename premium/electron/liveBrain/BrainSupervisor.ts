import { InterviewNotebook, renderRecentTurns } from './InterviewNotebook';
import { createResponseParser } from './responseParser';
import type { ResponseClock } from './ResponseOrchestrator';
import type { ConversationTurn, LiveBrain, LiveBrainEvent, LiveBrainId, LiveBrainStartContext } from './types';

const REALTIME = ['gemini-live', 'openai-realtime', 'elevenlabs-realtime', 'deepgram-voice-agent'] as const;
const ROLLOVER_MS = {
    'gemini-live': 13.5 * 60_000,
    'openai-realtime': 50 * 60_000,
    'elevenlabs-realtime': 8.5 * 60_000,
    'deepgram-voice-agent': 110 * 60_000,
};
const MAX_AUDIO_SAMPLES = 160_000; // 10 s of 16 kHz PCM
const MAX_RESPONSE_CHARS = 16_000; // notebook only; the overlay receives the entire stream
const NO_RESPONSE_MS = 6_000;

interface Lease {
    brain: LiveBrain;
    model: string;
    reason: string;
    since: number;
    ready: boolean;
    controller: AbortController;
    seeded?: ConversationTurn[];
    unsubscribe?: () => void;
}

export class BrainSupervisor<Timer> {
    private active?: Lease;
    private standby?: Lease;
    private stopped = true;
    private rollover?: Timer;
    private deadline?: Timer;
    private responseTimeout?: Timer;
    private latestSpeechStop?: number;
    private missed = 0;
    private speaking = false;
    private response?: { id: string; text: string };
    private audio: Int16Array[] = [];
    private audioSamples = 0;
    private candidates: { text: string; at: number }[] = [];
    private quoteAfter = 0;
    private rolloverAt?: number;
    private forceHandoff = false;
    private connectionSequence = 0;
    private readonly attempted = new Set<LiveBrainId>();
    private readonly retriedFresh = new Set<LiveBrainId>();

    constructor(private readonly options: {
        sessionId: string;
        preferred: LiveBrainId;
        instructions(id: LiveBrainId): string;
        notebook: InterviewNotebook;
        clock: ResponseClock<Timer>;
        create(id: LiveBrainId): { brain: LiveBrain; model: string } | undefined;
        onEvent(event: LiveBrainEvent, id: LiveBrainId, model: string): void;
        onSwitch?(data: { from?: LiveBrainId; to: LiveBrainId; reason: string; elapsedMs: number }): void;
        onRollover?(data: { brain: LiveBrainId; reason: string; elapsedMs: number }): void;
    }) {}

    get current(): LiveBrain | undefined { return this.active?.brain; }
    get pipelineContext(): string {
        return this.current?.id === 'pipeline'
            ? [this.options.notebook.renderNotebook(), renderRecentTurns(this.options.notebook.recentTurns())].filter(Boolean).join('\n\n')
            : '';
    }

    start(): void {
        if (!this.stopped) return;
        const preferred = this.options.preferred;
        if (preferred !== 'pipeline' && !REALTIME.some(id => id === preferred)) throw new Error(`Unsupported live brain: ${String(preferred)}`);
        this.stopped = false;
        this.options.notebook.clear();
        this.attempted.clear();
        this.retriedFresh.clear();
        this.select('meeting_start');
    }

    stop(): void {
        this.stopped = true;
        this.clearTimers();
        const { active, standby } = this;
        this.active = this.standby = undefined;
        this.release(active);
        this.release(standby);
        this.response = undefined;
        this.rolloverAt = undefined;
        this.latestSpeechStop = undefined;
        this.missed = 0;
        this.speaking = false;
        this.forceHandoff = false;
        this.clearAudio();
        this.candidates = [];
        this.options.notebook.clear();
    }

    pushAudio(pcm: Int16Array): void {
        if (this.stopped || this.current?.id === 'pipeline' || !pcm.length) return;
        if (!this.active?.ready || this.standby) {
            const chunk = new Int16Array(pcm.subarray(Math.max(0, pcm.length - MAX_AUDIO_SAMPLES)));
            this.audio.push(chunk);
            this.audioSamples += chunk.length;
            while (this.audioSamples > MAX_AUDIO_SAMPLES) this.audioSamples -= this.audio.shift()!.length;
        }
        if (this.active?.ready) this.active.brain.pushInterviewerAudio(pcm, 16_000);
    }

    addCandidateText(text: string, at: number): void {
        if (this.stopped) return;
        this.options.notebook.record({ role: 'candidate', text, at });
        if (!this.active?.ready || this.standby) {
            this.candidates.push({ text: text.slice(0, 2_000), at });
            if (this.candidates.length > 20) this.candidates.shift();
        }
        if (this.active?.ready) this.active.brain.addCandidateText(text, at);
    }

    noteSpeechStop(at: number): void {
        const lease = this.active;
        if (!lease?.ready || lease.brain.id === 'pipeline') return;
        this.speaking = false;
        if (this.responseTimeout !== undefined || (this.latestSpeechStop !== undefined && at - this.latestSpeechStop < 1_500)) return;
        this.latestSpeechStop = at;
        this.responseTimeout = this.options.clock.setTimeout(() => {
            this.responseTimeout = undefined;
            if (this.active === lease && ++this.missed >= 2) this.fail(lease, 'response_timeout');
        }, NO_RESPONSE_MS);
    }

    private create(id: LiveBrainId, reason: string): Lease | undefined {
        const provider = this.options.create(id);
        if (!provider) return undefined;
        if (provider.brain.id !== id) throw new Error(`Live brain factory returned ${provider.brain.id} for ${id}`);
        return { ...provider, reason, since: this.options.clock.now(), ready: false, controller: new AbortController() };
    }

    private select(reason: string, from?: LiveBrainId): void {
        const preferred = this.options.preferred;
        const ids: readonly LiveBrainId[] = preferred === 'pipeline' ? ['pipeline'] : [preferred, ...REALTIME, 'pipeline'];
        for (const id of ids) {
            if (this.attempted.has(id)) continue;
            this.attempted.add(id);
            const lease = this.create(id, reason);
            if (!lease) continue;
            this.active = lease;
            this.options.onSwitch?.({
                from, to: id, reason: reason === 'meeting_start' && id !== preferred ? 'preferred_unavailable' : reason, elapsedMs: 0,
            });
            this.launch(lease);
            return;
        }
    }

    private launch(lease: Lease): void {
        const { notebook } = this.options;
        const refreshContext = () => {
            const recentTurns = notebook.recentTurns();
            const instructions = this.options.instructions(lease.brain.id);
            return {
                notebook: notebook.snapshot(), recentTurns,
                // Deepgram seeds its history separately in agent.context.messages.
                instructions: lease.brain.id === 'deepgram-voice-agent'
                    ? instructions
                    : [instructions, notebook.renderNotebook(), renderRecentTurns(recentTurns)].filter(Boolean).join('\n\n'),
            };
        };
        const initial = refreshContext();
        if (lease === this.standby) lease.seeded = initial.recentTurns;
        else this.quoteAfter = this.options.clock.now();
        const ctx: LiveBrainStartContext = {
            sessionId: this.options.sessionId, responseNamespace: `${this.options.sessionId}:${++this.connectionSequence}`,
            signal: lease.controller.signal, ...initial,
            ...(lease.brain.id === 'deepgram-voice-agent' ? { refreshContext } : {}),
        };
        lease.unsubscribe = lease.brain.onEvent(event => this.onEvent(lease, event));
        void lease.brain.start(ctx).then(() => {
            if (!lease.ready) this.onEvent(lease, { type: 'status', status: 'ready' });
        }, () => this.fail(lease, 'startup_failed'));
    }

    private onEvent(lease: Lease, event: LiveBrainEvent): void {
        if (this.stopped || (lease !== this.active && lease !== this.standby)) return;
        if (event.type === 'error' && event.fatal) {
            if (lease === this.active) this.options.onEvent(event, lease.brain.id, lease.model);
            this.fail(lease, event.code, event.detail === 'session_resumption_failed');
            return;
        }
        if (event.type === 'status' && event.status === 'ready') {
            lease.ready = true;
            if (lease === this.standby) {
                this.promote();
                return;
            }
            this.ready(lease);
        }
        if (lease !== this.active) return;
        if (event.type === 'status' && (event.status === 'connecting' || event.status === 'degraded')) {
            lease.ready = false;
            this.clearResponseTimeout();
        }
        if (event.type === 'session_expiring') {
            this.rolloverAt ??= this.options.clock.now();
            if (event.resumable === false) this.prepareFresh(lease, event.inMs, 'no_resume_handle');
        }
        if (event.type === 'interviewer_speech_started') {
            this.speaking = true;
            this.clearResponseTimeout();
        }
        if (event.type === 'interviewer_speech_stopped') this.noteSpeechStop(event.at);
        if (event.type === 'interviewer_transcript' && event.final) {
            this.options.notebook.record({ role: 'interviewer', text: event.text, at: event.at });
        }
        if (event.type === 'response_started') {
            this.clearResponseTimeout();
            this.missed = 0;
            this.speaking = false;
            this.response = { id: event.responseId, text: '' };
            this.clearAudio(); // The current provider owns this question.
        }
        if (event.type === 'response_delta' && this.response?.id === event.responseId) {
            this.response.text += event.text.slice(0, MAX_RESPONSE_CHARS - this.response.text.length);
        }
        if (event.type === 'response_done' && this.response?.id === event.responseId) {
            // Audio-mode providers keep "speaking" long after the text is on
            // screen, so the interviewer's next words usually cancel the turn.
            // Text already shown was seen by the candidate: keep it in the notebook.
            if (event.status === 'completed') this.recordAnswer(event.finalText ?? this.response.text);
            else if (event.status === 'cancelled' && this.response.text.trim()) this.recordAnswer(this.response.text);
            this.response = undefined;
        }
        if (event.type === 'response_silent') {
            this.clearResponseTimeout();
            this.missed = 0;
            this.speaking = false;
        }
        this.options.onEvent(event, lease.brain.id, lease.model);
        if (event.type === 'response_done' || event.type === 'response_silent') this.promote();
    }

    private recordAnswer(text: string): void {
        const parser = createResponseParser();
        const parts = [...parser.push(text), ...parser.finish()];
        const kind = parts.find(part => part.type === 'kind')?.kind;
        if (kind === 'answer' || kind === 'ask') {
            const answer = parts.flatMap(part => part.type === 'text' ? [part.text] : []).join('');
            this.options.notebook.record({ role: 'assistant', text: answer, at: this.options.clock.now() }, kind === 'ask');
        }
    }

    private ready(lease: Lease): void {
        const id = lease.brain.id;
        const began = this.rolloverAt;
        if (began !== undefined) {
            this.options.onRollover?.({ brain: id, reason: lease.reason, elapsedMs: this.options.clock.now() - began });
            this.rolloverAt = undefined;
        }
        const audio = this.audio;
        this.clearAudio();
        for (const chunk of audio) lease.brain.pushInterviewerAudio(chunk, 16_000);
        for (const candidate of this.candidates.splice(0)) {
            if (candidate.at >= this.quoteAfter) lease.brain.addCandidateText(candidate.text, candidate.at);
        }
        if (this.rollover !== undefined) this.options.clock.clearTimeout(this.rollover);
        if (id !== 'pipeline') this.rollover = this.options.clock.setTimeout(() => {
            if (this.active !== lease || this.standby) return;
            this.rolloverAt = this.options.clock.now();
            if (!lease.brain.requestSessionRollover?.(30_000)) this.prepareFresh(lease, 30_000, 'scheduled');
        }, ROLLOVER_MS[id]);
    }

    private prepareFresh(lease: Lease, inMs: number, reason: string): void {
        if (this.standby) return;
        this.standby = this.create(lease.brain.id, reason);
        if (!this.standby) return;
        this.forceHandoff = false;
        this.deadline = this.options.clock.setTimeout(() => {
            this.forceHandoff = true;
            this.promote();
        }, Math.max(0, inMs - 1_000));
        this.launch(this.standby);
    }

    private promote(force = false): void {
        const replacement = this.standby;
        if (!replacement?.ready || (!force && !this.forceHandoff && (this.response || this.speaking) && this.active?.ready)) return;
        const previous = this.active;
        this.finishActiveResponse(previous, 'cancelled');
        this.active = replacement;
        this.standby = undefined;
        this.speaking = false;
        this.clearTimers();
        this.release(previous);
        const seeded = replacement.seeded ?? [];
        const history = this.options.notebook.recentTurns().filter(turn => turn.at >= replacement.since
            && !seeded.some(before => before.at === turn.at && before.role === turn.role && before.text === turn.text));
        if (replacement.brain.addHistoryContext) {
            replacement.brain.addHistoryContext(renderRecentTurns(history));
            this.candidates = [];
        }
        replacement.seeded = undefined;
        this.ready(replacement);
        this.options.onEvent({ type: 'status', status: 'ready' }, replacement.brain.id, replacement.model);
    }

    private fail(lease: Lease, reason: string, retryFresh = false): void {
        if (lease === this.standby) {
            this.standby = undefined;
            this.release(lease);
            if (!this.active) {
                this.rolloverAt = undefined;
                this.select(reason, lease.brain.id);
            }
            return;
        }
        if (lease !== this.active) return;
        this.finishActiveResponse(lease, 'failed');
        this.active = undefined;
        this.speaking = false;
        this.missed = 0;
        this.latestSpeechStop = undefined;
        this.clearTimers();
        this.release(lease);
        if (this.standby) {
            if (reason !== 'auth' && reason !== 'quota') {
                this.promote(true);
                return;
            }
            const standby = this.standby;
            this.standby = undefined;
            this.release(standby);
        }
        if (retryFresh && !this.retriedFresh.has(lease.brain.id)) {
            this.retriedFresh.add(lease.brain.id);
            const fresh = this.create(lease.brain.id, 'resumption_failed');
            if (fresh) {
                this.rolloverAt ??= this.options.clock.now();
                this.active = fresh;
                this.launch(fresh);
                return;
            }
        }
        this.rolloverAt = undefined;
        this.select(reason, lease.brain.id);
    }

    private finishActiveResponse(lease: Lease | undefined, status: 'cancelled' | 'failed'): void {
        if (lease && this.response) this.options.onEvent({
            type: 'response_done', responseId: this.response.id, status,
        }, lease.brain.id, lease.model);
        this.response = undefined;
    }

    private release(lease?: Lease): void {
        if (!lease) return;
        lease.unsubscribe?.();
        lease.controller.abort();
        void lease.brain.stop().catch(() => {});
    }

    private clearAudio(): void { this.audio = []; this.audioSamples = 0; }
    private clearResponseTimeout(): void {
        if (this.responseTimeout !== undefined) this.options.clock.clearTimeout(this.responseTimeout);
        this.responseTimeout = undefined;
    }
    private clearTimers(): void {
        this.clearResponseTimeout();
        if (this.rollover !== undefined) this.options.clock.clearTimeout(this.rollover);
        if (this.deadline !== undefined) this.options.clock.clearTimeout(this.deadline);
        this.rollover = this.deadline = undefined;
    }
}
