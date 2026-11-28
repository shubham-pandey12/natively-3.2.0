import { isIntelligenceFlagEnabled } from '../../../electron/intelligence/intelligenceFlags';
import { cleanupResponse } from '../../../electron/llm/responseCleanup';
import { notePromptDebugLiveBrain, isPromptDebugEnabled, notePromptDebugAnswerTiming } from '../../../electron/llm/promptDebug';
import type {
    AutoAnswerDispatchResult,
    DeepgramThinkConfig,
    LiveBrainAnswerRequest,
    LiveBrainMeetingOptions,
    LiveBrainMeetingSession,
    LiveBrainPendingTurn,
    LiveBrainPipelineActivation,
} from '../../../electron/premium/liveBrain';
import {
    DEFAULT_AMAZON_SONIC_MODEL,
    DEFAULT_DEEPGRAM_FLUX_MODEL,
    DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_MODEL,
    DEFAULT_ELEVENLABS_REALTIME_MODEL,
    DEFAULT_OPENAI_REALTIME_MODEL,
    type FluxAiRouteTestStatus,
    type LiveBrainProvider,
    type LiveBrainSettingsResult,
} from '../../../src/types/liveBrainSettings';
import { AnswerWriter } from './AnswerWriter';
import { AmazonSonicBrain, AmazonSonicError, type AmazonSonicOptions } from './brains/AmazonSonicBrain';
import { DeepgramFluxBrain, DeepgramFluxError } from './brains/DeepgramFluxBrain';
import { DeepgramVoiceAgentBrain, DeepgramVoiceAgentError } from './brains/DeepgramVoiceAgentBrain';
import { DEFAULT_GEMINI_LIVE_MODEL, GeminiLiveBrain, GeminiLiveError, type GeminiLiveOptions } from './brains/GeminiLiveBrain';
import { RealtimeBrainError } from './brains/RealtimeBrain';
import { createLiveBrain } from './index';
import { BrainSupervisor } from './BrainSupervisor';
import { InterviewNotebook } from './InterviewNotebook';
import { PipelineBrain } from './brains/PipelineBrain';
import type { LiveBrainStatus } from '../../../src/types/whatToAnswerQuestion';
import { buildProviderInstructions } from './instructions';
import { toPcm16kMono } from './interviewerAudio';
import { createLiveBrainOverlayPort } from './overlayPort';
import { isFillerOnly, ResponseOrchestrator, type OrchestratorDisposition, type ResponseClock } from './ResponseOrchestrator';
import { plainLiveSpeech } from './plainSpeech';
import type { LiveBrain, LiveBrainErrorCode, LiveBrainEvent, LiveBrainStartContext } from './types';

const DEFAULT_MODELS: Record<LiveBrain['id'], string> = {
    'gemini-live': DEFAULT_GEMINI_LIVE_MODEL,
    'openai-realtime': DEFAULT_OPENAI_REALTIME_MODEL,
    'elevenlabs-realtime': DEFAULT_ELEVENLABS_REALTIME_MODEL,
    'deepgram-voice-agent': DEFAULT_DEEPGRAM_VOICE_AGENT_THINK_MODEL,
    'deepgram-flux': DEFAULT_DEEPGRAM_FLUX_MODEL,
    'amazon-sonic': DEFAULT_AMAZON_SONIC_MODEL,
    pipeline: 'pipeline',
};

function startContext(sessionId: string, instructions: string, signal: AbortSignal): LiveBrainStartContext {
    return {
        sessionId, instructions, signal, recentTurns: [],
        notebook: { topics: [], currentTopic: null, requirements: [], constraints: [], clarifications: [], decisions: [], answered: [], summary: '', updatedAt: 0 },
    };
}

const BACKUP_BUSY_RETRY_MS = 3_000;
const PIPELINE_DEDUPE_MS = 5_000;

type MeetingTimer = ReturnType<typeof setTimeout> | number;
type BackupRun = { turn: LiveBrainPendingTurn; answer?: string; writer?: AbortController; visible: boolean };

