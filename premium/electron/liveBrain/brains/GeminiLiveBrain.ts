import WebSocket from 'ws';
import { streamingStttWsOptions } from '../../../../electron/audio/dnsHelpers';
import { wsDataToString } from '../../../../electron/audio/realtimeTransport';
import { DEFAULT_GEMINI_LIVE_MODEL, getSupportedLiveBrainReasoningEfforts, type LiveBrainExplicitReasoningEffort } from '../../../../src/types/liveBrainSettings';
import { CLARIFICATION_ASSUMPTION } from '../instructions';
import type { ResponseClock } from '../ResponseOrchestrator';
import { toPcm16kMono } from '../interviewerAudio';
import type { LiveBrain, LiveBrainErrorCode, LiveBrainEvent, LiveBrainStartContext } from '../types';

const ENDPOINT = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
export { DEFAULT_GEMINI_LIVE_MODEL };
export const GEMINI_AUTOMATIC_ACTIVITY_DETECTION = {
    endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
    silenceDurationMs: 1_300,
    prefixPaddingMs: 150,
} as const;
const BACKOFF_MS = [500, 1_000, 2_000, 4_000];
const AUDIO_CHUNK_BYTES = 3_200; // 100 ms at 16 kHz mono PCM16.
const AUDIO_BUFFER_BYTES = AUDIO_CHUNK_BYTES * 20;
// Last 10 s of interviewer audio (ARCHITECTURE §9). Replayed into the new
// session when a server deadline forces a rollover mid-question, so the
// question is not lost with the old socket.
const REPLAY_BUFFER_BYTES = AUDIO_CHUNK_BYTES * 100;
const BYTES_PER_MS = 32; // 16 kHz mono PCM16.
// System capture goes sparse while the speakers are silent (measured on Windows:
// ~100 ms of audio per second). Gemini's end-of-speech detector counts silence
// in AUDIO time, so a sparse stream made it wait ~9 s of wall time for 1.3 s of
// silence. Keep the stream at real-time pace by filling gaps with zeros.
const SILENCE_PUMP_MS = 100;
const SILENCE_FILL_AFTER_MS = 300; // tolerate capture jitter before filling
const SILENCE_FILL_MAX_MS = 1_000; // per tick, so a stall can't flood the socket
const ROLLOVER_MARGIN_MS = 1_000;
const MIN_DEFERRED_ROLLOVER_MS = 1_500;
const LATE_TRANSCRIPT_WINDOW_MS = 1_500;

export interface GeminiLiveOptions {
    apiKey: string;
    model?: string;
    reasoningEffort?: LiveBrainExplicitReasoningEffort;
    endpoint?: string;
    setupTimeoutMs?: number;
    backoffMs?: readonly number[];
    rolloverClock?: ResponseClock<ReturnType<typeof setTimeout>>;
    createSocket?: (url: string, options: WebSocket.ClientOptions) => WebSocket;
}

interface GeminiMessage {
    setupComplete?: object;
    error?: { code?: number; status?: string; message?: string };
    voiceActivity?: { type?: string };
    serverContent?: {
        interrupted?: boolean;
        inputTranscription?: { text?: string; finished?: boolean };
        interimInputTranscription?: { text?: string };
        outputTranscription?: { text?: string };
        generationComplete?: boolean;
        turnComplete?: boolean;
        interactionStatus?: string;
    };
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
    const result = classifyQuietly(code, detail);
    if (code !== undefined && code !== 1000) {
        console.warn(`[LiveBrain] Gemini closed the session: ${result} (code ${code})`);
    }
    return result;
}

