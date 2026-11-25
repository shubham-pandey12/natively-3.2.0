import { notePromptDebugLiveBrain, isPromptDebugEnabled, notePromptDebugAnswerTiming } from '../../../electron/llm/promptDebug';
import type { LiveBrainMeetingOptions, LiveBrainMeetingSession } from '../../../electron/premium/liveBrain';
import type { LiveBrainSettingsResult } from '../../../src/types/liveBrainSettings';
import { AnswerWriter } from './AnswerWriter';
import { GeminiLiveBrain, GeminiLiveError, type GeminiLiveOptions } from './brains/GeminiLiveBrain';
import { createLiveBrain } from './index';
import { buildDeciderInstructions } from './instructions';
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
    const instructions = buildDeciderInstructions({ profileSummary: options.profileSummary });
    const writer = new AnswerWriter(options.engine);
    const debug = isPromptDebugEnabled();
    let speechStoppedAt: number | undefined;
    let timing: { decisionAt: number; decisionId: string; speechStoppedAt?: number } | undefined;
    let unsubscribe: (() => void) | undefined;
    const orchestrator = new ResponseOrchestrator({
        clock: { now: Date.now, setTimeout, clearTimeout },
        overlay: createLiveBrainOverlayPort({
            emitQuestion: options.emitQuestion,
            setAutomaticAnswerOutdated: (generationId, outdated) => options.engine.setAutomaticAnswerOutdated(generationId, outdated),
        }),
        answerWriter: {
            cancel: reason => writer.cancel(reason),
            write: request => {
                const runTiming = timing;
                if (!runTiming) return writer.write(request);
                let firstVisibleTextAt: number | undefined;
                const run = writer.write(request, at => { firstVisibleTextAt = at; });
                void run.done.then(status => notePromptDebugAnswerTiming({
                    source: 'live-brain', ...runTiming, generationId: run.generationId, firstVisibleTextAt, doneAt: Date.now(), status,
                }));
                return run;
            },
        },
    });

    return {
        start() {
            if (unsubscribe || controller.signal.aborted) return;
            if (debug) notePromptDebugLiveBrain({ surface: 'live-brain', promptSource: 'decider', provider: 'gemini', system: instructions, user: '' });
            unsubscribe = brain.onEvent(event => {
                if (event.type === 'error' && event.fatal) {
                    options.onFailure(event.code);
                    return;
                }
                if (debug && event.type === 'decision') {
                    const current = { decisionAt: event.at, decisionId: event.decisionId, speechStoppedAt };
                    speechStoppedAt = undefined;
                    if (event.action !== 'wait') timing = current;
                    notePromptDebugLiveBrain({
                        surface: 'live-brain', promptSource: 'decide_turn', provider: 'gemini', system: '',
                        user: event.question ?? '', action: event.action,
                        extra: { ...current, kind: event.kind, clarification: event.clarification },
                    });
                    if (event.action !== 'answer') notePromptDebugAnswerTiming({
                        source: 'live-brain', ...current, doneAt: Date.now(), status: event.action,
                    });
                }
                orchestrator.handleEvent(event);
            });
            void brain.start(startContext(options.sessionId, instructions, controller.signal)).catch(error => {
                if (!controller.signal.aborted) options.onFailure(error instanceof GeminiLiveError ? error.code : 'protocol');
            });
        },
        stop() {
            unsubscribe?.();
            unsubscribe = undefined;
            orchestrator.reset();
            writer.cancel('auto_disabled_or_meeting_ended');
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
        cancelAnswer(reason) { writer.cancel(reason); },
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
        await brain.start(startContext('connection-test', buildDeciderInstructions({}), new AbortController().signal));
        return { success: true, message: 'Connected to Gemini Live.' };
    } catch (error) {
        const code = error instanceof GeminiLiveError ? error.code : 'protocol';
        return { success: false, error: code, message: connectionError[code] };
    } finally {
        await brain.stop();
    }
}

export const liveBrainPremium = { createMeeting, testConnection };
