import WebSocket from 'ws';
import {
    isProtocolCloseCode,
    isPublicHttpsUrl,
    REALTIME_READY_RESET_MS,
    realtimeReconnectDelay,
    realtimeSocketOptions,
    resampleRealtimePcm16,
    SocketBackpressureTracker,
} from '../../../../electron/audio/realtimeTransport';
import { safeDetachAndClose } from '../../../../electron/audio/wsSafeTeardown';
import type { DeepgramThinkConfig } from '../../../../electron/premium/liveBrain';
import { DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_MODEL, DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_PROVIDER } from '../../../../src/types/liveBrainSettings';
import { CLARIFICATION_ASSUMPTION, DEEPGRAM_MAX_MANAGED_PROMPT_CHARS } from '../instructions';
import type { LiveBrain, LiveBrainErrorCode, LiveBrainEvent, LiveBrainStartContext } from '../types';

export const DEEPGRAM_VOICE_AGENT_ENDPOINT = 'wss://agent.deepgram.com/v1/agent/converse';
export const DEEPGRAM_SAMPLE_RATE = 16_000;
export const DEEPGRAM_FRAME_SAMPLES = 320; // 20 ms at 16 kHz mono
export const DEEPGRAM_FRAME_BYTES = DEEPGRAM_FRAME_SAMPLES * 2; // 640 bytes
const DEEPGRAM_BYTES_PER_MS = DEEPGRAM_SAMPLE_RATE * 2 / 1_000; // 32 bytes/ms
const SILENCE_FILL_AFTER_MS = 300;
const SILENCE_FILL_INTERVAL_MS = 100;
const KEEPALIVE_INTERVAL_MS = 8_000;
const MAX_RETRIES = 3;

// Retryable transient/server-side error codes per
// https://developers.deepgram.com/docs/voice-agent-errors-warnings
const RETRYABLE_DEEPGRAM_ERROR_CODES = new Set([
    'ASR_CONNECTION_CLOSED',
    'FAILED_TO_START_LISTENING',
    'INTERNAL_SERVER_ERROR',
    'MAXIMUM_SESSION_LENGTH_REACHED',
]);

export interface DeepgramVoiceAgentOptions {
    apiKey: string;
    model?: string;
    endpoint?: string;
    setupTimeoutMs?: number;
    backoffMs?: readonly number[];
    deepgramThink?: DeepgramThinkConfig;
}

interface DeepgramWireMessage {
    type?: string;
    role?: string;
    content?: string;
    code?: string;
    warn_code?: string;
    description?: string;
    reason?: string;
    message?: string;
    error?: { code?: string; message?: string };
}

export class DeepgramVoiceAgentError extends Error {
    constructor(readonly code: LiveBrainErrorCode, detail?: string) {
        super(detail ? `Deepgram Voice Agent failed (${code}): ${detail}` : `Deepgram Voice Agent failed (${code}).`);
    }
}

export interface ResolvedByoEndpoint {
    providerType: 'open_ai' | 'anthropic' | 'google' | 'groq';
    model?: string;
    url: string;
    headers: Record<string, string>;
}

/**
 * Resolves a BYO Think endpoint for Deepgram Voice Agent.
 *
 * Codex, Antigravity, and local Ollama (localhost/127.0.0.1) are excluded:
 * Deepgram's servers make outbound HTTPS calls to `agent.think.endpoint.url`
 * and cannot reach Natively-internal OAuth sessions or localhost daemons.
 *
 * Google's OpenAI-compatible endpoint requires `Authorization: Bearer <key>`
 * (not `x-goog-api-key`) and `provider.type: 'open_ai'`. Anthropic BYO must
 * omit `anthropic-version`, which Deepgram sets itself and rejects if supplied.
 */
