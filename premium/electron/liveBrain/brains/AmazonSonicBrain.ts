import { randomUUID } from 'node:crypto';
import {
    BedrockRuntimeClient, InvokeModelWithBidirectionalStreamCommand,
    type InvokeModelWithBidirectionalStreamInput, type InvokeModelWithBidirectionalStreamOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { REALTIME_BACKPRESSURE_FAIL_MS } from '../../../../electron/audio/realtimeTransport';
import { awsErrorDetail } from '../../../../electron/llm/BedrockProvider';
import { DEFAULT_AMAZON_SONIC_MODEL } from '../../../../src/types/liveBrainSettings';
import { toPcm16kMono } from '../interviewerAudio';
import type { LiveBrain, LiveBrainErrorCode, LiveBrainEvent, LiveBrainStartContext } from '../types';

const FRAME_MS = 32;
const FRAME_BYTES = 16_000 * 2 * FRAME_MS / 1_000;
const MAX_PENDING_AUDIO = 16_000 * 2 * 5;
const SILENCE = Buffer.alloc(FRAME_BYTES);
const TEXT = { mediaType: 'text/plain' };
const AUDIO = { mediaType: 'audio/lpcm', sampleSizeBits: 16, channelCount: 1, audioType: 'SPEECH', encoding: 'base64' };

type RequestEvent = InvokeModelWithBidirectionalStreamInput;
type OutputEvent = InvokeModelWithBidirectionalStreamOutput;
type EventFields = Record<string, unknown>;

export interface AmazonSonicOptions {
    sonicRegion?: string;
    model?: string;
    setupTimeoutMs?: number;
    transport?: (region: string, model: string, input: AsyncIterable<RequestEvent>, signal: AbortSignal) => Promise<AsyncIterable<OutputEvent>>;
}

export class AmazonSonicError extends Error {
    constructor(readonly code: LiveBrainErrorCode, readonly detail?: string) {
        super(`Amazon Sonic connection failed (${code}).`);
    }
}

/** User-facing cause for a Sonic failure, including AWS's own message when there is one. */
export function describeSonicFailure(error: unknown): string | undefined {
    if (error instanceof AmazonSonicError) return error.detail;
    const failure = error as { name?: string; message?: string } | undefined;
    if (/credentialsprovider/i.test(failure?.name ?? '')) {
        return 'No AWS credentials were found on this computer. Amazon Sonic needs IAM access keys (Bedrock API keys are not supported for this AWS operation). Run "aws configure" or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, then restart Natively.';
    }
    return awsErrorDetail(failure?.message) || undefined;
}

function classify(error: unknown): LiveBrainErrorCode {
    if (error instanceof AmazonSonicError) return error.code;
    const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } } | undefined;
    const status = failure?.$metadata?.httpStatusCode;
    const name = failure?.name ?? '';
    if (status === 401 || status === 403 || /accessdenied|credentials|expiredtoken|unrecognizedclient/i.test(name)) return 'auth';
    if (status === 429 || /throttl/i.test(name)) return 'rate_limited';
    if (/quota/i.test(name)) return 'quota';
    if (status === 404 || /resourcenotfound/i.test(name)) return 'unsupported';
    if (/timeout/i.test(name)) return 'timeout';
    if (status === 400 || /validation|syntaxerror/i.test(name)) return 'protocol';
    return 'network';
}

function parseGenerationStage(raw: unknown): string | undefined {
    if (typeof raw !== 'string' || !raw.trim()) return undefined;
    try {
        const parsed = JSON.parse(raw) as { generationStage?: unknown };
        return typeof parsed?.generationStage === 'string' ? parsed.generationStage : undefined;
    } catch {
        return undefined;
    }
}

interface Completion {
    id: string;
    responseId: string;
    started: boolean;
    cancelled: boolean;
    speculative: string[];
    final: string[];
}

interface TextBlock {
    completionId: string;
    kind: 'user' | 'speculative' | 'final';
    text: string;
}

export class AmazonSonicBrain implements LiveBrain {
    readonly id = 'amazon-sonic' as const;
    private readonly listeners = new Set<(event: LiveBrainEvent) => void>();
    private readonly controller = new AbortController();
    private readonly promptName = randomUUID();
    private readonly audioName = randomUUID();
    private readonly blocks = new Map<string, TextBlock>();
    private readonly completions = new Map<string, Completion>();
    private currentResponse?: Completion;
    private queue: RequestEvent[] = [];
    private wake?: () => void;
    private audio = Buffer.alloc(0);
    private timer?: ReturnType<typeof setInterval>;
    private queueFullSince?: number;
    private lifecycleGeneration = 0;
    private ready = false;
    private closed = false;
    private context?: LiveBrainStartContext;