function classifyQuietly(code?: number, detail = ''): LiveBrainErrorCode {
    const isHardQuota = /billing|daily[- ]?limit|quota[- ]?(?:exhausted|exceeded)|(?:exhausted|exceeded|insufficient)[- ]?quota|insufficient[- ]?funds|credit[- ]?balance/i.test(detail)
        && !/per[- ]?minute/i.test(detail);
    if (isHardQuota) return 'quota';
    if (code === 401 || code === 403 || /api[-_. ]?key|unauthenticated|permission[-_. ]?denied|invalid[-_. ]?credential/i.test(detail)) return 'auth';
    if (code === 404 || /\bNOT_FOUND\b/i.test(detail)
        || /model\b[^.\n]*\bnot\s+found|unsupported\s+model|model\b[^.\n]*\bnot\s+supported/i.test(detail)
        || (code === 400 && /\bFAILED_PRECONDITION\b/i.test(detail))
        || /(?:location|region)\b[^.\n]*\bnot\s+supported|unsupported\s+(?:location|region)/i.test(detail)) {
        return 'unsupported';
    }
    if (code === 429 || code === 1013 || /rate[-_. ]?limit|resource[-_. ]?exhausted|too\s+many\s+requests/i.test(detail)) return 'rate_limited';
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
    private rolloverAt?: number;
    private resuming = false;
    private inputTranscript = '';
    private startup?: { ready(): void; fail(error: GeminiLiveError): void };
    private readyAt?: number;
    private failures = 0;
    private resumeHandle?: string;
    private speaking = false;
    private providerTurnActive = false;
    private responseSequence = 0;
    private responseId?: string;
    private discardOutput = false;
    private turnInterrupted = false;
    private generationCompleted = false;
    private lastTurnClosedAt?: number;
    private lifecycleGeneration = 0;
    private bufferedAudio: Buffer[] = [];
    private bufferedBytes = 0;
    private bufferLimit = AUDIO_BUFFER_BYTES;
    private recentAudio: Buffer[] = [];
    private recentBytes = 0;
    private bufferedCandidate: string[] = [];
    private silencePump?: ReturnType<typeof setInterval>;
    private streamStartedAt = 0;
    private audioSentMs = 0;
    private readonly rolloverClock;

    constructor(private readonly options: GeminiLiveOptions) {
        this.rolloverClock = options.rolloverClock ?? { now: Date.now, setTimeout, clearTimeout };
    }

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
            this.rememberAudio(chunk);
            if (this.readyAt !== undefined) this.sendAudio(chunk);
            else {
                this.bufferedAudio.push(chunk);
                this.bufferedBytes += chunk.length;
                while (this.bufferedBytes > this.bufferLimit) this.bufferedBytes -= this.bufferedAudio.shift()!.length;
            }
        }
    }

    addCandidateText(text: string, _at: number): void {
        const candidate = text.trim();
        if (!candidate || !this.context) return;
        // Client context must not interrupt an active provider turn.
        if (this.readyAt !== undefined && !this.providerTurnActive) this.sendCandidate(candidate);
        else {
            this.bufferedCandidate.push(candidate);
            if (this.bufferedCandidate.length > 20) this.bufferedCandidate.shift();
        }
    }

    requestClarificationAnswer(): void {
        if (this.readyAt === undefined || this.providerTurnActive) return;
        this.flushCandidate();
        this.providerTurnActive = true;
        this.sendClientTurn(CLARIFICATION_ASSUMPTION, true);
    }

    addHistoryContext(history: string): void {
        if (this.readyAt !== undefined && !this.providerTurnActive && history.trim()) this.sendClientTurn(history, false);
    }

    cancelResponse(_reason: string): void {
        if (!this.providerTurnActive) return;
        // Gemini owns speech barge-in. A local manual answer suppresses the
        // old output until Gemini sends its next turn boundary.
        this.discardOutput = true;
        this.finishResponse('cancelled');
    }

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
            this.lifecycleGeneration++;
            const timeout = this.options.setupTimeoutMs ?? 8_000;
            const url = this.options.endpoint ?? ENDPOINT;
            const wsOptions = streamingStttWsOptions({
                headers: { 'x-goog-api-key': this.options.apiKey },
                handshakeTimeout: timeout,
                maxPayload: 4 * 1024 * 1024,
            }) as WebSocket.ClientOptions;
            const socket = this.options.createSocket ? this.options.createSocket(url, wsOptions) : new WebSocket(url, wsOptions);
            this.socket = socket;
            this.setupTimer = setTimeout(() => { if (this.socket === socket) this.fail('timeout'); }, timeout);
            socket.on('open', () => {
                if (this.socket !== socket || !this.context) return;
                const model = this.options.model?.trim() || DEFAULT_GEMINI_LIVE_MODEL;
                const supported = getSupportedLiveBrainReasoningEfforts({ provider: 'gemini-live', model });
                const thinkingLevel = this.options.reasoningEffort && supported.includes(this.options.reasoningEffort)
                    ? this.options.reasoningEffort
                    : undefined;
                this.resuming = Boolean(this.resumeHandle);
                this.send({
                    setup: {
                        model: model.startsWith('models/') ? model : `models/${model}`,
                        generationConfig: {
                            responseModalities: ['AUDIO'],
                            ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
                        },
                        realtimeInputConfig: { automaticActivityDetection: GEMINI_AUTOMATIC_ACTIVITY_DETECTION },
                        systemInstruction: { parts: [{ text: this.context.instructions }] },
                        inputAudioTranscription: {},
                        outputAudioTranscription: {},
                        sessionResumption: this.resumeHandle ? { handle: this.resumeHandle } : {},
                        contextWindowCompression: { slidingWindow: {} },
                    }
                });
            });
            socket.on('message', data => { if (this.socket === socket) this.onMessage(wsDataToString(data)); });
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

    private isCurrentLifecycle(socket: WebSocket | undefined, generation: number): boolean {
        return Boolean(this.context) && this.socket === socket && this.lifecycleGeneration === generation;
    }

    private onMessage(raw: string): void {
        const socket = this.socket;
        const generation = this.lifecycleGeneration;
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
            this.resuming = false;
            const audio = this.bufferedAudio;
            this.bufferedAudio = [];
            this.bufferedBytes = 0;
            this.bufferLimit = AUDIO_BUFFER_BYTES;
            // A reconnect resumes from the last resumable checkpoint, which
            // cannot contain the previous socket's in-flight generation.
            this.providerTurnActive = false;
            this.speaking = false;
            this.discardOutput = false;
            this.turnInterrupted = false;
            this.generationCompleted = false;
            this.lastTurnClosedAt = undefined;
            this.flushCandidate();
            this.streamStartedAt = Date.now();
            this.audioSentMs = 0;
            for (const chunk of audio) this.sendAudio(chunk);
            clearInterval(this.silencePump);
            this.silencePump = setInterval(() => this.fillSilence(), SILENCE_PUMP_MS);
            this.startup?.ready();
            this.startup = undefined;
            this.emit({ type: 'status', status: 'ready' });
            if (!this.isCurrentLifecycle(socket, generation)) return;
        }
        if (this.readyAt === undefined) return;
        const at = Date.now();
        const content = message.serverContent;
        const interim = content?.interimInputTranscription?.text;
        const transcript = content?.inputTranscription;
        const output = content?.outputTranscription?.text;
        if (this.lastTurnClosedAt !== undefined && at - this.lastTurnClosedAt > LATE_TRANSCRIPT_WINDOW_MS) {
            this.lastTurnClosedAt = undefined;
        }
        const explicitNewSpeech = Boolean(
            content?.interrupted
            || message.voiceActivity?.type === 'ACTIVITY_START'
            || (typeof interim === 'string' && interim.trim())
            || (!this.discardOutput && typeof output === 'string' && output.length)
        );
        if (explicitNewSpeech) {
            this.lastTurnClosedAt = undefined;
        }
        const isLateTranscript = this.lastTurnClosedAt !== undefined
            && !explicitNewSpeech
            && typeof transcript?.text === 'string'
            && transcript.text.length > 0;
        if (isLateTranscript) {
            console.debug('[LiveBrain] Dropped late inputTranscription after turnComplete');
            if (transcript?.finished === true) this.lastTurnClosedAt = undefined;
        }
        if (content?.interrupted) {
            this.turnInterrupted = true;
            this.discardOutput = true;
            this.generationCompleted = false;
            this.finishResponse('cancelled');
            if (!this.isCurrentLifecycle(socket, generation)) return;
        }
        if (content?.interrupted || message.voiceActivity?.type === 'ACTIVITY_START'
            || (typeof interim === 'string' && interim.trim())
            || (!isLateTranscript && !this.responseId && typeof transcript?.text === 'string' && transcript.text.trim())) {
            this.providerTurnActive = true;
            if (!this.speaking) {
                this.emit({ type: 'interviewer_speech_started', at });
                if (!this.isCurrentLifecycle(socket, generation)) return;
            }
            this.speaking = true;
        }
        if (typeof interim === 'string' && interim.trim()) {
            this.emit({ type: 'interviewer_transcript', text: interim, final: false, at });
            if (!this.isCurrentLifecycle(socket, generation)) return;
        }
        // Gemini sends the interviewer's words as small pieces, usually without
        // `finished`. Join them and emit one final turn per question, so the
        // notebook records "How would you design a cache?" and not " a cache?".
        if (!isLateTranscript && typeof transcript?.text === 'string' && transcript.text) {
            this.inputTranscript += transcript.text;
            if (this.inputTranscript.trim()) {
                this.emit({ type: 'interviewer_transcript', text: this.inputTranscript.replace(/\s+/g, ' ').trim(), final: false, at });
                if (!this.isCurrentLifecycle(socket, generation)) return;
            }
        }
        if (!isLateTranscript && transcript?.finished === true) {
            this.flushInputTranscript(at);
            if (!this.isCurrentLifecycle(socket, generation)) return;
        }
        if (this.speaking && !content?.interrupted
            && (message.voiceActivity?.type === 'ACTIVITY_END' || (!isLateTranscript && transcript?.finished)
                || (!this.discardOutput && output) || (content?.turnComplete && !this.turnInterrupted))) {
            this.stopSpeaking(at);
            if (!this.isCurrentLifecycle(socket, generation)) return;
        }
        // modelTurn audio is ignored. The transcription is already incremental.
        if (!this.discardOutput && typeof output === 'string' && output.length) {
            this.providerTurnActive = true;
            this.failures = 0;
            if (!this.responseId) {
                this.generationCompleted = false;
                this.flushInputTranscript(at);
                if (!this.isCurrentLifecycle(socket, generation)) return;
                const namespace = this.context?.responseNamespace ?? this.context?.sessionId;
                this.responseId = `${namespace}:${++this.responseSequence}`;
                this.emit({ type: 'response_started', responseId: this.responseId, at });
                if (!this.isCurrentLifecycle(socket, generation)) return;
            }
            if (this.responseId) {
                this.emit({ type: 'response_delta', responseId: this.responseId, text: output });
                if (!this.isCurrentLifecycle(socket, generation)) return;
            }
        }
        if (content?.generationComplete && !this.discardOutput && this.responseId) {
            this.generationCompleted = true;
        }
        if (content?.turnComplete) {
            this.flushInputTranscript(at);
            if (!this.isCurrentLifecycle(socket, generation)) return;
            const interrupted = this.turnInterrupted;
            if (this.responseId) {
                this.finishResponse('completed');
                if (!this.isCurrentLifecycle(socket, generation)) return;
            } else if (!interrupted && content.interactionStatus !== 'IN_PROGRESS') {
                this.emit({ type: 'response_silent' });
                if (!this.isCurrentLifecycle(socket, generation)) return;
            }
            this.discardOutput = false;
            this.turnInterrupted = false;
            this.generationCompleted = false;
            if (!interrupted) this.lastTurnClosedAt = at;
            if (!interrupted && content.interactionStatus !== 'IN_PROGRESS') {
                this.providerTurnActive = false;
                this.flushCandidate();
            }
        }
        // A deferred rollover runs at the first idle point. After `interrupted`
        // the interviewer is speaking again, so keep waiting for that turn.
        if (content?.turnComplete && this.rolloverAt !== undefined && this.resumeHandle && !this.isBusy()) {
            this.rollover();
            return;
        }
        const update = message.sessionResumptionUpdate;
        if (update?.resumable && typeof update.newHandle === 'string' && update.newHandle) {
            this.resumeHandle = update.newHandle;
            if (this.rolloverAt !== undefined && !this.isBusy()) { this.rollover(); return; }
        }
        if (message.goAway) {
            const seconds = Number(String(message.goAway.timeLeft ?? '').replace(/s$/, ''));
            const inMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1_000) : 0;
            this.emit({ type: 'session_expiring', inMs, ...(this.resumeHandle ? {} : { resumable: false }) });
            if (!this.isCurrentLifecycle(socket, generation)) return;
            if (this.resumeHandle && !this.context?.needsFreshContext?.()) this.scheduleRollover(inMs);
        }
    }

    private finishResponse(status: 'completed' | 'cancelled' | 'failed'): void {
        const responseId = this.responseId;
        this.responseId = undefined;
        if (responseId) this.emit({ type: 'response_done', responseId, status });
    }

    private stopSpeaking(at: number): void {
        this.speaking = false;
        this.emit({ type: 'interviewer_speech_stopped', at });
    }

    private fillSilence(): void {
        if (this.readyAt === undefined) return;
        const behind = (Date.now() - this.streamStartedAt) - this.audioSentMs;
        if (behind <= SILENCE_FILL_AFTER_MS) return;
        let fill = Math.min(behind - SILENCE_PUMP_MS, SILENCE_FILL_MAX_MS);
        while (fill > 0) {
            const ms = Math.min(fill, AUDIO_CHUNK_BYTES / BYTES_PER_MS);
            this.sendAudio(Buffer.alloc(Math.round(ms) * BYTES_PER_MS));
            fill -= ms;
        }
    }

    private sendAudio(audio: Buffer): void {
        this.audioSentMs += audio.length / BYTES_PER_MS;
        this.send({ realtimeInput: { audio: { data: audio.toString('base64'), mimeType: 'audio/pcm;rate=16000' } } });
    }

    private sendCandidate(text: string): void {
        this.sendClientTurn(`Candidate said: ${text}`, false);
    }

    private sendClientTurn(text: string, turnComplete: boolean): void {
        this.send({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete } });
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
        const context = this.context;
        if (!context) return;
        if (this.readyAt !== undefined && Date.now() - this.readyAt >= 30_000) this.failures = 0;
        this.disconnect();
        const delay = (this.options.backoffMs ?? BACKOFF_MS)[this.failures++];
        const fatal = code === 'auth' || code === 'quota' || code === 'protocol' || code === 'unsupported' || delay === undefined;
        if (fatal) {
            const detail = this.resuming && code !== 'auth' && code !== 'quota' && code !== 'unsupported' ? 'session_resumption_failed' : undefined;
            this.release();
            this.startup?.fail(new GeminiLiveError(code));
            this.startup = undefined;
            this.emit({ type: 'error', code, fatal: true, ...(detail ? { detail } : {}) });
            return;
        }
        this.reconnectTimer = setTimeout(() => { this.reconnectTimer = undefined; this.connect(); }, delay);
        this.emit({ type: 'error', code, fatal: false });
        if (this.context === context) this.emit({ type: 'status', status: 'degraded' });
    }

    /** Rolls the socket over. `replay` re-sends the recent interviewer audio
     *  because the old session took part of an unanswered question with it. */
    private rollover(replay = false): void {
        const recent = replay ? this.recentAudio.slice() : [];
        this.disconnect(true);
        if (recent.length) {
            const bytes = recent.reduce((sum, chunk) => sum + chunk.length, 0);
            this.bufferedAudio = recent;
            this.bufferedBytes = bytes;
            this.bufferLimit = bytes + AUDIO_BUFFER_BYTES;
        }
        this.connect();
    }

    /** The interviewer is mid-question, Gemini has not answered yet, or an
     *  answer is streaming: a rollover now would lose that turn. */
    private isBusy(): boolean {
        return this.speaking || this.providerTurnActive || this.responseId !== undefined;
    }

    private rememberAudio(chunk: Buffer): void {
        this.recentAudio.push(chunk);
        this.recentBytes += chunk.length;
        while (this.recentBytes > REPLAY_BUFFER_BYTES) this.recentBytes -= this.recentAudio.shift()!.length;
    }

    private flushInputTranscript(at: number): void {
        const text = this.inputTranscript.replace(/\s+/g, ' ').trim();
        this.inputTranscript = '';
        if (text) this.emit({ type: 'interviewer_transcript', text, final: true, at });
    }

    requestSessionRollover(inMs: number): boolean {
        if (!this.resumeHandle || this.readyAt === undefined) return false;
        this.scheduleRollover(inMs);
        return true;
    }

    private scheduleRollover(inMs: number): void {
        if (!this.isBusy()) {
            this.rollover();
            return;
        }
        if (inMs < MIN_DEFERRED_ROLLOVER_MS) {
            this.rollover(this.responseId === undefined);
            return;
        }
        const at = this.rolloverClock.now() + inMs - ROLLOVER_MARGIN_MS;
        if (this.rolloverAt !== undefined && this.rolloverAt <= at) return;
        if (this.rolloverTimer !== undefined) this.rolloverClock.clearTimeout(this.rolloverTimer);
        this.rolloverAt = at;
        // At the deadline an unanswered question is replayed; a streaming
        // answer is cancelled, as before (its question was already answered).
        this.rolloverTimer = this.rolloverClock.setTimeout(() => this.rollover(this.responseId === undefined), at - this.rolloverClock.now());
    }

    private disconnect(graceful = false): void {
        clearTimeout(this.setupTimer);
        if (this.rolloverTimer !== undefined) this.rolloverClock.clearTimeout(this.rolloverTimer);
        clearInterval(this.silencePump);
        this.silencePump = undefined;
        this.rolloverTimer = undefined;
        this.rolloverAt = undefined;
        this.readyAt = undefined;
        const socket = this.socket;
        this.socket = undefined;
        if (graceful && socket?.readyState === WebSocket.OPEN) socket.close(1000);
        else socket?.terminate();
        if (this.responseId) {
            const status = graceful ? 'cancelled' : this.generationCompleted ? 'completed' : 'failed';
            this.generationCompleted = false;
            this.finishResponse(status);
        }
    }

    private release(graceful = false): void {
        this.lifecycleGeneration++;
        this.context?.signal.removeEventListener('abort', this.abort);
        this.context = undefined;
        clearTimeout(this.reconnectTimer);
        this.disconnect(graceful);
        this.bufferedAudio = [];
        this.bufferedBytes = 0;
        this.bufferLimit = AUDIO_BUFFER_BYTES;
        this.recentAudio = [];
        this.recentBytes = 0;
        this.bufferedCandidate = [];
        this.resumeHandle = undefined;
        this.resuming = false;
        this.inputTranscript = '';
        this.lastTurnClosedAt = undefined;
        this.speaking = false;
        this.providerTurnActive = false;
        this.discardOutput = false;
        this.turnInterrupted = false;
        this.generationCompleted = false;
        this.failures = 0;
    }

    private emit(event: LiveBrainEvent): void {
        for (const listener of this.listeners) listener(event);
    }
}
