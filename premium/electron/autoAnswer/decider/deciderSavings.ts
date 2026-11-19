/**
 * What the downloaded decider saves: a per-day count of judge calls (with prompt size) and of
 * moments the local model decided alone. Numbers only, never text. Kept 60 days in one JSON file.
 * The "before" window is the 7 days ending the day before install; until install, a projection
 * at the expected local share.
 */
import fs from 'fs';

/** The LLM judge the savings are priced against. */
export const JUDGE_REFERENCE = Object.freeze({ model: 'Gemini 3.1 Flash-Lite', inPerM: 0.25, outPerM: 1.5, outTokensPerCall: 40, charsPerToken: 4 });
/** The share of moments the local model is expected to decide alone (pre-install projection). */
export const EXPECTED_LOCAL_SHARE = 0.55;
const KEEP_DAYS = 60;
const WINDOW_DAYS = 7;

interface DayCounts { judged: number; local: number; judgeChars: number }
interface LedgerData { schema: 1; installedAt: string | null; days: Record<string, DayCounts> }

export interface DeciderSavingsOptions {
    /** The ledger file; null keeps it in memory (tests). */
    file: string | null;
    now?: () => number;
    writeDelayMs?: number;
}

export interface DeciderSavingsSummary {
    installedAt: string | null;
    before: { days: number; judgeCalls: number; tokens: number; usd: number };
    after: {
        days: number; moments: number; local: number; judged: number;
        tokensSaved: number; usdSaved: number; tokensSpent: number; usdSpent: number;
    } | null;
    projection: { localShare: number; judgeCallsSaved: number; tokensSaved: number; usdSaved: number } | null;
    reference: typeof JUDGE_REFERENCE;
}

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const usd = (tokensIn: number, calls: number) =>
    (tokensIn * JUDGE_REFERENCE.inPerM + calls * JUDGE_REFERENCE.outTokensPerCall * JUDGE_REFERENCE.outPerM) / 1e6;

export class DeciderSavingsLedger {
    private data: LedgerData;
    private writeTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(private opts: DeciderSavingsOptions) {
        this.data = this.read();
    }

    private now(): number { return this.opts.now?.() ?? Date.now(); }

    private read(): LedgerData {
        const empty: LedgerData = { schema: 1, installedAt: null, days: {} };
        if (!this.opts.file) return empty;
        try {
            const j = JSON.parse(fs.readFileSync(this.opts.file, 'utf8'));
            if (j?.schema !== 1 || typeof j.days !== 'object' || !j.days) return empty;
            const days: Record<string, DayCounts> = {};
            for (const [k, v] of Object.entries<any>(j.days)) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
                const n = (x: any) => (Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
                days[k] = { judged: n(v?.judged), local: n(v?.local), judgeChars: n(v?.judgeChars) };
            }
            return { schema: 1, installedAt: typeof j.installedAt === 'string' && !Number.isNaN(Date.parse(j.installedAt)) ? j.installedAt : null, days };
        } catch { return empty; }
    }

    private day(): DayCounts {
        const k = dayKey(this.now());
        return (this.data.days[k] ??= { judged: 0, local: 0, judgeChars: 0 });
    }

    private save(): void {
        if (!this.opts.file || this.writeTimer) return;
        this.writeTimer = setTimeout(() => this.flush(), this.opts.writeDelayMs ?? 2_000);
        (this.writeTimer as any)?.unref?.();
    }

    flush(): void {
        if (this.writeTimer) { clearTimeout(this.writeTimer); this.writeTimer = null; }
        if (!this.opts.file) return;
        const cutoff = dayKey(this.now() - KEEP_DAYS * 86_400_000);
        for (const k of Object.keys(this.data.days)) if (k < cutoff) delete this.data.days[k];
        try {
            const tmp = `${this.opts.file}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(this.data));
            fs.renameSync(tmp, this.opts.file);
        } catch { /* next save retries */ }
    }

    /** One judge call, with its prompt's length in characters. */
    recordJudgeCall(promptChars: number): void {
        const d = this.day();
        d.judged++;
        d.judgeChars += Math.max(0, Math.floor(promptChars) || 0);
        this.save();
    }

    /** One moment the downloaded model decided without the judge. */
    recordLocalDecision(): void {
        this.day().local++;
        this.save();
    }

    markInstalled(): void {
        if (!this.data.installedAt) { this.data.installedAt = new Date(this.now()).toISOString(); this.save(); }
    }

    markRemoved(): void {
        this.data.installedAt = null;
        this.save();
    }

    summary(): DeciderSavingsSummary {
        const now = this.now();
        const installedAt = this.data.installedAt;
        const installDay = installedAt ? dayKey(Date.parse(installedAt)) : null;
        const days = Object.entries(this.data.days);
        const all = days.reduce((a, [, d]) => ({ calls: a.calls + d.judged, chars: a.chars + d.judgeChars }), { calls: 0, chars: 0 });
        const tokensPerCall = all.calls ? all.chars / all.calls / JUDGE_REFERENCE.charsPerToken : 0;
        const inTok = (chars: number) => chars / JUDGE_REFERENCE.charsPerToken;
        const outTok = (calls: number) => calls * JUDGE_REFERENCE.outTokensPerCall;
        const endKey = installDay ? dayKey(Date.parse(installDay) - 86_400_000) : dayKey(now);
        const startKey = dayKey(Date.parse(endKey) - (WINDOW_DAYS - 1) * 86_400_000);
        const b = days.filter(([k]) => k >= startKey && k <= endKey)
            .reduce((a, [, d]) => ({ calls: a.calls + d.judged, chars: a.chars + d.judgeChars }), { calls: 0, chars: 0 });
        const before = { days: WINDOW_DAYS, judgeCalls: b.calls, tokens: Math.round(inTok(b.chars) + outTok(b.calls)), usd: usd(inTok(b.chars), b.calls) };
        let after: DeciderSavingsSummary['after'] = null;
        let projection: DeciderSavingsSummary['projection'] = null;
        if (installDay) {
            const a = days.filter(([k]) => k >= installDay)
                .reduce((x, [, d]) => ({ local: x.local + d.local, judged: x.judged + d.judged, chars: x.chars + d.judgeChars }), { local: 0, judged: 0, chars: 0 });
            const savedIn = a.local * tokensPerCall;
            after = {
                days: Math.max(1, Math.round((now - Date.parse(installedAt!)) / 86_400_000)),
                moments: a.local + a.judged,
                local: a.local,
                judged: a.judged,
                tokensSaved: Math.round(savedIn + outTok(a.local)),
                usdSaved: usd(savedIn, a.local),
                tokensSpent: Math.round(inTok(a.chars) + outTok(a.judged)),
                usdSpent: usd(inTok(a.chars), a.judged),
            };
        } else {
            const saved = Math.round(b.calls * EXPECTED_LOCAL_SHARE);
            const savedIn = b.calls ? (saved * (b.chars / b.calls)) / JUDGE_REFERENCE.charsPerToken : 0;
            projection = { localShare: EXPECTED_LOCAL_SHARE, judgeCallsSaved: saved, tokensSaved: Math.round(savedIn + outTok(saved)), usdSaved: usd(savedIn, saved) };
        }
        return { installedAt, before, after, projection, reference: JUDGE_REFERENCE };
    }
}
