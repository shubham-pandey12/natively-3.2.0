import WebSocket from 'ws';
import { openAiHandshakeVerdict, realtimeReconnectDelay, realtimeSocketOptions, resampleRealtimePcm16, SEND_THRESHOLD_SAMPLES, WS_SAMPLE_RATE, wsDataToString } from '../../../../electron/audio/realtimeTransport';
import { safeDetachAndClose } from '../../../../electron/audio/wsSafeTeardown';
import { getSupportedLiveBrainReasoningEfforts, type LiveBrainExplicitReasoningEffort } from '../../../../src/types/liveBrainSettings';
import { CLARIFICATION_ASSUMPTION } from '../instructions';
import type { LiveBrain, LiveBrainErrorCode, LiveBrainEvent, LiveBrainStartContext } from '../types';

export interface RealtimeBrainOptions {
    apiKey: string;
    model?: string;
    reasoningEffort?: LiveBrainExplicitReasoningEffort;
    endpoint?: string;
    setupTimeoutMs?: number;
    backoffMs?: readonly number[];
}

interface RealtimeProvider {
    id: 'openai-realtime' | 'elevenlabs-realtime';
    endpoint: string;
    defaultModel: string;
    headers(key: string): Record<string, string>;
    output: 'text' | 'audio';
    updateOnOpen?: boolean;
    voice?: string;
    inputTranscriptionModel?: string;
}

interface WireError {
    type?: string;
    code?: string;
    message?: string;
}

interface WireEvent {
    type?: string;
    session?: { output_modalities?: string[] };
    error?: WireError;
    response_id?: string;
    item_id?: string;
    delta?: string;
    transcript?: string;
    response?: { id?: string; status?: string; status_details?: { error?: WireError } };
}

const FRAME_BYTES = SEND_THRESHOLD_SAMPLES * 2;
const BYTES_PER_MS = WS_SAMPLE_RATE * 2 / 1_000;
const SILENCE_FILL_AFTER_MS = 300;
const MAX_RETRIES = 3;
const READY_RESET_MS = 30_000;
const MAX_AUDIO_BUFFERED_BYTES = 1024 * 1024;
const BACKPRESSURE_FAIL_MS = 5_000;

export class RealtimeBrainError extends Error {
    constructor(readonly code: LiveBrainErrorCode) {
        super(`Realtime session failed (${code}).`);
    }
}

function classify(status: number | undefined, detail: string, fallback: LiveBrainErrorCode): LiveBrainErrorCode {
    if (/insufficient.quota|credit.balance.exhausted|quota.exceeded|billing|out.of.credits/i.test(detail)) return 'quota';
    if (status === 401 || status === 403 || status === 4001 || status === 4003
        || /invalid.api.key|authentication|unauthenticated|permission.denied|invalid.credential/i.test(detail)) return 'auth';
    if (status === 429 || status === 1013 || /rate.limit|too.many.requests|concurrency/i.test(detail)) return 'rate_limited';
    if (/model.not.found|unsupported.model|model.not.supported/i.test(detail)) return 'unsupported';
    if (status === 1002 || status === 1003 || status === 1007 || status === 1008
        || (status !== undefined && status >= 400 && status < 500)) return 'protocol';
    return fallback;
}

export class RealtimeBrain implements LiveBrain {
    readonly id: RealtimeProvider['id'];
    private readonly model: string;
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
    private readonly inputTranscripts = new Map<string, string>();
    private response?: { providerId: string; visibleId?: string };
    private readonly finishedResponses = new Set<string>();
    private audio = Buffer.alloc(0);
    private audioThrough = 0;
    private backpressureSince?: number;
    private backpressureLogged = false;

    constructor(private readonly provider: RealtimeProvider, private readonly options: RealtimeBrainOptions) {
        this.id = provider.id;
        this.model = options.model?.trim() || provider.defaultModel;
    }

