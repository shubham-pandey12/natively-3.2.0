import WebSocket from 'ws';
import { parseDecideTurnArgs, toGeminiDecideTurnTool } from '../decideTurnTool';
import { toPcm16kMono } from '../interviewerAudio';
import type { LiveBrain, LiveBrainErrorCode, LiveBrainEvent, LiveBrainStartContext } from '../types';

const ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
export const DEFAULT_GEMINI_LIVE_MODEL = 'gemini-3.8-live';
const TOOL = toGeminiDecideTurnTool();
const BACKOFF_MS = [500, 1_000, 2_000, 4_000];
const AUDIO_CHUNK_BYTES = 3_200; // 100 ms at 16 kHz mono PCM16.
const AUDIO_BUFFER_BYTES = AUDIO_CHUNK_BYTES * 20;

export interface GeminiLiveOptions {
    apiKey: string;
    model?: string;
    endpoint?: string;
    setupTimeoutMs?: number;
    backoffMs?: readonly number[];
}

interface GeminiMessage {
    setupComplete?: object;
    error?: { code?: number; status?: string; message?: string };
    serverContent?: {
        interrupted?: boolean;
        inputTranscription?: { text?: string; finished?: boolean };
        interimInputTranscription?: { text?: string };
        turnComplete?: boolean;
        interactionStatus?: string;
    };
    toolCall?: { functionCalls?: { id?: string; name?: string; args?: unknown }[] };
    sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean };
    goAway?: { timeLeft?: string };
}

export class GeminiLiveError extends Error {
    constructor(readonly code: LiveBrainErrorCode) {
        super(`Gemini Live setup failed (${code}).`);
        this.name = 'GeminiLiveError';
    }
}

function classify(code?: number, detail = ''): LiveBrainErrorCode {
    if (/quota|billing|daily limit/i.test(detail)) return 'quota';
    if (code === 401 || code === 403 || /api.key|unauthenticated|permission.denied|invalid credential/i.test(detail)) return 'auth';
    if (code === 429 || code === 1013 || /rate.limit|resource.exhausted/i.test(detail)) return 'rate_limited';
    if (code === 1002 || code === 1003 || code === 1007 || code === 1008
        || (code !== undefined && code >= 400 && code < 500)) return 'protocol';
    return 'network';
}

export class GeminiLiveBrain implements LiveBrain {
    readonly id = 'gemini-live';
    private readonly listeners = new Set<(event: LiveBrainEvent) => void>();
    private socket?: WebSocket;
    private context?: LiveBrainStartContext;
    private setupTimer?: ReturnType<typeof setTimeout>;
    private reconnectTimer?: ReturnType<typeof setTimeout>;
    private rolloverTimer?: ReturnType<typeof setTimeout>;
    private startup?: { ready(): void; fail(error: GeminiLiveError): void };
    private readyAt?: number;
    private failures = 0;
    private resumeHandle?: string;
    private speechSinceDecision = false;
    private speaking = false;
    private providerTurnActive = false;
    private decisionSequence = 0;
    private bufferedAudio: Buffer[] = [];
    private bufferedBytes = 0;
    private bufferedCandidate: string[] = [];

    constructor(private readonly options: GeminiLiveOptions) {}

    onEvent(listener: (event: LiveBrainEvent) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    start(ctx: LiveBrainStartContext): Promise<void> {
        if (this.context || ctx.signal.aborted) return Promise.reject(new GeminiLiveError('protocol'));
        const started = new Promise<void>((ready, fail) => { this.startup = { ready, fail }; });
        this.context = ctx;
        ctx.signal.addEventListener('abort', this.abort, { once: true });
        if (!this.options.apiKey) this.fail('auth');
        else this.connect();
        return started;
    }

    pushInterviewerAudio(pcm: Int16Array, sampleRate: number): void {
        if (!this.context || !pcm.length || sampleRate <= 0) return;
        const audio = toPcm16kMono(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength), sampleRate, 1);
        for (let offset = 0; offset < audio.length; offset += AUDIO_CHUNK_BYTES) {
            const chunk = audio.subarray(offset, offset + AUDIO_CHUNK_BYTES);
            if (this.readyAt !== undefined) this.sendAudio(chunk);
            else {
                this.bufferedAudio.push(chunk);
                this.bufferedBytes += chunk.length;
                while (this.bufferedBytes > AUDIO_BUFFER_BYTES) this.bufferedBytes -= this.bufferedAudio.shift()!.length;
            }
        }
    }

    addCandidateText(text: string, _at: number): void {
        const candidate = text.trim();
        if (!candidate || !this.context) return;
        // Client context must not interrupt an active interviewer decision.
        if (this.readyAt !== undefined && !this.providerTurnActive) this.sendCandidate(candidate);
        else {
            this.bufferedCandidate.push(candidate);
            if (this.bufferedCandidate.length > 20) this.bufferedCandidate.shift();
        }
    }

