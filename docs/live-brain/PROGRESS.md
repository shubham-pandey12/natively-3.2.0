# Live Brain — Progress & Handoff

> Update this file at the end of every phase. It is the handoff contract between agents and sessions.
> Spec: [ARCHITECTURE.md](ARCHITECTURE.md) · Plan: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

## Phase status

| Phase | Status | Notes |
|---|---|---|
| UI — Settings UI (first) | ☐ Not started | General switch + Audio provider section; no runtime effect |
| 0 — Verify facts & baseline | ☐ Not started | |
| 1 — Corrections in pipeline | ☐ Not started | |
| 2 — Foundation | ☐ Not started | |
| 3 — Orchestrator + overlay | ☐ Not started | |
| 4 — GeminiLiveBrain | ☐ Not started | |
| 5 — Notebook + Supervisor | ☐ Not started | |
| 6 — OpenAIRealtimeBrain | ☐ Not started | |
| 7 — Tuning & validation | ☐ Not started | |

## Verified provider facts (fill in Phase 0, with source URLs)

| Question (ARCHITECTURE §14) | Answer | Source | Date checked |
|---|---|---|---|
| Q1 Gemini model + TEXT modality | | | |
| Q2 Gemini input audio format / VAD | | | |
| Q3 Session limit / goAway / resumption / compression | | | |
| Q4 Free-tier limits | | | |
| Q5 OpenAI Realtime model + price | | | |
| Q6 Full vs trimmed instructions | | | |

## Baseline measurements (current pipeline, Phase 0)

| Metric | Value | How measured |
|---|---|---|
| Speech stop → first visible text (median / p90) | | |
| Scenario pass rate (S1–S12) | | |

## Decisions log

- 2026-11-25 — Design approved by user: Gemini Live free as main brain; current Natively response style; clarifications on; text-only output; OpenAI Realtime optional backup; pipeline always-available fallback; feature flag off by default.
- 2026-11-25 — Activation: "Live Brain" switch in Settings → General directly below Auto Answer. On → Live Brain owns automatic answering (Auto Answer dispatch suppressed); Off → existing Natively unchanged. Independent of the Auto Answer switch; not Pro-gated; reuses existing Gemini/OpenAI keys; advanced options in Settings → Intelligence.
- 2026-11-25 — UI: Live Brain answers use exactly the same overlay UI as Auto Answer (same row, styles, delivery). Only minimal additions from existing styles: "Ask:" label, dimmed outdated row + "Updated" label, interviewer-speaking marker. Settings row mirrors the Auto Answer row.
- 2026-11-25 — API keys: never hardcoded. New "Live Brain Provider" section in Settings → Audio (after Speech Provider, same UI pattern): provider selector (Gemini Live / OpenAI Realtime / Existing pipeline), per-provider keys in CredentialsManager, optional reuse of AI Providers keys, model, instruction variant, Test connection.

## Open risks

- Gemini native-audio models may not support TEXT output → use output transcription (Phase 0 decides).
- Free-tier rate limits during long interviews.
- ~15-min Gemini session limit → rollover correctness.
- Timing changes in `SimpleAutoAnswer.ts` (Phase 1).
- macOS cannot be physically tested by the user → `Requires physical macOS verification`.
