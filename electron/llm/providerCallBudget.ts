export const TURN_MAX_UNCOMMITTED_CALLS = 3;
export const BREAKER_FAILURE_THRESHOLD = 3;
export const BREAKER_WINDOW_MS = 30_000;
export const BREAKER_COOLDOWN_MS = 20_000;
export const PROVIDER_CIRCUIT_OPEN_CODE = 'PROVIDER_CIRCUIT_OPEN';
export const TURN_CALL_BUDGET_EXHAUSTED_CODE = 'TURN_CALL_BUDGET_EXHAUSTED';

const engineManagedSignals = new WeakSet<AbortSignal>();
export function markEngineManagedSignal(signal?: AbortSignal): void { if (signal) engineManagedSignals.add(signal); }
export function sdkRetryOptions(signal?: AbortSignal): { maxRetries?: number } { return signal && engineManagedSignals.has(signal) ? { maxRetries: 0 } : {}; }

export class TurnCallBudget {
  private used = new WeakMap<object, number>();
  private aliases = new WeakMap<object, object>();
  constructor(readonly max = TURN_MAX_UNCOMMITTED_CALLS) {}
  alias(key: object, turnKey: object): void { if (!key || !turnKey || key === turnKey) return; this.aliases.set(key, this.resolve(turnKey)); }
  private resolve(key: object): object { let k = key; for (let i = 0; i < 8; i++) { const next = this.aliases.get(k); if (!next || next === k) break; k = next; } return k; }
  remaining(key: object): number { return Math.max(0, this.max - (this.used.get(this.resolve(key)) ?? 0)); }
  tryTake(key: object): boolean { const k = this.resolve(key), n = this.used.get(k) ?? 0; if (n >= this.max) return false; this.used.set(k, n + 1); return true; }
  refund(key: object): void { const k = this.resolve(key), n = this.used.get(k) ?? 0; if (n > 0) this.used.set(k, n - 1); }
}

type Entry = { consecutiveFails: number; lastFailAt: number; openUntil: number; probeInFlight: boolean };
export class ProviderCircuitBreaker {
  private entries = new Map<string, Entry>();
  constructor(private readonly opts: { now?: () => number; threshold?: number; windowMs?: number; cooldownMs?: number } = {}) {}
  private get now(): number { return (this.opts.now ?? Date.now)(); }
  admit(family: string): 'closed' | 'open' | 'probe' { const e = this.entries.get(family); if (!e || e.openUntil === 0) return 'closed'; if (this.now < e.openUntil || e.probeInFlight) return 'open'; e.probeInFlight = true; return 'probe'; }
  isOpen(family: string): boolean { const e = this.entries.get(family); return !!e && e.openUntil !== 0 && (this.now < e.openUntil || e.probeInFlight); }
  retryInMs(family: string): number { const e = this.entries.get(family); return e ? Math.max(0, e.openUntil - this.now) : 0; }
  recordSuccess(family: string): void { this.entries.delete(family); }
  recordFailure(family: string): void { const now = this.now, e = this.entries.get(family) ?? { consecutiveFails: 0, lastFailAt: 0, openUntil: 0, probeInFlight: false }; if (e.probeInFlight) { e.consecutiveFails++; e.lastFailAt = now; e.openUntil = now + (this.opts.cooldownMs ?? BREAKER_COOLDOWN_MS); } else { if (e.consecutiveFails && now - e.lastFailAt > (this.opts.windowMs ?? BREAKER_WINDOW_MS)) e.consecutiveFails = 0; e.consecutiveFails++; e.lastFailAt = now; if (e.consecutiveFails >= (this.opts.threshold ?? BREAKER_FAILURE_THRESHOLD)) e.openUntil = now + (this.opts.cooldownMs ?? BREAKER_COOLDOWN_MS); } e.probeInFlight = false; this.entries.set(family, e); }
  recordNeutral(family: string): void { const e = this.entries.get(family); if (e) e.probeInFlight = false; }
}

export function circuitOpenError(name: string, retryInMs: number): Error { return Object.assign(new Error(`${name} failed repeatedly (503 unavailable); not calling it again for ${Math.max(1, Math.ceil(retryInMs / 1000))}s`), { status: 503, code: PROVIDER_CIRCUIT_OPEN_CODE }); }
export function turnBudgetExhaustedError(name: string): Error { return Object.assign(new Error(`${name}: this turn already used its ${TURN_MAX_UNCOMMITTED_CALLS} provider attempts (503 unavailable)`), { status: 503, code: TURN_CALL_BUDGET_EXHAUSTED_CODE }); }

export function guardProviderOpen(opts: { family: string; name: string; turnKey: object; budget: TurnCallBudget; breaker: ProviderCircuitBreaker; outerSignal?: AbortSignal; open: (signal: AbortSignal) => AsyncGenerator<string, void, unknown> }): (signal: AbortSignal) => AsyncGenerator<string, void, unknown> {
  const { family, name, turnKey, budget, breaker, outerSignal, open } = opts;
  return async function* (signal) {
    const admitted = breaker.admit(family);
    if (admitted === 'open') throw circuitOpenError(name, breaker.retryInMs(family));
    if (!budget.tryTake(turnKey)) { if (admitted === 'probe') breaker.recordNeutral(family); throw turnBudgetExhaustedError(name); }
    markEngineManagedSignal(signal);
    let committed = false, settled = false;
    const neutral = () => outerSignal?.aborted || /hedge-lost/.test(String((signal.reason as Error | undefined)?.message ?? signal.reason ?? ''));
    try {
      for await (const chunk of open(signal)) {
        if (!committed && typeof chunk === 'string' && chunk.trim()) { committed = settled = true; breaker.recordSuccess(family); budget.refund(turnKey); }
        yield chunk;
      }
      if (!committed) { settled = true; neutral() ? breaker.recordNeutral(family) : breaker.recordFailure(family); }
    } catch (error) { if (!committed) { settled = true; neutral() ? breaker.recordNeutral(family) : breaker.recordFailure(family); } throw error; }
    finally { if (!settled) neutral() ? breaker.recordNeutral(family) : breaker.recordFailure(family); }
  };
}
