/**
 * Centralized Feature Gate for Premium Features.
 *
 * Determines at runtime whether premium modules (LicenseManager,
 * KnowledgeOrchestrator, etc.) are available. This allows the
 * source-available version to compile and run without premium code.
 *
 * Two signals, either of which marks premium absent:
 *  - main's startup load of the knowledge modules failed and called
 *    markPremiumAbsent() (3.2.0). The flag lives on globalThis so every
 *    bundled copy of this module agrees.
 *  - the module probe below fails (source-available builds without premium/).
 */

const PREMIUM_ABSENT_KEY = '__nativelyPremiumAbsentV1__';
type GateGlobal = typeof globalThis & { [PREMIUM_ABSENT_KEY]?: boolean };


/** Record that the premium modules failed to load at startup. */
export function markPremiumAbsent(): void {
    (globalThis as GateGlobal)[PREMIUM_ABSENT_KEY] = true;
}

/**
 * Check if premium modules are available in this build.
 * The probe result is cached after the first call.
 */
export function isPremiumAvailable(): boolean {
    return (globalThis as GateGlobal)[PREMIUM_ABSENT_KEY] !== true;
}

/**
 * Reset the cached premium availability check and the absent flag.
 * Useful for testing.
 */
export function resetFeatureGate(): void {
    delete (globalThis as GateGlobal)[PREMIUM_ABSENT_KEY];
}
