/**
 * licenseVerifyPolicy — pure decision logic for what to do with a stored
 * natively_api Pro license after re-validating against `GET /v1/pro/verify`.
 *
 * Extracted as a dependency-free function so the revoke/keep decision can be
 * unit-tested exhaustively without keytar / native bindings / fs / network.
 *
 * Server contract (natively-api/server.js `/v1/pro/verify` + validateKey):
 *   200 { ok:true,  has_pro:true,  plan }                      → still Pro
 *   200 { ok:true,  has_pro:false, plan:'standard' }           → plan downgraded (definitive)
 *   403 { ok:false, error:'subscription_inactive' }            → subscription lapsed (definitive)
 *   403 { ok:false, error:'account_suspended' }                → payment-method HOLD ("contact support") — RECOVERABLE, NOT a downgrade
 *   429 { ok:false, error:'ip_blocked' }                       → rate-limit/DDoS edge — transient
 *   4xx { ok:false, error:'key_not_found'|'invalid_key_format'}→ key no longer valid (e.g. refund) (definitive)
 *   5xx / network error / unparseable                          → server blip — transient
 *
 * PRINCIPLE (paying-user-safe): only revoke a paid user's local license on a
 * CONFIRMED loss of entitlement. Anything transient or unrecognized fails OPEN
 * (keep the license) so a flaky server / rate-limit blip can never downgrade a
 * paying customer. A refunded/deleted key is still caught (key_not_found), and
 * actual hosted-API usage remains server-enforced regardless.
 */

export type ProVerifyDecision = 'active' | 'revoke' | 'keep' | 'hold';

/** Errors that represent a CONFIRMED, durable loss of Pro entitlement → safe to revoke locally. */
const ENTITLEMENT_LOST_ERRORS: ReadonlySet<string> = new Set([
  'subscription_inactive', // subscription expired / cancelled
  'key_not_found',         // key deleted server-side (e.g. refund)
  'invalid_key_format',    // key is no longer a valid key
]);

/** Errors/states that are transient or recoverable → NEVER revoke a paying user on these. */
const TRANSIENT_ERRORS: ReadonlySet<string> = new Set([
  'ip_blocked',        // 429 rate-limit / DDoS edge throttle
  'rate_limited',
  'server_error',
]);
const HOLD_ERRORS = new Set(['account_suspended']);

/**
 * Decide what to do with a stored natively_api license given the verify response.
 * @param status  HTTP status code (use 0 for network error / no response).
 * @param data    Parsed JSON body, or null/undefined if unparseable / absent.
 */
export function classifyProVerify(
  status: number,
  data: { ok?: boolean; has_pro?: boolean; error?: string } | null | undefined,
): ProVerifyDecision {
  // Network error / no response → keep (fail-open).
  if (!status || status === 0) return 'keep';

  // Confirmed active Pro.
  if (data && data.ok === true && data.has_pro === true) return 'active';

  // Server-side blip (5xx) or unparseable body → keep (fail-open).
  if (status >= 500 || data == null) return 'keep';

  const err = typeof data.error === 'string' ? data.error : undefined;

  // Transient/recoverable states take precedence: never revoke on these.
  if (err && TRANSIENT_ERRORS.has(err)) return 'keep';
  if (err && HOLD_ERRORS.has(err)) return 'hold';

  // Confirmed downgrade (200 + has_pro:false) or a durable lost-entitlement error → revoke.
  if (data.has_pro === false || (err && ENTITLEMENT_LOST_ERRORS.has(err))) return 'revoke';

  // Anything unrecognized → keep (paying-user-safe default).
  return 'keep';
}

export function classifyGumroadVerify(status: number, data: any): { decision: 'active' | 'revoke' | 'keep'; why: string } {
  if (!status) return { decision: 'keep', why: 'no answer' };
  if (status === 429 || status >= 500 || data == null) return { decision: 'keep', why: `HTTP ${status}` };
  if (data.success === true) {
    const p = data.purchase ?? {};
    if (p.refunded === true) return { decision: 'revoke', why: 'refunded' };
    if (p.chargebacked === true) return { decision: 'revoke', why: 'charged back' };
    if (p.disputed === true && p.dispute_won !== true) return { decision: 'revoke', why: 'disputed' };
    if (p.subscription_ended_at) return { decision: 'revoke', why: 'subscription ended' };
    if (p.subscription_failed_at) return { decision: 'revoke', why: 'subscription payment failed' };
    return { decision: 'active', why: 'valid' };
  }
  if (status === 404) return { decision: 'revoke', why: 'licence not found or disabled' };
  return { decision: 'keep', why: `HTTP ${status}` };
}
