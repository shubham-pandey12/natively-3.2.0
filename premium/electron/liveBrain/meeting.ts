import { notePromptDebugLiveBrain, isPromptDebugEnabled, notePromptDebugAnswerTiming } from '../../../electron/llm/promptDebug';
import type { LiveBrainMeetingOptions, LiveBrainMeetingSession } from '../../../electron/premium/liveBrain';
import type { LiveBrainSettingsResult } from '../../../src/types/liveBrainSettings';
import { DEFAULT_GEMINI_LIVE_MODEL, GeminiLiveBrain, GeminiLiveError, type GeminiLiveOptions } from './brains/GeminiLiveBrain';
import { createLiveBrain } from './index';
import { BrainSupervisor } from './BrainSupervisor';
import { InterviewNotebook } from './InterviewNotebook';
import { PipelineBrain } from './brains/PipelineBrain';
import type { LiveBrainStatus } from '../../../src/types/whatToAnswerQuestion';
import { buildAnswerInstructions } from './instructions';
import { toPcm16kMono } from './interviewerAudio';
import { createLiveBrainOverlayPort } from './overlayPort';
import { ResponseOrchestrator } from './ResponseOrchestrator';
import type { LiveBrain, LiveBrainErrorCode, LiveBrainStartContext } from './types';

function startContext(sessionId: string, instructions: string, signal: AbortSignal): LiveBrainStartContext {
    return {
        sessionId, instructions, signal, recentTurns: [],
        notebook: { topics: [], currentTopic: null, requirements: [], constraints: [], clarifications: [], decisions: [], answered: [], summary: '', updatedAt: 0 },
    };
}