    constructor(private readonly options: AmazonSonicOptions) {}

    onEvent(listener: (event: LiveBrainEvent) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async start(context: LiveBrainStartContext): Promise<void> {
        if (this.context || this.closed || !this.options.sonicRegion) throw new AmazonSonicError('protocol');
        context.signal.throwIfAborted();
        const generation = ++this.lifecycleGeneration;
        this.context = context;
        context.signal.addEventListener('abort', this.onAbort, { once: true });
        this.emit({ type: 'status', status: 'connecting' });
        if (this.closed || this.lifecycleGeneration !== generation) {
            throw new AmazonSonicError('network');
        }
        this.send('sessionStart', { inferenceConfiguration: { maxTokens: 2048, topP: 0.9, temperature: 0.7 },
            turnDetectionConfiguration: { endpointingSensitivity: 'MEDIUM' } });
        this.send('promptStart', { promptName: this.promptName, textOutputConfiguration: TEXT,
            audioOutputConfiguration: { ...AUDIO, sampleRateHertz: 24_000, voiceId: 'tiffany' } });
        this.sendText('SYSTEM', context.instructions, false);
        this.send('contentStart', { promptName: this.promptName, contentName: this.audioName, type: 'AUDIO',
            role: 'USER', interactive: true, audioInputConfiguration: { ...AUDIO, sampleRateHertz: 16_000 } });
        this.timer = setInterval(() => this.flushAudio(), FRAME_MS);
        const setup = setTimeout(() => this.controller.abort(new AmazonSonicError('timeout')), this.options.setupTimeoutMs ?? 8_000);
        try {
            const input = this.input();
            const model = this.options.model || DEFAULT_AMAZON_SONIC_MODEL;
            const stream = this.options.transport
                ? await this.options.transport(this.options.sonicRegion, model, input, this.controller.signal)
                : await this.openSdk(this.options.sonicRegion, model, input);
            this.controller.signal.throwIfAborted();
            if (this.closed || this.lifecycleGeneration !== generation) {
                throw new AmazonSonicError('network');
            }
            this.ready = true;
            this.emit({ type: 'status', status: 'ready' });
            if (this.closed || this.lifecycleGeneration !== generation) return;
            void this.read(stream, generation);
        } catch (error) {
            const cause = this.controller.signal.reason ?? error;
            const code = classify(cause);
            const wasClosed = this.closed;
            this.releaseResources();
            if (!wasClosed) this.notifyFailure(code);
            await this.stop();
            throw new AmazonSonicError(code, describeSonicFailure(cause));
        } finally {
            clearTimeout(setup);
        }
    }

    private async openSdk(region: string, model: string, input: AsyncIterable<RequestEvent>): Promise<AsyncIterable<OutputEvent>> {
        const client = new BedrockRuntimeClient({ region, maxAttempts: 1, authSchemePreference: ['sigv4'], ignoreConfiguredEndpointUrls: true });
        try {
            const { body } = await client.send(new InvokeModelWithBidirectionalStreamCommand({ modelId: model, body: input }),
                { abortSignal: this.controller.signal });
            if (!body) throw new AmazonSonicError('protocol');
            return (async function* () {
                try { yield* body; }
                finally { client.destroy(); }
            })();
        } catch (error) {
            client.destroy();
            throw error;
        }
    }

    pushInterviewerAudio(pcm: Int16Array, sampleRate: number): void {
        if (!this.ready || !pcm.length) return;
        const source = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
        const bytes = toPcm16kMono(source, sampleRate, 1);
        const audio = Buffer.concat([this.audio, bytes]);
        this.audio = audio.subarray(Math.max(0, audio.length - MAX_PENDING_AUDIO));
    }

    /** The supervisor retains labelled candidate turns and seeds a fresh session. */
    addCandidateText(_text: string, _at: number): void {}

    sendTestPrompt(): void {
        if (this.ready) this.sendText('USER', 'Reply with OK.', true);
    }

    cancelResponse(_reason: string): void {
        const completion = this.currentResponse;
        if (!completion || completion.cancelled) return;
        completion.cancelled = true;
        this.emit({ type: 'response_done', responseId: completion.responseId, status: 'cancelled' });
        this.currentResponse = undefined;
    }

    private releaseResources(): void {
        this.context?.signal.removeEventListener('abort', this.onAbort);
        clearInterval(this.timer);
        this.timer = undefined;
        if (!this.controller.signal.aborted) this.controller.abort();
        this.ready = false;
        this.wake?.();
        this.blocks.clear();
        this.completions.clear();
        this.currentResponse = undefined;
        this.audio = Buffer.alloc(0);
        this.queue = [];
        this.queueFullSince = undefined;
    }

    async stop(): Promise<void> {
        if (this.closed) return;
        this.lifecycleGeneration++;
        this.context?.signal.removeEventListener('abort', this.onAbort);
        clearInterval(this.timer);
        this.timer = undefined;
        if (this.ready && !this.controller.signal.aborted) {
            this.queue = [];
            this.send('contentEnd', { promptName: this.promptName, contentName: this.audioName });
            this.send('promptEnd', { promptName: this.promptName });
            this.send('sessionEnd', {});
            setTimeout(() => this.controller.abort(), 250).unref();
        } else if (!this.controller.signal.aborted) {
            this.controller.abort();
        }
        this.closed = true;
        this.ready = false;
        this.wake?.();
        this.blocks.clear();
        this.completions.clear();
        this.currentResponse = undefined;
        this.audio = Buffer.alloc(0);
        this.queueFullSince = undefined;
        this.emit({ type: 'status', status: 'closed' });
    }

    private readonly onAbort = (): void => { void this.stop(); };

    private emit(event: LiveBrainEvent): void {
        for (const listener of this.listeners) listener(event);
    }

    private notifyFailure(code: LiveBrainErrorCode): void {
        console.warn('[LiveBrain] Amazon Sonic stream failed:', code);
        this.emit({ type: 'error', code, fatal: true });
    }

    private send(name: string, fields: EventFields): void {
        this.queue.push({ chunk: { bytes: Buffer.from(JSON.stringify({ event: { [name]: fields } })) } });
        this.wake?.();
    }

    private sendText(role: 'USER' | 'SYSTEM', content: string, interactive: boolean): void {
        if (!content) return;
        const names = { promptName: this.promptName, contentName: randomUUID() };
        this.send('contentStart', { ...names, type: 'TEXT', role, interactive, textInputConfiguration: TEXT });
        this.send('textInput', { ...names, content });
        this.send('contentEnd', names);
    }

    private flushAudio(): void {
        // Bound unsent frames when the HTTP/2 writer is stalled and keep data
        // flowing over sparse Windows/macOS loopback capture during pauses.
        if (this.queue.length > 64) {
            const now = Date.now();
            if (this.queueFullSince === undefined) this.queueFullSince = now;
            else if (now - this.queueFullSince > REALTIME_BACKPRESSURE_FAIL_MS) {
                this.releaseResources();
                if (!this.closed) this.notifyFailure('network');
                void this.stop();
            }
            return;
        }
        this.queueFullSince = undefined;
        let frame = SILENCE;
        if (this.audio.length) {
            frame = Buffer.alloc(FRAME_BYTES);
            const copied = this.audio.copy(frame, 0, 0, FRAME_BYTES);
            this.audio = this.audio.subarray(copied);
        }
        this.send('audioInput', { promptName: this.promptName, contentName: this.audioName, content: frame.toString('base64') });
    }

    private async *input(): AsyncGenerator<RequestEvent> {
        try {
            while (this.queue.length || !this.closed) {
                if (this.queue.length) yield this.queue.shift()!;
                else await new Promise<void>(resolve => { this.wake = resolve; });
            }
        } finally {
            this.wake = undefined;
        }
    }

    private async read(stream: AsyncIterable<OutputEvent>, generation: number): Promise<void> {
        try {
            for await (const result of stream) {
                if (this.closed || this.lifecycleGeneration !== generation) return;
                if (!result.chunk?.bytes) {
                    const name = Object.keys(result).find(key => key.endsWith('Exception'));
                    if (name) throw Object.assign(new Error(), { name });
                    continue;
                }
                const event = JSON.parse(Buffer.from(result.chunk.bytes).toString('utf8')).event;
                if (event) this.receive(event, generation);
            }
            if (!this.closed && this.lifecycleGeneration === generation) throw new AmazonSonicError('network');
        } catch (error) {
            if (!this.closed && this.lifecycleGeneration === generation) {
                this.releaseResources();
                this.notifyFailure(classify(error));
                await this.stop();
            }
        }
    }

    private receive(event: Record<string, EventFields>, generation: number): void {
        if (this.closed || this.lifecycleGeneration !== generation) return;
        const alive = () => !this.closed && this.lifecycleGeneration === generation;
        if (event.completionStart) {
            const id = String(event.completionStart.completionId ?? '');
            if (id) this.completions.set(id, { id, responseId: `${this.context?.responseNamespace ?? this.promptName}:${id}`,
                started: false, cancelled: false, speculative: [], final: [] });
        } else if (event.contentStart?.type === 'TEXT') {
            const { contentId, completionId, additionalModelFields, role } = event.contentStart;
            if (typeof contentId !== 'string' || typeof completionId !== 'string') return;
            const stage = parseGenerationStage(additionalModelFields);
            const kind = role === 'USER' ? 'user' : stage === 'SPECULATIVE' ? 'speculative' : 'final';
            this.blocks.set(contentId, { completionId, kind, text: '' });
            if (kind === 'user') this.emit({ type: 'interviewer_speech_started', at: Date.now() });
        } else if (event.textOutput) {
            const { contentId, content, completionId } = event.textOutput;
            if (typeof content !== 'string') return;
            const block = this.blocks.get(String(contentId));
            if (/^\s*\{\s*"interrupted"\s*:\s*true\s*\}\s*$/.test(content)) {
                this.interrupt(String(completionId ?? block?.completionId ?? ''), generation);
            } else if (block) {
                block.text += content;
                if (block.kind === 'speculative') {
                    this.completions.get(block.completionId)?.speculative.push(content);
                    this.delta(block.completionId, content, generation);
                }
            }
        } else if (event.contentEnd) {
            const { contentId, completionId, stopReason } = event.contentEnd;
            const block = this.blocks.get(String(contentId));
            this.blocks.delete(String(contentId));
            if (stopReason === 'INTERRUPTED') {
                this.interrupt(String(completionId ?? block?.completionId ?? ''), generation);
                if (!alive()) return;
            }
            if (block?.kind === 'user') {
                const at = Date.now();
                if (block.text.trim()) {
                    this.emit({ type: 'interviewer_transcript', text: block.text.trim(), final: true, at });
                    if (!alive()) return;
                }
                this.emit({ type: 'interviewer_speech_stopped', at });
            } else if (block?.kind === 'final' && block.text.trim()) {
                this.completions.get(block.completionId)?.final.push(block.text.trim());
            }
        } else if (event.completionEnd) {
            const id = String(event.completionEnd.completionId ?? '');
            const completion = this.completions.get(id);
            if (!completion) return;
            if (event.completionEnd.stopReason === 'INTERRUPTED') {
                this.interrupt(id, generation);
                if (!alive()) return;
            }
            if (!completion.cancelled) {
                const finalText = completion.final.join(' ').replace(/\s+/g, ' ').trim();
                if (!completion.started && finalText) {
                    this.delta(id, finalText, generation);
                    if (!alive()) return;
                }
                if (completion.started) {
                    const speculativeText = completion.speculative.join('').replace(/\s+/g, ' ').trim();
                    const overrideFinal = finalText && finalText !== speculativeText ? finalText : undefined;
                    this.emit({
                        type: 'response_done',
                        responseId: completion.responseId,
                        status: 'completed',
                        ...(overrideFinal ? { finalText: overrideFinal } : {}),
                    });
                } else {
                    this.emit({ type: 'response_silent' });
                }
            }
            this.completions.delete(id);
            if (this.currentResponse === completion) this.currentResponse = undefined;
        }
    }

    private delta(id: string, text: string, generation: number): void {
        const completion = this.completions.get(id);
        if (!completion || completion.cancelled || !text) return;
        if (!completion.started) {
            completion.started = true;
            this.currentResponse = completion;
            this.emit({ type: 'response_started', responseId: completion.responseId, at: Date.now() });
            if (this.closed || this.lifecycleGeneration !== generation) return;
        }
        if (!completion.cancelled) this.emit({ type: 'response_delta', responseId: completion.responseId, text });
    }

    private interrupt(id: string, generation: number): void {
        const completion = this.completions.get(id) ?? this.currentResponse;
        if (!completion || completion.cancelled) return;
        completion.cancelled = true;
        this.emit({ type: 'interviewer_speech_started', at: Date.now() });
        if (this.closed || this.lifecycleGeneration !== generation) return;
        if (completion.started) this.emit({ type: 'response_done', responseId: completion.responseId, status: 'cancelled' });
        if (this.currentResponse === completion) this.currentResponse = undefined;
    }
}
