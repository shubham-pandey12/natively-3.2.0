export declare function guideStopLockLeft(state: any, now: number): number;
export declare const GUIDE_EVENT_TYPES: readonly string[];
export declare function emptyGuideState(): {
    status: string;
    step: string;
    variant: string;
    outcome: any;
    startedAt: any;
    updatedAt: any;
    endedMeetingId: any;
    stopLockUntil: any;
};
export declare function normalizeGuideState(raw: any, now: number): {
    status: any;
    step: any;
    variant: any;
    outcome: any;
    startedAt: any;
    updatedAt: any;
    endedMeetingId: any;
    stopLockUntil: any;
};
export declare function reduceGuide(state: any, event: any, now: number): any;
export declare function reconcileGuide(state: any, { meetingActive, atLaunch, surface }: any, now: number): any;
/**
 * The guide's account facts from their raw sources (3.2.0). The trial sentinel
 * is a placeholder key, not a purchased one, so it never counts as a Natively key.
 */
export declare function guideFactsFromSources({ nativelyKey, trialSentinel, licensed, hasOwnAiKey, hasMeetings, launchCount, }?: {
    nativelyKey?: unknown;
    trialSentinel?: string;
    licensed?: unknown;
    hasOwnAiKey?: unknown;
    hasMeetings?: unknown;
    launchCount?: unknown;
}): {
    hasOwnAiKey: boolean;
    hasMeetings: boolean;
    hasNativelyKey: boolean;
    isPremium: boolean;
    launchCount: number;
};