    onEvent(listener: (event: LiveBrainEvent) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    start(context: LiveBrainStartContext): Promise<void> {
        if (this.context) return Promise.reject(new RealtimeBrainError('protocol'));
        if (context.signal.aborted) return Promise.reject(new RealtimeBrainError('network'));
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
        this.cancelResponse();
        this.dispose(new RealtimeBrainError('network'));
        this.emit({ type: 'status', status: 'closed' });
    }

    pushInterviewerAudio(pcm: Int16Array, sampleRate: number): void {
        if (!this.ready || !pcm.length || !Number.isFinite(sampleRate) || sampleRate <= 0) return;
        const input = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        this.enqueueAudio(resampleRealtimePcm16(input, sampleRate, 1, WS_SAMPLE_RATE));
    }

    addCandidateText(text: string): void {
        if (text.trim()) this.addContext(`Candidate said: ${text.trim()}`);
    }

    addHistoryContext(history: string): void {
        if (history.trim()) this.addContext(history);
    }

    requestClarificationAnswer(): void {
        if (!this.ready || this.speaking || this.response) return;
        if (this.addContext(CLARIFICATION_ASSUMPTION)) this.send({ type: 'response.create' });
    }

    cancelResponse(): void {
        const response = this.response;
        if (!response) return;
        // Detach the response before sending cancel. The provider may keep
        // streaming this ID until its asynchronous cancellation completes.
        this.response = undefined;
        this.finishedResponses.add(response.providerId);
        this.send({ type: 'response.cancel', response_id: response.providerId });
        if (response.visibleId) this.emit({ type: 'response_done', responseId: response.visibleId, status: 'cancelled' });
    }

    private readonly onAbort = (): void => { void this.stop(); };

    private emit(event: LiveBrainEvent): void {
        for (const listener of this.listeners) listener(event);
    }

    private connect(): void {
        const context = this.context;
        if (!context) return;
        this.emit({ type: 'status', status: this.failures ? 'degraded' : 'connecting' });
        if (this.context !== context) return;
        let socket: WebSocket;
        try {
            const url = new URL(this.options.endpoint ?? this.provider.endpoint);
            url.searchParams.set('model', this.model);
            socket = new WebSocket(url, realtimeSocketOptions(this.provider.headers(this.options.apiKey)));
        } catch {
            this.handleFailure('protocol');
            return;
        }
        this.socket = socket;
        this.setupTimer = setTimeout(() => this.handleFailure('timeout'), this.options.setupTimeoutMs ?? 10_000);
        socket.on('open', () => {
            if (this.socket === socket && this.provider.updateOnOpen) this.updateSession();
        });
        socket.on('message', data => {
            if (this.socket !== socket) return;
            let event: WireEvent;
            try { event = JSON.parse(wsDataToString(data)); }
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
                const verdict = openAiHandshakeVerdict(status, body);
                this.handleFailure(classify(status, verdict?.message ?? body, 'network'));
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

    private updateSession(): void {
        const provider = this.provider;
        const supported = provider.id === 'openai-realtime'
            ? getSupportedLiveBrainReasoningEfforts({ provider: 'openai-realtime', model: this.model })
            : [];
        const reasoningEffort = this.options.reasoningEffort && supported.includes(this.options.reasoningEffort)
            ? this.options.reasoningEffort
            : undefined;
        this.send({
            type: 'session.update',
            session: {
                type: 'realtime',
                // ElevenLabs negotiates the model in the first client event.
                ...(provider.updateOnOpen ? { model: this.model } : {}),
                instructions: this.context?.instructions,
                output_modalities: [provider.output],
                ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
                audio: {
                    input: {
                        format: { type: 'audio/pcm', rate: WS_SAMPLE_RATE },
                        turn_detection: { type: 'semantic_vad', eagerness: 'low', create_response: true, interrupt_response: true },
                        ...(provider.inputTranscriptionModel ? { transcription: { model: provider.inputTranscriptionModel } } : {}),
                    },
                    ...(provider.voice ? { output: { format: { type: 'audio/pcm' }, voice: provider.voice } } : {}),
                },
            },
        });
    }

    private onMessage(event: WireEvent): void {
        if (event.type === 'error') {
            // Server VAD can beat our own cancel to the provider's response.
            if (event.error?.code === 'response_cancel_not_active') return;
            this.handleFailure(this.classifyError(event.error));
            return;
        }
        if (!this.ready) {
            if (event.type === 'session.created' && !this.provider.updateOnOpen) this.updateSession();
            if (event.type === 'session.updated') {
                const modalities = event.session?.output_modalities;
                if (modalities !== undefined && !Array.isArray(modalities)) this.handleFailure('protocol');
                else if (modalities && !modalities.includes(this.provider.output)) this.handleFailure('unsupported');
                else this.becomeReady();
            }
            return;
        }
        const at = Date.now();
        const itemId = typeof event.item_id === 'string' && event.item_id
            ? `${this.context?.responseNamespace ?? this.context?.sessionId}:${event.item_id}` : undefined;
        const item = itemId ? { itemId } : {};
        switch (event.type) {
            case 'input_audio_buffer.speech_started':
                this.speaking = true;
                this.emit({ type: 'interviewer_speech_started', at, ...item });
                this.cancelResponse();
                break;
            case 'input_audio_buffer.speech_stopped':
                this.speaking = false;
                this.emit({ type: 'interviewer_speech_stopped', at, ...item });
                break;
            case 'conversation.item.input_audio_transcription.delta': {
                if (!itemId || typeof event.delta !== 'string' || !event.delta) break;
                const text = ((this.inputTranscripts.get(itemId) ?? '') + event.delta).slice(0, 16_000);
                this.inputTranscripts.set(itemId, text);
                if (this.inputTranscripts.size > 16) this.inputTranscripts.delete(this.inputTranscripts.keys().next().value!);
                this.emit({ type: 'interviewer_transcript', text, final: false, at, itemId });
                break;
            }
            case 'conversation.item.input_audio_transcription.completed':
                if (itemId) this.inputTranscripts.delete(itemId);
                if (typeof event.transcript === 'string' && event.transcript.trim()) {
                    this.emit({ type: 'interviewer_transcript', text: event.transcript.trim(), final: true, at, ...item });
                }
                break;
            case 'response.created':
                if (typeof event.response?.id === 'string' && event.response.id !== this.response?.providerId
                    && !this.finishedResponses.has(event.response.id)) {
                    this.cancelResponse();
                    this.response = { providerId: event.response.id };
                    if (this.speaking) this.cancelResponse();
                    else this.emit({ type: 'provider_response_progress' });
                }
                break;
            case 'response.output_audio_transcript.delta':
            case 'response.output_text.delta':
                if ((event.type === 'response.output_text.delta') === (this.provider.output === 'text')) this.handleDelta(event, at);
                break;
            case 'response.done':
                this.handleDone(event);
                break;
        }
    }

    private handleDelta(event: WireEvent, at: number): void {
        const response = this.response;
        if (!response || event.response_id !== response.providerId || typeof event.delta !== 'string' || !event.delta) return;
        if (!response.visibleId) {
            const namespace = this.context?.responseNamespace ?? this.context?.sessionId;
            response.visibleId = `${namespace}:${++this.sequence}`;
            this.emit({ type: 'response_started', responseId: response.visibleId, at });
        }
        if (this.response === response) this.emit({ type: 'response_delta', responseId: response.visibleId, text: event.delta });
    }

    private handleDone(event: WireEvent): void {
        const response = this.response;
        if (!response || event.response?.id !== response.providerId) return;
        const status = event.response.status === 'completed' || event.response.status === 'cancelled'
            ? event.response.status : 'failed';
        const error = event.response.status_details?.error;
        this.response = undefined;
        this.finishedResponses.add(response.providerId);
        if (status === 'completed') this.failures = 0;
        if (response.visibleId) this.emit({ type: 'response_done', responseId: response.visibleId, status });
        else if (status !== 'cancelled') this.emit({ type: 'response_silent' });
        if (error) this.handleFailure(this.classifyError(error));
    }

    private classifyError(error?: WireError): LiveBrainErrorCode {
        return classify(undefined, `${error?.code ?? ''} ${error?.type ?? ''} ${error?.message ?? ''}`, 'protocol');
    }

    private becomeReady(): void {
        clearTimeout(this.setupTimer);
        this.ready = true;
        this.readyAt = Date.now();
        this.audioThrough = Date.now();
        this.audioTimer = setInterval(() => {
            // The capture path can deliver sparse silence, especially on Windows.
            // Advance provider VAD at normal pace when the speaker stream dries up.
            if (Date.now() - this.audioThrough > SILENCE_FILL_AFTER_MS) {
                this.enqueueAudio(Buffer.alloc(FRAME_BYTES - this.audio.length));
            }
        }, 100);
        this.startup?.resolve();
        this.startup = undefined;
        this.emit({ type: 'status', status: 'ready' });
    }

    private enqueueAudio(pcm: Buffer): void {
        this.audioThrough = Math.min(Date.now(), this.audioThrough + pcm.length / BYTES_PER_MS);
        const audio = Buffer.concat([this.audio, pcm]);
        let offset = 0;
        for (; this.ready && offset + FRAME_BYTES <= audio.length; offset += FRAME_BYTES) {
            this.sendAudioFrame(audio.subarray(offset, offset + FRAME_BYTES));
        }
        if (this.ready) this.audio = Buffer.from(audio.subarray(offset));
    }

    private sendAudioFrame(frame: Buffer): void {
        const socket = this.socket;
        if (socket?.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount > MAX_AUDIO_BUFFERED_BYTES) {
            const now = Date.now();
            if (this.backpressureSince === undefined) this.backpressureSince = now;
            if (!this.backpressureLogged) {
                this.backpressureLogged = true;
                console.warn(`[LiveBrain] ${this.id} dropping audio chunk due to socket backpressure (bufferedAmount > 1 MiB)`);
            }
            if (now - this.backpressureSince > BACKPRESSURE_FAIL_MS) this.handleFailure('network');
            return;
        }
        this.backpressureSince = undefined;
        this.backpressureLogged = false;
        this.send({ type: 'input_audio_buffer.append', audio: frame.toString('base64') });
    }

    private addContext(text: string): boolean {
        return this.ready && this.send({
            type: 'conversation.item.create',
            item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
        });
    }

    private send(event: object): boolean {
        if (this.socket?.readyState !== WebSocket.OPEN) return false;
        try { this.socket.send(JSON.stringify(event)); return true; }
        catch { this.handleFailure('network'); return false; }
    }

    private handleFailure(code: LiveBrainErrorCode): void {
        const context = this.context;
        if (!context) return;
        if (this.readyAt !== undefined && Date.now() - this.readyAt >= READY_RESET_MS) this.failures = 0;
        const retryable = code === 'network' || code === 'timeout' || code === 'rate_limited';
        const delays = this.options.backoffMs;
        const delay = delays ? delays[this.failures] : this.failures < MAX_RETRIES ? realtimeReconnectDelay(this.failures) : undefined;
        const retry = retryable && delay !== undefined;
        const response = this.response;
        this.closeSocket();
        if (response?.visibleId) this.emit({ type: 'response_done', responseId: response.visibleId, status: 'failed' });
        if (this.context !== context) return;
        if (retry) {
            this.failures++;
            this.emit({ type: 'status', status: 'degraded' });
            if (this.context !== context) return;
            this.emit({ type: 'error', code, fatal: false });
            if (this.context !== context) return;
            this.retryTimer = setTimeout(() => {
                this.retryTimer = undefined;
                if (this.context === context) this.connect();
            }, delay);
            return;
        }
        this.dispose(new RealtimeBrainError(code));
        this.emit({ type: 'error', code, fatal: true });
    }

    private closeSocket(): void {
        this.ready = false;
        this.readyAt = undefined;
        this.speaking = false;
        this.response = undefined;
        this.finishedResponses.clear();
        this.audio = Buffer.alloc(0);
        this.backpressureSince = undefined;
        this.backpressureLogged = false;
        clearTimeout(this.setupTimer);
        clearInterval(this.audioTimer);
        safeDetachAndClose(this.socket);
        this.socket = undefined;
    }

    private dispose(error: Error): void {
        this.context?.signal.removeEventListener('abort', this.onAbort);
        this.context = undefined;
        clearTimeout(this.retryTimer);
        this.closeSocket();
        this.startup?.reject(error);
        this.startup = undefined;
    }
}
