import WebSocket from 'ws';
import {
    isProtocolCloseCode,
    REALTIME_READY_RESET_MS,
    realtimeReconnectDelay,
    realtimeSocketOptions,
    resampleRealtimePcm16,
    SocketBackpressureTracker,
} from '../../../../electron/audio/realtimeTransport';
import { safeDetachAndClose } from '../../../../electron/audio/wsSafeTeardown';
import { getSttContextTerms } from '../../../../electron/audio/sttContextTerms';
import { DEFAULT_DEEPGRAM_FLUX_MODEL } from '../../../../src/types/liveBrainSettings';
import type { LiveBrain, LiveBrainErrorCode, LiveBrainEvent, LiveBrainStartContext } from '../types';

export const DEEPGRAM_FLUX_ENDPOINT = 'wss://api.deepgram.com/v2/listen';
export const DEEPGRAM_FLUX_SAMPLE_RATE = 16_000;
export const DEEPGRAM_FLUX_FRAME_SAMPLES = 1_280; // 80 ms at 16 kHz mono (documented Flux chunk size)
export const DEEPGRAM_FLUX_FRAME_BYTES = DEEPGRAM_FLUX_FRAME_SAMPLES * 2; // 2,560 bytes
const SILENCE_FILL_AFTER_MS = 300;
const BYTES_PER_MS = DEEPGRAM_FLUX_SAMPLE_RATE * 2 / 1_000;
// A falling voice mid-question can exceed the default Flux confidence, so this
// stays above Flux's 0.7 default. 0.95 + 1,500 ms added up to two seconds of
// silence before an answer could start; with barge-in now stopping an answer
// when the interviewer keeps talking, an early end costs much less.
const DEFAULT_EOT_THRESHOLD = 0.9;
// Tuned on the Windows Phase 1 synthetic clips: 0.50 fires EagerEndOfTurn
// ~0.7-1.6s ahead of EndOfTurn (and catches resumed S2 turns at ~0.503 where
// 0.60 missed them), while 0.95 + 1,500 ms still guards confirmed EndOfTurn.
export const DEFAULT_EAGER_EOT_THRESHOLD = 0.5;
const DEFAULT_EOT_TIMEOUT_MS = 1_200;
// Deepgram keyterm prompting: the user's name and dictionary words (sttContextTerms.ts).
const MAX_FLUX_KEYTERMS = 50;
const SILENCE_FILL_INTERVAL_MS = 80;
const MAX_RETRIES = 3;

export interface DeepgramFluxOptions {
    apiKey: string;
    model?: string;
    endpoint?: string;
    setupTimeoutMs?: number;
    backoffMs?: readonly number[];
    eotThreshold?: number;
    eagerEotThreshold?: number;
    eotTimeoutMs?: number;
    /** Words to bias recognition toward; defaults to the meeting's STT context terms. */
    keyterms?: readonly string[];
}

interface FluxWireMessage {
    type?: string;
    event?: string;
    sequence_id?: number;
    turn_index?: number;
    transcript?: string;
    code?: string;
    description?: string;
    message?: string;
}

export class DeepgramFluxError extends Error {
    constructor(readonly code: LiveBrainErrorCode, detail?: string) {
        super(detail ? `Deepgram Flux failed (${code}): ${detail}` : `Deepgram Flux failed (${code}).`);
    }
}

function classify(status: number | undefined, detail: string, fallback: LiveBrainErrorCode): LiveBrainErrorCode {
    if (/insufficient.quota|credit.balance|quota.exceeded|out.of.credits|insufficient_funds/i.test(detail) || status === 402) return 'quota';
    if (status === 401 || status === 403 || status === 4001 || status === 4003
        || /invalid_auth|invalid.credential|invalid.api.key|authentication|unauthenticated|permission.denied|unauthorized/i.test(detail)) return 'auth';
    if (status === 429 || status === 1013 || /rate.limit|too.many.requests|concurrency/i.test(detail)) return 'rate_limited';
    if (/invalid_settings|model.not.available|model.not.found|unsupported/i.test(detail)) return 'unsupported';
    if (isProtocolCloseCode(status) || (status !== undefined && status >= 400 && status < 500)) return 'protocol';
    return fallback;
}

/**
 * Standalone Deepgram Flux v2 STT + turn-detection brain. Emits live
 * interviewer transcripts on Update/EagerEndOfTurn and triggers exactly one
 * AnswerWriter decision per confirmed, meaningful EndOfTurn.
 */
