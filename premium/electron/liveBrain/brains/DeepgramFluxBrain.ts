import WebSocket from 'ws';
import { realtimeReconnectDelay, realtimeSocketOptions, resampleRealtimePcm16 } from '../../../../electron/audio/realtimeTransport';
import { safeDetachAndClose } from '../../../../electron/audio/wsSafeTeardown';
import { DEFAULT_DEEPGRAM_FLUX_MODEL } from '../../../../src/types/liveBrainSettings';
import type { LiveBrain, LiveBrainErrorCode, LiveBrainEvent, LiveBrainStartContext } from '../types';

export const DEEPGRAM_FLUX_ENDPOINT = 'wss://api.deepgram.com/v2/listen';
export const DEEPGRAM_FLUX_SAMPLE_RATE = 16_000;
export const DEEPGRAM_FLUX_FRAME_SAMPLES = 1_280; // 80 ms at 16 kHz mono (documented Flux chunk size)
export const DEEPGRAM_FLUX_FRAME_BYTES = DEEPGRAM_FLUX_FRAME_SAMPLES * 2; // 2,560 bytes
const SILENCE_FILL_AFTER_MS = 300;
const BYTES_PER_MS = DEEPGRAM_FLUX_SAMPLE_RATE * 2 / 1_000;
// A falling voice mid-question can exceed the default Flux confidence.
const DEFAULT_EOT_THRESHOLD = 0.95;
const DEFAULT_EOT_TIMEOUT_MS = 1_500;
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
}

interface FluxWireMessage {
    type?: string;
    event?: string;
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
    if (status !== undefined && status >= 400 && status < 500) return 'protocol';
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
    private speaking = false;
    private failures = 0;
    private sequence = 0;
    private activeTurnIndex?: number;
    private lastFinalizedTurnIndex?: number;
    private lastPartialText = '';
    private audio = Buffer.alloc(0);
    private audioThrough = 0;

    constructor(private readonly options: DeepgramFluxOptions) {}

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
    addCandidateText(_text: string, _at: number): void {}

    /** Answer generation is handled downstream by AnswerWriter / ResponseOrchestrator. */
    cancelResponse(_reason: string): void {}

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
        if (this.options.eagerEotThreshold !== undefined && !url.searchParams.has('eager_eot_threshold')) {
            url.searchParams.set('eager_eot_threshold', String(this.options.eagerEotThreshold));
        }
        if (!url.searchParams.has('eot_timeout_ms')) {
            url.searchParams.set('eot_timeout_ms', String(this.options.eotTimeoutMs ?? DEFAULT_EOT_TIMEOUT_MS));
        }
        return url;
    }

    private readonly onAbort = (): void => { void this.stop(); };

    private emit(event: LiveBrainEvent): void {
        for (const listener of this.listeners) listener(event);
    }

    private connect(): void {
        const context = this.context;
        if (!context) return;
        // Turn indices reset to 0 on each new WebSocket connection.
        this.activeTurnIndex = undefined;
        this.lastFinalizedTurnIndex = undefined;
        this.lastPartialText = '';
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
            if (event && typeof event === 'object') this.onMessage(event);
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

    private onMessage(event: FluxWireMessage): void {
        if (event.type === 'Error') {
            const detail = `${event.code ?? ''} ${event.description ?? event.message ?? ''}`.trim();
            const fallback = event.code === 'INTERNAL_SERVER_ERROR' ? 'network' : 'protocol';
            this.handleFailure(classify(undefined, detail, fallback));
            return;
        }
        if (!this.ready) {
            if (event.type === 'Connected') this.becomeReady();
            return;
        }
        if (event.type !== 'TurnInfo') return;

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
                    this.speaking = true;
                    this.activeTurnIndex = turnIndex;
                    this.lastPartialText = '';
                    this.emit({ type: 'interviewer_speech_started', at });
                }
                break;
            case 'Update':
            case 'EagerEndOfTurn':
            case 'TurnResumed':
                if (transcript) {
                    if (!this.speaking || turnIndex !== this.activeTurnIndex) {
                        this.lastPartialText = '';
                        this.speaking = true;
                        this.activeTurnIndex = turnIndex;
                        this.emit({ type: 'interviewer_speech_started', at });
                    }
                    if (transcript !== this.lastPartialText) {
                        this.lastPartialText = transcript;
                        this.emit({ type: 'interviewer_transcript', text: transcript, final: false, at });
                    }
                }
                break;
            case 'EndOfTurn':
                this.lastFinalizedTurnIndex = turnIndex;
                this.speaking = false;
                this.activeTurnIndex = undefined;
                this.lastPartialText = '';
                this.failures = 0;
                if (!transcript) {
                    this.emit({ type: 'response_silent' });
                    break;
                }
                this.emit({ type: 'interviewer_transcript', text: transcript, final: true, at });
                this.emit({ type: 'interviewer_speech_stopped', at });
                {
                    const namespace = this.context?.responseNamespace ?? this.context?.sessionId ?? this.id;
                    this.emit({
                        type: 'decision',
                        decisionId: `${namespace}:${++this.sequence}`,
                        action: 'answer',
                        question: transcript,
                        at,
                    });
                }
                break;
        }
    }

    private becomeReady(): void {
        this.clearSetupTimer();
        this.ready = true;
        this.audioThrough = Date.now();
        this.audioTimer = setInterval(() => this.fillSparseSilence(), SILENCE_FILL_INTERVAL_MS);
        const startup = this.startup;
        this.startup = undefined;
        this.emit({ type: 'status', status: 'ready' });
        startup?.resolve();
    }

    private handleFailure(code: LiveBrainErrorCode): void {
        if (!this.context) return;
        this.closeSocket();
        this.ready = false;
        this.speaking = false;
        this.activeTurnIndex = undefined;
        this.lastFinalizedTurnIndex = undefined;
        this.lastPartialText = '';
        this.audio = Buffer.alloc(0);
        const retryable = code === 'network' || code === 'timeout' || code === 'rate_limited';
        const attempt = this.failures++;
        const backoff = this.options.backoffMs;
        const limit = backoff ? backoff.length : MAX_RETRIES;
        const fatal = !retryable || attempt >= limit;
        this.emit({ type: 'error', code, fatal });
        if (fatal) {
            this.dispose(new DeepgramFluxError(code));
            return;
        }
        const delay = backoff ? backoff[attempt] : realtimeReconnectDelay(attempt);
        this.emit({ type: 'status', status: 'degraded', detail: code });
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            this.connect();
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
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        try {
            this.socket.send(frame, { binary: true });
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
        this.audio = Buffer.alloc(0);
        context?.signal.removeEventListener('abort', this.onAbort);
        this.closeSocket();
        const startup = this.startup;
        this.startup = undefined;
        startup?.reject(error);
    }
}
