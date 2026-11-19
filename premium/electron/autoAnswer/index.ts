/**
 * Premium Auto Answer: the module electron/premium/autoAnswer.ts loads. Declared as
 * AutoAnswerPremium so `npm run typecheck:premium` fails when the boundary and this drift.
 * Platform differences live in decider/deciderRuntime.ts; nothing here branches on the OS.
 * The judge request is opaque at the boundary (AutoAnswerJudgeRequest); only this module builds it.
 */
import os from 'os';
import type { AutoAnswerPremium } from '../../../electron/premium/autoAnswer';
import { SimpleAutoAnswerEngine, acceptsLocalSpeechEndHint } from './SimpleAutoAnswer';
import { buildJudgePrompt, type JudgeRequest } from './AutoAnswerJudge';
import { AutoAnswerUsageTelemetry } from './AutoAnswerUsageTelemetry';
import { autoAnswerAccess, newTrainingConsent } from './autoAnswerAccess';
import { systemClock } from './AutoAnswerClock';
import { createAppDecider } from './decider/appDecider';
import { DeciderModelInstaller } from './decider/deciderModelInstaller';
import { chooseDeciderRuntime } from './decider/deciderRuntime';
import { DeciderSavingsLedger } from './decider/deciderSavings';
import { TrainingTranscriptUploader, setTrainingMeetingSink, offerTrainingMeeting } from './training/TrainingTranscriptUploader';

export const autoAnswerPremium: AutoAnswerPremium = {
    available: true,
    createEngine: (host, thresholds) => new SimpleAutoAnswerEngine(host, systemClock, thresholds),
    createUsageTelemetry: (deps) => new AutoAnswerUsageTelemetry(deps),
    buildJudgePrompt: (req) => buildJudgePrompt(req as JudgeRequest),
    acceptsLocalSpeechEndHint,
    autoAnswerAccess,
    newTrainingConsent,
    createDecider: (o) => createAppDecider({ ...o, clock: systemClock }),
    createModelInstaller: ({ platform, arch, release, ...deps }) => new DeciderModelInstaller({
        ...deps,
        choice: chooseDeciderRuntime(platform, arch, release || os.release()),
    }),
    createSavingsLedger: (o) => new DeciderSavingsLedger(o),
    createTrainingUploader: (deps) => new TrainingTranscriptUploader(deps),
    setTrainingMeetingSink: setTrainingMeetingSink,
    offerTrainingMeeting: offerTrainingMeeting,
};
