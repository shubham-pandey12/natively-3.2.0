import { notePromptDebugLiveBrain, isPromptDebugEnabled, notePromptDebugAnswerTiming } from '../../../electron/llm/promptDebug';
import type { LiveBrainMeetingOptions, LiveBrainMeetingSession } from '../../../electron/premium/liveBrain';
import type { LiveBrainSettingsResult } from '../../../src/types/liveBrainSettings';
import { DEFAULT_GEMINI_LIVE_MODEL, GeminiLiveBrain, GeminiLiveError, type GeminiLiveOptions } from './brains/GeminiLiveBrain';
import { createLiveBrain } from './index';
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

export function createMeeting(options: LiveBrainMeetingOptions, brain: LiveBrain = createLiveBrain('gemini-live', options)): LiveBrainMeetingSession {
    const controller = new AbortController();
    const promptVariant = options.promptVariant ?? 'full';
    const model = (options.model?.trim() || DEFAULT_GEMINI_LIVE_MODEL).replace(/^models\//, '');
    const instructions = buildAnswerInstructions(options, promptVariant, 'spoken');
    const debug = isPromptDebugEnabled();
    let speechStoppedAt: number | undefined;
    let timing: { responseStartedAt: number; responseId: string; speechStoppedAt?: number; firstTextAt?: number } | undefined;
    let unsubscribe: (() => void) | undefined;
    const orchestrator = new ResponseOrchestrator({
        clock: { now: Date.now, setTimeout, clearTimeout },
        overlay: createLiveBrainOverlayPort({
            emitQuestion: event => {
                if (timing && timing.firstTextAt === undefined && (event.responseText?.text.trim() || event.clarification?.trim())) {
                    timing.firstTextAt = Date.now();
                }
                options.emitQuestion(event);
            },
            setAutomaticAnswerOutdated: (generationId, outdated) => options.engine.setAutomaticAnswerOutdated(generationId, outdated),
        }),
        requestClarificationAnswer: () => brain.requestClarificationAnswer?.(),
    });
    const finishTiming = (status: 'completed' | 'cancelled' | 'failed') => {
        if (!timing) return;
        notePromptDebugAnswerTiming({ source: 'live-brain', brainId: brain.id, model, promptVariant, ...timing, doneAt: Date.now(), status });
        timing = undefined;
    };

    return {
        start() {
            if (unsubscribe || controller.signal.aborted) return;
            if (debug) notePromptDebugLiveBrain({
                surface: 'live-brain', promptSource: 'answer', provider: 'gemini', model, system: instructions, user: '',
            });
            unsubscribe = brain.onEvent(event => {
                if (event.type === 'error' && event.fatal) {
                    options.onFailure(event.code);
                    return;
                }
                if (debug) {
                    if (event.type === 'response_started') {
                        finishTiming('cancelled');
                        timing = {
                            responseId: event.responseId, responseStartedAt: event.at,
                            speechStoppedAt,
                        };
                    }
                    if (event.type === 'response_started' || event.type === 'response_silent') {
                        speechStoppedAt = undefined;
                    }
                }
                orchestrator.handleEvent(event);
                if (event.type === 'response_done' && event.responseId === timing?.responseId) finishTiming(event.status);
            });
            void brain.start(startContext(options.sessionId, instructions, controller.signal)).catch(error => {
                if (!controller.signal.aborted) options.onFailure(error instanceof GeminiLiveError ? error.code : 'protocol');
            });
        },
        stop() {
            unsubscribe?.();
            unsubscribe = undefined;
            orchestrator.reset();
            finishTiming('cancelled');
            controller.abort();
            void brain.stop();
        },
        acceptAudio(channel, pcm, sampleRate, channels = 1) {
            if (channel !== 'system' || !unsubscribe) return;
            const mono = toPcm16kMono(pcm, sampleRate, channels);
            const samples = mono.byteOffset % 2 === 0
                ? new Int16Array(mono.buffer, mono.byteOffset, mono.length / 2)
                : Int16Array.from({ length: mono.length / 2 }, (_, i) => mono.readInt16LE(i * 2));
            brain.pushInterviewerAudio(samples, 16_000);
        },
        addCandidateText(text, at) { if (unsubscribe) brain.addCandidateText(text, at); },
        noteSpeechStop(at) { if (debug) speechStoppedAt = at; },
        cancelAnswer(reason) {
            orchestrator.clearClarification();
            brain.cancelResponse(reason);
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
