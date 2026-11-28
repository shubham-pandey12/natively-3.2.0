import { REALTIME_READY_RESET_MS } from '../../../electron/audio/realtimeTransport';
import { InterviewNotebook, renderRecentTurns } from './InterviewNotebook';
import { createResponseParser } from './responseParser';
import type { OrchestratorDisposition, ResponseClock } from './ResponseOrchestrator';
import type { ConversationTurn, LiveBrain, LiveBrainEvent, LiveBrainId, LiveBrainStartContext } from './types';

const FALLBACK_ORDER: readonly LiveBrainId[] = [
    'gemini-live',
    'elevenlabs-realtime',
    'deepgram-flux',
    'deepgram-voice-agent',
    'openai-realtime',
    'amazon-sonic',
];
const ROLLOVER_MS = {
    'gemini-live': 13.5 * 60_000,
    'openai-realtime': 50 * 60_000,
    'elevenlabs-realtime': 8.5 * 60_000,
    'deepgram-voice-agent': 110 * 60_000,
    'deepgram-flux': 50 * 60_000,
    'amazon-sonic': 7.5 * 60_000,
};
const MAX_AUDIO_SAMPLES = 160_000; // 10 s of 16 kHz PCM
const MAX_RESPONSE_CHARS = 16_000; // notebook only; the overlay receives the entire stream
const NO_RESPONSE_MS = 6_000;
const BARGE_IN_GRACE_MS = 1_500;

interface Lease {
    brain: LiveBrain;
    model: string;
    reason: string;
    since: number;
    readyAt?: number;
    ready: boolean;
    controller: AbortController;
    seeded?: ConversationTurn[];
    groundingKey?: string;
    pendingFluxTranscript?: { text: string; at: number };
    unsubscribe?: () => void;
}

export class BrainSupervisor<Timer> {
    private active?: Lease;
    private standby?: Lease;
    private stopped = true;
    private rollover?: Timer;
    private deadline?: Timer;
    private responseTimeout?: Timer;
    private bargeInGrace?: Timer;
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
    private externalWriting = false;
    private missedTurnsDiscards = 0;
    private groundingDiscards = 0;
    private connectionSequence = 0;
    private readonly attempted = new Set<LiveBrainId>();
    private readonly retriedFresh = new Set<LiveBrainId>();

    constructor(private readonly options: {
        sessionId: string;
        preferred: LiveBrainId;
        instructions(id: LiveBrainId, notebookText?: string): string;
        groundingKey?(): string | undefined;
        notebook: InterviewNotebook;
        clock: ResponseClock<Timer>;
        create(id: LiveBrainId): { brain: LiveBrain; model: string } | undefined;
        onEvent(event: LiveBrainEvent, id: LiveBrainId, model: string): OrchestratorDisposition | void;
        onSwitch?(data: { from?: LiveBrainId; to: LiveBrainId; reason: string; elapsedMs: number }): void;
        onRollover?(data: { brain: LiveBrainId; reason: string; elapsedMs: number }): void;
        onLeaseDetached?(lease: { brain: LiveBrain; model: string }, reason: string, role: 'active' | 'standby'): void;
    }) { }

    get current(): LiveBrain | undefined { return this.active?.brain; }
    get notebookContext(): string {
        return [this.options.notebook.renderNotebook(), renderRecentTurns(this.options.notebook.recentTurns())].filter(Boolean).join('\n\n');
    }
    get pipelineContext(): string {
        return this.current?.id === 'pipeline' ? this.notebookContext : '';
    }

    setExternalWriting(writing: boolean): void {
        this.externalWriting = writing;
        if (!writing) this.promote();
    }

    recordAssistantTurn(text: string, isClarification = false): void {
        if (!this.stopped && text.trim()) {
            this.options.notebook.record({ role: 'assistant', text: text.trim(), at: this.options.clock.now() }, isClarification);
        }
    }

    mergeInterviewerTurn(previous: string, next: string, at: number): void {
        if (this.stopped) return;
        if (this.active?.pendingFluxTranscript?.text === next) this.active.pendingFluxTranscript = undefined;
        this.options.notebook.mergeInterviewerTurn(previous, next, at);
    }

    recordInterviewerTurn(text: string, at: number): void {
        if (!this.stopped) this.options.notebook.record({ role: 'interviewer', text, at });
    }

    start(): void {
        if (!this.stopped) return;
        const preferred = this.options.preferred;
        if (preferred !== 'pipeline' && !FALLBACK_ORDER.includes(preferred)) {
            throw new Error(`Unsupported live brain: ${String(preferred)}`);
        }
        this.stopped = false;
        this.missedTurnsDiscards = 0;
        this.groundingDiscards = 0;
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
        this.release(active, 'stopped', 'active');
        this.release(standby, 'stopped', 'standby');
        this.response = undefined;
        this.rolloverAt = undefined;
        this.latestSpeechStop = undefined;
        this.missed = 0;
        this.speaking = false;
        this.forceHandoff = false;
        this.externalWriting = false;
        this.missedTurnsDiscards = 0;
        this.groundingDiscards = 0;
        this.clearAudio();
        this.candidates = [];
        this.options.notebook.clear();
    }

