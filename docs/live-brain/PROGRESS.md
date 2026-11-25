# Live Brain — Progress & Handoff

> Update this file at the end of every phase. It is the handoff contract between agents and sessions.
> Spec: [ARCHITECTURE.md](ARCHITECTURE.md) · Plan: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

## Phase status

| Phase | Status | Notes |
|---|---|---|
| UI — Settings UI (first) | ✅ Done (reviewed) | Implemented by Codex, reviewed and fixed by Claude. Windows settings checks passed. One pre-existing Auto Answer telemetry assertion fails (unrelated). |
| 0 — Verify facts & baseline | ✅ Done (reviewed) | Research, dev timing, corpus, spike committed. Gemini spike run on Windows (see "Gemini Live spike results"). Pipeline baseline (real meeting) still pending. |
| 1 — Corrections in pipeline | ✅ Done (reviewed) | Implemented by Codex, reviewed and fixed by Claude. Gated by the Live Brain switch. Physical S4/S5 check in a real meeting still pending. |
| 2 — Foundation | ✅ Done (reviewed) | Implemented by Codex, reviewed and fixed by Claude. Contracts, instructions, decide_turn tool, parser, factory, test double. No runtime wiring yet. |
| 3 — Orchestrator + overlay | ✅ Done | Injected ports, fake-clock tests, and offline renderer verification. |
| 4 — GeminiLiveBrain | Blocked at Step 0 | Five of eight spike runs missed the latency or decision gate. Steps 1–6 await a decision on the transcription-marker fallback. |
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

- 2026-11-25 — **Fast text path (D10):** user chose to add a faster text path after the spike showed Gemini transcription arrives at speaking pace. Gemini Live = listener + decider (`decide_turn` tool call); answer text written by the user's selected text model through Natively's existing answer path (AnswerWriter). Phase 4 starts with a tool-call latency spike.

- 2026-11-26 — **Scope:** Live Brain answers only interviewer speech. Typed questions, Direct Assist, manual "What to answer" presses, screenshots and all other modes keep default Natively behaviour (ARCHITECTURE §9a scope rule).

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

## Gemini Live spike results — 2026-11-25 (Windows, user's free key, `gemini-3.8-live`)

Input: one synthetic spoken question (Windows SAPI voice, 16 kHz mono, ~6 s): "Can you explain how you would design a URL shortener that can handle millions of requests per day?"

| Mode | Turn detection | Setup ready | Speech end → first text | Speech end → done | Result |
|---|---|---|---|---|---|
| TEXT | manual | 1.35 s | — | — | **Rejected:** close 1007 "The requested combination of response modalities (TEXT) is not supported by the model." |
| AUDIO + output transcription | manual (`activityEnd`) | 0.85 s | **0.90 s** | 25.8 s | 390 chars, correct and on topic |
| TEXT | auto | 1.45 s | — | — | Rejected (same TEXT limitation) |
| AUDIO + output transcription | **auto VAD** (product behaviour) | 1.55 s | **0.49 s** | 23.5 s | 396 chars, correct and on topic |

Findings (measured, single sample — repeat before tuning):

1. **Q1 resolved:** `gemini-3.8-live` does **not** accept `TEXT`. Live Brain must use `AUDIO` + `outputAudioTranscription`, discard the audio bytes, and display the transcription (ARCHITECTURE §4.1 fallback path becomes the only path for this model).
2. **First text is fast:** ~0.5 s after the interviewer stops with automatic VAD, ~0.9 s with manual VAD — inside the §11 target (median ≤ 1.5 s).
3. **The rest of the answer streams at speaking pace:** ~390 characters (~65 words) took ~23–26 s, i.e. ~150 words/minute. The transcription follows the generated speech, so a long system-design answer would take a minute or more to finish appearing. **This is a design-relevant finding** — decide before Phase 4 whether that pace is acceptable (the candidate speaks along at roughly the same speed) or whether long answers need a faster text path. Not decided yet; raised with the user.
4. Without Natively instructions the answer is generic ("I'd start with a load balancer…"); style is expected to come from the Phase 2 instructions.
5. **Key format:** the working Gemini key is 53 characters and does not start with `AIza`. The Phase UI format check (`AIza` + 35) would have rejected it — fixed in `electron/services/liveBrainSettings.ts` (now 30–200 chars of `[A-Za-z0-9._-]`) with a regression test.
6. Free-tier key worked for four sessions back-to-back; quota numbers still unverified.
7. TEXT output re-checked on the other Gemini Live models (2026-11-26): `gemini-3.1-flash-live-preview` and `gemini-2.5-flash-native-audio-preview-12-2025` reject TEXT with the same 1007 error; `gemini-3.8-live-extended-thinking` refused setup without a thinking level (TEXT untested). No current Gemini Live model tested accepts TEXT output.

