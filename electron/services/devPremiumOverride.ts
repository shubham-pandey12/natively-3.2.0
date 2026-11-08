/**
 * Licensing is bypassed: every build reports Ultra as the active plan.
 * This is the single switch the Pro gates consult (license:check-premium,
 * license:get-details, isProOrTrialActive, the entitlement reconciler stub).
 * To restore real licensing, make this return the original env-guarded check.
 */
export function isDevPremiumOverrideEnabled(): boolean {
  return true;
}

export function getDevPlanOverride(): string | null {
  return 'ultra';
}