export function resolveByoEndpoint(
    byoKeyProvider: string | undefined,
    byoApiKey: string | undefined,
    byoModel?: string,
    customUrl?: string,
    customHeader?: string,
): ResolvedByoEndpoint {
    const provider = (byoKeyProvider || '').trim().toLowerCase();
    const key = (byoApiKey || '').trim();
    switch (provider) {
        case 'openai':
            if (!key) throw new DeepgramVoiceAgentError('auth', 'OpenAI API key is missing.');
            return {
                providerType: 'open_ai',
                model: byoModel?.trim() || 'gpt-4o-mini',
                url: 'https://api.openai.com/v1/chat/completions',
                headers: { Authorization: `Bearer ${key}` },
            };
        case 'anthropic':
        case 'claude':
            if (!key) throw new DeepgramVoiceAgentError('auth', 'Anthropic API key is missing.');
            return {
                providerType: 'anthropic',
                model: byoModel?.trim() || 'claude-haiku-4-5',
                url: 'https://api.anthropic.com/v1/messages',
                headers: { 'x-api-key': key },
            };
        case 'google':
        case 'gemini':
            if (!key) throw new DeepgramVoiceAgentError('auth', 'Google AI Studio API key is missing.');
            return {
                providerType: 'open_ai',
                model: byoModel?.trim() || 'gemini-2.5-flash',
                url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
                headers: { Authorization: `Bearer ${key}` },
            };
        case 'groq':
            // Deepgram documents a dedicated Groq BYO provider type.
            if (!key) throw new DeepgramVoiceAgentError('auth', 'Groq API key is missing.');
            return {
                providerType: 'groq',
                model: byoModel?.trim() || 'qwen/qwen3.8-27b',
                url: 'https://api.groq.com/openai/v1/chat/completions',
                headers: { Authorization: `Bearer ${key}` },
            };
        case 'openrouter':
            if (!key) throw new DeepgramVoiceAgentError('auth', 'OpenRouter API key is missing.');
            return {
                providerType: 'open_ai',
                model: byoModel?.trim() || 'openai/gpt-4o-mini',
                url: 'https://openrouter.ai/api/v1/chat/completions',
                headers: { Authorization: `Bearer ${key}` },
            };
        default: {
            if (provider !== 'custom' && !provider.startsWith('custom:')) {
                throw new DeepgramVoiceAgentError('unsupported', 'Unsupported BYO Think provider.');
            }
            const url = (customUrl || '').trim();
            if (!url || !isPublicHttpsUrl(url)) {
                throw new DeepgramVoiceAgentError('unsupported', 'Configure a public HTTPS Think endpoint.');
            }
            const model = byoModel?.trim();
            if (!model) throw new DeepgramVoiceAgentError('unsupported', 'Choose a model ID for the custom Think endpoint.');
            const headers: Record<string, string> = {};
            const headerLine = (customHeader || '').trim();
            if (headerLine) {
                const colon = headerLine.indexOf(':');
                if (colon > 0) {
                    headers[headerLine.slice(0, colon).trim()] = headerLine.slice(colon + 1).trim();
                } else {
                    headers.Authorization = headerLine;
                }
            }
            return {
                providerType: 'open_ai',
                model,
                url,
                headers,
            };
        }
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

export class DeepgramVoiceAgentBrain implements LiveBrain {
    readonly id = 'deepgram-voice-agent' as const;
    private readonly listeners = new Set<(event: LiveBrainEvent) => void>();
    private context?: LiveBrainStartContext;
    private startup?: { resolve(): void; reject(error: Error): void };
    private socket?: WebSocket;
    private setupTimer?: ReturnType<typeof setTimeout>;
    private retryTimer?: ReturnType<typeof setTimeout>;
    private audioTimer?: ReturnType<typeof setInterval>;
    private keepAliveTimer?: ReturnType<typeof setInterval>;
    private ready = false;
    private readyAt?: number;
    private speaking = false;
    private failures = 0;
    private sequence = 0;
    private activeResponseId?: string;
    private awaitingAnswer = false;
    private injectedText?: string;
    private interrupted = false;
    private audio = Buffer.alloc(0);
    private audioThrough = 0;
    private lastBinarySentAt = 0;
    private readonly backpressure = new SocketBackpressureTracker(this.id);

    constructor(private readonly options: DeepgramVoiceAgentOptions) {}

    onEvent(listener: (event: LiveBrainEvent) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    start(context: LiveBrainStartContext): Promise<void> {
        if (this.context) return Promise.reject(new DeepgramVoiceAgentError('protocol'));
        if (context.signal.aborted) return Promise.reject(new DeepgramVoiceAgentError('network'));
        const thinkCfg = this.options.deepgramThink;
        if (thinkCfg?.thinkMode === 'byo') {
            try {
                resolveByoEndpoint(
                    thinkCfg.byoKeyProvider,
                    thinkCfg.byoApiKey,
                    thinkCfg.byoModel,
                    thinkCfg.byoCustomUrl,
                    thinkCfg.byoCustomHeader,
                );
            } catch (err) {
                return Promise.reject(err);
            }
        }
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
        this.cancelResponse('stopped');
        this.dispose(new DeepgramVoiceAgentError('network'));
        this.emit({ type: 'status', status: 'closed' });
    }

    pushInterviewerAudio(pcm: Int16Array, sampleRate: number): void {
        if (!this.ready || !pcm.length || !Number.isFinite(sampleRate) || sampleRate <= 0) return;
        const input = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        this.enqueueAudio(resampleRealtimePcm16(input, sampleRate, 1, DEEPGRAM_SAMPLE_RATE));
    }

    /** Deepgram Voice Agent cannot inject silent turns mid-session; BrainSupervisor persists this in InterviewNotebook. */
    addCandidateText(_text: string, _at: number): void {}

    addHistoryContext(history: string): void {
        if (!this.ready || !history.trim() || !this.context) return;
        const extra = `\n\nRecent interview context from the prior session:\n${history.slice(-2_000)}`;
        const instructions = this.context.instructions;
        const prompt = this.options.deepgramThink?.thinkMode === 'byo'
            ? instructions + extra
            : instructions.slice(0, Math.max(0, DEEPGRAM_MAX_MANAGED_PROMPT_CHARS - extra.length)) + extra;
        this.sendJson({ type: 'UpdatePrompt', prompt: this.boundPrompt(prompt) });
    }

    requestClarificationAnswer(): void {
        if (!this.ready || this.speaking || this.activeResponseId) return;
        this.injectUserMessage(CLARIFICATION_ASSUMPTION);
    }

    /** Sends a synthetic user message (used by Test Connection to verify the Think model). */
    injectUserMessage(content: string): boolean {
        const text = content.trim();
        if (!this.ready || !text || !this.sendJson({ type: 'InjectUserMessage', content: text })) return false;
        this.injectedText = text;
        this.awaitingAnswer = true;
        return true;
    }

    cancelResponse(_reason: string): void {
        this.interrupted ||= this.awaitingAnswer;
        this.awaitingAnswer = false;
        this.finishResponse('cancelled');
    }

    private finishResponse(status: 'completed' | 'cancelled'): void {
        const responseId = this.activeResponseId;
        if (!responseId) return;
        this.activeResponseId = undefined;
        this.emit({ type: 'response_done', responseId, status });
    }

    private readonly onAbort = (): void => { void this.stop(); };

    private emit(event: LiveBrainEvent): void {
        for (const listener of this.listeners) listener(event);
    }

    private boundPrompt(raw: string): string {
        const thinkMode = this.options.deepgramThink?.thinkMode ?? 'managed';
        if (thinkMode === 'managed' && raw.length > DEEPGRAM_MAX_MANAGED_PROMPT_CHARS) {
            console.warn(`[DeepgramVoiceAgent] Managed prompt length (${raw.length}) exceeds ${DEEPGRAM_MAX_MANAGED_PROMPT_CHARS} chars; truncating.`);
            return raw.slice(0, DEEPGRAM_MAX_MANAGED_PROMPT_CHARS);
        }
        return raw;
    }

    private buildHistoryMessages(context: LiveBrainStartContext | undefined): Array<{ type: 'History'; role: 'user' | 'assistant'; content: string }> {
        if (!context) return [];
        const messages: Array<{ type: 'History'; role: 'user' | 'assistant'; content: string }> = [];
        if (context.notebook?.summary?.trim()) {
            messages.push({ type: 'History', role: 'user', content: `Earlier interview summary: ${context.notebook.summary.trim()}` });
        }
        for (const turn of context.recentTurns ?? []) {
            const text = turn.text.trim();
            if (!text) continue;
            if (turn.role === 'assistant') {
                messages.push({ type: 'History', role: 'assistant', content: text });
            } else {
                messages.push({
                    type: 'History',
                    role: 'user',
                    content: turn.role === 'candidate' ? `Candidate said: ${text}` : text,
                });
            }
        }
        return messages;
    }

    buildSettingsMessage(): Record<string, unknown> {
        const original = this.context;
        const refreshed = original?.refreshContext?.();
        const context = refreshed && original ? { ...original, ...refreshed } : original;
        const thinkCfg = this.options.deepgramThink;
        const thinkMode = thinkCfg?.thinkMode ?? 'managed';
        const prompt = this.boundPrompt(context?.instructions ?? '');

        let think: Record<string, unknown>;
        if (thinkMode === 'byo') {
            const resolved = resolveByoEndpoint(
                thinkCfg?.byoKeyProvider,
                thinkCfg?.byoApiKey,
                thinkCfg?.byoModel,
                thinkCfg?.byoCustomUrl,
                thinkCfg?.byoCustomHeader,
            );
            think = {
                provider: {
                    type: resolved.providerType,
                    ...(resolved.model ? { model: resolved.model } : {}),
                },
                endpoint: {
                    url: resolved.url,
                    headers: resolved.headers,
                },
                prompt,
            };
        } else {
            think = {
                provider: {
                    type: thinkCfg?.managedProvider ?? DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_PROVIDER,
                    model: thinkCfg?.managedModel?.trim() || this.options.model?.trim() || DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_MODEL,
                },
                prompt,
            };
        }

        const history = this.buildHistoryMessages(context);
        return {
            type: 'Settings',
            audio: {
                input: { encoding: 'linear16', sample_rate: DEEPGRAM_SAMPLE_RATE },
                output: { encoding: 'linear16', sample_rate: DEEPGRAM_SAMPLE_RATE, container: 'none' },
            },
            agent: {
                ...(history.length ? { context: { messages: history } } : {}),
                listen: { provider: { type: 'deepgram', version: 'v2', model: 'flux-general-multi' } },
                think,
                speak: { provider: { type: 'deepgram', model: 'aura-2-asteria-en' } },
            },
        };
    }

    private connect(): void {
        const context = this.context;
        if (!context) return;
        this.emit({ type: 'status', status: this.failures ? 'degraded' : 'connecting' });
        if (this.context !== context) return;
        let socket: WebSocket;
        try {
            const url = new URL(this.options.endpoint ?? DEEPGRAM_VOICE_AGENT_ENDPOINT);
            socket = new WebSocket(url, realtimeSocketOptions({ Authorization: `Token ${this.options.apiKey.trim()}` }));
        } catch {
            this.handleFailure('protocol');
            return;
        }
        this.socket = socket;
        this.setupTimer = setTimeout(() => this.handleFailure('timeout'), this.options.setupTimeoutMs ?? 10_000);
        socket.on('message', (data, isBinary) => {
            if (this.socket !== socket) return;
            // Binary frames are TTS output audio; discard immediately (D6).
            if (isBinary) return;
            let event: DeepgramWireMessage;
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

    private onMessage(event: DeepgramWireMessage, socket: WebSocket): void {
        const context = this.context;
        if (!context || this.socket !== socket) return;
        if (event.type === 'Warning') {
            const code = event.code ?? event.warn_code;
            if (code === 'MAXIMUM_SESSION_LENGTH_APPROACHING') {
                this.emit({ type: 'session_expiring', inMs: 5 * 60_000, resumable: false });
            } else if (code === 'PROMPT_TOO_LONG') {
                console.warn('[DeepgramVoiceAgent] Deepgram truncated the session prompt.');
            }
            return;
        }
        if (event.type === 'Error') {
            const errCode = event.code ?? event.error?.code;
            const detail = `${errCode ?? ''} ${event.description ?? event.message ?? event.error?.message ?? ''}`.trim();
            const fallback = errCode && RETRYABLE_DEEPGRAM_ERROR_CODES.has(errCode)
                ? 'network' : 'protocol';
            this.handleFailure(classify(undefined, detail, fallback));
            return;
        }
        if (event.type === 'Close') {
            this.handleFailure('network');
            return;
        }
        if (!this.ready) {
            if (event.type === 'Welcome') {
                try {
                    this.sendJson(this.buildSettingsMessage());
                } catch (err) {
                    const code = err instanceof DeepgramVoiceAgentError ? err.code : 'protocol';
                    this.handleFailure(code, err instanceof DeepgramVoiceAgentError ? err.message : undefined);
                }
            } else if (event.type === 'SettingsApplied') {
                this.becomeReady(context, socket);
            }
            return;
        }
        const at = Date.now();
        switch (event.type) {
            case 'UserStartedSpeaking':
                this.speaking = true;
                this.injectedText = undefined;
                this.emit({ type: 'interviewer_speech_started', at });
                if (this.context !== context || this.socket !== socket) return;
                this.cancelResponse('barge_in');
                break;
            case 'ConversationText': {
                const text = typeof event.content === 'string' ? event.content.trim() : '';
                if (!text) break;
                if (event.role === 'user') {
                    if (text === this.injectedText) break;
                    this.injectedText = undefined;
                    if (this.activeResponseId) {
                        this.cancelResponse('new_turn');
                        if (this.context !== context || this.socket !== socket) return;
                    }
                    this.speaking = false;
                    this.awaitingAnswer = true;
                    this.emit({ type: 'interviewer_transcript', text, final: true, at });
                    if (this.context !== context || this.socket !== socket) return;
                    this.emit({ type: 'interviewer_speech_stopped', at });
                } else if (event.role === 'assistant' && this.awaitingAnswer && !this.speaking) {
                    this.failures = 0;
                    const continuing = this.activeResponseId !== undefined;
                    if (!continuing) {
                        const namespace = context.responseNamespace ?? context.sessionId;
                        this.activeResponseId = `${namespace}:${++this.sequence}`;
                        this.emit({ type: 'response_started', responseId: this.activeResponseId, at });
                        if (this.context !== context || this.socket !== socket) return;
                    }
                    if (this.activeResponseId) {
                        this.emit({ type: 'response_delta', responseId: this.activeResponseId, text: continuing ? ` ${text}` : text });
                    }
                }
                break;
            }
            case 'AgentAudioDone':
                if (!this.awaitingAnswer || this.speaking || (this.interrupted && !this.activeResponseId)) break;
                this.awaitingAnswer = false;
                this.interrupted = false;
                this.injectedText = undefined;
                if (this.activeResponseId) this.finishResponse('completed');
                else this.emit({ type: 'response_silent' });
                break;
        }
    }

    private becomeReady(context: LiveBrainStartContext, socket: WebSocket): void {
        this.clearSetupTimer();
        this.ready = true;
        this.readyAt = Date.now();
        this.interrupted = false;
        this.injectedText = undefined;
        this.audioThrough = Date.now();
        this.lastBinarySentAt = Date.now();
        this.keepAliveTimer = setInterval(() => {
            if (Date.now() - this.lastBinarySentAt >= KEEPALIVE_INTERVAL_MS) {
                this.sendJson({ type: 'KeepAlive' });
            }
        }, KEEPALIVE_INTERVAL_MS);
        this.audioTimer = setInterval(() => this.fillSparseSilence(), SILENCE_FILL_INTERVAL_MS);
        const startup = this.startup;
        this.emit({ type: 'status', status: 'ready' });
        if (this.context !== context || this.socket !== socket) return;
        this.startup = undefined;
        startup?.resolve();
    }

    private handleFailure(code: LiveBrainErrorCode, detail?: string): void {
        const context = this.context;
        if (!context) return;
        if (this.readyAt !== undefined && Date.now() - this.readyAt >= REALTIME_READY_RESET_MS) {
            this.failures = 0;
        }
        this.closeSocket();
        this.cancelResponse(code);
        if (this.context !== context) return;
        this.ready = false;
        this.speaking = false;
        this.audio = Buffer.alloc(0);
        const retryable = code === 'network' || code === 'timeout' || code === 'rate_limited';
        const attempt = this.failures++;
        const backoff = this.options.backoffMs;
        const limit = backoff ? backoff.length : MAX_RETRIES;
        const fatal = !retryable || attempt >= limit;
        if (fatal) {
            this.dispose(new DeepgramVoiceAgentError(code, detail));
            this.emit({ type: 'error', code, fatal: true, ...(detail ? { detail } : {}) });
            return;
        }
        this.emit({ type: 'error', code, fatal: false, ...(detail ? { detail } : {}) });
        if (this.context !== context) return;
        const delay = backoff ? backoff[attempt] : realtimeReconnectDelay(attempt);
        this.emit({ type: 'status', status: 'degraded', detail: code });
        if (this.context !== context) return;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            if (this.context === context) this.connect();
        }, delay);
    }

    private enqueueAudio(pcm: Buffer, isSilence = false): void {
        if (!pcm.length || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.audioThrough = Date.now();
        this.audio = Buffer.concat([this.audio, pcm]);
        while (this.audio.length >= DEEPGRAM_FRAME_BYTES) {
            const frame = this.audio.subarray(0, DEEPGRAM_FRAME_BYTES);
            this.audio = this.audio.subarray(DEEPGRAM_FRAME_BYTES);
            this.sendBinary(frame, isSilence);
        }
    }

    private fillSparseSilence(): void {
        if (!this.ready) return;
        const lagMs = Date.now() - this.audioThrough;
        if (lagMs <= SILENCE_FILL_AFTER_MS) return;
        const padMs = Math.min(lagMs, 1_000);
        const padBytes = Math.floor((padMs * DEEPGRAM_BYTES_PER_MS) / 2) * 2;
        if (padBytes > 0) this.enqueueAudio(Buffer.alloc(padBytes), true);
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

    private sendBinary(frame: Buffer, isSilence = false): void {
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
            if (!isSilence) this.lastBinarySentAt = Date.now();
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
        if (this.keepAliveTimer !== undefined) clearInterval(this.keepAliveTimer);
        this.retryTimer = undefined;
        this.audioTimer = undefined;
        this.keepAliveTimer = undefined;
        this.readyAt = undefined;
        this.lastBinarySentAt = 0;
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
        this.activeResponseId = undefined;
        this.awaitingAnswer = false;
        this.injectedText = undefined;
        this.audio = Buffer.alloc(0);
        context?.signal.removeEventListener('abort', this.onAbort);
        this.closeSocket();
        const startup = this.startup;
        this.startup = undefined;
        startup?.reject(error);
    }
}