export class DeepgramFluxBrain implements LiveBrain {
    readonly id = 'deepgram-flux' as const;
    private readonly listeners = new Set<(event: LiveBrainEvent) => void>();
    private context?: LiveBrainStartContext;
    private startup?: { resolve(): void; reject(error: Error): void };
    private socket?: WebSocket;
    private setupTimer?: ReturnType<typeof setTimeout>;
    private retryTimer?: ReturnType<typeof setTimeout>;
    private audioTimer?: ReturnType<typeof setInterval>;
    private ready = false;
    private readyAt?: number;
    private speaking = false;
    private failures = 0;
    private sequence = 0;
    private connectionSequence = 0;
    private currentConnectionKey = '';
    private lastSequenceId?: number;
    private activeTurnIndex?: number;
    private lastFinalizedTurnIndex?: number;
    private lastPartialText = '';
    private activeEager: { turnKey: string; transcript: string } | null = null;
    private audio = Buffer.alloc(0);
    private audioThrough = 0;
    private readonly backpressure = new SocketBackpressureTracker(this.id);

    constructor(private readonly options: DeepgramFluxOptions) { }

    onEvent(listener: (event: LiveBrainEvent) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    start(context: LiveBrainStartContext): Promise<void> {
        if (this.context) return Promise.reject(new DeepgramFluxError('protocol'));
        if (context.signal.aborted) return Promise.reject(new DeepgramFluxError('network'));
        this.context = context;
        this.failures = 0;
        context.signal.addEventListener('abort', this.onAbort, { once: true });
        return new Promise((resolve, reject) => {
            this.startup = { resolve, reject };
            this.connect();
        });
    }

    async stop(): Promise<void> {
        if (!this.context) return;
        // Flush any buffered audio (< 80 ms) cleanly before closing the stream.
        if (this.ready && this.audio.length > 0) {
            this.sendBinary(this.audio);
            this.audio = Buffer.alloc(0);
        }
        if (this.ready) this.sendJson({ type: 'CloseStream' });
        this.dispose(new DeepgramFluxError('network'));
        this.emit({ type: 'status', status: 'closed' });
    }

    pushInterviewerAudio(pcm: Int16Array, sampleRate: number): void {
        if (!this.ready || !pcm.length || !Number.isFinite(sampleRate) || sampleRate <= 0) return;
        const input = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        this.enqueueAudio(resampleRealtimePcm16(input, sampleRate, 1, DEEPGRAM_FLUX_SAMPLE_RATE));
    }

    /** Candidate speech stays on Natively's existing mic/notebook context path. */
    addCandidateText(_text: string, _at: number): void { }

    /** Answer generation is handled downstream by AnswerWriter / ResponseOrchestrator. */
    cancelResponse(_reason: string): void { }

    buildEndpointUrl(): URL {
        const url = new URL(this.options.endpoint ?? DEEPGRAM_FLUX_ENDPOINT);
        if (!url.searchParams.has('model')) {
            url.searchParams.set('model', this.options.model?.trim() || DEFAULT_DEEPGRAM_FLUX_MODEL);
        }
        if (!url.searchParams.has('encoding')) url.searchParams.set('encoding', 'linear16');
        if (!url.searchParams.has('sample_rate')) url.searchParams.set('sample_rate', String(DEEPGRAM_FLUX_SAMPLE_RATE));
        if (!url.searchParams.has('eot_threshold')) {
            url.searchParams.set('eot_threshold', String(this.options.eotThreshold ?? DEFAULT_EOT_THRESHOLD));
        }
        const eagerEot = this.options.eagerEotThreshold ?? DEFAULT_EAGER_EOT_THRESHOLD;
        if (eagerEot > 0 && !url.searchParams.has('eager_eot_threshold')) {
            url.searchParams.set('eager_eot_threshold', String(eagerEot));
        }
        if (!url.searchParams.has('eot_timeout_ms')) {
            url.searchParams.set('eot_timeout_ms', String(this.options.eotTimeoutMs ?? DEFAULT_EOT_TIMEOUT_MS));
        }
        if (!url.searchParams.has('keyterm')) {
            for (const term of (this.options.keyterms ?? getSttContextTerms()).slice(0, MAX_FLUX_KEYTERMS)) {
                url.searchParams.append('keyterm', term);
            }
        }
        return url;
    }

    private readonly onAbort = (): void => { void this.stop(); };

    private emit(event: LiveBrainEvent): void {
        for (const listener of this.listeners) listener(event);
    }

    private emitPartialTranscript(transcript: string, at: number): void {
        if (transcript === this.lastPartialText) return;
        // Short opening hypotheses such as "Emma" and "É mesmo?" can revise
        // to filler. Hold them until more text arrives or the turn finalizes.
        if (!this.lastPartialText && Array.from(transcript).length < 12) return;
        this.lastPartialText = transcript;
        this.emit({ type: 'interviewer_transcript', text: transcript, final: false, at });
    }

    private turnKeyFor(turnIndex: number): string {
        return `${this.currentConnectionKey}:t${turnIndex}`;
    }

    private connect(): void {
        const context = this.context;
        if (!context) return;
        // Turn indices reset to 0 on each new WebSocket connection; scope turnKey
        // per connection instance so reconnects never adopt an earlier socket's draft.
        const namespace = context.responseNamespace ?? context.sessionId ?? this.id;
        this.currentConnectionKey = `${namespace}:c${++this.connectionSequence}`;
        this.lastSequenceId = undefined;
        this.activeTurnIndex = undefined;
        this.lastFinalizedTurnIndex = undefined;
        this.lastPartialText = '';
        this.activeEager = null;
        this.speaking = false;
        this.emit({ type: 'status', status: this.failures ? 'degraded' : 'connecting' });
        if (this.context !== context) return;

        let socket: WebSocket;
        try {
            const url = this.buildEndpointUrl();
            socket = new WebSocket(url, realtimeSocketOptions({ Authorization: `Token ${this.options.apiKey.trim()}` }));
        } catch {
            this.handleFailure('protocol');
            return;
        }
        this.socket = socket;
        this.setupTimer = setTimeout(() => this.handleFailure('timeout'), this.options.setupTimeoutMs ?? 10_000);
        socket.on('message', (data, isBinary) => {
            if (this.socket !== socket || isBinary) return;
            let event: FluxWireMessage;
            try { event = JSON.parse(data.toString()); }
            catch { this.handleFailure('protocol'); return; }
            if (event && typeof event === 'object') this.onMessage(event, socket);
        });
        socket.on('unexpected-response', (_request, response) => {
            const chunks: Buffer[] = [];
            let bytes = 0;
            response.on('data', (chunk: Buffer) => {
                if (bytes < 8192) chunks.push(chunk.subarray(0, 8192 - bytes));
                bytes += chunk.length;
            });
            response.on('end', () => {
                if (this.socket !== socket) return;
                const status = response.statusCode ?? 0;
                const body = Buffer.concat(chunks).toString();
                this.handleFailure(classify(status, body, 'network'));
            });
            response.on('error', () => {
                if (this.socket === socket) this.handleFailure('network');
            });
        });
        socket.on('close', (code, reason) => {
            if (this.socket === socket) this.handleFailure(classify(code, reason.toString(), 'network'));
        });
        socket.on('error', () => {
            if (this.socket === socket) this.handleFailure('network');
        });
    }

    private cancelActiveEagerIfTurnAdvanced(
        turnIndex: number,
        at: number,
        context: LiveBrainStartContext,
        socket: WebSocket,
    ): boolean {
        if (!this.activeEager || this.activeTurnIndex === undefined || turnIndex <= this.activeTurnIndex) {
            return true;
        }
        const staleTurnKey = this.activeEager.turnKey;
        this.activeEager = null;
        this.emit({ type: 'turn_resumed', turnKey: staleTurnKey, at });
        return this.context === context && this.socket === socket;
    }

    private onMessage(event: FluxWireMessage, socket: WebSocket): void {
        const context = this.context;
        if (!context || this.socket !== socket) return;
        if (event.type === 'Error') {
            const detail = `${event.code ?? ''} ${event.description ?? event.message ?? ''}`.trim();
            const fallback = event.code === 'INTERNAL_SERVER_ERROR' ? 'network' : 'protocol';
            this.handleFailure(classify(undefined, detail, fallback));
            return;
        }
        if (!this.ready) {
            if (event.type === 'Connected') this.becomeReady(context, socket);
            return;
        }
        if (event.type !== 'TurnInfo') return;
        if (typeof event.sequence_id === 'number') {
            if (this.lastSequenceId !== undefined && event.sequence_id <= this.lastSequenceId) return;
            this.lastSequenceId = event.sequence_id;
        }

        const at = Date.now();
        const turnIndex = event.turn_index;
        if (typeof turnIndex !== 'number' || !Number.isSafeInteger(turnIndex) || turnIndex < 0) return;
        if (this.lastFinalizedTurnIndex !== undefined && turnIndex <= this.lastFinalizedTurnIndex) return;
        if (this.activeTurnIndex !== undefined && turnIndex < this.activeTurnIndex) return;
        const transcript = typeof event.transcript === 'string'
            ? event.transcript.replace(/\s+/g, ' ').trim() : '';

        switch (event.event) {
            case 'StartOfTurn':
                if (!this.speaking || turnIndex !== this.activeTurnIndex) {
                    if (!this.cancelActiveEagerIfTurnAdvanced(turnIndex, at, context, socket)) return;
                    this.speaking = true;
                    this.activeTurnIndex = turnIndex;
                    this.lastPartialText = '';
                    this.activeEager = null;
                    this.emit({ type: 'interviewer_speech_started', at });
                }
                break;
            case 'Update':
                if (transcript) {
                    if (!this.speaking || turnIndex !== this.activeTurnIndex) {
                        if (!this.cancelActiveEagerIfTurnAdvanced(turnIndex, at, context, socket)) return;
                        this.lastPartialText = '';
                        this.speaking = true;
                        this.activeTurnIndex = turnIndex;
                        this.activeEager = null;
                        this.emit({ type: 'interviewer_speech_started', at });
                        if (this.context !== context || this.socket !== socket) return;
                    }
                    this.emit({ type: 'interviewer_barge_in_candidate', text: transcript, at });
                    if (this.context !== context || this.socket !== socket) return;
                    this.emitPartialTranscript(transcript, at);
                }
                break;
            case 'EagerEndOfTurn':
                if (transcript) {
                    if (!this.speaking || turnIndex !== this.activeTurnIndex) {
                        if (!this.cancelActiveEagerIfTurnAdvanced(turnIndex, at, context, socket)) return;
                        this.lastPartialText = '';
                        this.speaking = true;
                        this.activeTurnIndex = turnIndex;
                        this.emit({ type: 'interviewer_speech_started', at });
                        if (this.context !== context || this.socket !== socket) return;
                    }
                    this.emitPartialTranscript(transcript, at);
                    if (this.context !== context || this.socket !== socket) return;
                    const turnKey = this.turnKeyFor(turnIndex);
                    if (this.activeEager?.turnKey !== turnKey || this.activeEager.transcript !== transcript) {
                        this.activeEager = { turnKey, transcript };
                        this.emit({ type: 'eager_end_of_turn', turnKey, question: transcript, at });
                    }
                }
                break;
            case 'TurnResumed': {
                if (transcript) {
                    if (!this.speaking || turnIndex !== this.activeTurnIndex) {
                        if (!this.cancelActiveEagerIfTurnAdvanced(turnIndex, at, context, socket)) return;
                        this.lastPartialText = '';
                        this.speaking = true;
                        this.activeTurnIndex = turnIndex;
                        this.emit({ type: 'interviewer_speech_started', at });
                        if (this.context !== context || this.socket !== socket) return;
                    }
                    this.emitPartialTranscript(transcript, at);
                    if (this.context !== context || this.socket !== socket) return;
                }
                const turnKey = this.turnKeyFor(turnIndex);
                this.activeEager = null;
                this.emit({ type: 'turn_resumed', turnKey, at });
                break;
            }
            case 'EndOfTurn': {
                const turnKey = this.turnKeyFor(turnIndex);
                this.activeEager = null;
                this.lastFinalizedTurnIndex = turnIndex;
                this.speaking = false;
                this.activeTurnIndex = undefined;
                this.lastPartialText = '';
                if (!transcript) {
                    this.emit({ type: 'response_silent' });
                    break;
                }
                this.failures = 0;
                this.emit({ type: 'interviewer_transcript', text: transcript, final: true, at });
                if (this.context !== context || this.socket !== socket) return;
                this.emit({ type: 'interviewer_speech_stopped', at });
                if (this.context !== context || this.socket !== socket) return;
                const namespace = context.responseNamespace ?? context.sessionId ?? this.id;
                this.emit({
                    type: 'decision',
                    decisionId: `${namespace}:${++this.sequence}`,
                    action: 'answer',
                    question: transcript,
                    turnKey,
                    at,
                });
                break;
            }
        }
    }

    private becomeReady(context: LiveBrainStartContext, socket: WebSocket): void {
        this.clearSetupTimer();
        this.ready = true;
        this.readyAt = Date.now();
        this.audioThrough = Date.now();
        this.audioTimer = setInterval(() => this.fillSparseSilence(), SILENCE_FILL_INTERVAL_MS);
        const startup = this.startup;
        this.emit({ type: 'status', status: 'ready' });
        if (this.context !== context || this.socket !== socket) return;
        this.startup = undefined;
        startup?.resolve();
    }

    private handleFailure(code: LiveBrainErrorCode): void {
        const context = this.context;
        if (!context) return;
        if (this.readyAt !== undefined && Date.now() - this.readyAt >= REALTIME_READY_RESET_MS) {
            this.failures = 0;
        }
        this.closeSocket();
        this.ready = false;
        this.speaking = false;
        this.activeTurnIndex = undefined;
        this.lastFinalizedTurnIndex = undefined;
        this.lastPartialText = '';
        this.activeEager = null;
        this.audio = Buffer.alloc(0);
        const retryable = code === 'network' || code === 'timeout' || code === 'rate_limited';
        const attempt = this.failures++;
        const backoff = this.options.backoffMs;
        const limit = backoff ? backoff.length : MAX_RETRIES;
        const fatal = !retryable || attempt >= limit;
        if (fatal) {
            this.dispose(new DeepgramFluxError(code));
            this.emit({ type: 'error', code, fatal: true });
            return;
        }
        this.emit({ type: 'error', code, fatal: false });
        if (this.context !== context) return;
        const delay = backoff ? backoff[attempt] : realtimeReconnectDelay(attempt);
        this.emit({ type: 'status', status: 'degraded', detail: code });
        if (this.context !== context) return;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            if (this.context === context) this.connect();
        }, delay);
    }

    private enqueueAudio(pcm: Buffer): void {
        if (!pcm.length || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.audioThrough = Math.min(Date.now(), this.audioThrough + pcm.length / BYTES_PER_MS);
        this.audio = Buffer.concat([this.audio, pcm]);
        while (this.audio.length >= DEEPGRAM_FLUX_FRAME_BYTES) {
            const frame = this.audio.subarray(0, DEEPGRAM_FLUX_FRAME_BYTES);
            this.audio = this.audio.subarray(DEEPGRAM_FLUX_FRAME_BYTES);
            this.sendBinary(frame);
        }
    }

    private fillSparseSilence(): void {
        if (!this.ready) return;
        const lagMs = Date.now() - this.audioThrough;
        if (lagMs <= SILENCE_FILL_AFTER_MS) return;
        // Standalone /v2/listen rejects KeepAlive JSON frames; stream 80 ms zero-PCM chunks instead.
        const frames = Math.floor(Math.min(lagMs, 1_000) / SILENCE_FILL_INTERVAL_MS);
        this.enqueueAudio(Buffer.alloc(frames * DEEPGRAM_FLUX_FRAME_BYTES));
    }

    private sendJson(payload: Record<string, unknown>): boolean {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
        try {
            this.socket.send(JSON.stringify(payload));
            return true;
        } catch {
            return false;
        }
    }

    private sendBinary(frame: Buffer): void {
        const socket = this.socket;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const verdict = this.backpressure.shouldDrop(socket);
        if (verdict === 'fail') {
            this.handleFailure('network');
            return;
        }
        if (verdict === 'drop') return;
        try {
            socket.send(frame, { binary: true });
        } catch {
            // Close/error listeners handle socket drop.
        }
    }

    private clearSetupTimer(): void {
        if (this.setupTimer !== undefined) clearTimeout(this.setupTimer);
        this.setupTimer = undefined;
    }

    private closeSocket(): void {
        this.clearSetupTimer();
        if (this.retryTimer !== undefined) clearTimeout(this.retryTimer);
        if (this.audioTimer !== undefined) clearInterval(this.audioTimer);
        this.retryTimer = undefined;
        this.audioTimer = undefined;
        this.readyAt = undefined;
        this.lastSequenceId = undefined;
        this.backpressure.reset();
        const socket = this.socket;
        this.socket = undefined;
        if (socket) safeDetachAndClose(socket);
    }

    private dispose(error: Error): void {
        const context = this.context;
        this.context = undefined;
        this.ready = false;
        this.speaking = false;
        this.activeTurnIndex = undefined;
        this.lastFinalizedTurnIndex = undefined;
        this.lastPartialText = '';
        this.activeEager = null;
        this.audio = Buffer.alloc(0);
        context?.signal.removeEventListener('abort', this.onAbort);
        this.closeSocket();
        const startup = this.startup;
        this.startup = undefined;
        startup?.reject(error);
    }
}