export function createMeeting(options: LiveBrainMeetingOptions, injectedBrain?: LiveBrain): LiveBrainMeetingSession {
    const preferred = options.provider ?? 'gemini-live';
    const promptVariant = options.promptVariant ?? 'full';
    const instructions = buildAnswerInstructions(options, promptVariant, 'spoken');
    const clock = { now: Date.now, setTimeout, clearTimeout };
    const debug = isPromptDebugEnabled();
    let speechStoppedAt: number | undefined;
    let timing: { brainId: LiveBrain['id']; model: string; responseStartedAt: number; responseId: string; speechStoppedAt?: number; firstTextAt?: number } | undefined;
    let started = false;
    let status: LiveBrainStatus | null = null;
    let presented = false;
    const showStatus = (next: LiveBrainStatus | null) => {
        if (status === next) return;
        status = next;
        options.emitQuestion({ liveBrainStatus: next });
    };
    const diagnostic = (promptSource: string, extra: Record<string, unknown>) => {
        if (debug) notePromptDebugLiveBrain({ surface: 'live-brain', promptSource, system: '', user: '', extra });
    };
    const notebook = new InterviewNotebook({
        now: clock.now, summarize: options.summarize,
        onUpdate: sizes => diagnostic('notebook', sizes),
    });
    const orchestrator = new ResponseOrchestrator({
        clock,
        overlay: createLiveBrainOverlayPort({
            emitQuestion: event => {
                if (event.responseText?.text.trim() || event.clarification?.trim()) {
                    presented = true;
                    if (timing && timing.firstTextAt === undefined) timing.firstTextAt = Date.now();
                }
                options.emitQuestion(event);
            },
            setAutomaticAnswerOutdated: (generationId, outdated) => options.engine.setAutomaticAnswerOutdated(generationId, outdated),
        }),
        requestClarificationAnswer: () => supervisor.current?.requestClarificationAnswer?.(),
    });
    const finishTiming = (status: 'completed' | 'cancelled' | 'failed') => {
        if (!timing) return;
        notePromptDebugAnswerTiming({ source: 'live-brain', promptVariant, ...timing, doneAt: Date.now(), status });
        timing = undefined;
    };
    let injected = injectedBrain;
    const supervisor = new BrainSupervisor({
        sessionId: options.sessionId, preferred, instructions, notebook, clock,
        create(id) {
            if (id === 'pipeline') {
                return options.pipeline ? { brain: new PipelineBrain(options.pipeline.cancel), model: 'pipeline' } : undefined;
            }
            const config = options.resolveProvider?.(id) ?? (id === preferred ? options : undefined);
            const model = (config?.model?.trim() || (id === 'gemini-live' ? DEFAULT_GEMINI_LIVE_MODEL : '')).replace(/^models\//, '');
            if (injected?.id === id) {
                const brain = injected;
                injected = undefined;
                return { brain, model };
            }
            if (!config?.apiKey) return undefined;
            return { brain: createLiveBrain(id, { apiKey: config.apiKey, model }), model };
        },
        onSwitch: data => {
            diagnostic('brain-switch', data);
            if (data.to === 'pipeline') options.pipeline?.activate();
        },
        onRollover: data => diagnostic('rollover', data),
        onEvent(event, id, model) {
            if (event.type === 'error' && event.fatal && !options.pipeline) { options.onFailure(event.code); return; }
            const backup = id === 'pipeline' && preferred !== 'pipeline';
            if (event.type === 'response_started') presented = false;
            if (event.type === 'status') {
                if (event.status === 'ready') showStatus(backup ? 'Backup brain' : 'Listening');
                if (event.status === 'connecting' || event.status === 'degraded') showStatus('Reconnecting');
            } else if (!backup) {
                if (event.type === 'interviewer_speech_started' || event.type === 'response_silent') showStatus('Listening');
                if (event.type === 'interviewer_speech_stopped' || event.type === 'response_started') showStatus('Thinking');
            }
            if (debug && event.type === 'response_started') {
                finishTiming('cancelled');
                timing = { brainId: id, model, responseId: event.responseId, responseStartedAt: event.at, speechStoppedAt };
                speechStoppedAt = undefined;
            }
            if (debug && event.type === 'response_silent') speechStoppedAt = undefined;
            // Pipeline emits observations for memory and diagnostics. Its native
            // answer events already carry the generation IDs used by Phase 1.
            if (id !== 'pipeline') orchestrator.handleEvent(event);
            else if (event.type === 'response_started') orchestrator.replaceWithExternalAnswer();
            else if (event.type === 'response_delta') {
                presented = true;
                if (timing?.responseId === event.responseId && timing.firstTextAt === undefined) timing.firstTextAt = Date.now();
            }
            if (event.type === 'response_done') {
                if (!backup && event.status === 'completed') showStatus(presented ? 'Answer ready' : 'Listening');
                if (event.responseId === timing?.responseId) finishTiming(event.status);
            }
        },
    });

    return {
        start() {
            if (started) return;
            started = true;
            if (debug) notePromptDebugLiveBrain({
                surface: 'live-brain', promptSource: 'answer', provider: preferred === 'gemini-live' ? 'gemini' : preferred,
                model: (options.model?.trim() || DEFAULT_GEMINI_LIVE_MODEL).replace(/^models\//, ''), system: instructions, user: '',
            });
            supervisor.start();
        },
        stop() {
            if (!started) return;
            started = false;
            supervisor.stop();
            orchestrator.reset();
            finishTiming('cancelled');
            showStatus(null);
        },
        acceptAudio(channel, pcm, sampleRate, channels = 1) {
            if (channel !== 'system' || !started || supervisor.current?.id === 'pipeline') return;
            const mono = toPcm16kMono(pcm, sampleRate, channels);
            const samples = mono.byteOffset % 2 === 0
                ? new Int16Array(mono.buffer, mono.byteOffset, mono.length / 2)
                : Int16Array.from({ length: mono.length / 2 }, (_, i) => mono.readInt16LE(i * 2));
            supervisor.pushAudio(samples);
        },
        addCandidateText(text, at) { supervisor.addCandidateText(text, at); },
        noteSpeechStop(at) {
            if (debug) speechStoppedAt = at;
            supervisor.noteSpeechStop(at);
        },
        isPipeline() { return supervisor.current?.id === 'pipeline'; },
        pipelineContext() { return supervisor.pipelineContext; },
        observePipelineTranscript(text, final, at) {
            const brain = supervisor.current;
            if (brain instanceof PipelineBrain) brain.interviewerTranscript(text, final, at);
        },
        observePipelineOutput(output) {
            const brain = supervisor.current;
            if (brain instanceof PipelineBrain) brain.observe(output);
        },
        cancelAnswer(reason) {
            orchestrator.clearClarification();
            supervisor.current?.cancelResponse(reason);
        },
    };
}

const connectionError: Record<LiveBrainErrorCode, string> = {
    auth: 'Gemini rejected the API key or access to the model.',
    quota: 'Gemini Live quota is exhausted. Check your Google AI Studio plan.',
    rate_limited: 'Gemini Live is rate-limiting requests. Try again shortly.',
    network: 'Could not reach Gemini Live. Check your connection and try again.',
    protocol: 'Gemini Live rejected the setup. Check the model name and try again.',
    timeout: 'Gemini Live did not finish setup in time.',
    unsupported: 'This Gemini Live configuration is unsupported.',
};

export async function testConnection(options: GeminiLiveOptions): Promise<LiveBrainSettingsResult> {
    const brain = new GeminiLiveBrain({ ...options, setupTimeoutMs: options.setupTimeoutMs ?? 5_000, backoffMs: [] });
    try {
        await brain.start(startContext('connection-test', buildAnswerInstructions({}, 'full', 'spoken'), new AbortController().signal));
        return { success: true, message: 'Connected to Gemini Live.' };
    } catch (error) {
        const code = error instanceof GeminiLiveError ? error.code : 'protocol';
        return { success: false, error: code, message: connectionError[code] };
    } finally {
        await brain.stop();
    }
}

export const liveBrainPremium = { createMeeting, testConnection };
