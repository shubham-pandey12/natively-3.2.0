# Live Brain — Progress & Handoff

> Update this file at the end of every phase. It is the handoff contract between agents and sessions.
> Spec: [ARCHITECTURE.md](ARCHITECTURE.md) · Plan: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

## Phase status

| Phase | Status | Notes |
|---|---|---|
| UI — Settings UI (first) | ✅ Done (reviewed) | Implemented by Codex, reviewed and fixed by Claude. Windows settings checks passed. One pre-existing Auto Answer telemetry assertion fails (unrelated). |
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

## Phase UI — 2026-11-25

- The General switch defaults to off and persists independently of Auto Answer. Enabling a provider that requires a key rolls back with inline guidance if the effective key is missing or malformed. The existing pipeline requires no extra key.
- Audio stores dedicated keys through CredentialsManager. A dedicated key takes precedence over a stored AI Providers key for the same vendor. Config IPC returns presence, a masked suffix, and reuse state. Test connection checks the local key format and reports that connection testing arrives in Phase 4. Model and instruction defaults remain unset pending the planned provider validation.
- Windows dev app via agent-browser over CDP verified row order, shared styling, the masked state after saving a fake key, the connection status, toggle rollback, and Auto Answer's switch state while Live Brain was turned on and off. Removed the fake key after the check. Meeting capture and answering code were outside this phase.
- Automated checks on Windows: Electron build and both typechecks passed. Phase UI tests passed (2). Library tests passed (3,242 passed, 15 skipped), and component tests passed (1,000 passed, 2 skipped). Auto Answer returned 191 passed and 1 failed. The failing telemetry assertion expects a previous `onManualWhatToAnswer` signature and also fails against the unchanged HEAD source.
- Full CI reached the main test suite and stopped there (18,484 passed, 8 failed, 124 skipped). Failures covered bundled embeddings, negotiation coaching, phone label routing, the shortcut guard, coding follow-ups, and the Auto Answer telemetry assertion. The Live Brain settings IPC test passed in this run.
- Requires physical macOS verification. IPC and credential persistence reuse the shared Electron and CredentialsManager paths. Provider latency and quality measurements begin in later phases.
- Review fixes (Claude): `credentials-changed` is now broadcast only for key writes and the "Use my AI Providers key" switch — not for the on/off switch, provider, model or instruction variant, because that event makes AI Providers and the app shell reload credential state. Enabling with a present-but-malformed key now says the key "doesn't look valid" instead of asking to add one. Test updated to assert exactly these broadcasts and the new message.
- Review re-run on Windows: `npm run build:electron` passed; Live Brain settings, toggle and speech-provider guard tests passed (10/10); `typecheck:electron` and `typecheck:ts7` passed; `test:auto-answer` 191/192 — the failing `AutoAnswerUsageTelemetry2026_09_27` assertion matches source text in `onManualWhatToAnswer`, which this phase does not touch (pre-existing).
- Known, accepted for now: changing the provider while the switch is on does not re-check the key (BrainSupervisor falls back in Phase 5 per ARCHITECTURE §9b rule 5). New status strings are English-only in i18n until a translation pass.

## Open risks

- Gemini native-audio models may not support TEXT output → use output transcription (Phase 0 decides).
- Free-tier rate limits during long interviews.
- ~15-min Gemini session limit → rollover correctness.
- Timing changes in `SimpleAutoAnswer.ts` (Phase 1).
- macOS cannot be physically tested by the user → `Requires physical macOS verification`.