    // Gemini only decides. The orchestrator cancels the separate text writer.
    cancelResponse(_reason: string): void {}

    async stop(): Promise<void> {
        if (!this.context) return;
        this.release(true);
        this.startup?.fail(new GeminiLiveError('network'));
        this.startup = undefined;
        this.emit({ type: 'status', status: 'closed' });
    }

    private readonly abort = () => { void this.stop(); };

    private connect(): void {
        if (!this.context) return;
        this.emit({ type: 'status', status: 'connecting' });
        if (!this.context) return;
        try {
            const timeout = this.options.setupTimeoutMs ?? 8_000;
            const socket = new WebSocket(this.options.endpoint ?? ENDPOINT, {
                headers: { 'x-goog-api-key': this.options.apiKey },
                handshakeTimeout: timeout,
                maxPayload: 4 * 1024 * 1024,
            });
            this.socket = socket;
            this.setupTimer = setTimeout(() => { if (this.socket === socket) this.fail('timeout'); }, timeout);
            socket.on('open', () => {
                if (this.socket !== socket || !this.context) return;
                const model = this.options.model?.trim() || DEFAULT_GEMINI_LIVE_MODEL;
                this.send({ setup: {
                    model: model.startsWith('models/') ? model : `models/${model}`,
                    generationConfig: { responseModalities: ['AUDIO'] },
                    realtimeInputConfig: { automaticActivityDetection: { disabled: false } },
                    systemInstruction: { parts: [{ text: this.context.instructions }] },
                    inputAudioTranscription: {},
                    sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
                    contextWindowCompression: { slidingWindow: {} },
                    tools: [TOOL],
                } });
            });
            socket.on('message', data => { if (this.socket === socket) this.onMessage(data.toString()); });
            socket.on('unexpected-response', (_, response) => {
                let detail = '';
                const finish = () => {
                    if (this.socket === socket) this.fail(classify(response.statusCode, detail));
                    response.destroy();
                };
                response.setEncoding('utf8');
                response.on('data', (chunk: string) => {
                    detail += chunk.slice(0, 4096 - detail.length);
                    if (detail.length === 4096) finish();
                });
                response.once('end', finish);
                response.once('error', finish);
            });
            socket.on('close', (code, reason) => { if (this.socket === socket) this.fail(classify(code, reason.toString())); });
            socket.on('error', () => { if (this.socket === socket) this.fail('network'); });
        } catch {
            this.fail('protocol');
        }
    }