    refreshContext(): void {
        const previous = this.active;
        if (this.stopped || !previous || previous.brain.id === 'pipeline' || previous.brain.id === 'deepgram-flux') return;
        const replacement = this.create(previous.brain.id, 'context_revoked');
        this.finishActiveResponse(previous, 'cancelled', 'context_revoked');
        this.active = replacement;
        const standby = this.standby;
        this.standby = undefined;
        this.clearTimers();
        this.release(previous, 'context_revoked', 'active');
        this.release(standby, 'context_revoked', 'standby');
        this.speaking = false;
        this.missed = 0;
        this.latestSpeechStop = undefined;
        this.rolloverAt = this.options.clock.now();
        if (replacement) this.launch(replacement);
        else this.select('context_revoked', previous.brain.id);
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
        this.armResponseTimeout(lease);
    }

    private armResponseTimeout(lease: Lease): void {
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
        const ids: readonly LiveBrainId[] = preferred === 'pipeline'
            ? ['pipeline']
            : [preferred, ...FALLBACK_ORDER.filter(id => id !== preferred), 'pipeline'];
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
        lease.groundingKey = this.options.groundingKey?.();
        const refreshContext = () => {
            const recentTurns = notebook.recentTurns();
            const id = lease.brain.id;
            // Deepgram already gets verbatim turns separately in agent.context.messages.
            const notebookText = [notebook.renderNotebook(), id !== 'deepgram-voice-agent' && renderRecentTurns(recentTurns)]
                .filter(Boolean).join('\n\n');
            return {
                notebook: notebook.snapshot(), recentTurns,
                instructions: this.options.instructions(id, notebookText),
            };
        };
        const initial = refreshContext();
        if (lease === this.standby) lease.seeded = initial.recentTurns;
        else this.quoteAfter = this.options.clock.now();
        const ctx: LiveBrainStartContext = {
            sessionId: this.options.sessionId, responseNamespace: `${this.options.sessionId}:${++this.connectionSequence}`,
            signal: lease.controller.signal, ...initial,
            needsFreshContext: () => lease.groundingKey !== this.options.groundingKey?.(),
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
            this.fail(lease, event.code, event.detail === 'session_resumption_failed'
                || (lease.brain.id === 'amazon-sonic' && (event.code === 'network' || event.code === 'timeout')));
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
            if (event.resumable === false || lease.groundingKey !== this.options.groundingKey?.()) this.prepareFresh(lease, event.inMs, event.resumable === false ? 'no_resume_handle' : 'context_changed');
        }
        if (event.type === 'interviewer_speech_started') {
            this.speaking = true;
            this.clearResponseTimeout();
        }
        if (event.type === 'interviewer_speech_stopped') this.noteSpeechStop(event.at);
        if (event.type === 'provider_response_progress' && this.responseTimeout !== undefined && !this.speaking) {
            this.missed = 0;
            this.clearResponseTimeout();
            this.armResponseTimeout(lease);
        }
        if (event.type === 'decision') {
            this.clearResponseTimeout();
            this.missed = 0;
            this.speaking = false;
            if (event.action === 'answer') this.clearAudio();
        }
        if (event.type === 'response_started') {
            this.clearBargeInGrace();
            this.clearResponseTimeout();
            this.missed = 0;
            this.speaking = false;
            this.response = { id: event.responseId, text: '' };
            this.clearAudio(); // The current provider owns this question.
        }
        if (event.type === 'response_delta' && this.response?.id === event.responseId) {
            this.response.text += event.text.slice(0, MAX_RESPONSE_CHARS - this.response.text.length);
        }
        let rawResponse: string | undefined;
        if (event.type === 'response_done' && this.response?.id === event.responseId) {
            if (event.status === 'completed') rawResponse = event.finalText ?? this.response.text;
            else if (event.status === 'cancelled') {
                rawResponse = this.response.text;
                if (lease.brain.id !== 'pipeline' && !this.speaking
                    && (event.cancelReason === 'interviewer_barge_in' || event.cancelReason === undefined)) {
                    this.clearBargeInGrace();
                    this.bargeInGrace = this.options.clock.setTimeout(() => {
                        this.bargeInGrace = undefined;
                        this.promote();
                    }, BARGE_IN_GRACE_MS);
                }
            }
            this.response = undefined;
        }
        if (event.type === 'response_silent') {
            this.clearBargeInGrace();
            this.clearResponseTimeout();
            this.missed = 0;
            this.speaking = false;
        }
        const disposition = this.options.onEvent(event, lease.brain.id, lease.model);
        if (event.type === 'interviewer_transcript' && event.final && disposition?.kind !== 'interviewer_already_recorded') {
            // Flux confirms this transcript in the immediately following decision.
            // Draft and final use the same pre-question notebook.
            if (lease.brain.id === 'deepgram-flux') lease.pendingFluxTranscript = event;
            else this.recordInterviewerTurn(event.text, event.at);
        }
        if ((disposition?.kind === 'interviewer_confirmed' || disposition?.kind === 'interviewer_already_recorded')
            && disposition.deferredAnswer !== undefined) {
            this.recordAssistantTurn(disposition.deferredAnswer, disposition.deferredAsk);
        }
        if (event.type === 'decision' && lease.pendingFluxTranscript) {
            const { text, at } = lease.pendingFluxTranscript;
            lease.pendingFluxTranscript = undefined;
            this.recordInterviewerTurn(text, at);
        }
        if (rawResponse !== undefined) {
            if (disposition?.kind === 'answer' || disposition?.kind === 'ask') {
                this.recordAssistantTurn(disposition.text, disposition.kind === 'ask');
            } else if (!disposition) {
                this.recordAnswer(rawResponse);
            }
        }
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
        lease.readyAt = this.options.clock.now();
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
            if (lease.groundingKey !== this.options.groundingKey?.() || !lease.brain.requestSessionRollover?.(30_000)) this.prepareFresh(lease, 30_000, 'scheduled');
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
        if (!replacement?.ready || (!force && !this.forceHandoff && (this.response || this.externalWriting || this.speaking || this.bargeInGrace !== undefined) && this.active?.ready)) return;
        if (replacement.groundingKey !== this.options.groundingKey?.() && !force && !this.forceHandoff && this.groundingDiscards < 3) {
            this.groundingDiscards++;
            this.standby = undefined;
            if (this.deadline !== undefined) {
                this.options.clock.clearTimeout(this.deadline);
                this.deadline = undefined;
            }
            this.forceHandoff = false;
            this.release(replacement, 'context_changed', 'standby');
            if (!this.stopped && this.active) this.prepareFresh(this.active, 30_000, 'context_changed');
            else if (!this.stopped) this.select('context_changed', replacement.brain.id);
            return;
        }
        const seeded = replacement.seeded ?? [];
        const history = this.options.notebook.recentTurns().filter(
            turn => !seeded.some(before => before.at === turn.at && before.role === turn.role && before.text === turn.text),
        );
        if (history.length > 0 && !replacement.brain.addHistoryContext && !force && !this.forceHandoff && this.missedTurnsDiscards < 1) {
            this.missedTurnsDiscards++;
            this.standby = undefined;
            if (this.deadline !== undefined) {
                this.options.clock.clearTimeout(this.deadline);
                this.deadline = undefined;
            }
            this.forceHandoff = false;
            this.release(replacement, 'missed_turns', 'standby');
            if (!this.stopped && this.active) this.prepareFresh(this.active, 30_000, 'missed_turns');
            else if (!this.stopped) this.select('missed_turns', replacement.brain.id);
            return;
        }
        const previous = this.active;
        const detachReason = this.forceHandoff ? 'forced_rollover' : 'rollover';
        this.missedTurnsDiscards = 0;
        this.groundingDiscards = 0;
        this.finishActiveResponse(previous, 'cancelled', 'rollover');
        this.active = replacement;
        this.standby = undefined;
        this.speaking = false;
        this.clearTimers();
        this.release(previous, detachReason, 'active');
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
            this.release(lease, reason, 'standby');
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
        this.release(lease, reason, 'active');
        if (this.standby) {
            if (reason !== 'auth' && reason !== 'quota') {
                this.promote(true);
                return;
            }
            const standby = this.standby;
            this.standby = undefined;
            this.release(standby, reason, 'standby');
        }
        if (retryFresh && lease.brain.id === 'amazon-sonic'
            && lease.readyAt !== undefined
            && this.options.clock.now() - lease.readyAt >= REALTIME_READY_RESET_MS) {
            this.retriedFresh.delete('amazon-sonic');
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

    private finishActiveResponse(
        lease: Lease | undefined,
        status: 'cancelled' | 'failed',
        cancelReason?: 'interviewer_barge_in' | 'manual' | 'rollover' | 'context_revoked',
    ): void {
        if (lease && this.response) this.options.onEvent({
            type: 'response_done', responseId: this.response.id, status,
            ...(cancelReason ? { cancelReason } : {}),
        }, lease.brain.id, lease.model);
        this.response = undefined;
    }

    private release(lease?: Lease, reason = 'released', role: 'active' | 'standby' = 'active'): void {
        if (!lease) return;
        lease.unsubscribe?.();
        lease.controller.abort();
        this.options.onLeaseDetached?.({ brain: lease.brain, model: lease.model }, reason, role);
        void lease.brain.stop().catch(() => { });
    }

    private clearAudio(): void { this.audio = []; this.audioSamples = 0; }
    private clearResponseTimeout(): void {
        if (this.responseTimeout !== undefined) this.options.clock.clearTimeout(this.responseTimeout);
        this.responseTimeout = undefined;
    }
    private clearBargeInGrace(): void {
        if (this.bargeInGrace !== undefined) this.options.clock.clearTimeout(this.bargeInGrace);
        this.bargeInGrace = undefined;
    }

    private clearTimers(): void {
        this.clearBargeInGrace();
        this.clearResponseTimeout();
        if (this.rollover !== undefined) this.options.clock.clearTimeout(this.rollover);
        if (this.deadline !== undefined) this.options.clock.clearTimeout(this.deadline);
        this.rollover = this.deadline = undefined;
    }
}