## Phase 0 review — 2026-11-25 (Claude)

- Dev timing reviewed: inert unless `NATIVELY_PROMPT_DEBUG=1` (main only records the interviewer speech-stop then), so normal runs are unchanged; first visible text is recorded once per armed generation, superseded generations are ignored. `main.ts` keeps `./llm/promptDebug` as its first evaluated import (now a named import, same side effect).
- Spike improved: `--auto-vad` lets Gemini's automatic activity detection end the turn (product behaviour) and streams 3 s of real-time silence after the question; default stays manual VAD (pure model latency). `done` now prints the response text (first 600 chars) and character count; socket close prints Google's close code and reason (never contains the key).
- Re-run on Windows: `build:electron` passed, `typecheck:electron` passed, Live Brain timing + settings tests 2/2, `test:auto-answer` 191/192 (same pre-existing `AutoAnswerUsageTelemetry2026_09_27` failure), corpus parses with 12 scenarios.
- Still to do by the user (needs a key / real meeting; not blocking Phase 1):
  1. Gemini spike: set `GEMINI_API_KEY` in the terminal, record one interviewer question as mono 16-bit WAV, run
     `node scripts/spikes/gemini-live.mjs question.wav` and `node scripts/spikes/gemini-live.mjs question.wav --auto-vad`. Paste the JSON lines (no key appears in them) to fill Q1 TEXT-mode behaviour and latency.
  2. Pipeline baseline: run Natively in dev with `NATIVELY_PROMPT_DEBUG=1`, hold a short practice meeting with Auto Answer on, then read `answerTimings` from the Prompt Debugger.
- Requires physical macOS verification.

## Phase 1 — 2026-11-26

- With Live Brain on, a substantive interviewer final during an automatic answer or within 20 seconds of delivery immediately marks the affected visible row outdated. The judge receives the dispatched question and the new speech separately. A positive verdict sends both to the existing answer writer and cancels an active old stream. A silent, incomplete, low-confidence, or unavailable verdict restores the old row. Backchannels leave the stream alone. The regular Auto Answer path still applies with Live Brain off.
- The renderer uses the existing What to Answer IPC and answer row. It dims a live outdated row, preserves its text in an expandable fold once it stops, and labels the replacement “Updated”. The old generation's late tokens cannot reopen it.
- Windows automated validation: Electron build and both Electron and renderer type checks passed. Auto Answer had 198 passes and the known `AutoAnswerUsageTelemetry2026_09_27` failure. Library tests had 3,242 passes and 15 skips. Component tests had 1,001 passes and 2 skips. Seven fake-clock correction tests and the renderer generation regression passed. No live latency samples were collected.
- The same shared transcript and IPC paths apply to Windows and macOS. Requires physical Windows verification and physical macOS verification of the S4/S5 meeting scenarios and overlay presentation.


### Phase 1 review — 2026-11-26 (Claude)

- Fix: a self-contained new question asked within the 20 s window (e.g. "What happens if the database goes down?") was dispatched as `<previous question>
<new question>`, so the answer model would address both. Now a question-shaped utterance without a correction signal is answered on its own words; corrections ("Actually…", "…not allowed") still carry the previous question. Follow-up context still reaches the answer through the transcript window.
- Added tests: standalone new question answered on its own words; candidate (mic) speech mid-answer never marks, judges or cancels. `LiveBrainCorrections.test.mjs` 9/9.
- Verified switch-OFF parity by review: every new path is guarded by `correctionsEnabled()` / `replacesAutomaticAnswer`, which is only set when the switch is on.
- Re-run on Windows: `build:electron`, `typecheck:electron`, `typecheck:ts7` passed; `test:auto-answer` 200/201 (only the known `AutoAnswerUsageTelemetry2026_09_27` line-178 assertion; its later assertions were checked directly and pass); `test:components` 1001 passed, 2 skipped; `test:lib` 3242 passed, 15 skipped.
- To check in a real meeting (Live Brain on): when a correction cancels an answer that already streamed text, the partial row is kept and folded as "Outdated answer" — confirm it doesn't stay in a streaming state. "Updated" / "Outdated answer" labels are English-only until a translation pass.
- Requires physical macOS verification.

## Phase 2 — 2026-11-26