export function createMeeting(
    options: LiveBrainMeetingOptions,
    injectedBrain?: LiveBrain | ((id: LiveBrain['id']) => LiveBrain | undefined),
    clock: ResponseClock<MeetingTimer> = { now: Date.now, setTimeout, clearTimeout },
): LiveBrainMeetingSession {
    const preferred = options.provider ?? 'gemini-live';
    const promptVariant = options.promptVariant ?? 'full';
    let grounding = options.readGroundingState?.();
    const instructions = (id: LiveBrain['id'], notebookText?: string) => {
        const context = { ...(options.resolveContext?.() ?? options), notebookText };
        if (id === 'deepgram-voice-agent') {
            const dg = options.resolveProvider?.('deepgram-voice-agent')?.deepgramThink ?? options.deepgramThink;
            return buildProviderInstructions(context, promptVariant, id, dg?.thinkMode);
        }
        return buildProviderInstructions(context, promptVariant, id);
    };
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
        readMeetingHistory: options.readMeetingHistory,
        now: clock.now, summarize: options.summarize,
        onUpdate: sizes => diagnostic('notebook', sizes),
    });
    let supervisor!: BrainSupervisor<MeetingTimer>;
    let writerRun: symbol | undefined;
    let lastWriterStopAt: number | undefined;
    let turnSequence = 0;
    let unanswered: { turn: LiveBrainPendingTurn; providerFinal: boolean } | undefined;
    let turnAnswered = false;
    let realtimeDisconnected = false;
    let realtimeWasReady = false;
    let visibleRealtimeTurn: LiveBrainPendingTurn | undefined;
    let responseTurnId: number | undefined;
    let realtimeItemId: string | undefined;
    let closedItemId: string | undefined;
    let closedCaptureStop: number | undefined;
    let lastCaptureStop: number | undefined;
    let closedHandoff: LiveBrainPendingTurn | undefined;
    let backupRun: BackupRun | undefined;
    const ignoredRealtimeResponses = new Set<string>();
    let unsubscribeExternalAnswers: (() => void) | undefined;
    const deferredRealtime: { event: LiveBrainEvent; id: LiveBrain['id']; model: string }[] = [];
    let busyRetry: { turnId: number; route: 'writer' | 'pipeline'; timer: MeetingTimer } | undefined;
    let systemTranscriptCaptureAt: number | undefined;
    const unclaimedCaptureStops: number[] = [];
    let pipelineDedupe: { normalized: string; expiresAt: number; captureStop: number } | undefined;
    const normalizeQuestion = (text: string): string => text.replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
    const showProviderStatus = (next: LiveBrainStatus) => {
        if (!backupRun && !busyRetry && status !== 'Answer failed') showStatus(next);
    };
    let deferredFailure: LiveBrainErrorCode | undefined;
    const flushDeferredFailure = () => {
        if (deferredFailure === undefined || !started || backupRun || busyRetry) return;
        const code = deferredFailure;
        deferredFailure = undefined;
        showStatus('Backup brain unavailable');
        options.onFailure(code);
    };
    const clearBusyRetry = () => {
        if (busyRetry) clock.clearTimeout(busyRetry.timer);
        busyRetry = undefined;
    };
    const retireTurn = () => {
        clearBusyRetry();
        unanswered = undefined;
        turnAnswered = true;
    };
    const duplicateHandoff = (text: string, at: number, itemId?: string) => closedHandoff !== undefined
        && ((itemId !== undefined && itemId === closedItemId) || at < closedHandoff.at || (normalizeQuestion(text) === normalizeQuestion(closedHandoff.text)
            && (lastCaptureStop ?? -Infinity) <= (closedCaptureStop ?? closedHandoff.at)));
    const notePendingTurn = (text: string, at: number, providerFinal: boolean): boolean => {
        const clean = text.replace(/\s+/g, ' ').trim();
        if (!clean || isFillerOnly(clean) || duplicateHandoff(clean, at)) return false;
        if (closedHandoff && (providerFinal || realtimeDisconnected || supervisor.current?.id === 'pipeline')) {
            if (!backupRun && providerFinal) {
                closedHandoff = undefined;
                closedItemId = undefined;
            }
            turnAnswered = false;
        }
        if (turnAnswered || (unanswered && at < unanswered.turn.at)) return false;
        if (unanswered && normalizeQuestion(clean) === normalizeQuestion(unanswered.turn.text)) {
            if (providerFinal && !unanswered.providerFinal) {
                unanswered = { turn: { ...unanswered.turn, text: clean, at }, providerFinal };
            }
            return true;
        }
        clearBusyRetry();
        deferredRealtime.length = 0;
        unanswered = {
            turn: { turnId: ++turnSequence, text: clean, at, context: notebook.projectHistory(clean)?.text ?? supervisor.notebookContext },
            providerFinal,
        };
        if (status === 'Answer failed') showStatus(realtimeDisconnected ? 'Reconnecting' : 'Thinking');
        return true;
    };
    const parkBackup = (turn: LiveBrainPendingTurn, route: 'writer' | 'pipeline') => {
        busyRetry = {
            turnId: turn.turnId, route,
            timer: clock.setTimeout(() => retryBackup(), BACKUP_BUSY_RETRY_MS),
        };
        showStatus('Backup busy');
    };
    const closeHandoff = (turn: LiveBrainPendingTurn) => {
        closedHandoff = turn;
        closedItemId = realtimeItemId;
        closedCaptureStop = lastCaptureStop;
        retireTurn();
        pipelineDedupe = { normalized: normalizeQuestion(turn.text), expiresAt: clock.now() + PIPELINE_DEDUPE_MS, captureStop: lastCaptureStop ?? turn.at };
    };
    const dispatchBackup = (route: 'writer' | 'pipeline' = 'writer', retry = false): void => {
        const pending = unanswered;
        if (!started || !pending || backupRun || busyRetry) return;
        const { turn, providerFinal } = pending;
        const identity = turn.meetingTurn ?? options.identifyInterviewTurn?.(turn.text, turn.at);
        if (identity) turn.meetingTurn = identity;
        const projected = notebook.projectHistory(turn.text);
        if (projected) turn.context = projected.text;
        const writer = route === 'writer' ? options.engine.runLiveBrainAnswer : undefined;
        if (!writer && route === 'writer') {
            dispatchBackup('pipeline');
            return;
        }
        const run: BackupRun = { turn, visible: false };
        let result: LiveBrainPipelineActivation;
        try {
            if (writer) {
                if (options.engine.canAutoAnswer?.(true) === false) result = 'busy';
                else {
                    const controller = new AbortController();
                    run.writer = controller;
                    const output = writer.call(options.engine, {
                        question: turn.text,
                        ...(turn.meetingTurn ? { meetingTurn: turn.meetingTurn } : {}),
                        replacesAutomaticAnswer: false,
                        signal: controller.signal,
                        liveBrainNotebook: turn.context,
                        speechStoppedAt: lastCaptureStop ?? turn.at,
                        onFirstText: () => { run.visible = true; },
                        onComplete: (text, disposition) => {
                            if (!disposition.storageVeto && !disposition.stopReason) run.answer = text;
                        },
                    });
                    result = output ? { status: 'accepted', done: output.done } : 'unavailable';
                }
            } else {
                result = options.pipeline?.activate(turn) ?? 'unavailable';
            }
        } catch {
            result = 'failed';
        }
        if (result === 'busy' && !retry) {
            parkBackup(turn, route);
            return;
        }
        if (typeof result === 'string') {
            if (route === 'writer' && result !== 'busy') dispatchBackup('pipeline');
            else {
                closeHandoff(turn);
                showStatus('Answer failed');
            }
            return;
        }
        closeHandoff(turn);
        backupRun = run;
        showStatus('Backup answering');
        const settle = (outcome: AutoAnswerDispatchResult) => {
            if (backupRun !== run) return;
            backupRun = undefined;
            const succeeded = outcome.status === 'completed' || outcome.status === 'partial';
            const cancelled = outcome.status === 'cancelled';
            const busy = outcome.status === 'skipped' && outcome.reason === 'busy';
            if (!succeeded && !cancelled && !run.visible && !unanswered && (busy || route === 'writer')) {
                unanswered = pending;
                if (busy && !retry) parkBackup(turn, route);
                else if (route === 'writer' && !busy) dispatchBackup('pipeline');
                else {
                    retireTurn();
                    showStatus('Answer failed');
                }
                return;
            }
            if (succeeded) {
                if (!providerFinal) supervisor.recordInterviewerTurn(turn.text, turn.at);
                if (outcome.status === 'completed' && run.answer) {
                    const ask = /^Ask:\s*(\S[\s\S]*)$/i.exec(run.answer.trim());
                    supervisor.recordAssistantTurn(ask?.[1] ?? run.answer, Boolean(ask));
                }
                showStatus('Answer ready');
            } else if (!cancelled) showStatus('Answer failed');
            else showStatus(realtimeDisconnected ? 'Reconnecting' : 'Listening');
            if (unanswered && (realtimeDisconnected || supervisor.current?.id === 'pipeline')) dispatchBackup();
            else if (unanswered?.providerFinal) {
                closedHandoff = undefined;
                closedItemId = undefined;
                for (const { event, id, model } of deferredRealtime.splice(0)) {
                    const disposition = handleProviderEvent(event, id, model);
                    if (disposition?.kind === 'answer' || disposition?.kind === 'ask') {
                        supervisor.recordAssistantTurn(disposition.text, disposition.kind === 'ask');
                    }
                }
            }
        };
        const settleAndReport = (outcome: AutoAnswerDispatchResult) => {
            settle(outcome);
            flushDeferredFailure();
        };
        void result.done.then(settleAndReport, () => settleAndReport({ status: 'failed' }));
    };
    const retryBackup = () => {
        const retry = busyRetry;
        clearBusyRetry();
        if (retry && unanswered?.turn.turnId === retry.turnId) dispatchBackup(retry.route, true);
        flushDeferredFailure();
    };
    const settleWriterRun = (run: symbol, outcomeStatus: 'completed' | 'cancelled' | 'failed') => {
        if (writerRun !== run) return;
        writerRun = undefined;
        if (started) showProviderStatus(outcomeStatus === 'completed' && presented ? 'Answer ready' : 'Listening');
        finishTiming(outcomeStatus);
        supervisor.setExternalWriting(false);
    };
    const fluxReasoningEffort = () => (
        options.resolveProvider
            ? options.resolveProvider('deepgram-flux')?.reasoningEffort
            : preferred === 'deepgram-flux' ? options.reasoningEffort : undefined
    );
    const trackWriterRun = <T extends { generationId: number; done: Promise<AutoAnswerDispatchResult> }>(
        request: LiveBrainAnswerRequest,
        launch: (trackedRequest: LiveBrainAnswerRequest) => T | null,
    ): T | null => {
        const liveBrainNotebook = request.liveBrainNotebook !== undefined
            ? (request.liveBrainNotebook || undefined)
            : ((notebook.projectHistory(request.question)?.text ?? supervisor?.notebookContext) || undefined);
        const reasoningEffort = request.reasoningEffort ?? fluxReasoningEffort();
        const stopAt = request.reuseGenerationId !== undefined ? lastWriterStopAt : speechStoppedAt;
        lastWriterStopAt = stopAt;
        speechStoppedAt = undefined;
        const run = Symbol();
        const writerTurn = unanswered?.turn;
        writerRun = run;
        presented = false;
        visibleRealtimeTurn = undefined;
        supervisor.setExternalWriting(true);
        if (debug) {
            finishTiming('cancelled');
            const brainId = supervisor?.current?.id ?? preferred;
            timing = {
                brainId,
                model: (options.model?.trim() || DEFAULT_MODELS[brainId]).replace(/^models\//, ''),
                responseId: `writer:${Date.now()}`,
                responseStartedAt: Date.now(),
                speechStoppedAt: stopAt,
            };
        }
        showProviderStatus('Thinking');
        const res = launch({
            ...request,
            ...(liveBrainNotebook ? { liveBrainNotebook } : {}),
            ...(reasoningEffort ? { reasoningEffort } : {}),
            ...(stopAt !== undefined ? { speechStoppedAt: stopAt } : {}),
            onFirstText: (at) => {
                if (!started || writerRun !== run || request.signal.aborted) return;
                presented = true;
                visibleRealtimeTurn = writerTurn;
                if (unanswered?.turn.turnId === writerTurn?.turnId) retireTurn();
                if (timing && timing.firstTextAt === undefined) timing.firstTextAt = at;
                request.onFirstText?.(at);
            },
            onComplete: (text, disposition) => {
                if (!started || writerRun !== run || request.signal.aborted) return;
                presented = true;
                const clarification = /^Ask:\s*(\S[\s\S]*)$/i.exec(text.trim());
                if (!disposition?.stopReason && !disposition?.storageVeto) {
                    if (request.meetingTurn) options.recordInterviewAnswer?.(request.meetingTurn, clarification?.[1] ?? text, 'completed', request.replacesMeetingTurn);
                    orchestrator.commitMergedQuestion();
                    supervisor.recordAssistantTurn(clarification?.[1] ?? text, Boolean(clarification));
                    if (clarification) orchestrator.noteWriterClarification(request.question, clarification[1]);
                    else orchestrator.noteWriterAnswer(text);
                }
                request.onComplete?.(text, disposition);
            },
        });
        if (!res) {
            if (writerRun === run) {
                writerRun = undefined;
                speechStoppedAt = stopAt;
                finishTiming('cancelled');
                supervisor.setExternalWriting(false);
            }
            return null;
        }
        void res.done.then(({ status: dispatchStatus }) => {
            settleWriterRun(run, dispatchStatus === 'completed' || dispatchStatus === 'partial' ? 'completed' : dispatchStatus === 'cancelled' ? 'cancelled' : 'failed');
        }, () => settleWriterRun(run, 'failed'));
        return res;
    };
    const answerWriter = options.engine.runLiveBrainAnswer
        ? new AnswerWriter({
            runLiveBrainAnswer: (request) => trackWriterRun(request, tracked => options.engine.runLiveBrainAnswer!(tracked))!,
            ...(options.engine.startLiveBrainDraft
                ? {
                    startLiveBrainDraft: (request) => {
                        const liveBrainNotebook = request.liveBrainNotebook !== undefined
                            ? (request.liveBrainNotebook || undefined)
                            : ((notebook.projectHistory(request.question)?.text ?? supervisor?.notebookContext) || undefined);
                        const reasoningEffort = request.reasoningEffort ?? fluxReasoningEffort();
                        const inner = options.engine.startLiveBrainDraft!({
                            ...request,
                            ...(liveBrainNotebook !== undefined ? { liveBrainNotebook } : {}),
                            ...(reasoningEffort ? { reasoningEffort } : {}),
                        });
                        if (!inner) return null;
                        return {
                            draftId: inner.draftId,
                            sessionId: inner.sessionId,
                            turnKey: inner.turnKey,
                            question: inner.question,
                            routeKey: inner.routeKey,
                            ...(inner.contextKey !== undefined ? { contextKey: inner.contextKey } : {}),
                            canAdopt: () => inner.canAdopt(),
                            cancel: (reason: string) => inner.cancel(reason),
                            adopt: (request) => trackWriterRun(request, tracked => inner.adopt(tracked)),
                        };
                    },
                }
                : {}),
            ...(options.engine.getLiveBrainAiRouteKey
                ? { getLiveBrainAiRouteKey: () => options.engine.getLiveBrainAiRouteKey!() }
                : {}),
        }, {
            sessionId: options.sessionId,
            onDraftEvent: event => diagnostic('flux-draft', { ...event }),
        })
        : undefined;
    const orchestrator = new ResponseOrchestrator({
        sessionId: options.sessionId,
        clock,
        ...(answerWriter ? { answerWriter } : {}),
        getContextSnapshot: (question) => {
            const projected = notebook.projectHistory(question);
            return {
                baseNotebook: projected?.text ?? supervisor?.notebookContext ?? '',
                constraints: notebook.snapshot().constraints,
                groundingKey: options.readGroundingState?.().groundingKey,
                historyRevision: projected?.revision,
            };
        },
        shouldCleanupText: () => {
            if (isIntelligenceFlagEnabled('sharedResponseCleanup')) return true;
            try {
                return options.isHumanizeSkillEnabled?.() === true;
            } catch { return false; }
        },
        cleanupText: (text: string) => plainLiveSpeech(cleanupResponse({
            text, mode: 'spoken', speaker: 'candidate', preserveNumericRanges: true,
        }).text),
        overlay: createLiveBrainOverlayPort({
            emitQuestion: event => {
                if (event.responseText?.text.trim() || event.clarification?.trim()) {
                    presented = true;
                    const pending = unanswered?.turn;
                    if (pending && (responseTurnId === undefined || responseTurnId === pending.turnId)) {
                        visibleRealtimeTurn = pending;
                        retireTurn();
                    } else if (!pending) {
                        retireTurn();
                    }
                    if (timing && timing.firstTextAt === undefined) timing.firstTextAt = clock.now();
                }
                options.emitQuestion(event);
            },
            setAutomaticAnswerOutdated: (generationId, outdated) => options.engine.setAutomaticAnswerOutdated(generationId, outdated),
            discard: (generationId) => options.emitQuestion({ generationId, discard: true }),
        }),
        requestClarificationAnswer: () => supervisor.current?.requestClarificationAnswer?.(),
        recordSttQuestion: (text, at) => supervisor.recordInterviewerTurn(text, at),
        recordDeferredAnswer: (text, isClarification) => supervisor.recordAssistantTurn(text, isClarification),
        identifyInterviewTurn: options.identifyInterviewTurn,
        recordInterviewAnswer: options.recordInterviewAnswer,
        recordMergedQuestion: (previous, next, at) => supervisor.mergeInterviewerTurn(previous, next, at),
    });
    const finishTiming = (status: 'completed' | 'cancelled' | 'failed') => {
        if (!timing) return;
        notePromptDebugAnswerTiming({ source: 'live-brain', promptVariant, ...timing, doneAt: Date.now(), status });
        timing = undefined;
    };
    let injected = typeof injectedBrain === 'function' ? undefined : injectedBrain;
    supervisor = new BrainSupervisor({
        sessionId: options.sessionId, preferred, instructions, notebook, clock,
        groundingKey: () => options.readGroundingState?.().groundingKey,
        create(id) {
            if (id === 'pipeline') {
                return options.pipeline ? {
                    brain: new PipelineBrain(() => options.pipeline?.cancel('manual_answer'), (generationId, previousGenerationId, previous, next) => {
                        supervisor.mergeInterviewerTurn(previous, next, clock.now());
                        options.emitQuestion({ generationId, liveBrainReplacement: { previousGenerationId, pipelineQuestion: next, writer: true } });
                    }), model: 'pipeline',
                } : undefined;
            }
            const config = options.resolveProvider?.(id) ?? (id === preferred ? options : undefined);
            const model = (config?.model?.trim() || DEFAULT_MODELS[id]).replace(/^models\//, '');
            const testBrain = typeof injectedBrain === 'function' ? injectedBrain(id) : undefined;
            if (testBrain) return { brain: testBrain, model };
            if (injected?.id === id) {
                const brain = injected;
                injected = undefined;
                return { brain, model };
            }
            if (id === 'amazon-sonic') {
                return config?.sonicRegion ? { brain: createLiveBrain(id, { apiKey: '', model, sonicRegion: config.sonicRegion }), model } : undefined;
            }
            if (!config?.apiKey || (id === 'deepgram-flux' && !answerWriter)) return undefined;
            const deepgramThink = id === 'deepgram-voice-agent'
                ? (config.deepgramThink ?? options.deepgramThink)
                : undefined;
            const reasoningEffort = config.reasoningEffort;
            return { brain: createLiveBrain(id, {
                apiKey: config.apiKey,
                model,
                ...(reasoningEffort ? { reasoningEffort } : {}),
                ...(deepgramThink ? { deepgramThink } : {}),
            }), model };
        },
        onSwitch: data => {
            diagnostic('brain-switch', data);
            if (data.from === 'deepgram-flux') {
                answerWriter?.cancelDraft('provider_switched');
                answerWriter?.cancel('answer_corrected');
                writerRun = undefined;
                finishTiming('cancelled');
                supervisor.setExternalWriting(false);
                orchestrator.endProviderTurn();
            }
            if (data.to === 'pipeline') {
                options.pipeline?.warm?.();
                dispatchBackup();
            }
        },
        onRollover: data => diagnostic('rollover', data),
        onLeaseDetached: (lease, reason, role) => {
            if (role !== 'active') return;
            deferredRealtime.length = 0;
            realtimeWasReady = false;
            systemTranscriptCaptureAt = undefined;
            unclaimedCaptureStops.length = 0;
            if (lease.brain.id === 'deepgram-flux' && reason !== 'rollover') {
                answerWriter?.cancelDraft(reason);
                answerWriter?.cancel('answer_corrected');
                writerRun = undefined;
                finishTiming('cancelled');
                supervisor.setExternalWriting(false);
                orchestrator.endProviderTurn();
            } else {
                orchestrator.resetTurnState();
            }
        },
        onEvent: handleProviderEvent,
    });

    function handleProviderEvent(event: LiveBrainEvent, id: LiveBrain['id'], model: string): OrchestratorDisposition | undefined {
        const backup = id === 'pipeline' && preferred !== 'pipeline';
        if (id !== 'pipeline') {
            const failed = event.type === 'error' && event.fatal;
            const disconnected = event.type === 'status' && (event.status === 'degraded'
                || (event.status === 'connecting' && realtimeWasReady && event.detail !== 'rollover'));
            if (failed || disconnected) {
                deferredRealtime.length = 0;
                realtimeDisconnected = true;
                orchestrator.interruptTextResponse();
                if (!unanswered && visibleRealtimeTurn && !closedHandoff) closeHandoff(visibleRealtimeTurn);
                if (id === 'deepgram-flux') {
                    answerWriter?.cancelDraft(failed ? 'fatal_error' : 'reconnecting');
                    if (writerRun) {
                        answerWriter?.cancel(visibleRealtimeTurn ? 'live_brain_disconnected' : 'answer_corrected');
                        writerRun = undefined;
                        finishTiming('cancelled');
                        supervisor.setExternalWriting(false);
                    }
                    orchestrator.endProviderTurn();
                }
                if (failed && !options.pipeline) {
                    if (!unanswered && !closedHandoff && !backupRun) {
                        showStatus('Backup brain unavailable');
                        options.onFailure(event.code);
                        return;
                    }
                    // Report the failure once the rescue settles, so its
                    // status is not overwritten while it is answering.
                    deferredFailure = event.code;
                }
                dispatchBackup();
                flushDeferredFailure();
            }

            if (event.type === 'interviewer_speech_started') {
                realtimeItemId = event.itemId;
                turnAnswered = false;
            }
            if (event.type === 'interviewer_transcript') {
                if (event.final) {
                    if (event.itemId && realtimeItemId && event.itemId !== realtimeItemId) {
                        return orchestrator.handleEvent(event);
                    }
                    if (duplicateHandoff(event.text, event.at, event.itemId)) return { kind: 'interviewer_already_recorded' };
                    const confirmed = notePendingTurn(event.text, event.at, true);
                    if (confirmed && realtimeDisconnected) dispatchBackup();
                    else if (confirmed && supervisor.hasPendingExternalHistory()) {
                        diagnostic('history-sync-fallback', {
                            ledgerRevision: supervisor.getPendingHistoryRevision(),
                            route: supervisor.current?.id ?? 'none', outcome: 'writer_before_followup',
                        });
                        dispatchBackup('writer');
                    }
                } else if (closedHandoff) {
                    return { kind: 'suppressed' };
                }
            }
            if ('responseId' in event && ignoredRealtimeResponses.has(event.responseId)) return { kind: 'suppressed' };
            // Hold a newer confirmed turn's output until the backup finishes. A
            // replay of the rescued turn has no newer confirmed transcript.
            if ((closedHandoff || backupRun) && (
                event.type === 'response_started' || event.type === 'response_delta'
                || event.type === 'response_done' || event.type === 'response_silent'
                || event.type === 'decision' || event.type === 'eager_end_of_turn'
                || event.type === 'interviewer_barge_in_candidate'
            )) {
                if (backupRun && unanswered && !realtimeDisconnected && deferredRealtime.length < 512) {
                    deferredRealtime.push({ event, id, model });
                } else if ('responseId' in event) {
                    ignoredRealtimeResponses.add(event.responseId);
                    if (ignoredRealtimeResponses.size > 64) ignoredRealtimeResponses.delete(ignoredRealtimeResponses.values().next().value!);
                }
                return { kind: 'suppressed' };
            }
            if (event.type === 'decision' && event.action === 'wait') retireTurn();
            if (event.type === 'response_silent') retireTurn();
        }
        if (event.type === 'response_started') {
            presented = false;
            visibleRealtimeTurn = undefined;
            responseTurnId = unanswered?.turn.turnId;
        }

        if (event.type === 'status') {
            if (event.status === 'ready') {
                realtimeDisconnected = false;
                realtimeWasReady = id !== 'pipeline';
                showProviderStatus(id !== preferred ? 'Backup brain' : 'Listening');
            }
            if (event.status === 'connecting' || event.status === 'degraded') {
                realtimeWasReady = false;
                systemTranscriptCaptureAt = undefined;
                unclaimedCaptureStops.length = 0;
                orchestrator.resetTurnState();
                showProviderStatus('Reconnecting');
            }
        } else if (!backup) {
            if (event.type === 'interviewer_speech_started' || event.type === 'response_silent') showProviderStatus('Listening');
            if (event.type === 'interviewer_speech_stopped' || event.type === 'response_started') showProviderStatus('Thinking');
        }
        if (event.type === 'interviewer_speech_stopped') {
            if (id === 'deepgram-flux') speechStoppedAt = event.at;
            else if (debug && id !== 'gemini-live') speechStoppedAt ??= event.at;
        }
        if (debug && event.type === 'response_started') {
            finishTiming('cancelled');
            timing = { brainId: id, model, responseId: event.responseId, responseStartedAt: event.at, speechStoppedAt };
            speechStoppedAt = undefined;
        }
        if (debug && event.type === 'response_silent') speechStoppedAt = undefined;
        // Pipeline emits observations for memory and diagnostics. Its native
        // answer events already carry the generation IDs used by Phase 1.
        const disposition = id !== 'pipeline' ? orchestrator.handleEvent(event) : undefined;
        if (id === 'pipeline' && event.type === 'response_started') orchestrator.replaceWithExternalAnswer();
        else if (id === 'pipeline' && event.type === 'response_delta') {
            presented = true;
            if (timing?.responseId === event.responseId && timing.firstTextAt === undefined) timing.firstTextAt = Date.now();
        }
        if (event.type === 'response_done') {
            if (!backup && event.status === 'completed') showProviderStatus(presented ? 'Answer ready' : 'Listening');
            if (event.responseId === timing?.responseId) finishTiming(event.status);
        }
        return id === 'pipeline' && event.type === 'response_done' && event.status !== 'completed'
            ? { kind: 'suppressed' } : disposition;
    }

    return {
        start() {
            if (started) return;
            started = true;
            unsubscribeExternalAnswers = options.subscribeExternalMeetingAnswers?.((turn, revision) => {
                const outcome = supervisor.syncExternalHistory(turn, revision);
                diagnostic('history-sync', { ledgerRevision: revision, route: supervisor.current?.id ?? 'none', outcome });
            });
            if (debug) notePromptDebugLiveBrain({
                surface: 'live-brain', promptSource: 'answer', provider: preferred === 'gemini-live' ? 'gemini' : preferred,
                model: (options.model?.trim() || DEFAULT_MODELS[preferred]).replace(/^models\//, ''), system: instructions(preferred), user: '',
            });
            supervisor.start();
        },
        refreshContext(change) {
            const previous = grounding;
            grounding = options.readGroundingState?.();
            if (change !== 'skills' && previous?.groundingKey === grounding?.groundingKey) return;
            answerWriter?.cancelDraft('context_changed');
            if (change === 'skills' || (previous && grounding && (
                (previous.profileAllowed && !grounding.profileAllowed)
                || (previous.knowledgeEnabled && !grounding.knowledgeEnabled)
            ))) {
                if (supervisor.current?.id === 'deepgram-flux' || supervisor.current?.id === 'pipeline') return;
                systemTranscriptCaptureAt = undefined;
                unclaimedCaptureStops.length = 0;
                orchestrator.resetTurnState();
                showStatus('Context changed — reconnecting');
                supervisor.refreshContext();
            }
        },
        stop() {
            if (!started) return;
            started = false;
            unsubscribeExternalAnswers?.();
            unsubscribeExternalAnswers = undefined;
            if (backupRun) {
                const { writer } = backupRun;
                backupRun = undefined;
                if (writer) writer.abort('auto_disabled_or_meeting_ended');
                else options.pipeline?.cancel('auto_disabled_or_meeting_ended');
            }
            retireTurn();
            turnAnswered = false;
            closedHandoff = undefined;
            closedItemId = undefined;
            closedCaptureStop = undefined;
            realtimeItemId = undefined;
            visibleRealtimeTurn = undefined;
            responseTurnId = undefined;
            pipelineDedupe = undefined;
            realtimeDisconnected = false;
            realtimeWasReady = false;
            lastCaptureStop = undefined;
            deferredFailure = undefined;
            deferredRealtime.length = 0;
            ignoredRealtimeResponses.clear();
            writerRun = undefined;
            answerWriter?.cancelDraft('meeting_ended');
            answerWriter?.cancel('auto_disabled_or_meeting_ended');
            supervisor.stop();
            orchestrator.reset();
            finishTiming('cancelled');
            showStatus(null);
        },
        syncExternalHistory(turn, revision) { supervisor.syncExternalHistory(turn, revision); },
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
            lastCaptureStop = at;
            orchestrator.noteCapturedSpeechStop(at);
            unclaimedCaptureStops.push(at);
            if (unclaimedCaptureStops.length > 2) unclaimedCaptureStops.shift();
            supervisor.noteSpeechStop(at);
        },
        isPipeline() { return supervisor.current?.id === 'pipeline'; },
        pipelineContext(question) {
            if (supervisor.current?.id !== 'pipeline') return '';
            return notebook.projectHistory(question)?.text ?? supervisor.pipelineContext;
        },
        isUsingPipeline() { return supervisor.current?.id === 'pipeline'; },
        observePipelineTranscript(text, final, at) {
            const brain = supervisor.current;
            if (final) {
                const normalized = normalizeQuestion(text);
                if (busyRetry && unanswered && normalized === normalizeQuestion(unanswered.turn.text)
                    && (lastCaptureStop ?? -Infinity) <= unanswered.turn.at) return true;
                if (pipelineDedupe && clock.now() > pipelineDedupe.expiresAt) pipelineDedupe = undefined;
                if (duplicateHandoff(text, at)) return true;
                if (pipelineDedupe?.normalized === normalized && (lastCaptureStop ?? -Infinity) <= pipelineDedupe.captureStop) return true;
            }
            if (brain instanceof PipelineBrain) {
                if (busyRetry || backupRun) {
                    if (final && notePendingTurn(text, at, false) && !backupRun) dispatchBackup();
                    return true;
                }
                if (final && !isFillerOnly(text)) {
                    closedHandoff = undefined;
                    closedItemId = undefined;
                    if (status === 'Answer failed') showStatus(preferred === 'pipeline' ? 'Listening' : 'Backup brain');
                }
                brain.interviewerTranscript(text, final, at);
                return false;
            }
            // D14: the existing STT is the backup text for the interviewer bubble.
            else if (brain || realtimeDisconnected) {
                if (!final) systemTranscriptCaptureAt ??= at;
                else {
                    const capturedAt = systemTranscriptCaptureAt;
                    systemTranscriptCaptureAt = undefined;
                    if (capturedAt !== undefined) {
                        const stop = unclaimedCaptureStops.findIndex(end => end >= capturedAt);
                        orchestrator.noteSttTranscript(text, at, stop >= 0 ? unclaimedCaptureStops[stop] : capturedAt);
                        if (stop >= 0) unclaimedCaptureStops.splice(0, stop + 1);
                    } else if (unclaimedCaptureStops.length < 2) {
                        orchestrator.noteSttTranscript(text, at, unclaimedCaptureStops.shift());
                    } else {
                        // A final-only backend supplied no timestamp that identifies which capture it transcribed.
                        unclaimedCaptureStops.length = 0;
                    }
                    if (notePendingTurn(text, at, false)) {
                        if (realtimeDisconnected || status === 'Backup busy') dispatchBackup();
                        else if (supervisor.hasPendingExternalHistory()) {
                            diagnostic('history-sync-fallback', {
                                ledgerRevision: supervisor.getPendingHistoryRevision(),
                                route: supervisor.current?.id ?? 'none', outcome: 'writer_before_followup',
                            });
                            dispatchBackup('writer');
                        }
                    }
                }
            }
            return false;
        },
        observePipelineOutput(output) {
            if (backupRun) {
                if (!backupRun.writer && output.question && output.text?.trim()
                    && normalizeQuestion(output.question) === normalizeQuestion(backupRun.turn.text)) {
                    if (output.type === 'token' || output.type === 'answer') backupRun.visible = true;
                    if (output.type === 'answer') backupRun.answer = output.text.trim();
                }
                return;
            }
            if (output.type === 'token' && output.text) orchestrator.noteWriterProgress(output.generationId, output.text);
            const brain = supervisor.current;
            if (brain instanceof PipelineBrain) brain.observe(output);
        },
        observePipelineIdle: retryBackup,
        cancelAnswer(reason) {
            if (unanswered) closeHandoff(unanswered.turn);
            else retireTurn();
            deferredRealtime.length = 0;
            if (backupRun) {
                const { writer } = backupRun;
                backupRun = undefined;
                if (writer) writer.abort(reason);
                else options.pipeline?.cancel(reason);
                showStatus(realtimeDisconnected ? 'Reconnecting' : 'Listening');
                if (supervisor.current?.id === 'pipeline') return;
            }
            orchestrator.clearClarification();
            if (reason === 'manual_answer') orchestrator.noteManualCancel();
            if (supervisor.current?.id === 'deepgram-flux') {
                answerWriter?.cancelDraft(reason);
                answerWriter?.cancel(reason);
            }
            else supervisor.current?.cancelResponse(reason);
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

export async function testConnection(
    options: GeminiLiveOptions & AmazonSonicOptions & {
        provider?: Exclude<LiveBrainProvider, 'pipeline'>;
        deepgramThink?: DeepgramThinkConfig;
        thinkTimeoutMs?: number;
        testAiRoute?: () => Promise<FluxAiRouteTestStatus>;
    },
): Promise<LiveBrainSettingsResult> {
    const provider = options.provider ?? 'gemini-live';
    if (provider === 'amazon-sonic') return testSonicConnection(options);
    const config = { ...options, setupTimeoutMs: options.setupTimeoutMs ?? 5_000, backoffMs: [] };
    if (provider === 'deepgram-voice-agent') {
        return testDeepgramConnection(config);
    }
    if (provider === 'deepgram-flux') {
        return testFluxConnection(config);
    }
    const brain = provider === 'gemini-live' ? new GeminiLiveBrain(config) : createLiveBrain(provider, config);
    const name = provider === 'gemini-live' ? 'Gemini Live' : provider === 'openai-realtime' ? 'OpenAI Realtime' : 'ElevenLabs Realtime';
    try {
        await brain.start(startContext('connection-test', buildProviderInstructions({}, 'full', provider), new AbortController().signal));
        return { success: true, message: `Connected to ${name}.` };
    } catch (error) {
        const code = error instanceof GeminiLiveError || error instanceof RealtimeBrainError ? error.code : 'protocol';
        const message = provider === 'gemini-live' ? connectionError[code] : realtimeConnectionError(code, name);
        return { success: false, error: code, message };
    } finally {
        await brain.stop();
    }
}

async function testSonicConnection(options: AmazonSonicOptions): Promise<LiveBrainSettingsResult> {
    const brain = new AmazonSonicBrain(options);
    try {
        await brain.start(startContext('connection-test', 'Reply with exactly OK to the test message.', new AbortController().signal));
        const code = await new Promise<LiveBrainErrorCode | null>(resolve => {
            const finish = (error: LiveBrainErrorCode | null) => {
                clearTimeout(timer);
                unsubscribe();
                resolve(error);
            };
            const timer = setTimeout(() => finish('timeout'), 10_000);
            const unsubscribe = brain.onEvent(event => {
                if (event.type === 'response_delta' && event.text.trim()) finish(null);
                if (event.type === 'error') finish(event.code);
            });
            brain.sendTestPrompt();
        });
        return code ? { success: false, error: code, message: realtimeConnectionError(code, 'Amazon Sonic') }
            : { success: true, message: 'Amazon Sonic connected and replied.' };
    } catch (error) {
        const code = error instanceof AmazonSonicError ? error.code : 'protocol';
        const detail = error instanceof AmazonSonicError ? error.detail : undefined;
        return { success: false, error: code, message: [realtimeConnectionError(code, 'Amazon Sonic'), detail].filter(Boolean).join(' ') };
    } finally {
        await brain.stop();
    }
}

async function testDeepgramConnection(
    options: GeminiLiveOptions & { deepgramThink?: DeepgramThinkConfig; thinkTimeoutMs?: number },
): Promise<LiveBrainSettingsResult> {
    const brain = new DeepgramVoiceAgentBrain(options);
    const instructions = 'Reply with exactly OK to the test message.';
    try {
        await brain.start(startContext('connection-test', instructions, new AbortController().signal));
    } catch (error) {
        await brain.stop();
        const code = error instanceof DeepgramVoiceAgentError ? error.code : 'protocol';
        return { success: false, error: code, message: `Deepgram connection failed: ${realtimeConnectionError(code, 'Deepgram Voice Agent')}` };
    }
    try {
        const reply = await new Promise<{ ok: true } | { ok: false; code: LiveBrainErrorCode; detail?: string }>(resolve => {
            let settled = false;
            const finish = (res: { ok: true } | { ok: false; code: LiveBrainErrorCode; detail?: string }) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                unsubscribe();
                resolve(res);
            };
            const timer = setTimeout(
                () => finish({ ok: false, code: 'timeout', detail: 'Think model did not reply in time.' }),
                options.thinkTimeoutMs ?? 8_000,
            );
            const unsubscribe = brain.onEvent(event => {
                if (event.type === 'response_delta' && /^ok[.!]?$/i.test(event.text.trim())) finish({ ok: true });
                else if (event.type === 'error') finish({ ok: false, code: event.code, detail: realtimeConnectionError(event.code, 'Deepgram Think') });
            });
            if (!brain.injectUserMessage('Reply with OK.')) {
                finish({ ok: false, code: 'protocol', detail: 'Could not send test prompt.' });
            }
        });
        if (!reply.ok) {
            return {
                success: false,
                error: reply.code,
                message: `Deepgram key valid, but Think model failed${reply.detail ? `: ${reply.detail}` : '.'}`,
            };
        }
        return { success: true, message: 'Deepgram key verified · Think model replied.' };
    } finally {
        await brain.stop();
    }
}

async function testFluxConnection(
    options: GeminiLiveOptions & { testAiRoute?: () => Promise<FluxAiRouteTestStatus> },
): Promise<LiveBrainSettingsResult> {
    const brain = new DeepgramFluxBrain(options);
    let fluxConnected = false;
    let fluxError: LiveBrainErrorCode | undefined;
    let fluxDetail = 'Deepgram Flux connected.';
    try {
        await brain.start(startContext('connection-test', '', new AbortController().signal));
        fluxConnected = true;
    } catch (error) {
        fluxError = error instanceof DeepgramFluxError ? error.code : 'protocol';
        fluxDetail = realtimeConnectionError(fluxError, 'Deepgram Flux');
    } finally {
        await brain.stop();
    }

    const aiRoute: FluxAiRouteTestStatus = options.testAiRoute
        ? await options.testAiRoute()
        : {
            provider: 'unknown',
            providerLabel: 'AI Provider',
            model: '',
            configured: false,
            replied: false,
            detail: 'AI Provider route status unavailable.',
        };

    const success = fluxConnected && aiRoute.replied;
    const error = !fluxConnected
        ? (fluxError ?? 'protocol')
        : !aiRoute.configured
            ? 'ai_provider_unconfigured'
            : !aiRoute.replied
                ? 'ai_provider_test_failed'
                : undefined;

    return {
        success,
        ...(error ? { error } : {}),
        message: `${fluxDetail} · ${aiRoute.detail}`,
        fluxResult: {
            connected: fluxConnected,
            detail: fluxDetail,
            aiRoute,
        },
    };
}

function realtimeConnectionError(code: LiveBrainErrorCode, name: string): string {
    switch (code) {
        case 'auth': return `${name} rejected the API key or access to the model.`;
        case 'quota': return `${name} quota is exhausted. Check your provider plan.`;
        case 'rate_limited': return `${name} is rate-limiting requests. Try again shortly.`;
        case 'network': return `Could not reach ${name}. Check your connection and try again.`;
        case 'protocol': return `${name} rejected the session setup.`;
        case 'timeout': return `${name} did not finish setup in time.`;
        case 'unsupported': return `${name} does not support the selected model or session configuration.`;
    }
}

export const liveBrainPremium = { createMeeting, testConnection };
