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
| Amazon Sonic (D18) | Implemented | Nova 2.5 Sonic and Nova 2 Sonic are available as an optional text-output Live Brain. Mocked transport and supervisor coverage passed. Live AWS and physical audio capture verification remain open. |
| 7 — Tuning & validation | ☐ Not started | |
| 8 — Deepgram Voice Agent (D16) | ✅ Done | Implemented `'deepgram-voice-agent'` with Deepgram-managed and public BYO HTTPS endpoints, 16 kHz raw binary PCM transport, 25k managed prompt cap, grouped Settings picker, and mocked tests. Windows dev live meeting verified after the review fixes. Physical macOS and packaged Deepgram checks remain open. |
| 9 — Deepgram Flux + My AI Provider (D17) | ✅ Done | Implemented `'deepgram-flux'` standalone `/v2/listen` STT (`flux-general-multi`) routed into Natively's existing `AnswerWriter` / `IntelligenceEngine` streaming answer engine, supporting all configured AI Providers (OpenAI, Claude, Gemini, Groq, OpenRouter, Codex CLI, Antigravity, local Ollama, DeepSeek, NVIDIA NIM, custom). All builds, typechecks, unit/component tests, and Windows side-by-side live benchmarks passed. The later baseline covers Windows Electron replay. Physical macOS verification remains open. |
| Baseline 1 — Flux vs GPT Realtime & Gemini Live | ✅ Done | Measured Windows Electron app (`dev:agent` WASAPI loopback) on 6 synthetic interview scenarios across `deepgram-flux` (`codex-cli` and `openai/gpt-4o-mini`) and `gemini-live` (`gemini-3.1-flash-live-preview`). OpenAI Realtime (`gpt-realtime-2.1`) setup was rejected on the available account and no Realtime model appeared in its model list. Documented the filler duplicate, completed-answer fold, and the clarification scenario that could not be reached. Physical macOS verification remains open. |
| Baseline 2 — Flux Private Draft | ✅ Done | Verified on Windows Electron (`dev:agent` WASAPI loopback, `deepgram-flux` / `flux-general-multi` + `codex-cli`, Technical Interview, `full` prompt) vs fresh `5c092319` baseline worktree. S1 first overlay text dropped from `6,024` / `6,628 ms` to `2,471` / `2,863 ms` (smoke `2,322 ms`); S2 pause held with 2–3 `turn_resumed` draft discards and 1 final answer (`4,863` / `4,054 ms` vs `6,290` / `4,499 ms`); S4 cancelled Q1 cleanly with no stale chunks (`6,329` / `7,966 ms` vs `6,554` / `3,517 ms`, cause of the timing difference unverified). All 126 Live Brain tests, build, and typechecks pass. Physical macOS verification remains open. |
| Baseline 3 — Flux Interruptions & Corrections | ✅ Done | Reproduced S3 filler bubble (`"Emma"` → `"MM"` → `"MM."` → `"Mhmm."`), added Flux short-opening-partial hold (`DeepgramFluxBrain.ts`) + deferred `setOutdated` until replacement first text (`ResponseOrchestrator.ts`), and reran S2–S5 (`n=2`, `deepgram-flux` + `codex-cli`). S3 produced `0/2` filler bubbles and `0` duplicate answers; S4 kept Q1 visible until replacement first text (`-21 ms` before overlay batch); S5 kept base answers visible (`outdated: false` in `2/2`); S2 held the 1.2 s pause (`5,909` / `5,714 ms`, `2/1/1` drafts). All `132/132` Live Brain tests, builds, typechecks, `test:lib`, and `test:components` pass. Physical macOS verification remains open. |
| Baseline 4 — Flux Follow-up & Clarification Context | ✅ Done | Added `fluxTurnContext.ts`, wired `ResponseOrchestrator` + `AnswerWriter` + `meeting.ts` + `IntelligenceEngine.ts` (`contextKey` staleness check on private drafts), grounded follow-ups/corrections/pending clarification replies (`<turn_context>`), and omitted prior topics on unrelated new questions. Verified at the AI route boundary (`134/134` in `test:live-brain`) and on Windows Electron (`deepgram-flux` + `codex-cli`, S4 & S5 `n=2` each). Builds, typechecks, `test:lib`, and `test:components` pass. Physical macOS verification remains open. |
| Baseline 5 — Comparison & Regressions | ✅ Done | Replayed S1–S6 (`n=2` each) on Windows Electron (`aba131df`, `win32`) for `deepgram-flux` (`flux-general-multi` + `codex-cli`) and `deepgram-voice-agent` (managed `open_ai` / `gpt-4o-mini`). Flux S1 (`2,758`/`2,688 ms`) and S2 (`5,940`/`4,827 ms` post-fix) improved over Phase 1 (`5,130 ms`, `8,917 ms`), S4 replaced cleanly (`4,599`/`5,488 ms` vs Phase 1 `7,058 ms`), S5 kept base visible (`outdated: false`), and Voice Agent exhibited 2–11 s inter-burst gaps plus early split on S2/S3. Fixed single-letter `"A"` noise-burst filler (`ResponseOrchestrator.ts`) and verified S2 rerun (`1` answer each). Live S6 `"Yes."` remains blocked (`gotAsk=false` on both Deepgram modes); covered by deterministic `Meeting.test.mjs` (`135/135` in `test:live-brain`). Physical macOS and OpenAI Realtime live verification remain open. |

## Amazon Bedrock and Sonic (checked 2026-11-27)

