# Live Brain — Progress & Handoff

> Update this file at the end of every phase. It is the handoff contract between agents and sessions.
> Spec: [ARCHITECTURE.md](ARCHITECTURE.md) · Plan: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

## Phase status

| Phase | Status | Notes |
|---|---|---|
| UI — Settings UI (first) | ✅ Done (reviewed) | Implemented by Codex, reviewed and fixed by Claude. Windows settings checks passed. One pre-existing Auto Answer telemetry assertion fails (unrelated). |
| 0 — Verify facts & baseline | ✅ Done (reviewed) — live numbers pending | Research, dev timing, S1–S12 corpus and spike committed. Gemini spike run and pipeline baseline need the user's key and a real meeting (see "Phase 0 review"). |
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
| Q1 Gemini model + TEXT modality | Google's current conversational Live comparison lists `gemini-3.8-live` (Google's default), `gemini-3.8-live-extended-thinking`, `gemini-3.1-flash-live-preview`, and `gemini-2.5-flash-native-audio-preview-12-2025` (scheduled shutdown March 31, 2027). Live Translate and Live Transcribe are separate workloads. The Live capabilities guide specifies `AUDIO` for native-audio model responses. Set `outputAudioTranscription: {}` and consume `serverContent.outputTranscription.text` for response text. Some model cards list text as a supported output type, but the protocol guide gives the modality constraint. Actual TEXT setup behavior and transcription latency are **unverified** without a live run. | [Model comparison](https://aistudio.google.com/docs/live-api/capabilities#model-comparison), [3.8 model](https://aistudio.google.com/docs/models/gemini-3.8-live), [Live model lifecycle](https://aistudio.google.com/docs/deprecations#live-api-models), [Response modalities](https://aistudio.google.com/docs/live-api/capabilities#response-modalities), [Audio transcription](https://aistudio.google.com/docs/live-api/capabilities#audio-transcription) | 2026-11-25 |
| Q2 Gemini input audio format / VAD | Input is signed 16-bit little-endian raw PCM, native at 16 kHz. The server can resample from the rate declared in `audio/pcm;rate=16000` (substitute the actual rate). Audio output is 24 kHz PCM. Automatic VAD is enabled by default. Configure `realtimeInputConfig.automaticActivityDetection` with `startOfSpeechSensitivity`, `endOfSpeechSensitivity`, `prefixPaddingMs`, and `silenceDurationMs`. With `disabled: true`, send `activityStart` and `activityEnd` explicitly. With automatic VAD enabled, `audioStreamEnd` flushes the stream. User activity interrupts by default and `activityHandling` can change that. The guide's numeric tuning values are examples. Interview-specific tuning is unverified. | [Audio formats](https://aistudio.google.com/docs/live-api/capabilities#audio-formats), [VAD](https://aistudio.google.com/docs/live-api/capabilities#voice-activity-detection-vad), [WebSocket field reference](https://aistudio.google.com/api-reference/live) | 2026-11-25 |
| Q3 Session limit / goAway / resumption / compression | Without compression, the documented session limits are 15 minutes for audio-only and 2 minutes for audio-video. A WebSocket connection lasts around 10 minutes even when the logical session continues. `goAway.timeLeft` is the remaining time before disconnection. The exact model-specific minimum notice is **unverified** because the public sources checked give no numeric value. Enable `sessionResumption` in setup and reconnect with the latest resumable `sessionResumptionUpdate.newHandle` as `sessionResumption.handle`. The guide says handles remain valid for two hours after termination. `contextWindowCompression.slidingWindow` with optional `triggerTokens` and `targetTokens` prunes older context and removes the stated session-duration cap. This still requires connection resumption. | [Session management](https://aistudio.google.com/docs/live-api/session-management), [GoAway field](https://aistudio.google.com/api-reference/live#GoAway), [Compression fields](https://aistudio.google.com/api-reference/live#ContextWindowCompressionConfig) | 2026-11-25 |
| Q4 Free-tier limits | Google lists free input/output for the four conversational models above. Limits apply per project and vary by model/tier. Daily request counts reset at midnight Pacific time. Exact Free RPM, input TPM, RPD, concurrent sessions and whether a particular project can sustain a 60-minute interview are **unverified**. Google directs users to their signed-in AI Studio rate-limit panel and says capacity can vary. | [3.x Live pricing](https://aistudio.google.com/docs/pricing#gemini-3.8-live), [2.5 Live pricing](https://aistudio.google.com/docs/pricing#gemini-2.5-flash-native-audio), [Rate limits](https://aistudio.google.com/docs/rate-limits#current-rate-limits), [Project quota panel](https://aistudio.google.com/rate-limit) | 2026-11-25 |
| Q5 OpenAI Realtime model + price | The Realtime conversations guide uses `gpt-realtime-2.1`. An audio-input conversation can select `output_modalities: ["text"]` for text-only output. Prices per 1M tokens in USD, in input / cached input / output order: audio $32 / $0.40 / $64, text $4 / $0.40 / $24. The `gpt-realtime-2.1-mini` option lists audio $10 / $0.30 / $20 and text $0.60 / $0.06 / $2.40. Audio input and output text are billed at their respective rates. | [Realtime conversation guide](https://developers.openai.com/api/docs/guides/realtime-conversations), [Realtime WebSocket reference](https://developers.openai.com/api/reference/python/resources/realtime/methods/connect), [OpenAI pricing](https://developers.openai.com/api/docs/pricing) | 2026-11-25 |
| Q6 Full vs trimmed instructions | **Unverified.** No paired quality runs were performed. Phase 0's requested provider verification covers Q1–Q5. | S1–S12 corpus | — |

## Baseline measurements (current pipeline, Phase 0)

| Metric | Value | How measured |
|---|---|---|
| Speech stop → first visible text (median / p90) | Blocked, 0 live samples | A provider-backed development meeting with spoken or replayed interviewer audio is needed. Text injection bypasses the native speech-stop event and cannot provide this metric. Measure through the first display-bound engine emission, before IPC batching and renderer paint. |
| Scenario pass rate (S1–S12) | Blocked, 0/12 scenarios executed against the live pipeline | The corpus is text-only. No corpus recordings or controlled live meeting were supplied. Score the assertions during spoken or audio replay using the collection procedure in the [corpus README](../../tests/live-brain/scenarios/README.md). |

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

## Phase 0 — 2026-11-25

- Use `gemini-3.8-live` as the Phase 0 probe default based on Google's current model guide. Treat AUDIO plus output transcription as the documented response path. Revalidate observed setup and first-transcript timing with the spike before provider integration.
- The dev timing record starts at the existing interviewer capture's speech-stop callback and ends at the first display-bound Auto Answer text. It covers fresh streams, buffered tails/final text and adopted or revealed prefetches. The Prompt Debugger exposes the number-only record under `answerTimings` and in its existing JSONL file as `answer_timing`. No capture or answering policy changed.
- The spike was syntax-checked. It was not connected to Gemini because `GEMINI_API_KEY` was unset and no WAV was supplied. Setup results and first-text timings for both modes remain unmeasured. On Windows or macOS with the key in the environment, run `node scripts/spikes/gemini-live.mjs "path/to/interviewer.wav" [model-id]` from the repo. Use an uncompressed mono 16-bit PCM WAV trimmed to one turn. The spike signals manual speech end at WAV EOF, runs TEXT then AUDIO plus transcription, and reports a nonzero exit if either mode produces no text.
- Windows validation: `npm run build:electron` and `npm run typecheck:electron` passed. `npm run test:auto-answer` had 191 passes and the known `AutoAnswerUsageTelemetry2026_09_27` failure. `npm run test:lib` had 3,242 passes and 15 skips. The compiled timing and adopted-dispatch tests passed 11/11. All 12 scenario entries passed structural validation. The mocked timing interval was 200 ms and is not a live baseline sample.
- Requires physical macOS verification and physical Windows verification of the native-stop-to-debugger path. The instrumentation uses the existing shared capture callback and does not change the platform capture implementations.

## Phase 0 review — 2026-11-25 (Claude)

- Dev timing reviewed: inert unless `NATIVELY_PROMPT_DEBUG=1` (main only records the interviewer speech-stop then), so normal runs are unchanged; first visible text is recorded once per armed generation, superseded generations are ignored. `main.ts` keeps `./llm/promptDebug` as its first evaluated import (now a named import, same side effect).
- Spike improved: `--auto-vad` lets Gemini's automatic activity detection end the turn (product behaviour) and streams 3 s of real-time silence after the question; default stays manual VAD (pure model latency). `done` now prints the response text (first 600 chars) and character count; socket close prints Google's close code and reason (never contains the key).
- Re-run on Windows: `build:electron` passed, `typecheck:electron` passed, Live Brain timing + settings tests 2/2, `test:auto-answer` 191/192 (same pre-existing `AutoAnswerUsageTelemetry2026_09_27` failure), corpus parses with 12 scenarios.
- Still to do by the user (needs a key / real meeting; not blocking Phase 1):
  1. Gemini spike: set `GEMINI_API_KEY` in the terminal, record one interviewer question as mono 16-bit WAV, run
     `node scripts/spikes/gemini-live.mjs question.wav` and `node scripts/spikes/gemini-live.mjs question.wav --auto-vad`. Paste the JSON lines (no key appears in them) to fill Q1 TEXT-mode behaviour and latency.
  2. Pipeline baseline: run Natively in dev with `NATIVELY_PROMPT_DEBUG=1`, hold a short practice meeting with Auto Answer on, then read `answerTimings` from the Prompt Debugger.
- Requires physical macOS verification.

## Open risks

- Gemini native-audio models may not support TEXT output → use output transcription (Phase 0 decides).
- Free-tier rate limits during long interviews.
- ~15-min Gemini session limit → rollover correctness.
- Timing changes in `SimpleAutoAnswer.ts` (Phase 1).
- macOS cannot be physically tested by the user → `Requires physical macOS verification`.