- Implemented the shared Live Brain and notebook contracts, including the `decision` event and aliases to the existing provider types. The exhaustive factory distinguishes known, unimplemented providers from unknown IDs. The scriptable fake records audio, candidate text, cancellation, and lifecycle calls.
- The Gemini decider builder has no answer-prompt imports in its composition. The full answer builder uses `UNIVERSAL_WHAT_TO_ANSWER_PROMPT` from the existing `WhatToAnswerLLM` legacy path, plus `MODE_TECHNICAL_INTERVIEW_PROMPT` for Technical Interview or `HUMAN_SPOKEN_ANSWER_CONTRACT` otherwise. The current universal constant does not embed the spoken contract. The explicit composition provides it once, including its nested `SPOKEN_ANSWER_CONTRACT`, without editing existing prompt text.
- Trimmed keeps `CORE_IDENTITY`, `EXECUTION_CONTRACT`, `CONTEXT_INTELLIGENCE_LAYER`, and `HUMAN_SPOKEN_ANSWER_CONTRACT`. It drops the universal mode's scenario-specific intent, discovery, and closing guidance, shared coding rules, and the dedicated Technical Interview decision and formatting blocks. Both answer variants add the same live protocol and supplied context. Output quality comparisons remain open.
- `decide_turn` has a provider-neutral JSON schema and a Gemini `functionDeclarations` adapter using `parametersJsonSchema`. Validation checks required text by action, trims it, and caps it at 2,000 characters for answers and 300 for clarifications. The streaming parser reuses `NO_ACTION_SENTINEL` from Prompt System v2 and tests split sentinels, quoting, whitespace, unchanged answer streaming, and literal mid-text sentinels. [Google Live tool use](https://aistudio.google.com/docs/live-api/tools) · [Function declaration schema](https://aistudio.google.com/api-reference/caching#FunctionDeclaration)
- Windows build and typechecks passed (`build:electron`, `typecheck:electron`, `typecheck:ts7`, `typecheck:premium`). The existing premium build scan compiled the new code. Foundation tests were 12/12, `test:auto-answer` was 200/201 with only the pre-existing `AutoAnswerUsageTelemetry2026_09_27` assertion failing, and `test:lib` was 3,242 passed with 15 skipped.
- There are no meeting-path imports or provider calls in this phase. Requires physical macOS verification when the provider and meeting integrations are implemented.


### Phase 2 review — 2026-11-26 (Claude)

- Fix: `buildAnswerInstructions` chose the Technical Interview prompt by matching the mode **name** against "technical interview". In Natively the mode name is the user's own label (`ModesManager.getActiveMode().name`, e.g. "My Google interview"), so real technical-interview modes would get the generic prompt. It now takes `modeTemplate` (the template id, `'technical-interview'`) and uses that; `modeName` is only shown as context. Test updated, plus a check that the name alone never selects the mode prompt.
- Checked: nothing outside `premium/electron/liveBrain/` imports it (no runtime effect). Gemini tool shape uses `functionDeclarations[].parametersJsonSchema`; real Gemini acceptance is verified by the Phase 4 spike.
- Re-run on Windows: `build:electron`, `typecheck:electron`, `typecheck:ts7`, `typecheck:premium` passed; Foundation tests 12/12; `test:auto-answer` 200/201 (known pre-existing failure only).
- Requires physical macOS verification (when wired into meetings).

## Phase 3 — 2026-11-26

- Added `ResponseOrchestrator` with injected writer, overlay, and clock ports. It tracks one current answer, folds a replaced answer, cancels an active writer when a new answer takes over, and clears the interviewer-speaking marker on wait. The replacement window is 20 seconds after delivery. The clarification timer is 10 seconds and is cancelled by interviewer speech, another answer, or reset.
- `decide_turn` now keeps the interviewer question on ask so the timeout can pass it to the writer with an assumption instruction. A questionless ask, including the provider-text ASK sentinel path, still displays its clarification without scheduling an answer.
- Text responses use the Phase 2 parser, drop deltas for closed or older response IDs, and use a generation namespace separate from the writer. The overlay adapter reuses the Phase 1 outdated/Updated events and the existing automatic answer card. The new Ask label and interviewer-speaking marker use existing muted styles. No provider or meeting integration was added.
- Windows automated validation: `build:electron`, `typecheck:electron`, `typecheck:ts7`, and `typecheck:premium` passed. Live Brain tests passed 23/23. Auto Answer had 200 passes and the known `AutoAnswerUsageTelemetry2026_09_27` failure. Library tests had 3,242 passes and 15 skips. Component tests had 1,002 passes and 2 skips.
- Offline Windows Chromium via agent-browser, using synthetic events and a stub preload bridge, confirmed matching Ask and answer card styles, speaking-marker removal, and the outdated fold. Electron IPC and live audio were not exercised. Requires physical macOS verification when integrated.

## Phase 4 — 2026-11-26

- The standalone `--decide` probe loads the compiled decider instructions, tool declaration, and argument parser. It opens a `gemini-3.8-live` AUDIO session with automatic voice activity detection, discards model audio, logs each tool call and parsed decision, and sends a tool response.
- Ran each scenario twice on Windows with the same locally synthesized 16 kHz mono PCM WAV for both attempts. The WAVs preserved the scripted pauses. Latency starts at the end of the paced speech WAV and ends at the first `answer` call. Trailing silence remained in the stream for automatic voice activity detection. These timings exclude the text writer and overlay.

| Scenario | Run | Latency | Raw `answer` arguments | Decision check |
|---|---:|---:|---|---|
| S1 — mid-question pause | 1 | 1,692 ms | `{"kind":"new","action":"answer","question":"How would you design a system that can handle millions of concurrent users?"}` | Correct question after the pause. Two `wait` calls before speech ended and one extra afterward. |
| S1 — mid-question pause | 2 | 1,861 ms | `{"question":"How would you approach designing a system capable of handling millions of concurrent users?","action":"answer","kind":"new"}` | Correct question after the pause. Two `wait` calls before speech ended. |
| S2 — multi-part question | 1 | 1,334 ms | `{"question":"How would you design a URL shortener? How does it handle high redirect traffic? And how would you scale the database as the link count grows?","kind":"new","action":"answer"}` | Correct. All three parts included in one call. |
| S2 — multi-part question | 2 | 1,307 ms | `{"kind":"new","action":"answer","question":"How would you design a URL shortener, handle high redirect traffic, and scale the database as the link count grows?"}` | Correct question, followed by four extra `wait` calls during trailing silence. |
| S4 — correction before the answer | 1 | 1,649 ms | `{"kind":"new","question":"Design a catalog service. Use PostgreSQL. Actually, let's assume MongoDB. How would you model the products?","action":"answer"}` | Retained the superseded PostgreSQL instruction alongside MongoDB. One extra `wait` call followed. |
| S4 — correction before the answer | 2 | 1,700 ms | `{"question":"Design a catalog service and model the products using MongoDB.","kind":"new","action":"answer"}` | Corrected question uses MongoDB. Three extra `wait` calls followed. |
| S7 — recovery question | 1 | 1,320 ms | `{"action":"answer","question":"What's the difference between horizontal and vertical scaling?"}` | Correct. The parser accepted the omitted optional `kind`. |
| S7 — recovery question | 2 | 1,325 ms | `{"action":"answer","kind":"new","question":"What's the difference between horizontal and vertical scaling?"}` | Correct. |

- All primary `answer` payloads parsed successfully. The extra calls all had raw arguments `{"action":"wait"}` and parsed as `wait`. Four runs exceeded 1.5 s. The S4 content error was among those four. S2's repeat was under 1.5 s but violated the instruction to call the tool once per interviewer turn. That makes five of eight runs with a latency or decision miss.
- Stopped at the gate. No brain, writer, reconnect logic, meeting wiring, Settings handshake, or Prompt Debugger integration was added. The existing Auto Answer and Phase 1 corrections remain the active path.
- Proposed §4.1 fallback for approval: have Gemini speak only `answer`, `wait`, or `ask: <question>` in AUDIO mode. Read the marker through `outputAudioTranscription` and discard the generated audio. Build the full question from `inputAudioTranscription` and Natively's transcript, then use the existing text writer for answers. Benchmark the marker against the same four WAVs before wiring it into meetings.
- Windows validation: `npm run build:electron`, `node --check scripts/spikes/gemini-live.mjs`, and `git diff --check` passed. All eight `node --env-file=.env scripts/spikes/gemini-live.mjs <wav> --auto-vad --decide` invocations exited 0, which means a parseable decision arrived, independent of the gate. The remaining Phase 4 suites and real meeting tests were not run. Requires physical macOS verification.

## Open risks

- Gemini native-audio models may not support TEXT output → use output transcription (Phase 0 decides).
- Free-tier rate limits during long interviews.
- ~15-min Gemini session limit → rollover correctness.
- Timing changes in `SimpleAutoAnswer.ts` (Phase 1).
- macOS cannot be physically tested by the user → `Requires physical macOS verification`.