- **Regional discovery and inference.** Use [ListFoundationModels](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListFoundationModels.html) for regional foundation model metadata, [ListInferenceProfiles](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListInferenceProfiles.html) for active inference profiles, and [Mantle's model list](https://docs.aws.amazon.com/bedrock/latest/userguide/models-get-info.html) for Mantle IDs. These lists do not prove IAM authorization or Marketplace access. Use the model's [API compatibility](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html), [endpoint compatibility](https://docs.aws.amazon.com/bedrock/latest/userguide/models-endpoint-availability.html), and [regional availability](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html) for routing. For example, Nova 2 Lite supports Converse, while `xai.grok-4.3` uses Mantle's `/openai/v1` path. The settings accept exact model IDs and inference ARNs for deployments that require manual selection. [Nova 2 Lite](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-lite.html), [Grok 4.3](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-xai-grok-4-3.html), [AWS model access](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html).
- **Model settings.** Under AI Providers → Amazon Bedrock, configure an AWS Region and the AWS SDK credential chain or a Bedrock API key, refresh the catalogue, and select a model. Choose the API and streaming mode the model supports. In the model parameters field, enter the model's documented JSON, such as `{"reasoningConfig":{"type":"enabled","maxReasoningEffort":"high"}}` for Nova 2 Lite on Converse or `{"thinking":{"type":"adaptive"},"output_config":{"effort":"medium"}}` for supported Claude models. Leave sampling and max tokens blank where the model disallows them. Native Invoke uses a model-specific JSON body and a response text path. The app sends its existing screenshot attachments and displays answer text. [Nova 2 reasoning](https://docs.aws.amazon.com/nova/latest/nova2-userguide/extended-thinking.html), [Claude adaptive thinking](https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-adaptive-thinking.html).
- **Sonic models and transport.** Original Nova Sonic (`amazon.nova-sonic-v1:0`) reached end of life on 2026-09-14. Nova 2 Sonic (`amazon.nova-2-sonic-v1:0`) and Nova 2.5 Sonic (`amazon.nova-2-5-sonic`) are active in `us-east-1`, `us-west-2`, `eu-north-1`, and `ap-northeast-1` per their model cards. Use `InvokeModelWithBidirectionalStream` with AWS credentials and SigV4. In Settings → Audio → Live Brain Provider, select Amazon Sonic, choose the Region and model, and use Test Connection. The transport sends mono 16 kHz PCM in 32 ms frames, discards synthesized audio, handles interruption events, and opens a new session before the documented eight-minute stream limit. Assistant text streams from the provider's speculative output; its final transcription fills in only when speculative output is absent. Candidate turns stay in the local notebook for session seeding. [Lifecycle](https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle-legacy.html), [Nova 2 Sonic](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-sonic.html), [Nova 2.5 Sonic](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-5-sonic.html), [input events](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-input-events.html), [output events](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-output-events.html), [eight-minute connection limit](https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-conversational-speech.html).

**Verification.** Windows Electron and renderer builds, Electron/premium/renderer type checks, 139 Live Brain tests, eight Bedrock provider tests, and the lib and component suites passed. The Bedrock tests cover regional catalogue pagination, inference routing and request serialization, SigV4 signing, bearer auth, screenshot bytes, and reasoning parameters. Sonic coverage includes PCM framing, duplicate final text, stale text after interruption, orderly stop, model selection, reconnect, and rollover. Agent-browser verified both settings panels, invalid region handling, and the two Sonic model options in the Windows Electron launcher. The shared path was reviewed against both the CoreAudio/ScreenCaptureKit and WASAPI capture implementations. AWS account credentials and model access were unavailable for live verification. Requires physical macOS and Windows verification of AWS requests through the desktop app and Sonic meeting capture.

The full CI run stopped in the Electron test suite with failures. Six failing source assertions were reproduced with the corresponding files from HEAD. The run caught a Bedrock model ID guard regression in the cold-start tests. The guard was corrected, and the Bedrock and cold-start suites passed on both the rebuilt Electron test runner and the targeted routing check.

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

- 2026-11-27 — **D4 revised (user):** up to three clarifications per original question, one at a time, counted on the interviewer's reply, cap enforced in app code at the `Ask:` sentinel. Added as Later phase 6 in IMPLEMENTATION_PLAN.md (Flux + pipeline first).
- 2026-11-27 — **Later phase 6 contract revised after review (user):** one recovery generation allowed after a suppressed fourth `Ask:`; a meeting-level `ClarificationExchange` shared by Flux and pipeline; a pre-overlay `Ask:` gate in IntelligenceEngine; flag `liveBrainMultiClarify`; candidate-initiated clarifications and reconnect carry-over deferred; S13 added.

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

- 2026-11-26 — **D16, Deepgram Voice Agent (user):** add `deepgram-voice-agent` (`DeepgramVoiceAgentBrain`, standalone) with Deepgram-managed (`open_ai`, `anthropic`, `google`, `nvidia`, ≤ 25k prompt) and BYO HTTPS endpoint modes (reusing saved AI Provider keys; Codex, Antigravity, and local Ollama excluded as unreachable by Deepgram). 16 kHz raw binary PCM, 8 s KeepAlive, discarded output audio, ~110 min rollover via `agent.context.messages`.

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

- Live check (Gemini, Windows): "Mhm." between two questions got no answer; both real questions were answered normally (about 1.1 s to first text). Gemini started a turn after the filler, but no text from it was shown. The logs do not show whether the instruction or the safety net stopped it.
- Follow-up (user request): filler-only speech no longer gets a bubble in the chat either. `emitQuestion` skips a bubble until its text is more than filler, unless an Ask is waiting. The transcript strip at the top is unchanged. Two new tests (filler that grows into a question, "Yes." after an Ask), and the D14 filler test now expects no bubble. 96 Live Brain tests pass; build, `npx tsc --noEmit -p tsconfig.json` and `npm run typecheck:premium` pass. Requires physical macOS verification.

## Phase 8 — Deepgram Voice Agent (D16) (Windows, 2026-11-27)

- **Built**:
  - **Settings & credentials (`src/types/liveBrainSettings.ts`, `SettingsManager.ts`, `CredentialsManager.ts`, `electron/services/liveBrainSettings.ts`, `electron/premium/liveBrain.ts`, `electron/main.ts`)**: Added `'deepgram-voice-agent'` provider with optional Speech Provider Deepgram key reuse, `'managed'` vs `'byo'` Think configuration, public HTTPS validation (`isPublicHttpsUrl`) excluding Codex, Antigravity, local Ollama (`localhost`/`127.0.0.1`), and private/localhost gateways, plus existing AI Provider key reuse (`openai`, `anthropic`, `google`, `groq`, `openrouter`, and public saved `customProviders`). Raw keys and custom auth headers remain stripped before IPC responses.
  - **Runtime (`premium/electron/liveBrain/brains/DeepgramVoiceAgentBrain.ts`, `instructions.ts`, `BrainSupervisor.ts`, `index.ts`, `meeting.ts`)**: Standalone `DeepgramVoiceAgentBrain` connecting to `wss://agent.deepgram.com/v1/agent/converse` (`Authorization: Token <key>`), resampling PCM to 16 kHz (`linear16`) raw binary WebSocket frames with 300 ms sparse-silence fill and 8 s `KeepAlive`. Handles `Welcome`, `Settings`, `SettingsApplied`, `ConversationText`, `UserStartedSpeaking`, `AgentAudioDone`, `Warning`, `Error`, and `Close`; discards returned binary TTS frames; enforces `DEEPGRAM_MAX_MANAGED_PROMPT_CHARS` (`25_000`) for managed mode while leaving BYO unlimited; seeds `agent.context.messages` on rollover (`110 * 60_000` ms) from notebook/recent turns; verifies both `SettingsApplied` and an `InjectUserMessage` reply during `Test Connection`.
  - **UI (`src/components/SettingsOverlay.tsx`)**: Added `'deepgram-voice-agent'` card, custom in-DOM grouped dropdown (`DeepgramThinkSelect` — `"Deepgram-managed"` and `"Your AI Providers"` + Custom endpoint, avoiding native `<select>` popups), custom URL/auth header inputs, BYO transmission notice, and Codex/Antigravity/local Ollama unavailability explanation.
- **Live Deepgram protocol findings incorporated**:
  - Deepgram's `/v1/agent/settings/think/models` and live `SettingsApplied` rejected `gemini-2.0-flash` and `llama-3.3-70b-instruct` (`INVALID_SETTINGS`), so managed model lists use verified working IDs (`gemini-2.5-flash`, `nvidia/nemotron-3.5-lightning-30b-a3b`, etc.).
  - BYO `Settings` requires `agent.think.provider` alongside `endpoint`; Anthropic BYO rejects a custom `anthropic-version` header; Google's `/v1beta/openai/chat/completions` BYO route uses `Authorization: Bearer`.
- **Verification**:
  - `npm run build:electron`, `npx tsc --noEmit`, `npm run typecheck:electron`, and `npm run typecheck:premium` passed.
  - `node --test premium/electron/liveBrain/__tests__/ dist-electron/premium/electron/liveBrain/brains/__tests__/DeepgramVoiceAgentBrain.test.js electron/services/__tests__/LiveBrainSettings.test.mjs`: 109 passed, 0 failed (8 `DeepgramVoiceAgentBrain` tests, 5 `LiveBrainSettings` tests, 96 existing/updated Live Brain tests).
  - `npm run test:lib`: 3,245 passed, 15 skipped, 0 failed (including `NoNativePopups2026_09_27.test.mjs`).
  - `npm run test:components`: 1,002 passed, 2 skipped, 0 failed.
  - Full-app live meeting replay with Deepgram Voice Agent and **physical macOS verification** remain open (`Reviewed but not executed on macOS. Requires physical macOS verification.`).

## Phase 8 review fixes (Windows, 2026-11-27)

- The Deepgram adapter now keeps a single response across assistant text chunks, cancels it when the interviewer interrupts, and rejects late text before the next interviewer turn. It handles provider session expiry and transient server failures, reloads the notebook on reconnect, and applies bounded history that arrived while a standby session was starting. A settings acknowledgement no longer resets the reconnect budget.
- BYO headers and their URLs are now stored together in encrypted credentials. Startup removes the old plaintext header without reusing it. Changing the destination clears the prior header unless a new one is supplied, and Settings has a remove action. The picker imports compatible cURL providers from both stores and saves a model choice per BYO provider. The selected model is also used for timing attribution. Stale Test Connection results are discarded and upstream diagnostic text stays out of the renderer.
- The first managed Nova replay split the input into separate turns and began answering before the question ended. The full Voice Agent now uses Flux Multilingual for listening. In one paced replay on the final adapter, Flux kept the paused question together, the first text arrived 3,450 ms after the question clip, and the correction cancelled the original response. The first replacement text arrived 5,402 ms after the correction clip. Its text arrived in multiple chunks, and the probe ended before the provider completed that long spoken reply. These single-run transport measurements are above the existing ElevenLabs Mini first-text baseline and are not a provider latency distribution.
- **Tested physically on Windows (dev).** The isolated application had Deepgram selected through the Audio settings card. Test Connection verified the key and Think reply. Started a meeting, played a synthetic scaling question through the system speakers, and observed the recognized question, answer text, and Answer ready state in the overlay. The meeting was ended and the isolated profile's original Live Brain setting and provider were restored.
- **Build validated on Windows.** `npm run build:electron`, `npm run typecheck:electron`, `npm run typecheck:premium`, and `npx tsc --noEmit -p tsconfig.json` passed. The focused Live Brain, Deepgram adapter and settings checks passed 110 tests. `npm run test:lib` passed 3,245 tests with 15 skips, and `npm run test:components` passed 1,002 tests with two skips.
- **Reviewed but not executed on macOS. Requires physical macOS verification.** Windows and macOS use the same shared adapter and settings code. No native capture or packaging code changed. The installed Windows app and live BYO provider sessions still require verification. Candidate remarks remain notebook context for session seeding.

### Phase 8 test discovery and Groq verification

- Moved Deepgram tests into the shared Live Brain `.mjs` suite and load the compiled modules from `dist-electron`. The suite is included in `npm test`. Run it with the Settings IPC tests using `npm run test:live-brain`.
- Kept `provider.type: 'groq'` for native Groq BYO. Deepgram documents this provider type and accepted the session settings in a live probe. The probe could not get a Think reply, and Groq's models API returned HTTP 401 for the available key. A successful Groq Think reply still needs a valid key.

## Phase 8 follow-up — Deepgram BYO model picker (Windows, 2026-11-27)

- The existing Models control now shows up to five curated text chat models for the selected BYO provider. OpenAI, Google AI Studio, Anthropic, Groq, and OpenRouter each have a list. Model selection uses the existing per-provider setting and the manual model ID field still supports custom endpoints and other models.
- The Electron build, renderer and Electron type checks, 110 Live Brain and settings tests, 1,002 component tests, and four native-popup policy tests passed on Windows. The settings test covers the list cap, provider switching, per-provider persistence, and custom endpoints. The shared renderer and settings code have no OS-specific paths. Live BYO compatibility and response latency were not measured, and macOS was reviewed but not executed.

## Phase 9 — Deepgram Flux + My AI Provider (D17) (Windows, 2026-11-27)

- **Built**:
  - **Protocol adapter (`premium/electron/liveBrain/brains/DeepgramFluxBrain.ts`, `index.ts`, `instructions.ts`)**: Standalone Deepgram Flux v2 WebSocket adapter (`wss://api.deepgram.com/v2/listen`, `flux-general-multi`, 16 kHz mono `linear16` in 80 ms / 2,560-byte raw binary frames, 300 ms sparse-silence padding, `{"type":"CloseStream"}` on shutdown without unsupported `KeepAlive` JSON frames, `turn_index` dedupe reset across reconnects). Emits incremental interviewer transcripts (`Update` / `EagerEndOfTurn` / `TurnResumed`) and a single `decision` (`action: 'answer'`) per meaningful confirmed `EndOfTurn`.
  - **Runtime & answer routing (`premium/electron/liveBrain/BrainSupervisor.ts`, `ResponseOrchestrator.ts`, `AnswerWriter.ts`, `meeting.ts`, `electron/premium/liveBrain.ts`, `electron/IntelligenceEngine.ts`, `src/components/NativelyInterface.tsx`, `src/types/whatToAnswerQuestion.ts`)**: Routes Flux `EndOfTurn` questions directly into `AnswerWriter` → `IntelligenceEngine.runLiveBrainAnswer` → `runWhatShouldISay` → `WhatToAnswerLLM` → `LLMHelper` using the active AI Provider & model from AI Providers (including OpenAI, Anthropic, Gemini, Groq, OpenRouter, Codex CLI, Antigravity, local Ollama, DeepSeek, NVIDIA NIM, and custom/cURL gateways), with shared notebook context, recent turns, and screenshots where supported. Preserves D14 overlay bubbles without creating duplicate rows (`suppressQuestionRow: true` / `liveBrainAnswerStart`), D15 filler filtering (keeping active answers visible on `"mm-hmm"` while still answering `"Yes"` when a clarification `Ask:` is pending), mid-stream cancellation (`answer_corrected` + generation guard), and single-owner pipeline fallback (`LiveBrainRouting.pipelineOverride`).
  - **Settings, credentials & diagnostics (`src/types/liveBrainSettings.ts`, `electron/services/SettingsManager.ts`, `CredentialsManager.ts`, `liveBrainSettings.ts`, `src/components/SettingsOverlay.tsx`)**: Added `'deepgram-flux'` (`Deepgram Flux + My AI Provider`) alongside preserved `'deepgram-voice-agent'` (`Deepgram Voice Agent`), dedicated `liveBrainDeepgramFluxKey` / `liveBrainReuseDeepgramFluxKey` with Speech Provider key reuse, active AI route summary (`fluxAiRoute`), dual-stage `Test Connection` testing both `/v2/listen` and the active Natively AI route (distinctly reporting configured vs live test reply without exposing raw secrets), and clean Settings UI presentation.
- **Live Deepgram `/v2/listen` protocol findings & Windows side-by-side synthetic benchmarks**:
  - Live `/v2/listen` handshake returns `Connected` followed by `TurnInfo` events (`StartOfTurn`, `Update`, `EagerEndOfTurn`, `TurnResumed`, `EndOfTurn`). Sending `{"type":"KeepAlive"}` fails with `UNPARSABLE_CLIENT_MESSAGE: unknown variant KeepAlive, expected one of CloseStream, ForceEndTurn, Configure`, confirming 80 ms zero-PCM sparse silence + `CloseStream` design.
  - **Same question clip (`s7.wav`, 2,847 ms trimmed speech) side-by-side on Windows**:
    - **Deepgram Voice Agent (`gpt-4o-mini`, managed)**: first text delta `1,475 ms` after speech end (`4,322 ms` from start); completion `15,355 ms` after speech end (`18,202 ms` from start); `2` chunks with `13,564 ms` inter-chunk gap (TTS-paced).
    - **Deepgram Flux + OpenAI `gpt-4o-mini` streaming (`ResponseOrchestrator`)**: first interviewer partial `929 ms` from start; confirmed `EndOfTurn` `732 ms` after speech end (`3,579 ms` from start); first token `2,753 ms` after speech end (`5,600 ms` from start); full completion `3,542 ms` after speech end (`6,389 ms` from start, **~4.3x faster end-to-end than Voice Agent**); `60` tokens with `56 ms` max / `0 ms` median inter-chunk gap.
  - **Paused mid-question (`s1_a` trimmed + 400 ms silence + `s1_b`)**: With default Flux `eot_threshold`, the falling TTS phrase `"How would you design a system that can handle"` followed by 400 ms silence finalized turn 1 (`2,572 ms`) and turn 2 `"millions of concurrent users."` (`5,574 ms`) separately (recorded for optional future tuning via `eotThreshold`).
  - **Mid-answer interruption & cancellation (`s7.wav` interrupted at `first_delta` by `s8.wav`)**: Verified `ResponseOrchestrator` immediately marked generation 1 speaking (`+5,450 ms`), then on `s8.wav` `EndOfTurn` (`+9,211 ms`) marked generation 1 outdated, invoked `AnswerWriter.cancel('answer_corrected')` aborting generation 1 cleanly (334 deltas before abort, zero leaked deltas), and streamed generation 2 to completion (`700` deltas / `3,981` chars).
- **Verification**:
  - `npm run build:electron`, `npx tsc --noEmit`, `npm run typecheck:electron`, and `npm run typecheck:premium`: all passed on Windows.
  - `node --test premium/electron/liveBrain/__tests__/ electron/services/__tests__/LiveBrainSettings.test.mjs`: **118 passed, 0 failed** (including new `DeepgramFluxBrain.test.mjs` and updated `ResponseOrchestrator`, `Meeting`, `BrainSupervisor`, `Foundation`, and `LiveBrainSettings` tests).
  - `npm run test:lib`: **3,245 passed, 15 skipped, 0 failed**.
  - `npm run test:components`: **1,002 passed, 2 skipped, 0 failed**.
  - **Cross-platform capture review**: Inspected `electron/audio/SystemAudioCapture.ts`, `native-module/src/speaker/{mod.rs,macos.rs,windows.rs}`, and `electron/main.ts`; both Windows WASAPI loopback and macOS CoreAudio Tap / ScreenCaptureKit / Chromium fallback feed shared `acceptAudio('system', ...)` -> `toPcm16kMono` -> `BrainSupervisor.pushAudio`. No platform-specific or native Rust code changed. **Reviewed but not executed on macOS. Requires physical macOS verification.** Full-app UI replay in a live Electron meeting window remains open (`node` harnesses verified runtime classes directly against live Deepgram WebSockets and OpenAI streaming).


### Phase 9 independent review and fixes (Windows, 2026-11-27)

- Restored the existing Voice Agent BYO catalog, manual model ID, endpoint header removal, HTTPS validation, and settings race guards. Preserved the Voice Agent supervisor's refreshed notebook/history when reconnecting. Removed unrelated Settings UI formatting churn from the initial implementation.
- Standalone Flux now uses a 0.95 end-of-turn threshold with a 1,500 ms silence backstop. A paced Windows synthetic clip split at the default 0.7 threshold with both 400 ms and 1,200 ms pauses. At 0.95 both clips produced one confirmed turn. The compiled adapter independently emitted one answer decision for the 1,200 ms pause, 2,559 ms after the audio clip ended. These are single synthetic comparisons. Short or easy turns can finish on model confidence, and low-confidence turns can wait for the silence backstop.
- Hardened writer ownership so a replaced or cancelled generation cannot update the status or notebook on completion. Cancel the writer during fallback or meeting shutdown, close an interrupted question's partial bubble on reconnect, use the answer writer's clarification for a short follow-up, and pair late Flux transcripts with their existing overlay answer row. Flux requires a valid turn index and uses its PCM timeline to refill sparse audio.
- Flux Test Connection now targets the selected provider/model directly and requires a valid test reply. Upstream diagnostics stay out of the renderer. The combined connection test used the compiled Flux adapter and Natively's OpenAI adapter against live services and received a reply from gpt-4o-mini. Both compiled Deepgram adapters connected and responded to synthetic audio on Windows. The existing Voice Agent can still emit an early reply on the 1,200 ms paused clip.
- Windows build and renderer, Electron, and premium type checks passed. Live Brain and Settings had 118 passes. Library tests had 3,246 passes with 15 skips, and component tests had 1,002 passes with two skips. The review covered the shared audio path for Windows and macOS. Reviewed but not executed on macOS. Requires physical macOS verification. Full Electron meeting playback and live Codex CLI, Antigravity, and Ollama runs through the Flux mode remain unverified.

## Baseline Phase 1 — Flux vs GPT Realtime and Gemini Live (Windows, 2026-11-27)

- **Scope & setup:** Runtime behavior left unchanged (`9426e14e`). Replayed trimmed 16 kHz mono PCM WAV clips (`System.Speech` `Microsoft David Desktop` played through Windows `Realtek(R) Audio` speakers via persistent `System.Media.SoundPlayer` into `dev:agent` WASAPI loopback capture, `NATIVELY_E2E=1`, `NATIVELY_PROMPT_DEBUG=1`, `Technical Interview` mode, `promptVariant: full`). `agent-browser` CLI was not installed on `PATH`, so `dev:agent` derived its worktree session ID and Playwright `chromium.connectOverCDP` attached to the isolated `launcher` and `overlay` windows via `agent-browser.json` to observe overlay IPC (`onWhatToAnswerQuestion`, `onIntelligenceTokenBatch`, `onIntelligenceSuggestedAnswer`, `onIntelligenceSuggestedAnswerDiscard`) and `__e2e__:prompt-debug` (`speechStoppedAt` / `firstTextAt`).
- **Clip inventory (trimmed speech edges, 16 kHz mono):**
  1. Complete question: `"What is the difference between horizontal and vertical scaling?"` (`3,254`–`3,315 ms` playback)
  2. 1.2 s mid-question pause: `"How would you design a system that can handle"` (`1,997 ms`) + exact `1,200 ms` zero silence + `"millions of concurrent users?"` (`1,485 ms`) (`5,055`–`5,169 ms` playback)
  3. `"Mm-hmm"` while streaming: `"How would you make retry safe in an order API?..."` (`7,784`–`7,807 ms` playback), followed immediately at first visible answer text by `"Mm-hmm."` (`1,010`–`1,079 ms` playback)
  4. Correction while streaming: `"Design a low-latency product lookup service. You can use a cache. Explain your read path and how invalidation works."` (`7,534`–`7,603 ms` playback), followed immediately at first visible answer text by `"Actually, caching is not allowed."` (`2,439`–`2,516 ms` playback)
  5. Follow-up: `"How would you design a collaborative note-taking app that syncs across devices?"` (`3,943`–`3,968 ms` playback), followed after answer completion by `"What if it needs to work offline?"` (`1,907`–`2,003 ms` playback)
  6. Clarification `"Yes"`: `"Design an e-commerce app."` (`1,570`–`1,627 ms` playback), with `"Yes."` (`416 ms` WAV) queued if `Ask:` appeared

### Replay and evidence

The Windows run used a local scratch harness at
`$env:USERPROFILE/.gemini/antigravity/brain/73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e/scratch`.
It contains `replay_baseline.mjs`, `player_loop.ps1`, and `clips/`. These local
artifacts are outside Git. The replay uses the baseline’s CDP observation
method and produces JSON summaries, including `results_flux_codex.json`,
`results_flux_codex_s4.json`, `results_flux_openai_real.json`,
`results_gemini_live.json`, and `results_gemini_live_s2_s3.json`. The
`results_flux_openai.json` earlier run used a misconfigured model selection
and is excluded.

~~~powershell
# Run from the repository root in two terminals.
$env:NATIVELY_E2E = '1'
$env:NATIVELY_PROMPT_DEBUG = '1'
npm run dev:agent

# Second terminal, after the isolated app is ready.
$baseline = Join-Path $env:USERPROFILE '.gemini/antigravity/brain/73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e/scratch'
$runner = Join-Path $baseline 'replay_baseline.mjs'
node $runner --provider deepgram-flux --ai-provider codex-cli --ai-model codex-cli
node $runner --provider deepgram-flux --use-env-openai --ai-provider openai --ai-model gpt-4o-mini
node $runner --provider gemini-live
~~~

Run with `--only 3` to isolate filler or `--only 5` for the follow-up. Confirm
the expected provider/model in the isolated profile before capturing new results.

### Full Electron App Measurements (Windows WASAPI loopback)

First-text times are milliseconds from `SoundPlayer.PlaySync()` completion to the first nonblank answer-text IPC event observed in the overlay renderer. They use clip playback end as the speech-end reference and do not measure DOM paint. The Flux `EndOfTurn` time is the main-process `interviewer_speech_stopped` timestamp recorded as `speechStoppedAt` in Prompt Debugger. Completion follows each adapter’s overlay event. Gemini’s audio turn can finish well after its text, so completion times across providers measure different boundaries.

#### 1. Deepgram Flux + Codex CLI (`flux-general-multi` + `codex-cli`)
Runs: `n=1` per scenario (plus 1 S1 smoke pre-run and 1 S4 corrected-harness re-run; S4's initial run stopped early at +1.8 s into Answer 2 because the harness completion check matched Answer 1's `final` before `generationId` filtering was added — excluded from S4 replacement latency).

| Scenario | Speech end → EndOfTurn | EndOfTurn → 1st text | Speech end → 1st text | Speech end → done | Right question answered once? | Premature / duplicate / stale / incorrect |
|---|---:|---:|---:|---:|---|---|
| 1. Complete question (`n=1`, plus smoke `n=1`) | `2,737 ms` (smoke: `1,697 ms`) | `2,393 ms` (smoke: `1,909 ms`) | `5,130 ms` (smoke: `3,606 ms`) | `6,036 ms` (smoke: `4,647 ms`) | Yes (`52` chunks) | None |
| 2. 1.2 s pause in middle (`n=1`) | `2,534 ms` | `6,383 ms` | `8,917 ms` | `13,577 ms` | Yes (`281` chunks) | None; pause held cleanly |
| 3. `"Mm-hmm"` mid-stream (`n=1`) | `2,897 ms` (Q1) | `6,946 ms` (Q1) | `9,843 ms` (Q1) | `15,408 ms` (Q1) | Q1 answered once (`311` chunks); `"Mm-hmm."` started +107 ms after 1st text while streaming (`15,408 - 9,843 = 5,565 ms` stream), transcribed `"Mhmm."`, triggered no answer | **Stale/filler bubble leak:** `"Mhmm."` appeared as `q2` chat bubble (`ResponseOrchestrator` first partial `"M"` bypassed `isFillerOnly`) |
| 4. Correction mid-stream (`n=1` clean; `n=1` harness-aborted) | Q1: `2,490` / `2,001 ms`; Corr: **`2,412 ms`** | Q1: `4,489` / `6,961 ms`; Corr: **`4,646 ms`** | Q1: `6,979` / `8,962 ms`; Corr end → 1st replacement: **`7,058 ms`** | Corr end → done: **`8,263 ms`** (`67` chunks) | Yes; Q1 (`258` chunks) cancelled (`answer_corrected`) mid-stream, replacement removed caching | Q1 marked outdated (`outdatedAt` set) as expected |
| 5. Follow-up `"What if it needs to work offline?"` (`n=1`) | Base: `1,963 ms`; FU: `1,122 ms` | Base: `5,238 ms`; FU: `4,336 ms` | Base: `7,201 ms`; FU: `5,458 ms` | Base: `12,966 ms`; FU: `9,255 ms` | Yes; follow-up addressed local offline queue + CRDT sync (`209` chunks) | **Unwanted outdated fold:** completed base answer (`gid: 17`) marked `outdated` when FU started (20 s `RECENT_ANSWER_MS` rule) |
| 6. `"Yes"` after clarification (`n=1`) | `2,595 ms` | `7,967 ms` | `10,562 ms` | `16,260 ms` | Prompt answered directly (`gotAsk=false`); `"Yes"` not reached | The answer used an assumption and no clarification arrived |

#### 2. Deepgram Flux + OpenAI (`flux-general-multi` + `gpt-4o-mini`)
Runs: `n=1` per scenario (using the configured OpenAI API key with `setProviderPreferredModel('openai', 'gpt-4o-mini')` + `setModel('gpt-4o-mini')`; earlier harness misconfiguration runs that passed `'openai'` as model ID and hit 404/fallback were discarded and re-run cleanly).

| Scenario | Speech end → EndOfTurn | EndOfTurn → 1st text | Speech end → 1st text | Speech end → done | Right question answered once? | Premature / duplicate / stale / incorrect |
|---|---:|---:|---:|---:|---|---|
| 1. Complete question (`n=1`) | `1,815 ms` | `1,266 ms` | `3,081 ms` | `3,850 ms` | Yes (`66` chunks) | None |
| 2. 1.2 s pause in middle (`n=1`) | `3,294 ms` | `1,635 ms` | `4,929 ms` | `8,028 ms` | Yes (`250` chunks) | None; pause held cleanly |
| 3. `"Mm-hmm"` mid-stream (`n=1`) | Q1: `2,876 ms`; Filler: `2,436 ms` | Q1: `3,170 ms`; Dup: `2,146 ms` | Q1: `6,046 ms` | Q1: `8,665 ms`; Dup: `5,375 ms` | **No — duplicate answer** (`"Mm-hmm."` started +55 ms after 1st text while Q1 streamed) | **Bug reproduced:** Flux transcribed `"Mm-hmm."` as `"MM."`; `isFillerOnly("MM.")` returned `false`, marked Q1 outdated, showed `"MM."` bubble, and streamed duplicate Answer 2 (`91` chunks) |
| 4. Correction mid-stream (`n=1`) | Q1: `2,048 ms`; Corr: **`2,806 ms`** | Q1: `1,561 ms`; Corr: **`2,668 ms`** | Q1: `3,609 ms`; Corr end → 1st replacement: **`5,474 ms`** | Corr end → done: **`6,724 ms`** (`98` chunks) | Yes; Q1 (`311` chunks) cancelled (`answer_corrected`) mid-stream, replacement removed caching | Q1 marked outdated as expected |
| 5. Follow-up `"What if it needs to work offline?"` (`n=1`) | Base: `2,659 ms`; FU: `1,378 ms` | Base: `1,242 ms`; FU: `1,161 ms` | Base: `3,901 ms`; FU: `2,539 ms` | Base: `6,634 ms`; FU: `3,958 ms` | Yes; follow-up addressed local storage + reconnect sync (`82` chunks) | **Unwanted outdated fold:** completed base answer (`gid: 112`) marked `outdated` when FU started (20 s rule) |
| 6. `"Yes"` after clarification (`n=1`) | `3,103 ms` | `2,372 ms` | `5,475 ms` | `8,986 ms` | Prompt answered directly (`gotAsk=false`); `"Yes"` not reached | The answer used an assumption and no clarification arrived |

#### 3. Gemini Live (`gemini-3.1-flash-live-preview`, `promptVariant: full`)
Runs: `n=1` for S1/S4/S5/S6; `n=2` for S2 & S3 (S2 run 1 timed out at 25 s before `turnComplete`; run 2 waited 40 s and completed cleanly).

| Scenario | Speech end → 1st text | Speech end → done | Right question answered once? | Premature / duplicate / stale / incorrect |
|---|---:|---:|---|---|
| 1. Complete question (`n=1`) | `1,788 ms` (`1,735 ms` main) | `12,260 ms` (`25` chunks) | Yes | None |
| 2. 1.2 s pause in middle (`n=2`) | `1,925 ms` (run 1); `1,799 ms` (run 2) | `>25,000 ms` timeout (run 1, `57` chunks); `23,185 ms` (run 2, `44` chunks) | Yes | None; pause held cleanly |
| 3. `"Mm-hmm"` mid-stream (`n=2`) | Q1: `3,106 ms` (run 1), `2,498 ms` (run 2) | Q1: `3,191 ms` (run 1, `2` chunks), `2,498 ms` (run 2, `2` chunks) | Q1 answered once; Gemini emitted no answer for filler (`"Mm-hmm."` arrived 57–68 ms after `responseText.done` burst) | **Filler bubble leak:** Gemini transcribed `"Mm-hmm."` as `"mm"` (run 1) and `"M.M."` (run 2), both missed by `isFillerOnly` so `q2` bubbles appeared in chat |
| 4. Correction mid-stream (`n=1`) | Q1: `1,732 ms`; Corr end → 1st replacement: **`2,065 ms`** | Corr end → done: **`17,688 ms`** (`33` chunks) | Yes; Q1 (`12` chunks) barged in / cancelled (`92eaf573...:1:1`), replacement used DB indexing without cache | Q1 marked outdated as expected |
| 5. Follow-up `"What if it needs to work offline?"` (`n=1`) | Base: `1,954 ms`; FU: `1,978 ms` | Base: `1,954 ms` (`2` chunks); FU: `17,346 ms` (`36` chunks) | Answered both in context; Base kept visible (`outdated: false`) | **Incorrect/leaked preamble on Base:** Answer 1 began verbatim with `"Current turn is empty. Transcript is empty. Notes are missing. Job description is missing. Candidate profile is missing. No previous context."` |
| 6. `"Yes"` after clarification (`n=1`) | `2,041 ms` | `17,372 ms` (`33` chunks) | Prompt answered directly (`gotAsk=false`); `"Yes"` not reached | Answered with stated assumptions instead of emitting `Ask:` |

#### 4. OpenAI Realtime (`gpt-realtime-2.1`) — Blocked live + lower-level test results
- **Live Electron app / API blocker:** `window.electronAPI.testLiveBrainConnection()` with `openai-realtime` and the available OpenAI API key failed with `error: "unsupported"` (`"OpenAI Realtime does not support the selected model or session configuration."`). A direct probe to `GET https://api.openai.com/v1/models` returned HTTP `200` with `8` accessible models (`gpt-4.1`, `gpt-4o-mini`, `gpt-4o-mini-transcribe`, `gpt-5-nano`, `gpt-5.6-luna`, `gpt-6-luna`, `gpt-transcribe`, `whisper-1`) and `0` Realtime models (`realtimeModels: []`). These observations are consistent with missing model access on the available account. They do not establish model availability for other accounts or rule out an unsupported session setting.
- **Lower-level mocked WebSocket & unit coverage (separate from Electron app tests):**
  - `npm run test:live-brain`: **`118` passed, `0` failed** (`DeepgramFluxBrain.test.mjs` `6/6`, `RealtimeBrain.test.mjs` `13/13` covering OpenAI Realtime & ElevenLabs mock WebSocket streaming, `speech_started` cancel, late-delta drop, auth/quota/rate-limit handling, `GeminiLiveBrain.test.mjs` `21/21`, `ResponseOrchestrator.test.mjs` `25/25` covering `Ask:` -> `"Yes."` and filler suppression, `BrainSupervisor.test.mjs` `7/7`, `Meeting.test.mjs` `10/10`, plus `Foundation.test.mjs` and `LiveBrainSettings.test.mjs`).

### Product Bugs / Deficiencies Documented (No Runtime Changes Made)

1. **Filler `"Mm-hmm"` variants (`"MM."`, `"mm"`, `"M.M."`, and 1-char `"M"` partial) bypass `isFillerOnly` (`ResponseOrchestrator.ts`):**
   - `FILLER_WORD` (`m+-?h+m+`) requires `'h'`, so Flux `"MM."` and Gemini `"mm"` / `"M.M."` do not match. On Flux + OpenAI S3, `"MM."` marked the completed Q1 outdated and triggered a duplicate Answer 2 (`generationId: 106`). Flux also displayed `"Mhmm."` in the Codex CLI run. That final transcript matches the filler rule. An earlier partial such as `"M"` would cause the bubble to persist under the current code. The saved summary retains the final transcript and a partial count, so it cannot confirm the exact partial.
   - **Reproduction:** Start a `deepgram-flux` + `openai` (`gpt-4o-mini`) meeting in `dev:agent`, play `s3_question.wav`, and play `s3_mmhmm.wav` on first visible text; observe `q2: "MM."` and duplicate `generationId`.
2. **Flux follow-up after completed answer marks base answer `outdated` (`ResponseOrchestrator.ts` `handleDecision`):**
   - Because `handleDecision` calls `replaceCurrent()` (which applies `RECENT_ANSWER_MS = 20_000`) instead of `supersedeForNewTurn(true)` (D14 mid-stream cutoff rule), completed answers within 20 s of a follow-up (S5 on both Codex CLI and OpenAI) get folded as `Outdated answer`.
   - **Reproduction:** In `deepgram-flux`, play `s5_base.wav`, wait for `final` completion, then play `s5_followup.wav` within 20 s; observe `outdated: true` on the base answer.
3. **Scenario 6 `"Yes"` after `Ask:` not reachable via `"Design an e-commerce app."` on Flux + V3 or Gemini Live:**
   - `IntelligenceEngine.ts:1708` passes `promptInstruction: 'If a clarification is essential before answering, start the reply with Ask:...'`, while the V3 turn policy prefers stated assumptions. That conflict is a plausible contributor for the Flux routes. None of the two Flux runs or the one Gemini Live run emitted Ask, and the replay therefore never played "Yes." This scenario does not establish a clarification failure or its cause.
4. **Gemini Live S5 base answer leaked internal context-absence preamble** (`"Current turn is empty. Transcript is empty. Notes are missing..."` before answering).

### Cross-platform & Build Validation

- **Tested physically on Windows:** `dev:agent` Windows Electron app with WASAPI loopback (`Realtek(R) Audio`) for `deepgram-flux` (`codex-cli` and `openai/gpt-4o-mini`) and `gemini-live` (`gemini-3.1-flash-live-preview`).
- **Build & automated checks validated on Windows:** `npm run test:live-brain` (`118/118`), `npm run build:electron`, `npm run typecheck:electron`, `npm run typecheck:premium`, `npm run typecheck:ts7`, `npm run test:lib`, and `npm run test:components`.
- **Reviewed but not executed on macOS. Requires physical macOS verification.** OpenAI Realtime still needs an account and session configuration that accept `gpt-realtime-2.1`.


### Independent baseline review

- Recomputed first-text, turn-confirmation, correction, and completion timings
  from the saved Windows Electron summaries. Verified the paused WAV is
  16 kHz mono PCM16 and contains 1,200 ms of digital silence. This review
  checked the saved renderer IPC evidence without repeating the full-app run.
- Reproduced the duplicate after `"MM."`, the partial-to-filler bubble, and
  the completed-answer fold with events sent through the compiled
  `ResponseOrchestrator` and a stub writer. These are Phase 3 findings and
  the baseline leaves the product code as-is.
- A separate live transport check with the compiled Flux adapter transcribed
  the filler clip as `"mm."` and the correction correctly. The 1,200 ms
  paused clip yielded one confirmed question with four seconds of trailing
  silence supplied as PCM. An earlier standalone attempt that relied on
  sparse silence had no final within its 3.5-second wait. These are
  transport observations and do not replace the full-app timings.
- Independently checked the configured OpenAI credential. The model list
  returned HTTP 200 with eight models and no Realtime model, and the app
  adapter’s live Realtime connection probe returned `unsupported`.
- Independently passed `npm run test:live-brain` (118), `npm run test:lib`
  (3,246 passed, 15 skipped), `npm run test:components` (1,002 passed, two
  skipped), `npm run typecheck:electron`, `npm run typecheck:premium`,
  `npm run typecheck:ts7`, and `git diff --check`.

## Baseline 2 — Flux Private Draft (2026-11-27)

### Implementation

Phase 2 adds an early private LLM draft for `deepgram-flux`. On `EagerEndOfTurn` (Flux confidence ≥ 0.5) the system starts a private `IntelligenceEngine.startLiveBrainDraft()` call that runs `runWhatShouldISayInner` in a fully suppressed mode: no overlay events, no session entries, no generation-id claim, no notebook writes, no FG-gate acquisition. Buffered text chunks accumulate in the draft's `rawChunks` array. On confirmed `EndOfTurn`, `AnswerWriter.write()` atomically adopts the draft if the session, turn-key, transcript, and AI route all still match; otherwise it falls back to a fresh `runLiveBrainAnswer`. On `TurnResumed`, the draft is cancelled silently.

**Files changed (13 total):**

| File | Change |
|---|---|
| `electron/IntelligenceEngine.ts` | Added `startLiveBrainDraft`, `cancelLiveBrainDrafts`, `getLiveBrainAiRouteKey`, `InternalPrivateLiveBrainDraft`, `pushTokenToLivePipeline`, private-draft mode in `runWhatShouldISayInner`, `claimAdoptedDraft`, `acquireFg`/`releaseFg` helpers |
| `electron/IntelligenceManager.ts` | Delegation methods: `startLiveBrainDraft`, `getLiveBrainAiRouteKey`, `cancelLiveBrainDrafts` |
| `electron/main.ts` | `sendModelChanged()` calls `cancelLiveBrainDrafts('provider_switched')` before model-changed broadcast |
| `electron/premium/liveBrain.ts` | `LiveBrainDraftRequest`, `LiveBrainAdoptedDraft`, `LiveBrainPrivateDraft`, `reuseGenerationId` on answer request; optional `startLiveBrainDraft` and `getLiveBrainAiRouteKey` on engine/meeting interface; `export type { AutoAnswerDispatchResult }` |
| `premium/electron/liveBrain/AnswerWriter.ts` | `prepareDraft`, `cancelDraft`, updated `write` for draft adoption, fallback guard, `visibleTextShown` |
| `premium/electron/liveBrain/ResponseOrchestrator.ts` | Handles `eager_end_of_turn` → `prepareDraft`; `turn_resumed` → `cancelDraft`; `reset`/`replaceWithExternalAnswer` → `cancelDraft`; added `noteWriterClarification` (ask-pending + timer) and `endProviderTurn` (provider switch/reconnect cleanup) |
| `premium/electron/liveBrain/brains/DeepgramFluxBrain.ts` | `eager_eot_threshold=0.5` URL param; `connectionSequence`/`currentConnectionKey`/`activeEager` fields; `EagerEndOfTurn` → `eager_end_of_turn` with deduplication; `TurnResumed` → `turn_resumed`; `EndOfTurn` carries `turnKey`; `dispose()` clears `activeEager` |
| `premium/electron/liveBrain/types.ts` | Added `eager_end_of_turn` and `turn_resumed` event types; `decision` event carries optional `turnKey` |
| `premium/electron/liveBrain/meeting.ts` | `answerWriter` wired with `startLiveBrainDraft`/`getLiveBrainAiRouteKey`; `trackWriterRun` supports `reuseGenerationId`; `onSwitch`/fatal/reconnect call `cancelDraft` and `endProviderTurn`; `stop()` calls `cancelDraft('meeting_ended')`; `noteWriterClarification` wired from `onComplete` |
| `docs/live-brain/ARCHITECTURE.md` | §4.4 AnswerWriter documented with Phase 2 private-draft lifecycle; §4.7 DeepgramFluxBrain updated with `eager_eot_threshold`, `eager_end_of_turn`, `turn_resumed`, turn-key scoping, draft cancellation events; `LiveBrainEvent` union extended |
| `premium/electron/liveBrain/__tests__/DeepgramFluxBrain.test.mjs` | Phase 2: duplicate `EagerEndOfTurn` dedup, `TurnResumed` allows fresh eager draft, reconnect changes `turnKey` |
| `premium/electron/liveBrain/__tests__/ResponseOrchestrator.test.mjs` | Phase 2: empty/filler eager turns skipped, `Yes` on Ask allowed, `TurnResumed`/reset cancel drafts |
| `premium/electron/liveBrain/__tests__/Meeting.test.mjs` | 6 Phase 2 integration tests (see below) |

### New tests (all pass, 2026-11-27)

| Test | Scenario |
|---|---|
| `Phase 2: confirmation before first token promotes in-flight draft` | `EagerEndOfTurn` → draft started; `EndOfTurn` arrives before first token; adoption is atomic; one overlay row |
| `Phase 2: completed private draft leaks zero state until EndOfTurn` | Draft completes before `EndOfTurn`; buffered chunks released exactly once on confirmation; no overlay events before that |
| `Phase 2: buffered-to-live handoff preserves chunk order` | Chunks buffered before adoption flushed in order; no loss or duplication |
| `Phase 2: TurnResumed discards draft; changed final transcript` | `TurnResumed` → `cancelDraft`; fresh `EagerEndOfTurn` allowed; changed final transcript → draft discarded, fresh fallback |
| `Phase 2: early AI failures fall back; post-text failures blocked` | Pre-text draft failure → fresh `runLiveBrainAnswer`; post-text failure → no second answer |
| `Phase 2: provider/route change, reconnect, meeting end cancel drafts` | Each lifecycle event cancels active drafts with zero leakage |

### Windows Electron replay — 2026-11-27

#### Root cause of prior zero-event replay & smoke test

The earlier `replay_phase2.mjs` run reported `0` overlay answers because its CDP selector `pages.find((p) => p.url().includes('window=overlay'))` matched `http://127.0.0.1:52731/?window=overlay-toggle` (which appeared earlier in `pages`) instead of `window=overlay`. Fixed `smoke_one.mjs` and `replay_phase2.mjs` to match `new URL(p.url()).searchParams.get('window') === 'overlay'`.

#### Pre-benchmark Test Connection & smoke verification

- **Selected route:** `deepgram-flux` (`flux-general-multi`) + `codex-cli` (`codex-cli`), Technical Interview mode, `promptVariant: full`, isolated `dev:agent` (`NATIVELY_E2E=1`, `NATIVELY_PROMPT_DEBUG=1`).
- **`window.electronAPI.testLiveBrainConnection('deepgram-flux')`:** `{ success: true, message: "Deepgram Flux connected. · Codex CLI (codex-cli) replied.", fluxResult: { connected: true, aiRoute: { provider: "codex-cli", model: "codex-cli", configured: true, replied: true } } }`.
- **Smoke test (`smoke_one.mjs`, `s1_complete.wav`):** `31` overlay events captured; live interviewer transcript streamed into `q1` (`"What is the difference between horizontal and vertical scaling?"`, `done: true` at `+1,401 ms`); Flux `EndOfTurn` at `+1,381 ms` (`speechStoppedAt`); first visible overlay `token_batch` at **`2,322 ms`** after speech end (`939 ms` after `EndOfTurn`); `final` at `3,405 ms`.

#### Paired Windows Electron comparison: `5c092319` baseline vs Phase 2 working tree

Replayed the same trimmed 16 kHz mono PCM WAV clips (`s1_complete.wav`, `s2_pause1200.wav`, `s4_question.wav`, `s4_correction.wav`) in fresh meetings (`n=2` reps per scenario) using `deepgram-flux` (`flux-general-multi`) + `codex-cli` (`codex-cli`). The baseline ran in an isolated detached worktree at `5c092319` (`dev:agent` CDP port `56824`); Phase 2 ran in the current working tree (`dev:agent` CDP port `52730`).

~~~powershell
# Phase 2 working tree (current repo)
$env:NATIVELY_E2E='1'; $env:NATIVELY_PROMPT_DEBUG='1'; npm run dev:agent
node "C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\replay_phase2.mjs" --provider deepgram-flux --ai-provider codex-cli --ai-model codex-cli --reps 2

# Isolated 5c092319 baseline worktree
git worktree add --detach C:\Users\dell\Desktop\shubham\natively-baseline-5c092319 5c092319
$env:NATIVELY_E2E='1'; $env:NATIVELY_PROMPT_DEBUG='1'; npm run dev:agent
node "C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\replay_phase2.mjs" --provider deepgram-flux --ai-provider codex-cli --ai-model codex-cli --reps 2 --out "C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\results_baseline_5c092319_flux_codex-cli.json"
~~~

| Scenario | Run | `5c092319` EoT / EoT→1st / Speech→1st | Phase 2 EoT / EoT→1st / Speech→1st | Phase 2 Drafts (start / reuse / discard) | Notes |
|---|---|---|---|---|---|
| 1. Complete question (`n=2`) | rep 1 | `1,959` / `4,060` / **`6,024 ms`** | `2,006` / `464` / **`2,471 ms`** | `1 / 1 / 0` | One answer (`62` chunks vs `4`); `-3,553 ms` |
| 1. Complete question (`n=2`) | rep 2 | `2,191` / `4,434` / **`6,628 ms`** | `1,299` / `1,562` / **`2,863 ms`** | `1 / 1 / 0` | One answer (`56` chunks vs `4`); `-3,765 ms` |
| 2. 1.2 s mid-question pause (`n=2`) | rep 1 | `2,577` / `3,712` / **`6,290 ms`** | `2,270` / `2,590` / **`4,863 ms`** | `3 / 1 / 2` | Both discards `turn_resumed`; 1 final answer; `-1,427 ms` |
| 2. 1.2 s mid-question pause (`n=2`) | rep 2 | `2,814` / `1,683` / **`4,499 ms`** | `2,769` / `1,283` / **`4,054 ms`** | `4 / 1 / 3` | All 3 discards `turn_resumed`; 1 final answer; `-445 ms` |
| 4. Correction mid-stream (`n=2`) | rep 1 | Corr: `2,220` / `4,332` / **`6,554 ms`** | Corr: `1,910` / `4,417` / **`6,329 ms`** | `2 / 2 / 0` | Q1 cancelled (`doneAt: null`, `outdated: true`), replacement `updated: true`, no stale chunks |
| 4. Correction mid-stream (`n=2`) | rep 2 | Corr: `2,326` / `1,191` / **`3,517 ms`** | Corr: `2,285` / `5,679` / **`7,966 ms`** | `2 / 2 / 0` | Q1 cancelled (`doneAt: null`, `outdated: true`), replacement `updated: true`, no stale chunks; `codex-cli` subprocess variance |

**Summary of full-app replay findings:**
- **Draft reuse & pause protection verified live:** Every S1 and S4 turn reused its private draft (`6/6` turns reused). Both S2 1.2 s paused turns fired `EagerEndOfTurn` during speech/pause, cancelled those drafts cleanly on `TurnResumed` (`2` and `3` discards), produced zero premature answers during the pause, and reused the final post-pause draft.
- **S1 & S2 latency improved:** S1 improved by `3.55–3.77 s` (`2,471` / `2,863 ms` vs `6,024` / `6,628 ms`). S2 improved by `0.45–1.43 s` (`4,863` / `4,054 ms` vs `6,290` / `4,499 ms`).
- **S4 replacement latency:** `6,329` / `7,966 ms` vs `6,554` / `3,517 ms` on `codex-cli`. In both Phase 2 runs, Q1 was actively streaming and cancelled mid-stream (`status: 'cancelled'`, `doneAt: null`), whereas in the `5c092319` baseline runs Q1 had already completed in 4 chunks (`4.5 s` / `4.4 s`) before Q2's `EndOfTurn`. Because `codex-cli` spawns a subprocess per request, overlapping cancellation/turn startup plus CLI variance explains the `3.5 s`–`8.0 s` range; no stale chunks leaked into the replacement answer.
- **Separation of evidence:** The table above contains full Windows Electron app (`dev:agent` WASAPI loopback) measurements only. Transport-level socket probes and mocked `IntelligenceEngine` tests (`Meeting.test.mjs`) are tracked separately under **New tests** and **Independent Phase 2 review**.

### Key decisions

- **Eager threshold = 0.5** (URL param `eager_eot_threshold=0.5`), separate from confirmed threshold (0.95). Chosen to start drafts early without changing the confirmed-turn window. Document-only decision; not user-configurable yet.
- **Turn-key scoping per connection:** `${sessionId}:c${connectionSequence}:t${turnIndex}`. Old connection's drafts cannot be adopted after reconnect even if `turnIndex` coincidentally matches.
- **Private draft route key:** `getLiveBrainAiRouteKey()` tries `getDirectAssistSelection()` → `getCurrentProvider()/getCurrentModelId()` → `'unknown:unknown'`. A provider-model change (from Settings or model selector) cancels all active drafts before the model-changed IPC broadcast.
- **Post-text failure guard:** once `visibleTextShown` is set on an adopted draft, `AnswerWriter.write()` does not start a second fallback `runLiveBrainAnswer` — the existing answer stream handles its own failure path.
- **`noteWriterClarification` and `endProviderTurn`** are new `ResponseOrchestrator` public methods added in this phase. `noteWriterClarification` is called when the `AnswerWriter`'s `onComplete` callback reveals the completed text starts with `Ask:` (the AnswerWriter already streamed it; the orchestrator only sets `askPending` and starts the clarification timer). `endProviderTurn` is called on provider switch, reconnect, or fatal error to clear the in-flight writer turn state so the next provider starts clean.

### Validation

- **`npm run test:live-brain`:** 126/126 pass, 0 fail (up from 118 before this phase; 8 new tests added).
- **`npm run typecheck:electron`:** clean.
- **`npm run typecheck:premium`:** clean.
- **`npm run typecheck:ts7`:** clean.
- **`npm run test:lib`:** 3246/3261 pass, 15 skipped (unchanged).
- **`npm run test:components`:** 1002/1004 pass, 2 skipped (unchanged).
- **`npm run build:electron`:** passed (exit 0).
- **Windows Electron replay:** verified on `deepgram-flux` (`flux-general-multi`) + `codex-cli` (`codex-cli`) across S1, S2, S4 (`n=2` reps each, plus `n=1` S1 smoke test) vs fresh `5c092319` baseline (`n=2` reps each).
- **Requires physical macOS verification.** Shared capture and Live Brain code reviewed; macOS was not executed.

### Independent Phase 2 review

Fixed a private-draft path that could abort an active Assist request before confirmation. Draft adoption now respects manual answer ownership, and a pre-text retry rechecks generation ownership after waiting for the automatic slot. The first Windows replay captured no confirmed turns. The later replay corrected the overlay selector and supersedes that result. The compiled adapter replayed the same 1.2-second paused WAV against live Flux and reported eager → resumed → eager → one confirmed decision. The second eager event preceded confirmation by 1,279 ms on this transport run. That interval measures opportunity for overlap, without measuring model generation or the overlay. The independent Electron build and 126 Live Brain tests, premium type check, and diff whitespace check passed.

The final review recalculated first-text and replacement times from both saved Electron JSON summaries. All six Phase 2 runs reused a draft. The paused clips each yielded one answer and discarded five resumed drafts across the two runs. Both original correction streams were superseded and both replacements completed. The replay demonstrates faster first text for the complete and paused questions on this route. It does not establish a correction-latency improvement.

### Independent Phase 3 review

The Windows replay still recorded a filler-only question bubble in one of two runs. Neither run produced a duplicate answer. The 1.2-second paused clip held together, but first-text time rose to 7.44–7.53 s from Phase 2’s 4.05–4.86 s. The samples do not isolate the reason. Tightened the shared filler expression to require separators between filler words, avoiding ambiguous splits of long repeated letters. That initial review left Phase 3 open until the filler-bubble rerun below.

## Open risks

- Gemini native-audio models may not support TEXT output → use output transcription (Phase 0 decides).
- Free-tier rate limits during long interviews.
- ~15-min Gemini session limit → rollover correctness.
- Timing changes in `SimpleAutoAnswer.ts` (Phase 1).
- macOS cannot be physically tested by the user → `Requires physical macOS verification`.

## Baseline Phase 3 — Improve Flux Interruptions and Corrections (Windows, 2026-11-27)

Started from commit `28aec5aa` on `feat/live-brain`. Scope: `deepgram-flux` + My AI Provider (`ResponseOrchestrator.ts`, `AnswerWriter.ts`).

### Changes made

1. **Filler variants & partial growth (`premium/electron/liveBrain/ResponseOrchestrator.ts`):**
   - Extended `FILLER_WORD` to match `m+` and `m+\.m+`, suppressing Flux/Gemini filler variants (`"MM."`, `"mm"`, `"M.M."`, `"Mhmm."`) and single-letter `"M"` partials in `emitQuestion`, `eager_end_of_turn`, and `handleDecision`.
   - Partials that grow into real questions (e.g. `"M"` → `"Make it stateless."`) appear once they exceed filler; pending `Ask:` clarifications still allow `"Yes."`.
2. **Completed answers preserved on ordinary follow-ups (`premium/electron/liveBrain/ResponseOrchestrator.ts`):**
   - `handleDecision` (`case 'answer'`) and `replaceWithExternalAnswer()` now use `supersedeForNewTurn(true)` instead of `replaceCurrent()`, and `supersedeForNewTurn` treats `source: 'writer'` answers with `completedAt !== undefined && !cutOff` the same as completed `source: 'text'` answers — keeping them visible (`outdated: false`, `replacesAutomaticAnswer: false`) rather than folding them under the 20 s `RECENT_ANSWER_MS` rule.
3. **Replacement pre-text failure preservation (`ResponseOrchestrator.ts`, `AnswerWriter.ts`):**
   - `ResponseOrchestrator.write()` passes `onFirstText` via `AnswerWriter.write` options (wired for both fresh runs and adopted private drafts) and tracks `restoresOutdatedGenerationId`. If a replacement fails or is cancelled mid-fallback before showing useful text, `overlay.setOutdated(restoresOutdatedGenerationId, false)` restores the useful text already on screen.

### New unit & regression tests (`131/131` passing in `npm run test:live-brain`)

- `ResponseOrchestrator.test.mjs`:
  - `Phase 3: a completed writer answer {1s, 10s, 25s} ago stays visible on an ordinary follow-up` (updated from the old 20 s rule; `ask` test updated to fold in-flight streaming answers).
  - `Phase 3: Flux/Gemini filler variants and initial M partial are suppressed, while filler-like real questions pass` (`"MM."`, `"mm"`, `"M.M."`, `"Mhmm."`, `"M"` vs `"MySQL?"`, `"MongoDB or Postgres?"`, `"M.I.T.?"`, `"Make it stateless."`, `"Memory limit?"`, `"Okay, how does caching work?"`, `"Yes, what about offline?"`).
  - `Phase 3: initial M partial growing into a real question shows normally, while M -> MM. stays hidden`.
  - `Phase 3: replacement failure before showing text restores outdated flag; repeated corrections preserve original until text arrives`.
- `Meeting.test.mjs`:
  - `Phase 3: Flux filler mid-stream, correction before first token, stale drops, and fallback mid-replacement`.

### Windows Electron replay — 2026-11-27

Replayed Scenarios 2, 3, 4, and 5 (`n=2` reps each, fresh meetings) on `dev:agent` (`NATIVELY_E2E=1`, `NATIVELY_PROMPT_DEBUG=1`) with `deepgram-flux` (`flux-general-multi`) + `codex-cli` (`codex-cli`), Technical Interview mode, `promptVariant: full`:

~~~powershell
$env:NATIVELY_E2E='1'; $env:NATIVELY_PROMPT_DEBUG='1'; npm run dev:agent
node "C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\replay_phase3.mjs" --provider deepgram-flux --ai-provider codex-cli --ai-model codex-cli --reps 2 --only 2,3,4,5
~~~

| Scenario | Rep | EoT / EoT→1st / Speech→1st | Drafts (s/r/d) | Visible answers & state |
|---|---:|---|---|---|---|
| 2. 1.2 s pause (`n=2`) | 1 | `2,360` / `5,167` / **`7,531 ms`** | `2 / 0 / 2` | `1` answer (`286` chunks); no answer during pause |
| 2. 1.2 s pause (`n=2`) | 2 | `3,094` / `4,347` / **`7,443 ms`** | `3 / 1 / 2` | `1` answer (`287` chunks); no answer during pause |
| 3. `"Mm-hmm"` mid-stream (`n=2`) | 1 | Q1: `2,819` / `4,094` / **`6,916 ms`** | `3 / 1 / 2` | `1` answer (`232` chunks, `outdated: false`); zero duplicate/cancel; `q2: "MM."` (`gid: null`) appeared from an intermediate non-filler partial |
| 3. `"Mm-hmm"` mid-stream (`n=2`) | 2 | Q1: `1,892` / `5,439` / **`7,333 ms`** | `3 / 1 / 2` | `1` answer (`204` chunks, `outdated: false`); zero filler bubble (`q1` only), zero duplicate/cancel |
| 4. Correction mid-stream (`n=2`) | 1 | Corr: `2,244` / `3,479` / **`5,723 ms`** | `2 / 2 / 0` | Q1 (`262` chunks) cancelled (`doneMs: null`, `outdated: true`); replacement (`79` chunks, `updated: true`), zero stale chunks (`-606` to `-2,243 ms` vs Phase 2) |
| 4. Correction mid-stream (`n=2`) | 2 | Corr: `2,228` / `3,001` / **`5,229 ms`** | `2 / 2 / 0` | Q1 (`245` chunks) completed at `8,265 ms` (294 ms before Corr EoT) so kept visible (`outdated: false`); Q2 (`67` chunks), zero stale chunks (`-1,100` to `-2,737 ms` vs Phase 2) |
| 5. Follow-up after completed (`n=2`) | 1 | FU: `1,507` / `1,439` / **`2,946 ms`** | `2 / 2 / 0` | `2` answers (`264` + `62` chunks); **Base kept visible (`outdated: false`)** |
| 5. Follow-up after completed (`n=2`) | 2 | FU: `1,564` / `1,411` / **`2,975 ms`** | `2 / 2 / 0` | `2` answers (`264` + `57` chunks); **Base kept visible (`outdated: false`)** |

- **Separation of evidence:** The table above contains full Windows Electron app (`dev:agent` WASAPI loopback) measurements only. Unit/mocked integration tests (`ResponseOrchestrator.test.mjs`, `Meeting.test.mjs`) are tracked separately above.
- **Note on S3 rep 1:** No duplicate answer or cancellation occurred, though `q2: "MM."` (`gid: null`) appeared once because an intermediate Flux partial briefly differed from the `m+` filler pattern before settling on `"MM."`.

### Validation

- **`npm run test:live-brain`:** `131/131` pass, `0` fail (includes `DeepgramVoiceAgentBrain.test.mjs`, `DeepgramFluxBrain.test.mjs`, `ResponseOrchestrator.test.mjs`, `Meeting.test.mjs`, `LiveBrainSettings.test.mjs`).
- **`npm run build:electron`:** passed (exit 0).
- **`npm run typecheck:electron`:** clean (exit 0).
- **`npm run typecheck:premium`:** clean (exit 0).
- **`npm run typecheck:ts7`:** clean (exit 0).
- **`npm run test:lib`:** `3,246` pass, `15` skipped, `0` fail.
- **`npm run test:components`:** `1,002` pass, `2` skipped, `0` fail.
- **Tested physically on Windows:** `dev:agent` Windows Electron app (`deepgram-flux` + `codex-cli`).
- **Reviewed but not executed on macOS. Requires physical macOS verification.**

### Phase 3 verification follow-up (Windows, 2026-11-27)

1. **S3 filler-bubble reproduction trace (`trace_s3.mjs`, `n=3` reps on `deepgram-flux` + `codex-cli`):**
   - Rep 1 & Rep 2: `q2s=[]` (zero filler bubbles).
   - Rep 3 reproduced `q2` with exact `liveBrainQuestion` sequence:
     `{"dt":7797,"questionId":"q2","text":"Emma","done":false}` → `{"dt":7991,"questionId":"q2","text":"MM","done":false}` → `{"dt":8110,"questionId":"q2","text":"MM.","done":false}` → `{"dt":8310,"questionId":"q2","text":"Mhmm.","done":false}` → `{"dt":10056,"questionId":"q2","text":"Mhmm.","done":true}`.
   - Cause: Flux emitted `"Emma"` as the first single-word partial for `"Mm-hmm."`, setting `bubble.shown = true` before revising to `"MM"` / `"MM."` / `"Mhmm."`.
2. **Fixes applied:**
   - **Flux short-opening-partial hold (`premium/electron/liveBrain/brains/DeepgramFluxBrain.ts`):** on `Update` when `lastPartialText` is empty, hold single-word partials shorter than 8 characters (`!/\s/.test(transcript) && transcript.length < 8`) until multi-word, `>= 8` chars, or `EndOfTurn` (`final: true`). Added `DeepgramFluxBrain.test.mjs` regression for `"Emma"` → `"MM"` → `"MM."` → `"Mhmm."` and `"Emma"` → `"Emma, how do you scale?"`.
   - **Deferred `outdated` fold (`premium/electron/liveBrain/ResponseOrchestrator.ts`):** on confirmed correction of an in-flight `writer` answer, cancel the superseded stream (`answer_corrected`) and clear `speaking`, but keep the old answer visible (`outdated: false`) until `onFirstText` fires on the replacement. If the replacement fails before showing text, `setOutdated(..., true)` is never sent.
3. **S2 paused-question latency check:**
   - Earlier Phase 3 run (`7,531` / `7,443 ms`) had `2/0/2` drafts in rep 1 (final turn did not reuse a draft, `EoT → 1st = 5,167 ms`) and `EoT = 3,094 ms` + `EoT → 1st = 4,347 ms` in rep 2 (`codex-cli` subprocess variance).
   - Rerun below (`2/1/1` drafts reused in both reps): **`5,909 ms`** (`EoT 2,097` + `EoT→1st 3,812 ms`) and **`5,714 ms`** (`EoT 2,950` + `EoT→1st 2,764 ms`), `1` answer each (`254` / `243` chunks), no premature answer during pause.
4. **Rerun S2–S5 Windows Electron replay (`n=2` per scenario, `deepgram-flux` + `codex-cli`):**

| Scenario | Rep | EoT / EoT→1st / Speech→1st | Drafts (s/r/d) | Visible answers & state |
|---|---:|---|---|---|---|
| 2. 1.2 s pause (`n=2`) | 1 | `2,097` / `3,812` / **`5,909 ms`** | `2 / 1 / 1` | `1` answer (`254` chunks); no answer during pause |
| 2. 1.2 s pause (`n=2`) | 2 | `2,950` / `2,764` / **`5,714 ms`** | `2 / 1 / 1` | `1` answer (`243` chunks); no answer during pause |
| 3. `"Mm-hmm"` mid-stream (`n=2`) | 1 | `—` / `—` / **`6,415 ms`** | `3 / 1 / 2` | `1` answer (`191` chunks, `outdated: false`); **zero filler bubble (`q1` only)**, zero duplicate/cancel |
| 3. `"Mm-hmm"` mid-stream (`n=2`) | 2 | `—` / `—` / **`9,264 ms`** | `2 / 1 / 1` | `1` answer (`261` chunks, `outdated: false`); **zero filler bubble (`q1` only)**, zero duplicate/cancel |
| 4. Correction mid-stream (`n=2`) | 1 | Corr: `2,098` / `2,467` / **`4,565 ms`** | `2 / 2 / 0` | Q1 (`1` chunk, `codex-cli` slow start) finished 29 ms before Corr EoT (`outdated: false`); Q2 (`63` chunks), zero stale chunks |
| 4. Correction mid-stream (`n=2`) | 2 | Corr: `2,092` / `4,892` / **`6,984 ms`** | `3 / 2 / 1` | Q1 (`254` chunks) cancelled (`doneMs: null`), kept visible while Q2 generated, folded at `14,530 ms` (`21 ms` before Q2 overlay `firstTextAt` `14,551 ms`); Q2 (`73` chunks, `updated: true`), zero stale chunks |
| 5. Follow-up after completed (`n=2`) | 1 | FU: `1,312` / `1,741` / **`3,053 ms`** | `2 / 2 / 0` | `2` answers (`260` + `71` chunks); **Base kept visible (`outdated: false`)** |
| 5. Follow-up after completed (`n=2`) | 2 | FU: `1,446` / `1,696` / **`3,142 ms`** | `2 / 2 / 0` | `2` answers (`286` + `60` chunks); **Base kept visible (`outdated: false`)** |

5. **Final validation after all edits:**
   - `npm run test:live-brain`: **`132/132`** pass, `0` fail.
   - `npm run build:electron`: passed (exit 0).
   - `npm run typecheck:electron`, `typecheck:premium`, `typecheck:ts7`: all clean (exit 0).
   - `npm run test:lib`: **`3,246`** pass, `15` skipped, `0` fail.
   - `npm run test:components`: **`1,002`** pass, `2` skipped, `0` fail.
   - **Tested physically on Windows:** `dev:agent` Windows Electron app (`deepgram-flux` + `codex-cli`).
   - **Reviewed but not executed on macOS. Requires physical macOS verification.**

Independent final review checked the saved Emma filler trace and Windows S2–S5 rerun summaries. Added a generation guard and regression assertion so a late first-text notification from a cancelled replacement cannot fold the earlier answer. The Electron build, all 132 Live Brain tests, and the 30-test orchestrator rerun passed.

## Baseline Phase 4 — Improve Flux Follow-up and Clarification Context (Windows, 2026-11-27)

Started from commit `5f51aa21` on `feat/live-brain`. Scope: `deepgram-flux` + My AI Provider (`fluxTurnContext.ts`, `ResponseOrchestrator.ts`, `AnswerWriter.ts`, `meeting.ts`, `electron/premium/liveBrain.ts`, `electron/IntelligenceEngine.ts`).

### Changes made

1. **Focused Flux turn-context builder (`premium/electron/liveBrain/fluxTurnContext.ts`):**
   - **Follow-ups (`<turn_context kind="follow_up">`):** pairs follow-up questions (pronouns/deictic referents or elliptical openers such as `"What if it needs to work offline?"`) with `lastConfirmedTurn.question` and `lastConfirmedTurn.answer` (truncated to 900 chars).
   - **Corrections (`<turn_context kind="correction">`):** carries forward `lastConfirmedTurn.question` and active `InterviewNotebook` constraints alongside the new correction (`"Actually, caching is not allowed."`). Unfinished/interrupted drafts are never recorded into `lastConfirmedTurn.answer` or `InterviewNotebook`.
   - **Pending clarification replies (`<turn_context kind="clarification_reply">`):** ties `{ originalQuestion, clarification, reply }` together when a pending `Ask:` exists; consumed once on confirmation and cleared on 10 s expiry, unrelated new questions, `response_silent`, `endProviderTurn` (reconnect/fallback), and `reset()` (meeting end).
   - **Unrelated new topics:** returns `''`, and `meeting.ts` (`trackWriterRun` / `startLiveBrainDraft`) preserves `''` instead of falling back to `supervisor.notebookContext`, avoiding stale topic leakage onto unrelated questions.
2. **Draft context staleness (`AnswerWriter.ts`, `electron/premium/liveBrain.ts`, `electron/IntelligenceEngine.ts`):**
   - Added `contextKey` to `LiveBrainDraftRequest`, `LiveBrainPrivateDraft`, `AnswerWriter.prepareDraft`, and `AnswerWriter.write`. If semantic turn context (`lastConfirmedTurn`, `pendingClarification`) changes between `EagerEndOfTurn` and `EndOfTurn`, the draft is discarded (`context_changed`) and the confirmed-turn path runs.

### AI-boundary & lifecycle tests (`134/134` passing in `npm run test:live-brain`)

- `Meeting.test.mjs` (`Phase 4: AI-boundary context for follow-ups, corrections, clarification replies, unrelated topics, and stale draft rejection`):
  - Inspected `streamCalls[i].transcript` passed to `whatToAnswerLLM.generateStream(...)` inside `IntelligenceEngine`:
    - Early-draft follow-up (`"What if it needs to work offline?"`) received `<turn_context kind="follow_up">`, `"collaborative note-taking app"`, and `"CRDTs with WebSocket delta sync"`, and adopted the draft.
    - Unrelated new topic (`"What is the difference between horizontal and vertical scaling?"`) received neither `<turn_context` nor `"collaborative note-taking app"`.
    - Interrupted product-lookup answer + early-draft correction (`"Actually, caching is not allowed."`) kept the unfinished tail out of `sessionAssistantWrites` and passed `<turn_context kind="correction">` with `"low-latency product lookup service"`.
    - Pending `Ask: Is disk latency acceptable?` + early-draft `"Yes."` passed `<turn_context kind="clarification_reply">` with `"Can the cache serve from disk?"`, `"Is disk latency acceptable?"`, and `"Interviewer reply: Yes."`, then consumed the clarification so a second `"Yes."` was suppressed as filler.
    - Meeting stop (`routing.stop()`) reset context so a new meeting's `"What if it needs to work offline?"` had zero `<turn_context` or prior-meeting leakage.
- `ResponseOrchestrator.test.mjs` (`Phase 4: clarification expiry, unrelated question consumption, reconnect reset, and stale-context draft discard`):
  - Verified 10 s clarification expiry suppresses subsequent `"Yes."`, unrelated questions consume pending clarification with empty context, `endProviderTurn()` clears pending clarification, and clarification expiry between `EagerEndOfTurn` and `EndOfTurn` updates `contextKey`.

### Windows Electron replay — 2026-11-27

Replayed S4 (correction) and S5 (follow-up) (`n=2` reps each, fresh meetings) on `dev:agent` (`NATIVELY_E2E=1`, `NATIVELY_PROMPT_DEBUG=1`) with `deepgram-flux` (`flux-general-multi`) + `codex-cli` (`codex-cli`), Technical Interview mode, `promptVariant: full`:

~~~powershell
$env:NATIVELY_E2E='1'; $env:NATIVELY_PROMPT_DEBUG='1'; npm run dev:agent
node "C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\replay_phase3.mjs" --provider deepgram-flux --ai-provider codex-cli --ai-model codex-cli --reps 2 --only 4,5 --out "C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\results_phase4_deepgram-flux_codex-cli.json"
~~~

| Scenario | Rep | EoT / EoT→1st / Speech→1st | Drafts (s/r/d) | Grounding & overlay state |
|---|---:|---|---|---|---|
| 4. Correction mid-stream (`n=2`) | 1 | Corr: `2,345` / `3,872` / **`6,217 ms`** | `2 / 2 / 0` | Q1 (`252` chunks) cancelled (`doneMs: null`, `outdated: true`); Q2 (`73` chunks, `updated: true`) preserved product-lookup read path without caching |
| 4. Correction mid-stream (`n=2`) | 2 | Corr: `2,143` / `3,029` / **`5,172 ms`** | `3 / 2 / 1` | Q1 (`260` chunks) cancelled (`doneMs: null`, `outdated: true`); Q2 (`68` chunks, `updated: true`) preserved partitioned indexed DB product-lookup read path without cache |
| 5. Follow-up after completed (`n=2`) | 1 | FU: `1,679` / `934` / **`2,613 ms`** | `2 / 2 / 0` | Base (`260` chunks) kept visible (`outdated: false`); FU (`55` chunks) grounded in local note copy + operation queue + Sync Service CRDT merge |
| 5. Follow-up after completed (`n=2`) | 2 | FU: `1,672` / `1,330` / **`3,002 ms`** | `2 / 2 / 0` | Base (`322` chunks) kept visible (`outdated: false`); FU (`63` chunks) grounded in local note copy + CRDT operation queue + Sync Service |

- **Clarification `"Yes."` note:** Verified deterministically at the AI route boundary in `Meeting.test.mjs` (`"Can the cache serve from disk?"` → `Ask: Is disk latency acceptable?` → `"Yes."`), as live `codex-cli` runs answer `"Design an e-commerce app."` directly with stated assumptions rather than emitting `Ask:`.

### Validation

- **`npm run test:live-brain`:** `134/134` pass, `0` fail.
- **`npm run build:electron`:** passed (exit 0).
- **`npm run typecheck:electron`, `typecheck:premium`, `typecheck:ts7`:** all clean (exit 0).
- **`npm run test:lib`:** `3,246` pass, `15` skipped, `0` fail.
- **`npm run test:components`:** `1,002` pass, `2` skipped, `0` fail.
- **Tested physically on Windows:** `dev:agent` Windows Electron app (`deepgram-flux` + `codex-cli`).
- **Reviewed but not executed on macOS. Requires physical macOS verification.**

## Baseline Phase 5 — Comparison and Regressions (Windows, 2026-11-27)

Started from commit `aba131df` on `feat/live-brain` (`platform: win32`, Technical Interview mode, `dev:agent` WASAPI loopback, `NATIVELY_E2E=1`, `NATIVELY_PROMPT_DEBUG=1`).

### 1. Routes & Test Connection verified

- **Deepgram Flux + My AI Provider:** `deepgram-flux` (`flux-general-multi`) + `codex-cli` (`codex-cli`) — `testLiveBrainConnection()` passed (`"Deepgram Flux connected. · Codex CLI (codex-cli) replied."`).
- **Deepgram Voice Agent:** `deepgram-voice-agent` (`listen: flux-general-multi`, `thinkMode: managed`, `managedProvider: open_ai`, `managedModel: gpt-4o-mini`) — `testLiveBrainConnection()` passed (`"Deepgram key verified · Think model replied."`).
- **OpenAI Realtime (`gpt-realtime-2.1`):** remains blocked on the available OpenAI account (no Realtime model access in `GET /v1/models`, Phase 1).
- **Gemini Live (`gemini-3.1-flash-live-preview`):** comparable Phase 1 Windows Electron baseline retained from `PROGRESS.md` (S1 `1,788 ms`, S2 `1,925`/`1,799 ms`, S4 `2,065 ms`, S5 `1,978 ms` with leaked preamble).

### 2. Full Electron App Corpus (`S1`–`S6`, `n=2` reps each)

Commands & raw artifacts (outside Git):
~~~powershell
$env:NATIVELY_E2E='1'; $env:NATIVELY_PROMPT_DEBUG='1'; npm run dev:agent
node "C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\replay_phase5.mjs" --provider deepgram-flux --ai-provider codex-cli --ai-model codex-cli --reps 2 --only 1,2,3,4,5,6
node "C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\replay_phase5.mjs" --provider deepgram-voice-agent --reps 2 --only 1,2,3,4,5,6
node "C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\replay_phase5.mjs" --provider deepgram-flux --ai-provider codex-cli --ai-model codex-cli --reps 2 --only 2 --out "C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\results_phase5_flux_s2_rerun.json"
~~~

- Flux JSON: `C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\results_phase5_deepgram-flux.json`
- Flux S2 post-fix JSON: `C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\results_phase5_flux_s2_rerun.json`
- Voice Agent JSON: `C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\results_phase5_deepgram-voice-agent.json`

#### Deepgram Flux + Codex CLI (`aba131df`, `n=2` per scenario)

| Scenario & clip | Rep | EoT / Speech→1st | Drafts (s/r/d) | Regressions & observations |
|---|---:|---|---|---|
| S1 Complete (`s1_complete.wav`) | 1 / 2 | `1,496`→**`2,758 ms`** / `1,367`→**`2,688 ms`** | `1/1/0` / `1/1/0` | `1` answer each (`60` chunks); `-2.4 s` vs Phase 1 (`5,130 ms`) |
| S2 1.2 s pause (`s2_pause1200.wav`, initial) | 1 / 2 | `2,843`→**`4,150 ms`** / `8,548`→**`6,043 ms`** | `3/1/2` / `8/2/6` | Rep 1 clean (`1` answer); Rep 2 had late single-letter `"A"` noise burst (`q2`, `gid 34`) |
| S2 1.2 s pause (**post-fix rerun**) | 1 / 2 | `2,581`→**`5,940 ms`** / `2,762`→**`4,827 ms`** | `2/1/1` / `3/1/2` | `1` answer each (`273`/`286` chunks, `outdated: false`); `-3.0` to `-4.1 s` vs Phase 1 (`8,917 ms`) |
| S3 `"Mm-hmm"` mid-stream (`s3_question+mmhmm`) | 1 / 2 | `1,835`→**`9,524 ms`** / `2,689`→**`8,118 ms`** | `2/1/1` / `2/1/1` | `0` duplicate answers/cancels (`outdated: false`); Rep 1 had `q2: "Mhmm."` (`gid: null`), Rep 2 `q1` only |
| S4 Correction mid-stream (`s4_question+correction`) | 1 / 2 | Corr `2,131`→**`4,599 ms`** / `2,097`→**`5,488 ms`** | `3/2/1` / `2/2/0` | Q1 cancelled (`outdated: true`), Q2 (`updated: true`, no cache, zero stale chunks); `-1.6` to `-2.5 s` vs Phase 1 (`7,058 ms`) |
| S5 Follow-up (`s5_base+followup`) | 1 / 2 | FU `1,406`→**`4,207 ms`** / `1,295`→**`3,341 ms`** | `2/2/0` / `2/2/0` | Base kept visible (`outdated: false` in `2/2`); FU grounded in CRDT + local note queue (`-1.3` to `-2.1 s` vs Phase 1 `5,458 ms`) |
| S6 Clarification (`s6_ambiguous.wav`) | 1 / 2 | `2,410`→**`18,755 ms`** / `2,448`→**`21,761 ms`** | `1/1/0` / `1/1/0` | `gotAsk=false` (answered with stated assumptions); live `"Yes."` blocked |

#### Deepgram Voice Agent (`managed` `open_ai` / `gpt-4o-mini`, `aba131df`, `n=2` per scenario)

| Scenario & clip | Rep | Speech→1st | Bursts & inter-chunk gaps | Regressions & observations |
|---|---:|---|---|---|
| S1 Complete (`s1_complete.wav`) | 1 / 2 | **`1,489 ms`** / **`1,200 ms`** | `4` bursts (`9,586`, `11,160 ms`) / `4` bursts (`5,298`, `5,321`, `7,560 ms`) | `1` answer each; multi-second gaps between `ConversationText` bursts |
| S2 1.2 s pause (`s2_pause1200.wav`) | 1 / 2 | **`3,984 ms`** / **`3,059 ms`** | `5` bursts (`3.6–9.8 s` gaps) / `4` bursts (`6.2–9.2 s` gaps) | Rep 1 `1` bubble; Rep 2 split question into `q1` + `q2: "Millions of concurrent users."` |
| S3 `"Mm-hmm"` mid-stream (`s3_question+mmhmm`) | 1 / 2 | **`-3,759 ms`** / **`-3,766 ms`** (premature!) | `2` bursts (`q1`) + `2–3` bursts (`q2`, `5.1–8.2 s` gaps) | **Early split:** fired Answer 1 before `s3_question.wav` ended (`-3.76 s`), then `Walk me through...` superseded it (`outdated: true`, `updated: true`) |
| S4 Correction mid-stream (`s4_question+correction`) | 1 / 2 | Corr: **`10,307 ms`** / **`10,344 ms`** | `2` bursts (`q1`) + `4` bursts (`q2`, `2.1–8.8 s` gaps) | Answer 1 finished (`18.3` / `20.4 s`) before correction; Answer 2 omitted caching (`outdated: false`) |
| S5 Follow-up (`s5_base+followup`) | 1 / 2 | FU: **`3,147 ms`** / **`1,295 ms`** | `4–5` bursts (`4.3–10.3 s` gaps) | Base kept visible (`outdated: false`), follow-up grounded in offline local storage |
| S6 Clarification (`s6_ambiguous.wav`) | 1 / 2 | **`22,299 ms`** / **`20,603 ms`** | `1` burst each | `gotAsk=false` (answered directly); live `"Yes."` blocked |

### 3. Fix & Regression Verification
- **Single-letter `"A"` noise-burst filler (`premium/electron/liveBrain/ResponseOrchestrator.ts`):** added `a` to `FILLER_WORD` so isolated `"A"` / `"A."` noise artifacts are suppressed while multi-word questions (`"A cache?"`, `"A B-tree?"`) pass. Added unit assertions in `ResponseOrchestrator.test.mjs` and verified `S2` rerun (`1` answer each, `5,940` / `4,827 ms`).
- **Clarification lifecycle (deterministic coverage):** Live S6 `"Design an e-commerce app."` did not emit `Ask:` on either Deepgram mode (`gotAsk=false`). Reply (`"Yes."`), 10 s timeout stated-assumption fallback, and reconnect/meeting-end clearing are verified in `Meeting.test.mjs` and `ResponseOrchestrator.test.mjs` (`135/135` passing).

### 4. Final Validation
- `npm run test:live-brain`: **`135/135`** pass, `0` fail (includes `DeepgramVoiceAgentBrain.test.mjs`, `DeepgramFluxBrain.test.mjs`, `ResponseOrchestrator.test.mjs`, `Meeting.test.mjs`, `LiveBrainSettings.test.mjs`).
- `npm run build:electron`: passed (exit 0).
- `npm run typecheck:electron`, `typecheck:premium`, `typecheck:ts7`: all clean (exit 0).
- `git diff --check`: exit 0.
- **Tested physically on Windows:** `dev:agent` Windows Electron app (`deepgram-flux` + `codex-cli` and `deepgram-voice-agent` managed `open_ai`/`gpt-4o-mini`).
- **Remaining open:** OpenAI Realtime live run (blocked by account model access), live `Ask:` → `"Yes."` trigger from an unprompted model, and **physical macOS verification (`Requires physical macOS verification`)**.

### Baseline Phase 4 review

- Fixed the Flux writer clarification timeout to send the original question, clarification, and stated-assumption instruction through AnswerWriter. Reconnect and silent turns cancel the pending timer. Speech suppresses the timed fallback while the pending reply is still eligible until expiry.
- Unrelated questions can supersede an active stream without being treated as corrections. Successive corrections retain the confirmed question and correction text, and the draft key includes relevant notebook constraints apart from sentences already represented by the current transcript.
- Independently verified the saved Windows Electron traces for both corrections and both completed-answer follow-ups. From clip end to first visible text, follow-ups took 2,613 and 3,002 ms and replacements took 6,217 and 5,172 ms. These traces predate the review fixes. The short-reply and timeout paths are covered through automated meeting and AI-route tests.
- Independent validation on Windows: Electron build, all 135 Live Brain tests, Electron and premium type checks, and diff whitespace check. Physical macOS and a live provider clarification replay remain open.

### Baseline Phase 5 independent review

- Recalculated the clip-end-to-first-text timings from the three saved Windows Electron JSON files. Flux S2 initial repetition 2 started two answer generations and the first never reported completion. The two saved S2 reruns each show one completed answer. Narrowed the filter to standalone "A" and "A." and added coverage that "A?" still passes.
- Flux S3 repetition 1 showed a "Mhmm." question row with no answer generation. Neither S3 run cancelled the answer. Repeated the isolated S3 backchannel WAV three times over the Flux transport using the existing eager probe adapted to include Update events. All three finalized as "mm." and none supplied a new transcript sequence explaining the renderer leak. Saved those transport events in scratch/results_phase5_review_s3_transport.jsonl alongside the Electron JSON files. A fresh full-app trace of the failing sequence remains open.
- Voice Agent S3 started answering about 3.76 s before the question clip ended in both runs, and S2 repetition 2 showed two question rows. Several Voice Agent captures lack a completion event. The summaries cannot distinguish a truncated answer from the replay ending before the provider completed.

### Baseline Phase 5 follow-up trace, fix, and rerun (Windows, 2026-11-27)

1. **Full-app Flux S3 filler-bubble reproduction (`trace_phase5_detail.mjs`):**
   - Raw trace: `C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\trace_phase5_detail.json`
   - Captured exact sequence on `s3_mmhmm.wav` (`p2=[6422, 7388]` ms relative to `p1.psEnd`):
     - `dt: 7339` `interviewer_speech_started`
     - `dt: 7942` `interviewer_transcript` `text: "É mesmo"`, `final: false` → **opened `q2` (`dt: 7950`, `questionId: "q2"`, `text: "É mesmo"`, `done: false`)**
     - `dt: 8099` `interviewer_transcript` `text: "É mesmo?"`, `final: false` → `dt: 8138` `eager_end_of_turn` `"É mesmo?"`
     - `dt: 8258` `interviewer_transcript` `text: "Emem."`, `final: false` + `turn_resumed` → `dt: 8299` `eager_end_of_turn` `"Emem."`
     - `dt: 9898` `interviewer_transcript` `text: "Mhmm."`, `final: false` + `turn_resumed` → `dt: 9939` `eager_end_of_turn` `"Mhmm."`
     - `dt: 10857` `interviewer_transcript` `text: "Mhmm."`, `final: true` + `decision` `"Mhmm."` → `dt: 10891` `q2: "Mhmm.", done: true`.
   - Cause: multilingual `flux-general-multi` transcribed the nasal onset as `"É mesmo"` (2 words, 7 chars), which bypassed the prior single-word `< 8`-char hold and set `bubble.shown = true` before revising to `"Mhmm."`.

2. **Fix & deterministic regression (`DeepgramFluxBrain.ts`, `DeepgramFluxBrain.test.mjs`):**
   - Updated `DeepgramFluxBrain.ts` (`Update`, `EagerEndOfTurn`, `TurnResumed`) to hold opening `interviewer_transcript` (`final: false`) until `lastPartialText` is set OR `(transcript.length >= 12 && /\s/.test(transcript))`. `EndOfTurn` still emits `final: true` for every turn.
   - Replaced the earlier `"Emma"` test in `DeepgramFluxBrain.test.mjs` with the captured `"É mesmo"` → `"É mesmo?"` → `"Emem."` → `"Mhmm."` sequence and verified that `"A cache with TTL?"` still streams live once `>= 2` words and `>= 12` chars.

3. **Post-fix Flux S2–S4 Windows Electron rerun (`n=2` each, `deepgram-flux` + `codex-cli`):**
   - Command: `node "C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\replay_phase5.mjs" --provider deepgram-flux --ai-provider codex-cli --ai-model codex-cli --reps 2 --only 2,3,4 --out "C:\Users\dell\.gemini\antigravity\brain\73d0cf55-9cfb-4f3e-9d1b-ae367f1b886e\scratch\results_phase5_flux_postfix_s234.json"`
   - **S2 (1.2 s pause):** `7,156 ms` (`EoT 2,896 ms`, drafts `2/1/1`, `256` chunks) and `4,648 ms` (`EoT 2,667 ms`, drafts `2/1/1`, `262` chunks) — `1` question, `1` answer (`outdated: false`) in both reps.
   - **S3 (`"Mm-hmm"` mid-stream):** `6,323 ms` (`EoT 1,934 ms`, `185` chunks) and `7,028 ms` (`EoT 1,981 ms`, `313` chunks) — **`q1` only (`0/2` filler bubbles)**, `1` answer (`outdated: false`), zero cancellations.
   - **S4 (Correction mid-stream):** `7,590 ms` (`Corr EoT 1,981` + `EoT→1st 5,609 ms`, drafts `2/2/0`) and `5,185 ms` (`Corr EoT 1,810` + `EoT→1st 3,375 ms`, drafts `2/2/0`) — Q1 cancelled (`outdated: true`), Q2 (`updated: true`, `62`/`64` chunks), zero stale chunks.

4. **Voice Agent S2 & S3 diagnosis (`trace_phase5_detail.json`, `managed` `open_ai` / `gpt-4o-mini`):**
   - **S2 (`play=[-5028, 0]`):** Deepgram's server-side Voice Agent endpointed during the 1.2 s pause at `dt: -2040` (`"How would you design a system that can handle?"`), started `response_started` at `dt: -1103` (`"Ask: Can you specify..."`), cancelled on `UserStartedSpeaking` at `dt: -819`, then finalized `"Millions of concurrent users."` at `dt: +4204` (`response_delta` bursts at `4.2 s`, `10.3 s`, `22.5 s`, `29.3 s`; `AgentAudioDone` had not arrived by `+35 s`).
   - **S3 (`p1=[-7721, 0]`, `p2=[5, 908]`):** Deepgram's server-side Voice Agent endpointed between the two sentences of `s3_question.wav` at `dt: -4368` (`"How would you make retry safe in an order API?"`), started `response_started` at `dt: -3453` (`112` chars), cancelled at `dt: -3265` when `"Walk me through..."` began, then finalized `q2` at `dt: +2243` (`7` bursts from `2.3 s` to `30.6 s`; `AgentAudioDone` not yet emitted by `+35 s`).
   - **Conclusion:** Both S2/S3 splits and early answers originate in Deepgram Voice Agent's server-side endpointing/streaming behavior (`flux-general-multi` inside `/v1/agent/converse` without standalone `eot_threshold=0.95` / `eot_timeout_ms=1500`), not local `ResponseOrchestrator` handling. Left open as an upstream provider-behavior finding outside Phase 5 scope.

5. **Final validation after all edits:**
   - `npm run test:live-brain`: **`135/135`** pass, `0` fail.
   - `npm run build:electron`: passed (exit 0).
   - `npm run typecheck:electron`, `typecheck:premium`, `typecheck:ts7`: all clean (exit 0).
   - `git diff --check`: exit 0.
   - **Clarification & platform status:** Live S6 `Ask:` → `"Yes."` remains blocked (`gotAsk=false` on both Deepgram modes); deterministic reply, timeout, and reconnect tests pass in `test:live-brain`. **Requires physical macOS verification.**


### Baseline Phase 5 final review

- Independently inspected the saved Flux and Voice Agent traces and all six post-fix Flux runs. Both S3 runs show one completed answer and one question row. S2 retained one completed answer per run, and both S4 replacements completed.
- Centralized the Flux opening-partial guard and count Unicode characters without requiring whitespace. The automated regression covers the captured filler sequence, a short confirmed question, and live emission of a long partial in a language without word-separating spaces. The saved Windows reruns predate this adjustment.
- Voice Agent emitted response events before the question clips ended. Its second answers lacked a completion event within the 35-second capture, so completion beyond that window was not verified. The S2 clarification was interrupted before it could support a live reply or timeout test.
- The Windows Electron build, 135 Live Brain tests, Electron, premium, and TS7 type checks, and diff whitespace check passed. Phase 5 comparison is complete. Live clarification, Voice Agent provider behavior, OpenAI Realtime access, and physical macOS verification remain documented follow-ups.