    private onMessage(raw: string): void {
        let message: GeminiMessage;
        try { message = JSON.parse(raw); } catch { this.fail('protocol'); return; }
        if (!message || typeof message !== 'object') { this.fail('protocol'); return; }
        if (message.error) {
            this.fail(classify(message.error.code, `${message.error.status ?? ''} ${message.error.message ?? ''}`));
            return;
        }
        if (message.setupComplete && this.readyAt === undefined) {
            clearTimeout(this.setupTimer);
            this.readyAt = Date.now();
            const audio = this.bufferedAudio;
            this.bufferedAudio = [];
            this.bufferedBytes = 0;
            if (!this.resumeHandle) {
                this.providerTurnActive = false;
                this.speechSinceDecision = false;
                this.speaking = false;
            }
            if (!this.providerTurnActive) this.flushCandidate();
            for (const chunk of audio) this.sendAudio(chunk);
            this.startup?.ready();
            this.startup = undefined;
            this.emit({ type: 'status', status: 'ready' });
        }
        if (this.readyAt === undefined) return;
        const at = Date.now();
        const content = message.serverContent;
        const interim = content?.interimInputTranscription?.text;
        const transcript = content?.inputTranscription;
        if (content?.interrupted || (typeof interim === 'string' && interim.trim())
            || (typeof transcript?.text === 'string' && transcript.text.trim())) {
            this.speechSinceDecision = true;
            this.providerTurnActive = true;
            if (!this.speaking) this.emit({ type: 'interviewer_speech_started', at });
            this.speaking = true;
        }
        if (typeof interim === 'string' && interim.trim()) {
            this.emit({ type: 'interviewer_transcript', text: interim, final: false, at });
        }
        if (typeof transcript?.text === 'string' && transcript.text.trim()) {
            this.emit({ type: 'interviewer_transcript', text: transcript.text, final: transcript.finished === true, at });
        }
        if (this.speaking && (transcript?.finished || (content?.turnComplete && !content.interrupted))) this.stopSpeaking(at);
        const calls = message.toolCall?.functionCalls;
        if (Array.isArray(calls)) this.respondToTools(calls, at);
        if (content?.turnComplete && !content.interrupted && content.interactionStatus !== 'IN_PROGRESS') {
            this.providerTurnActive = false;
            this.flushCandidate();
        }
        const update = message.sessionResumptionUpdate;
        if (update?.resumable && typeof update.newHandle === 'string' && update.newHandle) {
            this.resumeHandle = update.newHandle;
            if (this.rolloverTimer) { this.rollover(); return; }
        }
        if (message.goAway) {
            const seconds = Number(String(message.goAway.timeLeft ?? '').replace(/s$/, ''));
            const inMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1_000) : 0;
            this.emit({ type: 'session_expiring', inMs });
            if (this.resumeHandle) this.rollover();
            else if (!this.rolloverTimer) this.rolloverTimer = setTimeout(() => this.rollover(), Math.max(0, inMs - 500));
        }
    }

    private respondToTools(calls: NonNullable<NonNullable<GeminiMessage['toolCall']>['functionCalls']>, at: number): void {
        const responses = [];
        const decisions: LiveBrainEvent[] = [];
        for (const call of calls) {
            if (!call || typeof call.id !== 'string' || typeof call.name !== 'string') continue;
            const { id, name, args } = call;
            const decision = name === 'decide_turn' ? parseDecideTurnArgs(args) : null;
            responses.push({ id, name, response: decision ? { ok: true } : { error: 'Invalid decision' } });
            if (!decision) {
                console.warn('[LiveBrain] Gemini sent an invalid decision.');
                continue;
            }
            if (!this.speechSinceDecision) continue;
            this.speechSinceDecision = false;
            this.failures = 0;
            if (this.speaking) this.stopSpeaking(at);
            decisions.push({ type: 'decision', ...decision, at, decisionId: `${this.context?.sessionId}:${++this.decisionSequence}` });
        }
        if (responses.length) this.send({ toolResponse: { functionResponses: responses } });
        for (const decision of decisions) this.emit(decision);
    }

    private stopSpeaking(at: number): void {
        this.speaking = false;
        this.emit({ type: 'interviewer_speech_stopped', at });
    }

    private sendAudio(audio: Buffer): void {
        this.send({ realtimeInput: { audio: { data: audio.toString('base64'), mimeType: 'audio/pcm;rate=16000' } } });
    }

    private sendCandidate(text: string): void {
        this.send({ clientContent: { turns: [{ role: 'user', parts: [{ text: `Candidate said: ${text}` }] }], turnComplete: false } });
    }

    private flushCandidate(): void {
        const candidates = this.bufferedCandidate.splice(0);
        for (const text of candidates) this.sendCandidate(text);
    }

    private send(message: object): void {
        const socket = this.socket;
        if (socket?.readyState !== WebSocket.OPEN) return;
        if (socket.bufferedAmount > AUDIO_BUFFER_BYTES * 4) { this.fail('network'); return; }
        socket.send(JSON.stringify(message), error => { if (error && this.socket === socket) this.fail('network'); });
    }

    private fail(code: LiveBrainErrorCode): void {
        if (!this.context) return;
        if (this.readyAt !== undefined && Date.now() - this.readyAt >= 30_000) this.failures = 0;
        this.disconnect();
        const delay = (this.options.backoffMs ?? BACKOFF_MS)[this.failures++];
        const fatal = code === 'auth' || code === 'quota' || delay === undefined;
        if (fatal) {
            this.release();
            this.startup?.fail(new GeminiLiveError(code));
            this.startup = undefined;
            this.emit({ type: 'error', code, fatal: true });
            return;
        }
        this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; this.connect(); }, delay);
        this.emit({ type: 'error', code, fatal: false });
        if (this.context) this.emit({ type: 'status', status: 'degraded' });
    }

    private rollover(): void {
        this.disconnect(true);
        this.connect();
    }

    private disconnect(graceful = false): void {
        clearTimeout(this.setupTimer);
        clearTimeout(this.rolloverTimer);
        this.rolloverTimer = undefined;
        this.readyAt = undefined;
        const socket = this.socket;
        this.socket = undefined;
        if (graceful && socket?.readyState === WebSocket.OPEN) socket.close(1000);
        else socket?.terminate();
    }

    private release(graceful = false): void {
        this.context?.signal.removeEventListener('abort', this.abort);
        this.context = undefined;
        clearTimeout(this.reconnectTimer);
        this.disconnect(graceful);
        this.bufferedAudio = [];
        this.bufferedBytes = 0;
        this.bufferedCandidate = [];
        this.resumeHandle = undefined;
        this.speaking = false;
        this.speechSinceDecision = false;
        this.providerTurnActive = false;
        this.failures = 0;
    }

    private emit(event: LiveBrainEvent): void {
        for (const listener of this.listeners) listener(event);
    }
}
