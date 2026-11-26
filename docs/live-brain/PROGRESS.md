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
| 4 — GeminiLiveBrain | Implemented | D11 accepted `decide_turn`. Steps 1–6 are in place. Live meeting validation and consistent S4 constraint replacement are still open. |
| 4b — Gemini writes the answer (D12) | Implemented | Task 0 accepted. Tasks 1–6 implemented with Gemini 3.1 Flash Live Preview as default. Tuned VAD passed the S1 pause case and exceeded §11's first-word targets. Real meeting and macOS verification remain open. |
| 5 — Notebook + Supervisor | Implemented | Bounded interview memory, answer-aware rollover, and legacy pipeline fallback. Windows backend live handoff verified. Full app capture, rendered status and physical macOS remain open. |
| 6 — OpenAI + ElevenLabs Realtime | Implemented | The user accepted ElevenLabs audio mode. Both providers share the Realtime client and fallback path. ElevenLabs Mini passed a live Windows backend replay. Live OpenAI validation needs a key with access to the configured Realtime model. |
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

- 2026-11-26 — **D12 replaces D10/D11 (user decision after the first live tests):** the goal is ChatGPT Voice behaviour, so Gemini Live writes the answer itself. Its audio is discarded and its output transcription streams into the overlay word by word as it speaks (never waiting for the full answer). Measured before the switch (2 live runs, Windows): speech end → decision 2.6 / 5.2 s, decision → first text 2.2 / 4.6 s (answer model was codex-cli via Fast Response Mode's Auto tier), first word 4.9 / 9.8 s. The D10 trade-off (a separate model writes the answer, so Gemini stops answering) was not stated clearly when D10 was offered; recorded here so it is not repeated.

- 2026-11-26 — **Phase 4b gate:** after the spike (first words median ~1.45 s, incremental transcription), the user accepted median ≤ 1.5 s / p90 ≤ 2.5 s and approved building Phase 4b on `gemini-3.1-flash-live-preview`, with end-of-speech tuning added as task 6.

- 2026-11-26 — **D13:** user asked to add ElevenLabs Realtime (`eleven_realtime_v1_mini` / `v1_max`) as a third provider, same card, same behaviour as Gemini and OpenAI. ElevenLabs states OpenAI-Realtime wire compatibility, so one shared protocol client. Built in Phase 6 after an ElevenLabs spike; text-only output is unverified.

- 2026-11-26 — **ElevenLabs spike accepted (user):** audio mode with the transcript shown and the audio discarded, because text-only produced no answers. Mini is the default; Max is labelled "slower (~3 s)". Late deltas are dropped after a cancel. If filler or `Ask:` sentinels are ignored, that is documented as a known limitation, with no local filtering.

- 2026-11-26 — **End-of-speech wait kept at 1.3 s (user):** Gemini stays at `silenceDurationMs` 1300 with low end sensitivity, and OpenAI and ElevenLabs keep `semantic_vad` low eagerness. This was chosen over a GPT-like ~0.5 s so that a mid-question pause (corpus S1, 1.2 s) does not trigger an answer. Phase 7 tuning must not shorten it without asking the user.

- 2026-11-26 — **D14, chat-style question → answer (user):** the user asked for ChatGPT-like chat: the interviewer's words stream into a bubble, and the answer appears under it. Chosen after comparing STT-only (A) with the provider transcript (B): B, with the existing STT as backup. B is about as easy because the same model hears the question and writes the answer, so they pair naturally; it streams word by word on Gemini; and it costs nothing extra. This replaces the earlier "skip it" on showing Gemini's transcript in chat.

- 2026-11-26 — **D15, no answers to filler (user):** after the D14 live check showed Gemini repeating its previous answer under a "Mm-hmm." bubble, the user chose both a stronger instruction for all providers and a local safety net that hides an answer under a filler-only bubble. This reverses the earlier "no local filtering" condition for ElevenLabs.

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

## Phase 4 spike — 2026-11-26

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
- Implementation paused at the original gate. D11 (`7b616e07`) then accepted `decide_turn` and revised the target to a median of ≤ 2.0 s. The original eight-run median was 1,491.5 ms. The transcription-marker fallback moved to Phase 7.
- Windows spike validation: `npm run build:electron`, `node --check scripts/spikes/gemini-live.mjs`, and `git diff --check` passed. All eight `node --env-file=.env scripts/spikes/gemini-live.mjs <wav> --auto-vad --decide` invocations exited 0, which means a parseable decision arrived, independent of the gate.

## Phase 4 — 2026-11-26

- Gemini Live uses AUDIO with auto VAD, input transcription, session resumption and context window compression. The app discards model audio, acknowledges each tool call with a matching ID, and suppresses decisions without intervening interviewer transcription or interruption. Candidate finals append as context-only turns and wait for an active provider turn to finish. `goAway` rolls over the connection using the latest resumable handle. Transient errors back off and retry. Authentication, quota, and exhausted retries go to the existing Auto Answer pipeline with Phase 1 corrections. [Google Live WebSocket reference](https://aistudio.google.com/api-reference/live) · [Session management](https://aistudio.google.com/docs/live-api/session-management)
- The meeting switch owns routing immediately. Windows WASAPI, Windows Chromium loopback fallback, and macOS CoreAudio/ScreenCaptureKit feed the shared system PCM callback. Only that callback forwards PCM to Gemini. Existing STT still supplies the visible transcript. The old automatic judge is suppressed while Gemini owns the meeting and takes over on failure even if its independent switch is off. Manual and typed paths keep their existing entry points. Settings runs a setup-only Gemini handshake. The dev Prompt Debugger records instructions, decisions, and the capture speech-stop, decision, first visible text, and completion timestamps.
- S4 was replayed twice on the same Windows WAV and `gemini-3.8-live` after the instruction change. Both commands exited 0. The median was **1,611 ms**. Only one of two questions removed the superseded constraint. The raw spike still records extra waits, and a mock WebSocket test verifies the production duplicate guard acknowledges and drops them.

| S4 rerun | Speech end → first answer | Raw `answer` arguments | Correctness |
|---|---:|---|---|
| 1 | 1,556 ms | `{"question":"Design a catalog service, and specifically, how would you model the products assuming we are using MongoDB?","kind":"new","action":"answer"}` | MongoDB replaced PostgreSQL. Three extra `wait` calls followed in silence. |
| 2 | 1,666 ms | `{"action":"answer","question":"Design a catalog service. Use PostgreSQL. Actually, let's assume MongoDB. How would you model the products?","kind":"new"}` | Both database constraints remained. |

- Windows validation: `npm run build:electron`, `npm run typecheck:electron`, `npm run typecheck:ts7`, and `npm run typecheck:premium` passed. Live Brain, Phase 1 corrections, Settings IPC, and baseline timing tests passed 50/50. `npm run test:auto-answer` passed 200 of 201 with only the known `AutoAnswerUsageTelemetry2026_09_27` “main.ts wires it” assertion failing. `npm run test:lib` passed 3,242 with 15 skipped. `npm run test:components` passed 1,002 with 2 skipped.
- Windows Electron CDP verified Settings → Audio shows the Live Brain section after Speech Provider and reports the missing key when testing without a key. The mock WebSocket test covers the successful setup-only handshake. The two S4 trials used synthetic speech and exercised the standalone probe. Real meeting S1–S9, physical capture, and end-to-end answer latency still need verification. Requires physical macOS verification.

## Post-Phase-4 fixes and settings — 2026-11-26 (Claude, Windows)

- **a2f86c04, 97ebe139 — core-smoke dev builds:** private `premium/` imports are externalized only when they resolve under `<root>/premium`, and they now point at the compiled copy in `dist-electron/premium` by absolute path, because the importer is inlined into its entry bundle (e.g. `dist-electron/electron/main.js`), where `../../premium/x` landed on the TypeScript source. Symptom was "Gemini Live is unavailable in this build" and "Auto Answer is off in this build" in `electron:dev:ultra`.
- **97ebe139 — overlay "Maximum update depth exceeded":** an unused `conversationContext` state was set on every `messages` change; during streaming it tipped React past its nested-update limit and no streamed answer rendered (Auto Answer and Live Brain alike). Removed; 0 loop errors in the next live run. Also logs `[LiveBrain] meeting start: Live Brain is on|off`.
- **120a4cd0, e2f85ac6 — keys and settings card:** dev builds prefer the `.env` key after a dedicated Live Brain key; the card matches the Speech Provider card; Live model list; working Save/Test.
- **895b3e8b — ElevenLabs Realtime settings** (see Phase 6 row).
- **Live timing, old D10 path (2 runs):** speech end → decision 2.6 / 5.2 s; decision → first text 2.2 / 4.6 s (codex-cli via Fast Response Mode's Auto tier); first word 4.9 / 9.8 s. Led to D12.
- Validation: Tested physically on Windows (dev build). Requires physical macOS verification.

## Phase 4b spike

**2026-11-26, Windows.** Ran one fresh Gemini Live session per case per model using `node --env-file=.env scripts/spikes/gemini-live.mjs <wav> <model> --answer`. Both model IDs accepted setup. The probe uses automatic VAD and `AUDIO`, enables both transcriptions, sends no tools, and discards the response audio. It composes the existing universal and Technical Interview prompts with the §6 spoken protocol. The fixture provides interview mode only.

The inputs were locally synthesized Windows speech, trimmed at the outer speech edges and replayed as 16 kHz mono PCM in 40 ms windows. S1, S2, S4, and S7 use the corpus wording and inter-step gaps with the synthesizer's own speaking durations. Filler was “mm-hmm, okay”. The ambiguous prompt was S8, “Design an e-commerce app.” The barge-in run replayed S2 and started S7 about 300 ms after the first nonblank answer chunk in the same session.

### Standalone turns

Times are in milliseconds from paced WAV speech end. The first chunk is the first nonblank transcription delta. Cadence is the median interval between nonblank chunks. Sizes are in characters (minimum / median / maximum), including whitespace in each chunk. Word counts come from the joined transcript. Last chunk measures when the answer text was fully available to the probe.

| Model | Case | First chunk | Chunks | Size | Cadence | Last chunk | `turnComplete` | Words | Answer quality |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 3.1 Flash Live Preview | S1 | 1,328 | 37 | 3 / 9 / 14 | 125.5 | 6,080 | 19,910 | 51 | First-person design with a real-time presence assumption. A premature “I'm assuming” appeared 1,639 ms before final speech end and was interrupted. |
| 3.1 Flash Live Preview | S2 | 2,253 | 60 | 4 / 9 / 17 | 126 | 9,371 | 29,102 | 87 | Covers the mapping, redirect and database scaling paths. Starts with a coaching phrase and adds a check-in at the end. |
| 3.1 Flash Live Preview | S4 | 1,594 | 37 | 4 / 8 / 18 | 131 | 6,440 | 20,475 | 50 | Concise, first-person MongoDB document design with embedded variants. Uses the corrected database. |
| 3.1 Flash Live Preview | S7 | 1,298 | 42 | 3 / 8 / 22 | 111 | 6,058 | 19,657 | 48 | Defines both scaling types with concrete examples and a short tradeoff. |
| 3.1 Flash Live Preview | Filler | 1,404 | 1 | 10 / 10 / 10 | — | 1,404 | 2,225 | 2 | Exact `No action.` |
| 3.1 Flash Live Preview | Ambiguous | 1,427 | 15 | 3 / 8 / 11 | 88 | 2,895 | 7,088 | 22 | Starts with `Ask:` and asks one useful question about scope. |
| 3.8 Live | S1 | 1,420 | 19 | 9 / 19 / 24 | 138.5 | 3,929 | 20,873 | 52 | Direct, first-person scaling answer. The mid-question pause triggered an interrupted `No action.` 1,628 ms before final speech end. |
| 3.8 Live | S2 | 1,453 | 26 | 9 / 15.5 / 33 | 146 | 5,064 | 28,195 | 73 | States its workload assumption and covers shortening, hot redirects and database sharding in candidate voice. |
| 3.8 Live | S4 | 2,461 | 19 | 10 / 19 / 24 | 165.5 | 5,571 | 21,614 | 59 | Direct MongoDB answer with a concrete tradeoff between embedding and linking variants. Uses the corrected database. |
| 3.8 Live | S7 | 1,339 | 18 | 8 / 19.5 / 26 | 134 | 3,730 | 19,921 | 53 | Explains both scaling types with examples. “Nearly limitless growth” overstates horizontal scaling. |
| 3.8 Live | Filler | 1,426 | 2 | 3 / 5 / 7 | 93 | 1,519 | 2,435 | 2 | Exact `No action.` across two chunks. |
| 3.8 Live | Ambiguous | 1,785 | 21 | 6 / 17 / 27 | 45.5 | 4,819 | 22,342 | 51 | Omits `Ask:` and assumes a large marketplace, then gives a concise architecture. |

### Barge-in

| Model | Turn | First chunk | Chunks | Size | Cadence | Last chunk | `turnComplete` | Words | Answer quality |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 3.1 Flash Live Preview | Original (S2) | 2,214 | 5 | 6 / 8 / 10 | 116.5 | 2,773 | 2,820 | 8 | Starts with a scale requirement and cuts off mid-thought. |
| 3.1 Flash Live Preview | Replacement (S7) | 1,288 | 22 | 3 / 7 / 20 | 104 | 3,928 | 11,470 | 27 | Concise candidate-ready explanation with a RAM example. |
| 3.8 Live | Original (S2) | 1,308 | 4 | 10 / 18 / 21 | 139 | 1,737 | 1,862 | 14 | Opens directly with expected read load and cuts off mid-thought. |
| 3.8 Live | Replacement (S7) | 1,279 | 9 | 11 / 19 / 31 | 120.5 | 2,229 | 10,667 | 28 | Concise explanation of both scaling types with CPU and memory examples. |

- **3.1 Flash Live Preview:** S7 began 319 ms after the first S2 chunk. The provider emitted `interrupted` 276 ms after S7 started. The replacement started 1,288 ms after S7 ended, about 4,433 ms from its start.
- **3.8 Live:** S7 began 308 ms after the first S2 chunk. The provider emitted `interrupted` 223 ms after S7 started. The replacement started 1,279 ms after S7 ended, about 4,425 ms from its start.
- Both stopped the original stream. Their last original text arrived before `interrupted` and no further original text arrived before that turn's `turnComplete`.

### Result and model recommendation

The medians below use completed standalone answers to S1, S2, S4, and S7, one sample per case. P90 uses nearest rank (the maximum with four samples).

| Model | Median first chunk (ms) | P90 first chunk (ms) | Median last chunk (ms) | Median `turnComplete` (ms) | Median words | Median of per-turn chunk sizes (chars) | Median of per-turn cadences (ms) |
|---|---:|---:|---:|---:|---:|---:|---:|
| `gemini-3.1-flash-live-preview` | 1,461 | 2,253 | 6,260 | 20,192.5 | 50.5 | 8.5 | 125.75 |
| `gemini-3.8-live` | 1,436.5 | 2,461 | 4,496.5 | 21,243.5 | 56 | 19 | 142.25 |

**Incremental transcription passed on both.** Gemini answered directly without tools or a separate text model. In the four standalone answer cases per model, 3.1 delivered 37–60 short word or phrase chunks and 3.8 delivered 18–26, with occasional partial words. The last text arrived 13.6–23.1 seconds before `turnComplete` across those runs. The probe measured text arrival at the socket and discarded audio. Audible playback and overlay paint were outside the spike.

**First-word latency failed the gate on both.** The first chunk arrived within 1,500 ms in two of four 3.1 answers and three of four 3.8 answers. Both missed §11's median ≤1,000 ms and p90 ≤1,500 ms targets. Neither is recommended for product integration at this gate. If follow-up measurement is approved, start with 3.1 Flash Live Preview because it used the exact `Ask:` prefix and delivered smaller chunks. Its premature S1 answer remains a turn-taking issue.

The user subsequently accepted Task 0 and revised §11 to median ≤1,500 ms and p90 ≤2,500 ms in `bbfd8948`. Gemini 3.1 Flash Live Preview became the Phase 4b default.

Windows validation used the 14 live `--answer` invocations, `node --check scripts/spikes/gemini-live.mjs`, `node --test premium/electron/liveBrain/__tests__/*.test.mjs` (44 passed), and `git diff --check`. The standalone probe uses shared Node APIs and has no platform branch. Reviewed but not executed on macOS. Requires physical macOS verification.

Official protocol references for this run include the [v1beta WebSocket endpoint](https://aistudio.google.com/api-reference/live/bidi-generate-content), [AUDIO and both transcription setup fields](https://aistudio.google.com/docs/live-api/capabilities#audio-transcription), [PCM input](https://aistudio.google.com/docs/live-api/capabilities#audio-formats), [automatic VAD and barge-in](https://aistudio.google.com/docs/live-api/capabilities#interruptions), and the [`outputTranscription`, `interrupted`, and `turnComplete` events](https://aistudio.google.com/api-reference/live#BidiGenerateContentServerContent).

## Phase 4b — Gemini writes the answer (D12)

Gemini uses AUDIO with input and output transcription, session resumption, and context window compression. The shared meeting path discards audio and sends output deltas through the existing What to Answer event path, with the same row rendering as Auto Answer. Spoken and bracket sentinels are recognized before text is displayed. Silence and `No action.` leave the current answer in place. `Ask:` updates one clarification row as text arrives, and the 10-second timeout sends the assumption instruction in a new Gemini client text turn. Gemini barge-in closes the in-flight response and suppresses its remaining chunks until the cancelled turn's boundary. The replacement folds the previous answer and displays as updated. Manual cancellation suppresses the current Gemini response locally until its turn boundary.

The session uses the configured answer-prompt variant (full by default), mode context, and the existing profile/resume/JD grounding builder when Profile Intelligence is enabled and the active mode allows it. That context is captured when the meeting session starts. The Prompt Debugger records the native speech stop when available, response start, first overlay-bound text, completion time, model, variant, and status. The existing writer and `decideTurnTool.ts` with its tests were kept for historical compatibility. The production Gemini meeting path instantiates neither the writer nor the tool. The spike retains `--decide` for comparing older measurements.

### End-of-speech tuning

On Windows, replayed the same SAPI PCM fixtures from Task 0 with `gemini-3.1-flash-live-preview`, using `node --env-file=.env scripts/spikes/gemini-live.mjs <wav> gemini-3.1-flash-live-preview --answer --vad=low,<silenceMs>,150`. All profiles used `END_SENSITIVITY_LOW` and 150 ms prefix padding. Quota errors initially blocked S2, S4, and S7; those nine cases succeeded on retry. Each table cell gives milliseconds from paced speech end to the first nonblank chunk / last chunk / `turnComplete`. P90 uses nearest rank with four runs per setting.

| Silence | S1 | S2 | S4 | S7 | First-chunk median / p90 | S1 pause |
|---:|---:|---:|---:|---:|---:|---|
| 900 ms | 1,456 / 3,308 / 8,711 | 2,233 / 8,472 / 25,753 | 1,566 / 4,812 / 12,722 | 1,417 / 6,236 / 19,535 | 1,511 / 2,233 | Premature `Ask: What`; rejected. |
| **1,300 ms** | **1,805 / 8,587 / 27,498** | **2,717 / 6,724 / 18,108** | **1,776 / 6,702 / 20,868** | **1,816 / 7,025 / 23,222** | **1,810.5 / 2,717** | One turn after the question; selected. |
| 1,600 ms | 2,131 / 5,930 / 19,983 | 3,158 / 9,038 / 25,529 | 2,057 / 7,068 / 21,325 | 2,071 / 4,055 / 12,414 | 2,101 / 3,158 | One turn after the question. |

The selected setting delivered text incrementally in each trial and was the fastest profile to protect the S1 pause. It missed both accepted §11 targets (median ≤1,500 ms and p90 ≤2,500 ms). These measurements stop at the socket and exclude capture and rendering. [VAD fields and sensitivity](https://aistudio.google.com/api-reference/live#RealtimeInputConfig.AutomaticActivityDetection) · [Output event order and activity signals](https://aistudio.google.com/api-reference/live#BidiGenerateContentServerContent) · [Client text turns](https://aistudio.google.com/api-reference/live#BidiGenerateContentClientContent) · [Resumable checkpoints](https://aistudio.google.com/api-reference/live#SessionResumptionUpdate)

Windows WASAPI and the Chromium loopback fallback share the PCM entry point with macOS CoreAudio and ScreenCaptureKit. The implementation affects the shared Gemini provider, meeting routing, and overlay. Native capture, playback, and packaging modules were outside the change.

Windows validation passed `npm run build:electron`, `node --test premium/electron/liveBrain/__tests__/` (49), `node --test electron/services/__tests__/LiveBrainSettings.test.mjs` (4), both requested `npx tsc --noEmit -p` checks, and `npm run typecheck:premium`. `npm run test:lib` passed 3,242 with 15 skipped. `npm run test:components` passed 1,002 with 2 skipped. `npm run test:auto-answer` passed 200 of 201. The `AutoAnswerUsageTelemetry2026_09_27` assertion at line 178 also fails against the pre-change `main.ts` on HEAD.

Two Windows live smoke tests replayed synthetic WAVs into the compiled meeting/provider and observed 21 and 27 incremental overlay-bound answer updates. The model answered both prompts directly, so the clarification timeout was verified with a fake clock and a mock WebSocket. Real meeting capture and renderer paint remain unverified. Reviewed but not executed on macOS. Requires physical macOS verification.

## Phase 4b review — 2026-11-26 (Claude, Windows)

- Reviewed 34917245: Gemini answers itself, output transcription → overlay, no AnswerWriter/decide_turn on the Gemini path, profile/resume/JD/mode context passed in. Build, 53/53 Live Brain + settings tests, both typechecks passed.
- **Live meeting bug found and fixed:** first words arrived 8.7 s after speech end. Trace showed Windows system capture delivers ~1,000 ms of audio per second during speech but only ~100 ms per second while the speakers are silent, so Gemini's 1.3 s end-of-speech silence took ~9 s of wall time. Fix in `GeminiLiveBrain`: a 100 ms silence pump pads the stream with zeros whenever it falls > 300 ms behind wall time (≤ 1 s per tick). Shared code; macOS capture may not go sparse, in which case the pump never fires.
- **After the fix (live meeting, Windows, synthetic interviewer voice through speakers):** native speech end → first answer text **1.0 s**; the whole answer text arrived within ~0.3 s of the first chunk (faster than speaking pace), `response_done` ~20 s later when Gemini's audio turn ended. One run; scenario corpus still to run.
- Tested physically on Windows. Requires physical macOS verification (capture sparseness on macOS unknown).

## Phase 5 — Notebook, supervisor, and pipeline

- `InterviewNotebook` retains provider interviewer transcripts, candidate speech, and completed answers in memory. The existing ConversationSummarizer builds deterministic notes in the background. The selected fast model (or Gemini Flash Lite when available) refines them through `LLMHelper`. The notebook caps rendered notes at 5,000 characters and keeps up to four minutes of recent turns under a separate 16,000-character limit. Meeting stop aborts pending summaries and clears memory.
- `BrainSupervisor` owns provider selection, readiness, and handoff. It skips unavailable or unimplemented realtime providers and uses the existing Auto Answer pipeline after a fatal failure. It retries the preferred provider on the next meeting. The pipeline adapter observes existing automatic response events for the notebook and status. Legacy generation IDs, rendering, and Phase 1 correction behavior stay with Auto Answer. The notebook is injected into the automatic answer prompt, including the V3 path. Manual and typed requests keep their existing routes.
- Gemini's transport keeps its resume handles, reconnect backoff, silence fill, and stale-output guard. Previously, `goAway` with a handle immediately cancelled a streaming answer. With a long enough deadline it now waits for the turn to complete or be interrupted, up to one second before expiry. An idle socket or a deadline under 1.5 s rolls immediately. If resumption fails, the supervisor starts a fresh seeded connection and replays buffered PCM. A fresh standby can prepare while the old connection answers, and the supervisor switches at a turn boundary when possible. [GoAway deadline](https://aistudio.google.com/api-reference/live#GoAway) · [Resumption checkpoints](https://aistudio.google.com/api-reference/live#SessionResumptionUpdate) · [Client history updates](https://aistudio.google.com/api-reference/live#BidiGenerateContentClientContent)
- The overlay uses its existing muted status style for Listening, Thinking, Answer ready, Reconnecting, and Backup brain. The dev Prompt Debugger records notebook sizes, provider switch reasons, and rollover durations. Notebook diagnostics carry counts and sizes.

### Windows live backend check

Replayed synthetic interviewer speech into the compiled Electron meeting and a real Gemini Live session, then forced an auth error locally at the transport boundary. The stored key stayed in place. With Gemini Flash Lite explicitly selected for the legacy text path, Gemini delivered 45 incremental updates and the pipeline handled the next follow-up once. The follow-up asked which channels the earlier constraint allowed without repeating the constraint. The answer retained email-only and proposed a secondary email provider. Earlier runs reached the pipeline with the constraint but the default text model in the isolated harness yielded a timeout notice. The check exercised backend handoff and answer generation with injected PCM and a follow-up STT final. Native capture, the full Auto Answer trigger in a live meeting, and actual overlay paint remain unverified.

Windows validation passed `npm run build:electron`, `node --test premium/electron/liveBrain/__tests__/` (63), `node --test electron/services/__tests__/LiveBrainSettings.test.mjs` (4), both requested `npx tsc --noEmit -p` checks, and `npm run typecheck:premium`. `npm run test:lib` passed 3,242 with 15 skipped, and `npm run test:components` passed 1,002 with 2 skipped. `npm run test:auto-answer` passed 200 of 201. The known telemetry assertion also fails on the pre-change `c957cf82` source. The fake-clock session ran 70 simulated minutes over five rollover boundaries, each with 550 ms of standby setup. Mock Gemini tests covered idle and interrupted rollover, turn completion, deadline cancellation, and silence fill after reconnection.

Windows WASAPI and its Chromium fallback and macOS CoreAudio/ScreenCaptureKit still deliver PCM through the shared capture callback. No native backend or packaging changes. Reviewed but not executed on macOS. Requires physical macOS verification.

### Phase 5 review fix: one notebook turn per interviewer question

- Found in review: Phase 5 treated every Gemini `inputTranscription` piece without `finished: false` as final. Gemini sends the interviewer's words as small pieces that usually lack `finished`, so each piece became its own notebook turn. Question detection kept only the piece with the "?" (" a cache?"), and the pieces pushed real turns out of the notebook's bounded history.
- Fix (`GeminiLiveBrain`): pieces are joined and emitted as a growing non-final transcript. One final turn is emitted when Gemini starts answering, at `turnComplete`, or on `finished: true`, so it always comes before `response_started`. The buffer clears on disconnect. New test: three pieces become exactly one final turn, "How would you design a cache?", before the answer starts.
- Validation: `npm run build:electron`, `node --test premium/electron/liveBrain/__tests__/` (64), `LiveBrainSettings.test.mjs` (4), `npx tsc --noEmit -p tsconfig.json`.
- Tested physically on Windows: a live meeting with interviewer audio through the speakers. 16 answers, all completed. From native speech end to first answer text, the median was 1.15 s; 15 of 16 were 0.77–1.27 s, and one was 2.52 s. The notebook's interviewer turns hold whole questions (for example "Good. Let's pivot. Requirements change again. … What happens?").
- Observed, not fixed: the notebook's earlier summaries read as generic recaps ("Focused discussion covering 10 topics. Started with: …"), and one began with a mis-transcribed non-English fragment. Needs review in Phase 7 tuning.
- Requires physical macOS verification.

## Phase 6, Step 0 — ElevenLabs Realtime spike (2026-11-26)

Windows standalone socket probe using the existing `ws` dependency and `buildAnswerInstructions` with the full Technical Interview prompt. The probe read `ELEVENLABS_API_KEY` from the environment populated by `node --env-file=.env`. It sent synthetic interviewer speech only. Audio emitted by the service was discarded.

### Protocol and pricing

- ElevenLabs documents an OpenAI GA Realtime-compatible WebSocket at `wss://api.elevenlabs.io/v1/convai/realtime` for `eleven_realtime_v1_mini` and `eleven_realtime_v1_max`. The documented browser flow sends `xi-api-key` to `POST /v1/convai/realtime/client_secrets` and sends the returned ephemeral value as `Authorization: Bearer <value>` on the socket. This flow worked for both models from Node. Direct `xi-api-key` on the WebSocket with an immediate `session.update` also negotiated both models, and a direct Mini S7 replay produced answer transcript deltas. Direct `session.created` initially reported Mini even when the URL requested Max. `session.updated` confirmed the requested model. Waiting for `session.created` before sending the update timed out on the direct route. Sending the long-lived key as a WebSocket Bearer credential closed with 4001. The public compatibility guide covers the ephemeral browser flow. [Compatibility guide](https://elevenlabs.io/docs/eleven-agents/guides/openai-realtime-compatibility) · [Client secret API](https://elevenlabs.io/docs/api-reference/conversations/create-client-secret)
- The live audio path accepted `session.update` with `type: "realtime"`, the model, instructions, `output_modalities: ["audio"]`, PCM input at 24 kHz, PCM output with voice `brian`, and `audio.input.turn_detection` set to `semantic_vad` with `eagerness: "low"`, `create_response: true`, and `interrupt_response: true`. The audio append format was base64-encoded mono PCM16 little-endian in `input_audio_buffer.append`, sent every 100 ms. Audio mode emitted `input_audio_buffer.speech_started`, `input_audio_buffer.speech_stopped`, `conversation.item.input_audio_transcription.completed`, `response.created`, `response.output_audio_transcript.delta`, `response.output_audio_transcript.done`, and `response.done`. [Session configuration mapping](https://github.com/elevenlabs/skills/blob/main/realtime/references/session-config.md) · [WebSocket audio reference](https://github.com/elevenlabs/skills/blob/main/realtime/references/browser-audio.md)
- The negotiated session default was 600 s. Client-secret requests with 60 and 7,200 s were accepted and echoed. A 7,201 s request returned HTTP 422. Timed expiry on an open socket was outside the probe. Published pricing is $0.08 per additional connected minute for both, plus input/output token prices per million of $0.20/$6.00 for Mini and $1.80/$9.00 for Max. The published above-concurrency rate is $0.16 per minute. [API changelog](https://elevenlabs.io/docs/changelog#october-19-2026) · [Realtime API pricing](https://elevenlabs.io/pricing/api)

### Text-only output

Both models echoed `output_modalities: ["text"]` at mint, `session.created`, and `session.updated`. The corpus attempts used a fresh session per model and case. S1, S2, S4, S7, filler, ambiguous, and the initial S2 barge-in turn all timed out without a speech event, input transcript, response event, or error. The barge-in trigger required a first text delta, so the second utterance was never sent in text mode. An S7 retry without automatic VAD returned `input_audio_buffer.committed` and conversation item events but produced no answer after an explicit `response.create` requesting text. Text-only output is therefore not usable with interviewer PCM in the tested flow.

### Audio mode with output transcription

The inputs were synthesized with Windows System.Speech and trimmed at the outer speech edges. The probe sent 300 ms of initial silence, paced the 24 kHz PCM in 100 ms frames, and kept sending silence between turns. S1 used the corpus question with a 1.2 s pause. S2 asked how to design a high-traffic URL shortener and scale its database. S4 asked for a product-catalog data model with PostgreSQL and corrected it to MongoDB after a 350 ms gap. S7 asked the difference between horizontal and vertical scaling. Filler was “Mm-hmm, okay.” The ambiguous prompt was “Design an e-commerce app.” The same fixtures ran in both output modes.

Times are milliseconds from the scheduled end of the replayed speech. First and last text are the first and last nonblank answer transcript deltas. The last delta is the full-text time for completed answers. Cadence is the median gap between nonblank deltas, rounded to milliseconds. The results measure socket delivery.

| Model | Case | First text | Last text | `response.done` | Deltas | Size (min / median / max chars) | Median gap | Words | Observed behavior |
|---|---|---:|---:|---:|---:|---|---:|---:|---|
| Mini | S1 | 1,411 | 1,419 | 35,980 | 56 | 1 / 10 / 25 | 0 | 88 | One answer after the full question. |
| Mini | S2 | 1,421 | 1,435 | 20,289 | 36 | 1 / 9 / 18 | 0 | 57 | Covered the shortener, traffic, and database. |
| Mini | S4 | 1,648 | 1,734 | 37,514 | 60 | 1 / 9 / 21 | 0 | 92 | Used MongoDB without mentioning PostgreSQL. |
| Mini | S7 (retry) | 1,137 | 1,140 | 21,614 | 25 | 2 / 12 / 23 | 0 | 50 | Answered both scaling types. |
| Mini | Filler | 2,095 | 2,095 | 9,351 | 14 | 1 / 8 / 21 | 0 | 24 | Responded without `No action.`. |
| Mini | Ambiguous | 805 | 854 | 19,692 | 33 | 1 / 10 / 17 | 0 | 54 | Responded without an `Ask:` prefix. |
| Max | S1 | 3,174 | 4,247 | 37,550 | 25 | 1 / 10 / 134 | 0 | 97 | One answer after the full question. |
| Max | S2 | 3,506 | 4,426 | 40,884 | 26 | 1 / 11 / 146 | 0 | 111 | Covered the shortener, traffic, and database. |
| Max | S4 | 3,252 | 3,850 | 40,006 | 29 | 1 / 11 / 148 | 0 | 99 | Used MongoDB without mentioning PostgreSQL. |
| Max | S7 | 2,248 | 3,062 | 31,624 | 15 | 5 / 12 / 149 | 0 | 78 | Answered both scaling types. |
| Max | Filler | 3,638 | 3,638 | 5,059 | 5 | 1 / 10 / 14 | 0 | 8 | Responded without `No action.`. |
| Max | Ambiguous | 2,577 | 3,121 | 31,001 | 9 | 1 / 13 / 161 | 12 | 79 | Responded without an `Ask:` prefix. |

The primary Mini S7 socket timed out before receiving any session events. The retry above completed, as did the initial audio-mode preflight with 1,125 ms to first text and 1,126 ms to last text. For S1, S2, S4, and S7 across the table, first-text median / p90 (nearest rank) were 1,416 / 1,648 ms for Mini and 3,213 / 3,506 ms for Max. Mini's answer deltas spanned 3–86 ms and arrived effectively as one burst per turn. Max sent clustered bursts covering 598–1,073 ms. The wire carries incremental deltas with no need to wait for `response.done`, which arrived much later. The interviewer transcript was reported via `conversation.item.input_audio_transcription.completed`.

### Barge-in

The probe started S7 during S2, about 300 ms after the first answer delta. On the new `input_audio_buffer.speech_started` it sent `response.cancel` for the original response. Both models emitted `output_audio_buffer.cleared`, ended the original with `response.done` status `cancelled`, and completed a new answer covering both scaling types.

| Model | S7 start after first S2 text (ms) | S7 start to speech event (ms) | S7 start to S2 cancellation (ms) | S2 deltas after sending cancel | S7 end to first / last text (ms) |
|---|---:|---:|---:|---:|---:|
| Mini | 348 | 395 | 690 | 51 | 1,040 / 1,041 |
| Max | 305 | 301 | 603 | 2 | 1,148 / 3,061 |

Old response deltas were still arriving between local cancellation and provider completion on both models. The shared client will need to discard them by response ID as soon as cancellation begins. The test had both automatic interruption and explicit cancel enabled, so it does not isolate which caused the provider to cancel.

### Review gate

The tested ElevenLabs path for D13 is audio output with the audio discarded and `response.output_audio_transcript.delta` forwarded as each event arrives. It uses the compatible GA WebSocket events, with burst delivery and missed filler and clarification sentinels in this sample. Step 0 ends here for user acceptance before provider implementation.

### Validation

- **Tested physically on Windows** for the live Node/WebSocket replay with synthetic PCM and the production prompt builder. Native meeting capture and actual overlay rendering were outside this spike.
- **Build validated on Windows.** `npm run build:electron`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.node.json`, and `npm run typecheck:premium` passed.
- `node --test premium/electron/liveBrain/__tests__/ electron/services/__tests__/LiveBrainSettings.test.mjs electron/audio/__tests__/OpenAISttSocketAndQuota2026_09_26.test.mjs electron/audio/__tests__/openaiTranscriptTurnCoalescer.test.mjs` passed all 85 tests. `npm run test:lib` passed 3,242 with 15 skipped.
- The broader baseline `node --test electron/audio/__tests__/` passed 1,066 with one skipped and three source assertions failing on the unchanged product code. The failures were in `MicEchoNotCountedAsUser2026_11_13.test.mjs`, `Recovered320Audio.test.mjs`, and `SttGapRecovery2026_10_15.test.mjs`.
- **Reviewed but not executed on macOS. Requires physical macOS verification.** The protocol replay uses shared Node APIs and existing instructions. The commit affects documentation only, with no shared or platform-specific application changes.

## Phase 6 — Realtime provider implementation (2026-11-26)

- **Accepted Step 0 and repeated the sentinel check.** With a stronger instruction, Mini returned the exact `No action.` sentinel for “Mm-hmm, okay.” in 2,092 ms, split across two deltas in one burst. On “Design an e-commerce app.” the reply was five words without the `Ask:` prefix. First and last text arrived at 882 ms. The shipped ElevenLabs prompt includes the tested wording. The existing spoken parser handles emitted sentinels, with no local filler classification. The rerun passed the filler condition for omitting the Settings hint. §4.5 records that sentinel compliance varies.
- **Step 1.** Extracted the OpenAI STT socket options, Bearer header, handshake verdict, backoff calculation, PCM resampler, and frame constants into `electron/audio/realtimeTransport.ts`. STT keeps the same entry points, model selection, retry behavior, and tests.
- **Steps 2–4.** Both brains use one GA WebSocket client with 24 kHz PCM append frames of 100 ms, sparse-silence fill, semantic VAD, candidate text context, bounded retries, and sanitized error codes. OpenAI requests text and emits `response.output_text.delta`. ElevenLabs uses the direct `xi-api-key` path, sends `session.update` on open, and displays `response.output_audio_transcript.delta`. Audio is discarded. Cancellation ends the local response immediately, and all further deltas for that provider response ID are ignored. [OpenAI Realtime conversation events](https://developers.openai.com/api/docs/guides/realtime-conversations) · [OpenAI Realtime client events](https://developers.openai.com/api/reference/resources/realtime/client-events) · [ElevenLabs compatibility guide](https://elevenlabs.io/docs/eleven-agents/guides/openai-realtime-compatibility)
- **Steps 5–7.** Both Settings connection tests negotiate a session without sending audio. Mini is the ElevenLabs default, and the model list labels Max “slower (~3 s)”. The factory creates both providers and the supervisor tries the selected provider, then configured realtime backups in the §9b order, then the existing pipeline. Provider-specific instructions, notebook seeding, status, and answer timing with provider and model use the shared meeting path. ElevenLabs opens its standby at 8.5 minutes for the negotiated 10-minute session default. Gemini's transport, silence fill, goAway, resumption, and transcript handling stay in its existing implementation.

### Live and cross-platform validation

- **Tested physically on Windows** for synthetic PCM replay through the compiled ElevenLabs Mini meeting path. Test Connection succeeded. S7 produced one interviewer transcript and 24 overlay-bound answer updates, with first text at 1,045 ms and last text at 17,007 ms from replayed speech end. The response completed and covered both scaling types. This replay exercised the shared audio entry point and overlay delivery callbacks.
- The OpenAI connection returned `model_not_found` for the configured `gpt-realtime-2.1`. The same key's successful model-list request showed no Realtime models. OpenAI behavior is covered by mock WebSocket tests. Live audio-to-answer validation needs a key with Realtime model access.
- **Reviewed but not executed on macOS. Requires physical macOS verification.** Windows WASAPI and Chromium loopback and macOS CoreAudio and ScreenCaptureKit supply PCM to the same shared meeting contract. The change affects shared Electron, settings, and overlay delivery paths. Native capture, actual renderer paint, and packaged builds were outside the replay.
- **Build validated on Windows.** `npm run build:electron`, both `npx tsc --noEmit -p tsconfig.json` and `npx tsc --noEmit -p tsconfig.node.json`, and `npm run typecheck:premium` passed. `npm run test:lib` passed 3,242 with 15 skipped.
- The combined Live Brain, Live Brain Settings, and STT test command passed 145 tests. The command was `node --test premium/electron/liveBrain/__tests__/ electron/services/__tests__/LiveBrainSettings.test.mjs electron/audio/__tests__/OpenAISttSocketAndQuota2026_09_26.test.mjs electron/audio/__tests__/openaiTranscriptTurnCoalescer.test.mjs electron/audio/__tests__/SttEndpointLatency2026_09_23.test.mjs electron/audio/__tests__/SttProviderTerminalErrors2026_11_01.test.mjs`. The broader `node --test electron/audio/__tests__/` again passed 1,066 with one skipped and the same three baseline source assertion failures listed under Step 0.

## Phase 7 — Tuning and physical validation (2026-11-26)

### Clarification decision and notebook notes

- The user confirmed that every completed realtime `Ask:` starts the 10-second timer. The same brain answers under an assumption by calling `requestClarificationAnswer` without a transcript prerequisite. The legacy AnswerWriter path still requires the original question. Architecture §7 rule 6 now records both cases. Existing tests cover the realtime timer with no transcript, cancellation when interviewer speech arrives, and the AnswerWriter path with and without the original question.
- The generic “Focused discussion covering … topics. Started with: …” text comes from `ConversationSummarizer.summarizeNarrative`. The notebook inserted it on every deterministic pass. The formatter copied the first transcript entry directly, so a mis-transcribed opening could appear in the notes even if the LLM returned no result. The original Phase 5 trace does not establish whether refinement subsequently ran or what produced the input fragment.
- The shared notebook now builds deterministic notes from interviewer requirements and constraints, candidate commitments, facts from both speakers, and resolved clarifications. It keeps structured details ahead of the freeform summary in the bounded notebook and gives the refinement model the recorded evidence with instructions to omit unintelligible fragments. Recent turns remain verbatim for session seeding. Tests cover a missing refinement result, the fallback's evidence selection, and the next refinement's input.

### Windows live replay

The corpus used locally synthesized 16 kHz mono PCM paced in 40 ms frames through the compiled meeting paths. Clause gaps used the offsets in the corpus. Candidate remarks entered as labeled final candidate context, as they do after mic STT. Reported times are milliseconds from the relevant paced speech end to the first visible nonblank text and the last changed text. Provider turn completion can come much later. These replay timings are at the overlay delivery boundary. The ElevenLabs trials used the shipped Mini audio configuration and discarded output audio. Pipeline trials used the existing STT → Auto Answer → What to Answer path with ElevenLabs Scribe and Groq. Deepgram rejected the available key, and Gemini Flash-Lite and OpenAI produced failure notices in initial pipeline runs. S11 injected Gemini transport faults through a local relay to the real service. Pipeline S11 stopped or restarted the real STT adapter at the fault boundary.

#### Gemini and PipelineBrain

| Case | Gemini Full | Gemini Trimmed | PipelineBrain |
|---|---|---|---|
| S1 | Pass, 1,788 / 6,192. One answer after the pause. | Pass, 1,761 / 7,842. One answer after the pause. | Pass on retry, 8,485 / 8,852. First attempt showed a timeout at 12,456 ms. |
| S2 | Fail, 1,717 / 7,259. Covered redirects and sharding, omitted URL creation. | Fail, 1,876 / 6,118. Covered lookup, redirects, and sharding, omitted URL creation. | Pass, 2,792 / 3,171. Covered creation, lookup, redirects, and sharding. |
| S3 | Pass, 1,991 / 5,436 on the follow-up. Explained Redis and TTL for hot links. | Pass on retry, 2,074 / 4,094 on the follow-up. Explained Redis for heavy read traffic. | Fail, 4,989 / 4,990 on retry. The follow-up answered a career question about the mistranscribed “Reedy's”. The initial run showed a rate-limit notice. |
| S4 | Pass, 2,339 / 7,044. Modeled products in MongoDB. | Pass, 1,671 / 7,271. Modeled products in MongoDB. | Pass, 5,424 / 5,983. Modeled products in MongoDB. |
| S5 | Pass, 1,824 / 4,745 for replacement. Old answer folded. | Pass, 1,804 / 5,050 for replacement. Old answer folded. | Fail. The original answer appeared at 4,692 / 5,291 ms, was marked outdated, and got no replacement. Retry also got no replacement and restored the old row. |
| S6 | Pass, 1,881 / 6,790. One answer about regional failover. | Pass, 1,871 / 5,921. One answer about regional failover. | Pass, 5,526 / 5,750. One answer about regional failover. |
| S7 | Pass, 1,812 / 5,396. Defined both terms and gave a spoken example. | Pass, 1,832 / 1,832. Defined both terms with examples. Text arrived in one chunk. | Pass, 6,134 / 6,293. Defined both terms with examples. |
| S8 | Fail, 1,886 / 6,358. Asked questions inside an ordinary answer. | Fail, 1,837 / 1,837. Answered directly. | Fail, 5,876 / 6,416. Answered directly. |
| S9 | Fail, 1,670 / 7,505 for final answer. Two visible responses during pauses. | Fail, 1,675 / 7,309 for final answer. Two visible responses during pauses. | Fail. Rate-limit notices at 9,141 ms and 9,898 ms on retry after the complete prompt. |
| S10 | Blocked by Gemini quota at the second question. First answer 1,959 / 8,512. | Context passes at 70 minutes, 1,734 / 6,039. Recommended multiple email providers, preserving the email-only rule. Rollover continuity fails. One of eleven questions went unanswered when the session rolled near the end of the 63-minute question. | Pass on the 70-minute context check, 4,057 / 4,184. Recommended a second email provider and explicitly ruled out SMS and push. Eight of eleven turns produced substantive answers. The remaining turns showed one timeout and two rate-limit notices. This replay began with the first structured-notes build. Tests also cover the final extractor. |
| S11 | Quota and 10 s drop pass. Follow-up 5,020 / 5,249 and 5,431 / 5,596 on pipeline fallback, respectively. Socket kill fails, 2,603 / 7,436. Gemini reconnected and answered but lost the 15-minute requirement. | Socket kill fails, 1,785 / 6,871. Gemini reconnected and lost the freshness requirement. The network and quota cases switched to pipeline, then showed rate-limit notices at 9,434 and 9,420 ms. | Quick STT restart passes, 5,245 / 5,453 for the follow-up on 15-minute freshness. The 10 s restart fails. Original 7,874 / 8,231, then no follow-up in 35 s despite STT recovery. A terminal STT shutdown modeling exhausted quota failed with no follow-up, as the pipeline sits at the end of the fallback chain. Original 7,270 / 7,777. |
| S12 | Fail, original 1,886 / 2,330. Cancelled on first backchannel. Replacement 1,692 / 11,200 after the final backchannel. | Inconclusive for interruption, 1,891 / 1,891. One burst completed before the filler began. Filler produced no replacement. | Fail. Timeout notice at 11,942 ms and rate-limit notice at 9,934 ms on retry. Neither trial produced an answer to interrupt. |

No completed S8 turn used the exact `Ask:` prefix in four Full, two Trimmed, or one Mini live samples. In one of the Full probes, the harness called `requestClarificationAnswer` 10,001 ms after the provider completed its initial turn. The same session began a stated-assumption answer 964 ms after the request. That probe exercised the live fallback transport. Fake-clock coverage verifies that one completed `Ask:` triggers one request at 10 seconds, and that interviewer speech cancels the timer. No runtime clarification code changed.

#### Architecture §11 targets and default recommendation

- Across S1/S2/S4/S7, the first-text median and nearest-rank p90 were **1,800 / 2,339 ms Full** and **1,797 / 1,876 ms Trimmed**. Both passed the 2,500 ms p90 budget and missed the 1,500 ms median by about 300 ms. Median full-text times were 6,618 ms Full and 6,695 ms Trimmed. Both protected S1's 1.2-second pause and answered prematurely during S9.
- Full streamed visible text in 33–49 updates across all four common scenarios. Trimmed streamed 40–48 updates in three of four but delivered all of S7 in one update. Its S12 answer also arrived in one update. On this small sample, **keep Full as the default** for the more consistent streaming cadence. The current default stays in place.
- The S5 replacement began at **1,824 ms Full** and **1,804 ms Trimmed** after the correction, meeting the 2,000 ms target. The marker followed the provider speech-start event in the same millisecond on both runs. From the correction PCM onset to the marker, wall times were 231 ms Full and 245 ms Trimmed. These measurements stop at the overlay port.
- The complete Trimmed S10 run crossed seven provider `goAway` boundaries. Reconnecting-to-Listening gaps were 1,032, 793, 798, 1,130, 773, 825, and 719 ms. Two exceeded the 1,000 ms target. The seventh began 206 ms before the 63-minute question ended, and that question received no answer. The final question completed at 70 minutes and retained the original restriction. The existing 70-minute automated simulation passed its seeded-rollover and in-flight answer assertions.
- The production endpoint settings remain at the approved 1,300 ms and low Gemini sensitivity, and low semantic VAD eagerness for OpenAI and ElevenLabs. S9's late 1.6–1.7 s pauses exceeded the fixed Gemini end-of-speech interval. The measurement identifies a turn-taking gap and does not establish a better setting.

#### ElevenLabs Mini

| Case | Expected result | First / last text (ms) | Observation |
|---|---|---:|---|
| S1 | Pass | 1,544 / 1,599 | One answer after the full question. |
| S2 | Pass with a quality issue | 1,301 / 1,491 | Discussed link creation, redirect cache, and distributed storage. Its assumed write rate was inconsistent with its stated daily volume. |
| S4 | Fail | 1,840 / 1,841 | Proposed a document model without identifying MongoDB as the store and opened by discussing missing profile context. |
| S7 | Pass | 1,591 / 1,593 | Added servers versus CPU or RAM on one server. |
| S8 | Fail | 2,153 / 2,153 | Answered directly. No `Ask:`, so the timer did not start. |
| S12 | Fail | 1,826 / 1,834 (original only) | First backchannel interrupted the original turn even though its text had already arrived. No replacement was displayed. |

Four comparable standalone cases (S1/S2/S4/S7) gave Mini a first-text median / p90 of 1,568 / 1,840 ms (nearest-rank p90). Mini emitted 20–103 chunks in those cases, generally in one burst. No local filler rule was added.

### Windows packaging and macOS review

- **Tested physically on Windows (dev).** The isolated `npm run dev:agent` launcher showed the Live Brain Audio card with Mini default and Max labeled “slower (~3 s)”. The in-app Test Connection IPC succeeded. Started a meeting, played the S7 fixture through the Windows speaker path, confirmed native WASAPI system capture (48 kHz device to 16 kHz), and observed the scaling answer in the overlay renderer. Ended the meeting and restored the isolated profile's initial Live Brain selection and toggle.
- `npm run app:build` reached the packaged asset check and found four missing multilingual-e5-small files. `node scripts/download-models.js` retrieved and hash-verified them. The subsequent source asset check passed. The existing NSIS packaging preflight then refused the build because `GOOGLE_CALENDAR_CLIENT_SECRET` was absent. An installer requires that release credential.
- The existing unpacked Windows x64 build completed and passed `node scripts/verify-packaged-local-assets.mjs --app release/win-unpacked --platform win32`. Its ASAR contains the renderer, main bundle, and premium Live Brain modules and excludes `.env`. The executable reached launcher creation and completed startup with `appPackaged: true`. A separate Electron harness loaded the real Live Brain factory from the ASAR, passed the Mini Test Connection call, and streamed S7 in 29 updates (1,609 / 1,613 ms). The first packaging run encountered a workspace-addon rebuild lock. The final `node scripts/package-app.js --win --dir --x64` run rebuilt both workspace addons successfully, passed the unpacked asset check again, booted, passed the ASAR Test Connection again, and answered S7 in 21 updates (1,599 / 1,602 ms). The installed Settings UI and a meeting through native capture still require an installer run.
- macOS default and signed configurations share the `dist-electron` inclusion rule. The normal build includes compiled premium modules, and the loader uses bundled or relative compiled imports. The absolute-path core-smoke resolver is development-only. No packaging configuration or native code changed.

### Regression and baseline

`npm run test:ci` stopped at its `npm test` stage on the pre-change commit `b1572188` and again after the Phase 7 change. The baseline had 18,517 passes, 14 failures, and 124 skips. The final run had 18,520 passes, 13 failures, and 122 skips. These 13 failures reproduced before the Phase 7 edits:

1. `MicEchoNotCountedAsUser2026_11_13` — main keeps the echo final out of the session and retrieval.
2. `Recovered320Audio` — missing and unknown providers remain off while echo reaches display and Auto Answer.
3. `SttGapRecovery2026_10_15` — main feeds both captures and opens recovery only on retryable cloud outages.
4. `AutoAnswerAdoptedDispatchReliability2026_11_23` — adopted draft with a tracked promise completes.
5. `AutoAnswerAdoptedDispatchReliability2026_11_23` — adopted draft without a tracked promise completes.
6. `PhoneMirrorPhoneActions2026_09_27` — phone expects the desktop What to Answer label.
7. `StealthShortcutGuard` — shortcut-only tap starts without overlay bounds.
8. `TelemetryEmissionSites` — production meeting teardown emits `meeting_stop`.
9. `WhatToAnswerSnapshotWiring` — a newer request aborts the previous provider request at entry.
10. `WtaActiveCodingProblemSpoken2026_11_15` — critique keeps the active problem.
11. `WtaActiveCodingProblemSpoken2026_11_15` — follow-up without later discussion names only the problem.
12. `WtaActiveCodingProblemSpoken2026_11_15` — additional talk keeps the same problem.
13. `AutoAnswerUsageTelemetry2026_09_27` — main wires usage telemetry to the engine and meeting lifecycle.

The baseline-only `CatalogInstallIntegrity2026_10_09` bundled-embedding check passed after the model assets were installed. The first post-change run had three additional file-level failures while the dev app was building and starting. `EvidenceResolverWiringIdentity2026_07_12`, `LLMHelperNegotiationCoachingGate`, and `PhoneChatRouteOptions` all passed on the subsequent full run with the dev app closed. They also passed on the pre-change run.

Ran the skipped CI stages separately. `npm run test:lib` passed 3,242 with 15 skipped, `npm run test:components` passed 1,002 with two skipped, and `npm run test:scripts` passed 356 with three skipped. `npm run test:company-research-spend` passed. `npm run test:intelligence` had 3,296 passes and nine failures, all in `HotkeyTurnsRecorded2026_10_28`. The same nine cases failed with the production source restored to `b1572188`, after which the Phase 7 notebook source was restored:

1. Screenshot Code Hint enters the conversation with its screenshot (line 116).
2. The problem statement names the hint turn (line 129).
3. Brainstorm enters the conversation (line 139).
4. Presses on one queued screenshot give it a stable identity (line 150).
5. Code Hint and Brainstorm name optimized screenshot copies consistently with What to Answer (line 167).
6. An empty result keeps the screenshot and drops the canned failure (line 208).
7. A provider failure keeps the screenshot and omits the failure text from the conversation (line 217).
8. A press running across meeting start stays in its original conversation (line 250).
9. Brainstorm retains its screenshot while “explain that” refers to the last answer (line 369).

- **Build validated on Windows.** `npm run build:electron` and `npm run typecheck:premium` passed. `node --test premium/electron/liveBrain/__tests__/ electron/services/__tests__/LiveBrainSettings.test.mjs` passed 84 tests. The unpacked package, asset verification, and native Windows dev replay are described above.
- The shared changes affect notebook notes and their use during provider rollover and fallback. No platform-specific source, settings defaults, provider transport, capture code, or installer configuration changed. Windows WASAPI and macOS Core Audio/ScreenCaptureKit continue to use the same PCM boundary. A transcript error can still affect the raw recent context or a model response, as seen in S3.
- **Reviewed but not executed on macOS. Requires physical macOS verification.** **Requires physical Windows verification** for the installed NSIS build when its release credential is available.

## Phase 7 review fix: Gemini rollover no longer loses a question (Claude, Windows)

- Cause (S10, 63-minute question): on `goAway` with a resume handle, `scheduleRollover` rolled over immediately whenever no answer was streaming, including while the interviewer was mid-question. The old socket took the first part of the question with it, and the new session heard only the last ~206 ms, so it never answered. The same gap existed between speech end and the first answer text, and after an `interrupted` (the interviewer talking again).
- Fix (`GeminiLiveBrain`):
  - A rollover now waits while the provider turn is busy: interviewer speaking, waiting for the answer, or answer streaming. It runs at the next idle `turnComplete`; `interrupted` is no longer a rollover point.
  - It still rolls one second before the deadline. If the deadline lands mid-question, the last 10 s of interviewer audio (ARCHITECTURE §9) is replayed into the new session.
  - A streaming answer cut by the deadline is cancelled, as before. Idle rollovers stay immediate.
  - Resumption, backoff, silence fill and late-delta dropping are unchanged.
- Tests: the interruption test now expects the rollover after the new interviewer turn completes. New tests cover a goAway mid-question (waits for the turn) and a deadline mid-question (the question audio reaches the new session). 82 Live Brain tests and 4 Settings tests pass; `npm run build:electron`, `npx tsc --noEmit -p tsconfig.json` and `npm run typecheck:premium` pass.
- Not fixed: two of seven reconnect gaps exceeded 1 s (1,032 and 1,130 ms). That is setup time to Google, not lost audio, because audio is buffered during the reconnect.
- Not re-run live: the 70-minute replay. Requires physical macOS verification.

## ElevenLabs live meeting + notebook fix for cancelled answers (Claude, Windows, 2026-11-26)

- Tested physically on Windows: a live meeting on ElevenLabs Realtime Mini, with the user's dedicated key (Test Connection passed) and real interviewer audio through the speakers. 10 answers came through. From native speech end to first text, the median was 1,456 ms, p90 2,022 ms, and the range 598–2,181 ms, which meets the §11 targets. No fallback or connection errors.
- 8 of the 10 answers ended `cancelled`. ElevenLabs keeps its audio turn open for 10–20 s after the text is shown, and the interviewer's next words ("Sure. Next one.") interrupt that turn. On screen a cancelled answer keeps the text it already showed. But `BrainSupervisor` saved only `completed` answers to the notebook, so follow-ups lost those answers. The same applies to Gemini when the interviewer talks before Gemini's audio turn ends.
- Fix (`BrainSupervisor`): a cancelled answer that already showed text is saved to the notebook like a completed one. An empty cancelled answer and failed answers are still not saved. New test in `BrainSupervisor.test.mjs`. 83 Live Brain tests pass; build, `npx tsc --noEmit -p tsconfig.json` and `npm run typecheck:premium` pass.
- Not checked: filler and `Ask:` behaviour on screen (the meeting ended before the overlay was read). Requires physical macOS verification.

## D14 chat-style question -> answer (Claude, Windows, 2026-11-26)

- Built: `ResponseOrchestrator` turns the provider's interviewer transcript into one bubble per turn. The bubble streams while the interviewer speaks (Gemini), closes when its answer starts, and is linked to that answer. A transcript that arrives late (OpenAI Whisper) is placed above its answer. When the provider sent no transcript for a turn, the existing STT final fills the bubble (`noteSttTranscript`, wired in `meeting.ts`); a later provider transcript replaces that text, and a stale STT final (> 8 s) is not used. Filler turns get a bubble with no answer. The overlay shows each bubble as the existing `role: 'interviewer'` row (pulsing dot while streaming), via `liveBrainQuestion` on the What to Answer event and `src/lib/liveBrainChat.mjs` (keeps a late bubble above its answer).
- First live check, Gemini, Windows: all 7 questions appeared as interviewer bubbles in order, each directly above its answer. But answers 2-6 were collapsed as "Outdated answer". The old §7 rule marks the previous answer outdated whenever a new one starts within 20 s, so a quick round of questions hid every answer but the last.
- Fix (user approved): a realtime text answer stays visible. It is marked outdated only when the interviewer cut it off mid-stream, meaning its text grew within 1.5 s of the interviewer speaking or of a provider cancel (Gemini reports the cancel before the speech start). The same rule applies to an `Ask:`. The pipeline/AnswerWriter paths are unchanged.
- Tests: 7 new orchestrator tests (bubble streaming and closing, filler, a late transcript, STT backup and replacement, a stale STT final, a finished answer kept visible, a mid-stream cut-off marked outdated) and 3 overlay placement tests. One existing test now includes the interviewer's speech before its replacement. 90 Live Brain tests, 3,245 lib tests and 1,002 component tests pass; `npm run build:electron`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p electron/tsconfig.json` and `npm run typecheck:premium` pass.
- Requires a live re-check of the outdated rule, and physical macOS verification.

## D15 filler answers (Claude, Windows, 2026-11-26)

- Cause (D14 live check, Gemini): the interviewer said "Mm-hmm." while Gemini's previous audio turn was still open (~18 s). Gemini's speech detection counted it as an interruption (that answer ended `cancelled`), and Gemini then answered the memory-leak question again under the "Mm-hmm." bubble. The existing "filler -> No action." instruction did not stop it.
- Fix, both layers:
  - `FILLER_TURN_RULE` is added to every realtime provider's instructions (Gemini, OpenAI, ElevenLabs). It says a filler-only turn gets exactly `No action.`, and the model must never repeat, continue or rephrase its previous answer because of filler, including right after an interruption.
  - In `ResponseOrchestrator`, when a turn's interviewer bubble is only filler words (`isFillerOnly`), that turn's answer is not shown and the previous answer stays current. While an `Ask:` is waiting, a short reply ("Yes.") is still answered.
- Not covered: a filler bubble that arrives only after its answer started (OpenAI's late Whisper transcript) is not filtered, and the hidden answer's text is still saved to the notebook.
- Tests: the filler word list, a hidden answer under "Mm-hmm." (the next real question is answered normally), a "Yes." after an Ask is answered, and every provider getting the rule. 94 Live Brain tests pass; build and all three typechecks pass. Needs a live check. Requires physical macOS verification.

## Open risks

- Gemini native-audio models may not support TEXT output → use output transcription (Phase 0 decides).
- Free-tier rate limits during long interviews.
- ~15-min Gemini session limit → rollover correctness.
- Timing changes in `SimpleAutoAnswer.ts` (Phase 1).
- macOS cannot be physically tested by the user → `Requires physical macOS verification`.
