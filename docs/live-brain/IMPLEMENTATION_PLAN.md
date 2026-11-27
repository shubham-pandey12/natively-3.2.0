# Live Brain — Implementation Plan

> **Canonical plan.** Follow phases in order. Each phase is one reviewable unit of work (one or a few commits).
> Spec: [ARCHITECTURE.md](ARCHITECTURE.md). Status: [PROGRESS.md](PROGRESS.md).
> Branch: `feat/live-brain`. Push only to `origin` (never upstream). No Claude/Codex attribution lines in commits or PRs.

---

## Rules for every agent (read before each phase)

1. **Read** `CLAUDE.md`, `ARCHITECTURE.md`, and `PROGRESS.md` first. Do the next unchecked phase only.
2. **Scope:** do not start the next phase, do not refactor unrelated code, do not rename existing symbols.
3. **Flag-off parity:** with `liveBrain.enabled = false`, behaviour must be identical to before. Every phase must prove this with the existing test suites.
4. **Reuse first:** existing prompts, STT, capture, overlay delivery, summarizer, key storage. Never copy-paste prompt text — import and compose.
5. **No new dependencies** unless the phase explicitly allows it. No native modules. No Unix-only or Windows-only commands in scripts.
6. **Facts over memory:** provider protocol details (Gemini/OpenAI field names, sample rates, limits, model names) must come from current official docs checked during the phase, and be written into PROGRESS.md with the source URL.
7. **Tests:** Node test runner (`*.test.mjs`, run against compiled output — `npm run build:electron` first), fake clocks for timing (`premium/electron/autoAnswer/__tests__/fakeClock.mjs` pattern), mock WebSocket servers for providers. Never hit real paid APIs in automated tests.
8. **Platform:** inject platform/clock/socket factories where practical. No `process.platform` checks in liveBrain code (it should not need any).
9. **Finish each phase** by updating PROGRESS.md (what was done, decisions, measured numbers, remaining risks) and producing the CLAUDE.md completion report (validation categories; macOS is `Requires physical macOS verification` unless physically tested).
10. **When the spec is wrong or unclear:** stop and ask the user; update ARCHITECTURE.md only with agreement.

### Standard validation commands (run what applies, report actual results)

```
npm run build:electron
npm run test:auto-answer
npm run test:lib
npm run test:live-brain  # Electron build, Live Brain suite, and settings IPC tests
npm run typecheck   # if defined; otherwise the project's tsc command
npm run lint        # if defined
npm run test:ci     # before marking a phase done when practical
```

Check `package.json` for exact script names before running; do not invent scripts.

---

## Phase UI — Settings UI first  *(≈2–3 days)*  ← **do this first (user decision 2026-11-25)**

**Objective:** the user can see and configure Live Brain before the brain exists. Settings only; no runtime behaviour changes.

Tasks:
1. **General tab switch** per ARCHITECTURE §9a — new "Live Brain" row directly below the Auto Answer row in `src/components/SettingsOverlay.tsx`, identical markup pattern (icon tile, title, "Beta" `LiquidGlassBadge variant="sky"`, description, `SettingsToggle`, optimistic update + rollback). Persist `liveBrainEnabled` (default `false`) via the existing settings store; `appState.getLiveBrainEnabled()/setLiveBrainEnabled()`; IPC `live-brain:get-enabled` / `live-brain:set-enabled` (boolean-only validation); preload `getLiveBrainEnabled` / `setLiveBrainEnabled` with types. Turning on with no usable key for the selected provider → inline message, switch stays off.
2. **Audio tab "Live Brain Provider" section** per ARCHITECTURE §9b — after the Speech Provider section, built from the same components/styles: provider selector (`gemini-live` default | `openai-realtime` | `pipeline`), per-provider masked key fields saved via `CredentialsManager` (`setLiveBrainGeminiKey`/`setLiveBrainOpenaiKey` + has-key), "Use my AI Providers key" option, model fields (`liveBrainGeminiModel`, `liveBrainOpenaiModel`), instruction variant (`liveBrainPromptVariant`: full | trimmed), **Test connection** button, status line. IPC `live-brain:get-config` (never returns raw keys — `hasKey`, masked suffix, `usingAiProvidersKey`), `live-brain:set-provider`, `live-brain:set-key`, `live-brain:set-options`, `live-brain:test-connection`; preload equivalents; broadcast `credentials-changed`.
3. **Test connection** in this phase: validate that a key is present and well-formed and return a clear "not available yet — brain arrives in Phase 4" result. Real connection test is added in Phase 4. Do not call external APIs yet.
4. i18n: wrap new strings with `t(...)` like neighbouring rows.
5. **No runtime effect:** the switch only persists and broadcasts. Auto Answer and every other behaviour must be unchanged whether the switch is on or off (the brain is wired in Phase 4).

Files: `src/components/SettingsOverlay.tsx`, `electron/preload.ts`, `electron/ipcHandlers.ts`, `electron/main.ts` (AppState getters/setters only), `electron/services/SettingsManager.ts` (if keys are declared there), `electron/services/CredentialsManager.ts`, i18n resource files if the repo uses them.
Tests: setting defaults to false and persists; IPC rejects non-boolean / unknown provider; `get-config` never returns raw keys; AI-Providers-key reuse resolution; renderer toggle rollback on failure. Manual (agent-browser per CLAUDE.md): General shows "Live Brain" directly under Auto Answer with matching style; Audio shows "Live Brain Provider" after Speech Provider; saving a key shows masked state; Auto Answer behaviour unchanged.
Acceptance: UI matches Auto Answer / Speech Provider patterns; no raw key reaches the renderer; existing suites green (`test:auto-answer`, `test:lib`).
Out of scope: any brain, orchestrator, overlay answer changes.

> Phase 2 task 5 (settings) is satisfied by this phase; Phase 2 only adds the remaining foundation pieces.

---

## Phase 0 — Verify facts & measure baseline  *(≈2–3 days)*

**Objective:** remove guesswork; establish numbers to beat.

Tasks:
1. From current official Google docs, confirm and record (with URLs) the answers to ARCHITECTURE §14 Q1–Q4: Gemini Live model(s), TEXT modality support, output transcription, input audio format, VAD config, session limit, `goAway`, session resumption, context compression, free-tier limits.
2. From OpenAI docs, confirm Q5 (Realtime conversation model name, text-only output, price).
3. Add a timing mark to the existing answer path: `speechStoppedAt → firstVisibleTextAt` (extend the existing trace marks in `IntelligenceEngine.ts`, e.g. near `first_visible_text`). Dev-only exposure via Prompt Debugger.
4. Build the scenario corpus `tests/live-brain/scenarios/` (text scripts + timing; audio recordings optional, user-provided). Minimum scenarios: S1–S12 from §Test corpus below.
5. Write a **throwaway spike script** (not shipped; under `scripts/spikes/` or the scratchpad) that opens a Gemini Live session with a user-provided key, streams a WAV file, and prints events + timings for TEXT mode and AUDIO+transcription mode. Record results.
6. Record baseline latency/quality of the current pipeline on the corpus.

Files: `electron/IntelligenceEngine.ts` (timing mark only), `tests/live-brain/scenarios/*`, PROGRESS.md.
Acceptance: all §14 questions answered or explicitly marked "blocked" with reason; baseline numbers in PROGRESS.md; flag-off suites green.
Out of scope: any product code for Live Brain.

---

## Phase 1 — Corrections replace stale answers in today's pipeline  *(≈3–4 days)*

**Objective:** make corrections and interruptions replace stale automatic answers, so PipelineBrain is a good fallback.

**Gating (D9):** the new correction behaviour is active **only while the Live Brain switch is on** (read via `appState.getLiveBrainEnabled()`, injected into the engine — not read from settings inside the engine). With the switch off, Auto Answer behaves exactly as before, byte-for-byte. Making it the default for everyone is a separate, later decision.

Current behaviour (verified): new interviewer speech cancels a streaming automatic answer only via `joinsDispatch` (`SimpleAutoAnswer.ts` ~1072: within 1.5 s, same speaker, continuation-shaped). Corrections like "Actually, caching is not allowed" are parked (`parkAutomatic` ~1604) and the outdated answer stays on screen.

Tasks:
1. While an automatic answer is streaming or was delivered < ~20 s ago, an interviewer final that is **not** filler/backchannel (reuse existing `isInertUtterance` / backchannel detection) must:
   - immediately mark the visible answer as outdated (overlay flag), and
   - be judged together with the dispatched question text (so the judge sees the correction in context), and
   - if the judge says answer → cancel the current stream (`cancelAutomaticAnswer`) and dispatch a new answer that includes the correction; if not → clear the outdated flag.
2. Filler during an answer never cancels it.
3. Overlay: `outdated` fold for the previous answer (minimal UI).

Files: `premium/electron/autoAnswer/SimpleAutoAnswer.ts`, `electron/IntelligenceEngine.ts`, `src/components/NativelyInterface.tsx`, overlay lib helpers as needed.
Tests (fake clock): correction mid-stream → cancel + new answer; correction 10 s after answer → new answer, old marked outdated; "mm-hmm"/"okay" mid-stream → no cancel; existing `test:auto-answer` suite fully green.
Acceptance: Scenario S4/S5 pass on PipelineBrain; no regression in existing Auto Answer tests.
Risk: delicate timing code — keep changes additive and behind clear conditions.

---

## Phase 2 — Live Brain foundation  *(≈2–3 days)*

**Objective:** contracts, instructions, parser, factory, test double — no provider, no runtime wiring. Settings were already delivered in Phase UI.

Tasks:
1. `premium/electron/liveBrain/types.ts` exactly per ARCHITECTURE §4, **including the `decision` event from §6** (`decisionId`, `action: 'answer'|'ask'|'wait'`, `question?`, `clarification?`, `kind?`, `at`). Reuse `LiveBrainProvider`/`LiveBrainKeyProvider` from `src/types/liveBrainSettings.ts` rather than redefining them.
2. `instructions.ts` per §5, two builders:
   - `buildDeciderInstructions(ctx)` — for Gemini Live (D10): live-session preamble, the `decide_turn` protocol (call it at every end of interviewer turn, never speak an answer), clarification rule, correction rule, short profile summary, optional notebook text. Short, no answer-style rules.
   - `buildAnswerInstructions(ctx, variant)` — for brains that write answers themselves (OpenAI Realtime): composes the **existing** Natively answer prompt constants (import them; never copy prompt text), plus preamble, sentinel protocol (§6), clarification and correction rules, profile context, optional notebook. `variant: 'full' | 'trimmed'`.
   - Both take their inputs as parameters (profile, mode, notebook text) — no settings/global reads inside.
3. `decideTurnTool.ts`: the `decide_turn` function declaration (name, description, JSON schema per §4.1) and `parseDecideTurnArgs(raw) → decision | null` that validates and normalises (unknown action → null; `answer` without `question` → null; trims; caps lengths).
4. `responseParser.ts` per §6 (streaming sentinel detection for text-writing brains and the Gemini transcription-marker fallback).
5. `index.ts` factory with exhaustive switch (§3). In this phase the three brain ids can return a clear "not implemented yet" brain or throw a typed error — but an **unknown** id must throw.
6. `__tests__/FakeLiveBrain` test double implementing `LiveBrain` (scriptable events, records calls).

Tests: parser (sentinel split across chunks, whitespace/markdown around it, no sentinel → answer, mid-text sentinel ignored); decide_turn arg parsing (valid answer/ask/wait, missing question, unknown action, oversized strings, non-object input); decider instructions mention decide_turn and the clarification/correction rules and contain no answer-style contract; answer instructions include the existing human spoken answer contract (by import, asserted via a distinctive substring) and differ between full/trimmed; factory throws on unknown id; FakeLiveBrain satisfies the interface.
Acceptance: unit tests green; no runtime behaviour change (nothing imports `liveBrain/` from the meeting path yet); flag-off parity; existing suites green.

---

## Phase 3 — ResponseOrchestrator + overlay  *(≈3–4 days)*

**Objective:** the single owner of what the screen shows for Live Brain, driven by `FakeLiveBrain` and a fake answer writer. Aligned with D10 (Gemini decides, the existing answer path writes) and reusing Phase 1's outdated/Updated mechanism. No real provider, no meeting wiring yet.

Tasks:
1. `premium/electron/liveBrain/ResponseOrchestrator.ts` per ARCHITECTURE §7, consuming `LiveBrainEvent`s from any brain and talking to the app only through injected ports (no imports of `IntelligenceEngine`/`main.ts`):
   - `answerWriter.write({ question, replacesAutomaticAnswer }) → { generationId, done: Promise<…> }` and `answerWriter.cancel(reason)` — implemented for real in Phase 4 (AnswerWriter); a fake here.
   - `overlay.showAsk({ askId, clarification })`, `overlay.setOutdated(generationId, boolean)`, `overlay.setInterviewerSpeaking(generationId, boolean)`.
   - `clock` (fake-clock friendly).
   Behaviour:
   - `decision.answer` → if an answer is current (streaming, or completed < ~20 s ago) mark it outdated and cancel it if still streaming; then `answerWriter.write(question, replacesAutomaticAnswer: true when replacing)`.
   - `decision.ask` → mark the current answer outdated (if any) and show the clarification; start the clarification timer.
   - `decision.wait` → clear the interviewer-speaking marker; keep the current answer; never cancel.
   - `interviewer_speech_started` while an answer is current → set the interviewer-speaking marker (logical latency ≤ 300 ms).
   - **Clarification timeout:** if an ask is showing and no `interviewer_speech_started` arrives within ~10 s, call `answerWriter.write` with the clarified question plus "The interviewer did not clarify; state a reasonable assumption first." If speech does arrive, cancel the timer (Gemini's next decision handles it).
   - `response_started / response_delta / response_done` (brains that write text themselves, e.g. OpenAI Realtime): run text through `responseParser` (§6) and map wait/ask/answer the same way; text before `response_started` is never shown; late deltas of a cancelled/older response are dropped; duplicate `response_done` is harmless.
   - Idempotent `reset()` for meeting start/stop.
2. **Ask carries its question.** Extend `decide_turn` so `action:"ask"` also fills `question` (the question being clarified): update `DECIDE_TURN_TOOL` descriptions, `parseDecideTurnArgs` (keep optional `question` on ask), `buildDeciderInstructions`, and ARCHITECTURE §4.1. Needed for the clarification timeout.
3. **Overlay (UI identical to Auto Answer, ARCHITECTURE §7 UI rule):**
   - Reuse Phase 1's outdated/"Updated" path (`IntelligenceEngine.setAutomaticAnswerOutdated`, `what_to_answer_question { outdated | updated }`, `Message.outdated/updated`). Do not build a second mechanism.
   - Ask: add an optional `clarification` (and `askId`) field to the existing `what_to_answer_question` event/IPC payload and render it in the **same automatic-answer row style** with an "Ask:" label. No new renderer/component.
   - Interviewer speaking: optional `interviewerSpeaking: boolean` on the same event; a small marker using existing status/muted styles.
   - Thin adapter `premium/electron/liveBrain/overlayPort.ts` (or on `IntelligenceManager`) that implements the overlay port by emitting those events — not wired into meetings yet.
4. Status line: **deferred to Phase 5** (keep this phase small).

Tests (fake clock + FakeLiveBrain + fake answer writer + fake overlay port):
- answer decision → write called once; second answer decision while streaming → previous outdated + cancel + replacement write with `replacesAutomaticAnswer:true`.
- answer decision 10 s after completion → previous outdated, no cancel; 25 s after → not outdated.
- ask → clarification shown, previous outdated; timeout at 10 s → assumption write; speech before 10 s → no timeout write.
- wait → marker cleared, nothing cancelled.
- interviewer_speech_started during answer → marker set immediately.
- text-writing brain path: `[[NO_ACTION]]` keeps previous answer; `[[ASK]]` shows tip; late deltas from an old response dropped; duplicate `response_done`; no text shown before `response_started`.
- parseDecideTurnArgs keeps `question` on ask.
- Renderer: helper/component tests for the "Ask:" row and interviewer-speaking marker in `src/lib/__tests__/` or `src/components/__tests__/`; flag-off rendering unchanged.
Acceptance: all orchestrator scenarios pass; with injected events in `npm run dev:agent`, the overlay shows Ask and marker rows in the Auto Answer style (agent-browser snapshot per CLAUDE.md); flag-off parity; existing suites green.

---

## Phase 4 — GeminiLiveBrain + AnswerWriter (fast text path)  *(≈7–9 days)*

> **Done, then superseded for the answer path by D12 / Phase 4b.** Connection, audio streaming, resumption, errors and meeting wiring stay; the decide_turn + AnswerWriter answer path is replaced.

**Objective:** the main brain, per ARCHITECTURE D10: Gemini Live listens and decides; the existing Natively answer path writes the text fast.

Tasks:
0. **Spike first (½ day):** extend `scripts/spikes/gemini-live.mjs` with a `--decide` mode that registers the `decide_turn` function tool and the decider instructions, and logs `speech_end → toolCall` latency and the tool arguments. Run it (user's key from `.env` via `node --env-file=.env`) on the S1, S2, S4 and S7 questions. Record results in PROGRESS.md. If tool calls are slow (> ~1.5 s) or unreliable, switch to the transcription-marker fallback (ARCHITECTURE §4.1) and record why.
1. `brains/GeminiLiveBrain.ts` per ARCHITECTURE §4.1: setup (`AUDIO` + discard audio, `inputAudioTranscription`, auto VAD, session resumption, context compression, `decide_turn` tool), audio streaming (resample to 16 kHz with existing resampler utilities), candidate text turns without response, `toolCall` → `decision` event + `toolResponse`, `interrupted` → `interviewer_speech_started`, `goAway` → `session_expiring`, error classification (auth/quota/rate_limited/network/protocol).
2. `AnswerWriter.ts` per §4.4: `decision.answer` → existing automatic answer path (`IntelligenceEngine` automatic mode) with the decided question + notebook context, user's selected answer model; cancel the in-flight answer on a newer decision; `ask` shown directly; `wait` no-op. The old Auto Answer judge is bypassed while GeminiLiveBrain is active.
3. Reconnect with exponential backoff (reuse the backoff policy style of existing STT providers).
4. Wire into `main.ts` behind `liveBrainEnabled`: tap interviewer PCM to the brain; send candidate finals; suppress the old engine's automatic dispatch while a non-pipeline brain is active; react to the switch mid-meeting per ARCHITECTURE §9a.
5. Test connection in Settings → Audio becomes real for Gemini (short setup, no audio).
6. Prompt Debugger: record decider instructions, each decision, and timings (`speechStop → decision → firstAnswerText → done`).

Tests: mock WebSocket server replaying recorded Gemini event sequences (from the spikes): answer decision, ask, wait, interruption mid-answer (new decision cancels the old answer), goAway, 429, auth failure, socket drop. AnswerWriter: decision → existing answer path called once with the decided question; newer decision cancels; ask/wait never call the text model.
Manual: S1–S9 with a real free key on Windows; record latency vs ARCHITECTURE §11.
Acceptance: scenarios pass manually; full short answer visible ≤ ~5 s; latency recorded; flag-off parity.

---

## Phase 4b — Gemini Live writes the answer, streamed in real time (D12)  *(≈3–4 days)*  ← **next**

**Objective:** ChatGPT-Voice behaviour per ARCHITECTURE D12 and §4.1: Gemini Live answers by itself; its output transcription streams into the overlay word by word as Gemini speaks. No `decide_turn`, no AnswerWriter/text model for GeminiLiveBrain.

Tasks:
0. **Spike first (½ day), before product code:** extend `scripts/spikes/gemini-live.mjs` with an `--answer` mode: answer instructions (§5), `outputAudioTranscription` on, no tools, audio discarded. On S1, S2, S4, S7 (+ one filler, one ambiguous question) record, per model in the user's list (`gemini-3.1-flash-live-preview`, `gemini-3.8-live` if available): speech end → first transcription chunk; chunk sizes/cadence (must be incremental); speech end → turnComplete; whether filler gets silence / `No action.`; whether ambiguity gets `Ask: …`; behaviour on barge-in. Record in PROGRESS.md. **Stop and report to the user** if transcription is not incremental or first words take > ~1.5 s.
1. `GeminiLiveBrain.ts`: setup per §4.1 (D12) — `outputAudioTranscription`, answer instructions, no tools. Map output transcription → `response_started` / `response_delta` (immediately) / `response_done`; `interrupted` → `response_done{cancelled}` + `interviewer_speech_started`. Keep audio discarded, resumption, goAway, errors, candidate text as today. Remove the `decide_turn` path from this brain (leave `decideTurnTool.ts` unused or delete it with its tests — say which).
2. `instructions.ts`: Gemini uses `buildAnswerInstructions` with the spoken sentinel protocol (§6) and the profile/resume/JD/mode context the existing answer path uses (passed in as parameters, from main.ts).
3. `responseParser.ts`: accept spoken sentinels (`No action`, leading `Ask:`) besides the bracket forms; never hold text longer than needed to decide (≤ ~16 chars).
4. `meeting.ts` / `ResponseOrchestrator.ts`: use the existing text-writing-brain path (response_* events) for Gemini; overlay rows identical to Auto Answer (§7 UI rule); replace-in-place on barge-in; clarification timeout sends the assumption instruction to Gemini as a client text turn. AnswerWriter is not created for Gemini.
5. Prompt Debugger timings: `speechStoppedAt → firstTextAt → doneAt`, status, model.
6. **End-of-speech tuning (added after the spike, user accepted 2026-11-26):** expose `realtimeInputConfig.automaticActivityDetection` (`endOfSpeechSensitivity`, `silenceDurationMs`, `prefixPaddingMs`) as constants in GeminiLiveBrain (not user settings yet). Re-run the `--answer` spike on S1 (mid-question pause), S2, S4, S7 with 2–3 settings; pick the fastest setting that does not answer during S1's pause; record in PROGRESS.md.

**Spike result (Task 0, 8182296a):** transcription incremental (~130–140 ms chunks); first words median 1.46 s (3.1 Flash Live Preview) / 1.44 s (3.8 Live). Gate relaxed by the user to median ≤ 1.5 s, p90 ≤ 2.5 s (ARCHITECTURE §11). Default model for Phase 4b: `gemini-3.1-flash-live-preview` (finer chunks, only model that used `Ask:`).

Tests: mock WebSocket replaying recorded sequences: incremental transcription → deltas in order with no buffering; `No action.` / silence → nothing shown; `Ask:` → ask row; `interrupted` mid-answer → cancelled + replacement answer replaces in place; late chunks of a cancelled turn dropped; goAway/429/auth unchanged. Parser: spoken sentinels split across chunks.
Manual: S1–S9 live on Windows; record first-word and full-answer times vs §11.
Acceptance: first words median ≤ 1.5 s, p90 ≤ 2.5 s after speech end; text visibly streams while Gemini speaks; interruptions replace the answer; flag-off parity; existing suites green.

---

## Phase 5 — InterviewNotebook + BrainSupervisor  *(≈4–5 days)*

**Objective:** full context across long interviews and failures.

Tasks:
1. `InterviewNotebook.ts` per §8 (background updates via fast/free model + `ConversationSummarizer`; bounded size; cleared per meeting).
2. `BrainSupervisor.ts` per §9: selection, rollover (~13–14 min Gemini) with parallel session + seeding + audio buffer replay, fallback chain to `pipeline`, retry preferred brain at next rollover.
3. `brains/PipelineBrain.ts` adapter (§4.3).

Tests: 70-minute simulated session (fake clock, FakeLiveBrain + mock Gemini) — rollovers happen, never mid-answer when avoidable, notebook content reaches new session; quota error → pipeline within one turn; context continuity after fallback (follow-up answered with prior constraint).
Acceptance: S10–S12 pass; no answer gap > ~3 s across rollover/fallback in simulation.

---

## Phase 6 — OpenAIRealtimeBrain + ElevenLabsRealtimeBrain (D13)  *(≈4–6 days)*

**Objective:** the user can pick Gemini Live, OpenAI Realtime or ElevenLabs Realtime in the Live Brain card, enter that provider's key, choose a model, test the connection, and get the same streamed-answer behaviour (D12) from any of them.

Task 0 — **ElevenLabs spike first** (before product code): from current ElevenLabs docs (record URLs), then a live run with `ELEVENLABS_API_KEY` from `.env` on S1, S2, S4, S7 + filler + ambiguous, for `eleven_realtime_v1_mini` and `eleven_realtime_v1_max`: endpoint/auth, whether `output_modalities:["text"]` works, speech end → first text, full-answer time, transcript cadence, filler/ask behaviour, barge-in. Record in PROGRESS.md and **stop and report** to the user before building.

ElevenLabs tasks (after the spike is accepted):
- Settings: add `elevenlabs-realtime` to the provider list, key field (CredentialsManager `setLiveBrainElevenlabsKey`), model list (mini/max), dev `.env` key, Test connection — identical card layout to Gemini/OpenAI (ARCHITECTURE §9b). Update `src/types/liveBrainSettings.ts`, IPC validation, preload, and the settings tests.
- `brains/ElevenLabsRealtimeBrain.ts` as a configuration of the shared Realtime protocol client (§4.5); output mode per the spike.
- Factory case, fallback order (§9b), meeting wiring identical to Gemini.
- Tests: mock WebSocket (text deltas or transcript deltas, speech_started cancel, quota/auth), settings (key never returned raw, provider validation), factory.

OpenAI tasks:
1. Extract reusable socket/backoff/quota/resample helpers from `electron/audio/OpenAIStreamingSTT.ts` into a shared module **without behaviour change** (its existing tests, e.g. `OpenAISttSocketAndQuota2026_09_26`, must stay green).
2. `brains/OpenAIRealtimeBrain.ts` per §4.2.
3. Add to fallback chain when an OpenAI key exists.

Tests: mock WebSocket for Realtime events (text deltas, `speech_started` cancel, `response.done` cancelled, quota).
Acceptance: same scenario behaviour as Gemini in mocks; STT tests unchanged.

---

## Next provider phase — Amazon Sonic (D18)

Implement the separately configured AWS bidirectional streaming transport and text-only overlay behavior approved on 2026-11-27. The AWS SDK for JavaScript is allowed for this phase. Reuse captured audio, prompts, and supervisor. Verify both active models and regional support against AWS model cards, cover protocol and routing in mocked tests, and record live verification separately. The existing Phase 7 tuning scope remains pending.

## Phase 7 — Tuning & physical validation  *(≈3–4 days)*

Tasks:
1. Run the corpus on Gemini (full vs trimmed instructions) and PipelineBrain; pick defaults; record in PROGRESS.md.
2. Tune VAD/eagerness and clarification behaviour against targets.
3. Practice interviews on the user's **Windows** machine (dev + packaged build). Document results.
4. Full regression: `npm run test:ci`.

Acceptance: targets met or gaps documented with numbers; completion report with macOS marked `Requires physical macOS verification`.

---

## Phase 8 — Deepgram Voice Agent provider (D16)

**Objective:** add `deepgram-voice-agent` as an optional Live Brain provider supporting both Deepgram-managed Think models and BYO compatible HTTPS endpoints.

Tasks:
1. Settings & credentials: add `'deepgram-voice-agent'` to `LiveBrainKeyProvider`, `SettingsManager` Think fields (`liveBrainDeepgramThinkMode`, `liveBrainDeepgramManagedProvider`, `liveBrainDeepgramManagedModel`, `liveBrainDeepgramByoKeyProvider`, `liveBrainDeepgramByoModels`, `liveBrainReuseDeepgramKey`), `CredentialsManager` (`liveBrainDeepgramKey` and the encrypted custom endpoint and auth header), and `PROVIDERS` / BYO config resolution in `electron/services/liveBrainSettings.ts` (reusing Natively's existing AI Provider keys without re-entry).
2. Instructions: add `buildDeepgramInstructions(ctx)` in `premium/electron/liveBrain/instructions.ts` (≤ 25,000 chars for managed mode, asserting length) and handle `'deepgram-voice-agent'` in `buildProviderInstructions`.
3. Transport: implement standalone `premium/electron/liveBrain/brains/DeepgramVoiceAgentBrain.ts` (`wss://agent.deepgram.com/v1/agent/converse`, `Authorization: Token <key>`, Flux Multilingual listening, 16 kHz raw binary PCM with 300 ms sparse-silence fill, 8 s `KeepAlive`, discarded binary output, one response per turn across `ConversationText` chunks, cancellation on `UserStartedSpeaking` and completion on `AgentAudioDone`, ~110 min rollover with `agent.context.messages` history replay, 3x retry backoff).
4. Factory & supervisor wiring: add `'deepgram-voice-agent'` to `premium/electron/liveBrain/index.ts`, `BrainSupervisor.ts` (rollover + fallback), `meeting.ts`, and `testConnection` (validating both `SettingsApplied` and a short `InjectUserMessage` Think reply).
5. Settings UI: update `LiveBrainProviderSettings` in `src/components/SettingsOverlay.tsx` with the Deepgram Voice Agent option, key card + STT key reuse toggle, grouped AI Provider + Model pickers (Deepgram-managed & BYO + Custom endpoint, key-transmission notice, and disabled explanation for Codex/Antigravity/local Ollama), and dual-stage Test Connection status.
6. Tests: create `premium/electron/liveBrain/__tests__/DeepgramVoiceAgentBrain.test.mjs` (mock WebSocket handshake, assistant/user `ConversationText`, `UserStartedSpeaking`, binary discard, `KeepAlive`, managed & BYO configs, ≤ 25k prompt assertion, 401 auth failure, 3x retry) and update settings/foundation coverage. Verify `npx tsc --noEmit` and Live Brain tests.

---

## Phase 9 — Deepgram Flux + My AI Provider (D17)

**Objective:** add `deepgram-flux` as a second Deepgram Live Brain mode alongside `deepgram-voice-agent`, pairing standalone Deepgram Flux `/v2/listen` turn detection with Natively's existing streaming answer engine (`AnswerWriter` → `IntelligenceEngine.runLiveBrainAnswer`).

Tasks:
1. Settings & credentials: add `'deepgram-flux'` to `LiveBrainKeyProvider`, `SettingsManager` (`liveBrainReuseDeepgramFluxKey`), `CredentialsManager` (`liveBrainDeepgramFluxKey`), and `PROVIDERS` / `inspectFluxAiRoute` in `electron/services/liveBrainSettings.ts` (preserving all Voice Agent keys/settings, reusing the Deepgram Speech Provider key when enabled, and exposing sanitized active AI Provider + model + setup state to the renderer).
2. Transport: implement standalone `premium/electron/liveBrain/brains/DeepgramFluxBrain.ts` (`wss://api.deepgram.com/v2/listen?model=flux-general-multi&encoding=linear16&sample_rate=16000`, `Authorization: Token <key>`, 80 ms / 2,560-byte 16 kHz `linear16` binary frames, sparse-capture zero padding, `CloseStream` shutdown, monotonic `turn_index` dedupe, partial/final `interviewer_transcript`, and one confirmed `decision: { action: 'answer' }` per meaningful `EndOfTurn` with no speculative answer triggers).
3. Answer streaming integration: wire `AnswerWriter` in `premium/electron/liveBrain/meeting.ts` (`IntelligenceManager.runLiveBrainAnswer`), thread `liveBrainNotebook`, `speechStoppedAt`, assistant notebook recording, and duplicate-bubble prevention (`suppressQuestionRow` / `liveBrainAnswerStart`), keep `ResponseOrchestrator` filler suppression (`!askPending && isFillerOnly`) and clarification replies (`"Yes"`), and ensure active generation cancellation (`answer_corrected`) drops stale chunks cleanly.
4. Supervisor, factory & Test Connection: add `'deepgram-flux'` to `premium/electron/liveBrain/index.ts` and `BrainSupervisor.ts` (decision timeout reset, 50-min rollover, fallback), and implement two-part `testConnection` verifying `/v2/listen` and separately testing the active Natively AI route (distinguishing configured vs test reply).
5. Settings UI: show both `Deepgram Voice Agent` and `Deepgram Flux + My AI Provider` in `SettingsOverlay.tsx`, display the Flux active AI provider/model & setup state, and show the dual Flux + AI route test status cleanly.
6. Tests & verification: add `DeepgramFluxBrain.test.mjs` and extend `ResponseOrchestrator.test.mjs`, `BrainSupervisor.test.mjs`, `Meeting.test.mjs`, `Foundation.test.mjs`, and `LiveBrainSettings.test.mjs` covering settings/key reuse, mid-sentence pauses, duplicate finals, filler turns, corrections, clarification `"Yes"`, stale deltas, reconnect, shutdown, and fallback ownership. Run builds, typechecks, Live Brain tests, lib/component tests, and side-by-side synthetic clip measurements on Windows.

---

## Baseline & Tuning Plan (Post-Phase 9)

### Baseline Phase 1 — Baseline Flux against GPT Realtime and Gemini Live  ✅ Done

**Objective:** measure current Windows Electron app behavior (no runtime code changes) across **Deepgram Flux + My AI Provider**, **OpenAI Realtime**, and **Gemini Live** using the same synthetic interview clips before making further tuning or behavior changes.

Tasks:
1. Synthesize and silence-trim mono 16 kHz PCM WAV interview clips covering:
   - (1) A complete question.
   - (2) A question with a 1.2-second pause in the middle.
   - (3) `"Mm-hmm"` while an answer is streaming.
   - (4) A meaningful correction while an answer is streaming.
   - (5) A follow-up (`"What if it needs to work offline?"`).
   - (6) `"Yes"` after the assistant asks a clarification.
2. Replay the clips through the Windows Electron app (`npm run dev:agent` with WASAPI loopback speaker capture, `NATIVELY_E2E=1`, `NATIVELY_PROMPT_DEBUG=1`) for every provider/model whose credentials and model access permit live execution; record exact blockers and separate lower-level test results for any blocked provider.
3. Measure and record per run: provider/model, `speech end -> first visible text` (and for Flux separately: `speech end -> confirmed EndOfTurn` and `EndOfTurn -> first visible text`), `correction end -> first replacement text`, whether the right question was answered once, premature/duplicate/stale/incorrect answers, run counts (`n`), and exact reproduction steps for any product bugs found.
4. Keep runtime behavior unchanged, record results in `PROGRESS.md`, and leave changes in the working tree for review.

**Acceptance:** record comparable results for the routes available in the dev app, identify any provider-access or scenario blockers, and keep live Electron measurements separate from transport and mocked tests.

### Later phases

2. **Confirmed release of early drafts.** Done. Draft on EagerEndOfTurn, cancel on TurnResumed, and release on matching confirmation with confirmed-turn fallback. Windows Electron replays verified draft reuse and faster first text on the complete and paused questions. Correction timing was mixed. See PROGRESS.md for the comparison.
3. **Interruptions and corrections.** Done. Fixed Flux/Gemini filler variants (`MM.`, `mm`, `M.M.`, `Mhmm.`, `M` partial), kept completed answers visible on ordinary follow-ups, and preserved useful on-screen text when a replacement fails before showing text. Windows Electron reruns covered S2–S5 and showed no filler bubbles. Paused questions stayed intact, with slower first text than in the Phase 2 samples. See PROGRESS.md.
4. **Follow-up and clarification context.** Done. Added focused Flux turn context (`fluxTurnContext.ts`), grounded follow-ups, corrections, and pending clarification replies at the AI route boundary, omitted prior topics on unrelated new questions, and verified context staleness checks on early drafts. See PROGRESS.md.
5. **Comparison and regressions.** Done. Compared both Deepgram modes on Windows, fixed the reproduced Flux question-row regressions, and traced Voice Agent early turns to provider behavior. Live clarification, OpenAI Realtime account access, and physical macOS coverage remain open. See PROGRESS.md.

6. **Multi-turn clarification (D4 revised 2026-11-27).** Not started. Phase 6 implements D4 for **Deepgram Flux and the pipeline fallback only**. The realtime brains (Gemini, OpenAI, ElevenLabs, Voice Agent, Sonic) keep today's single-`Ask:` behaviour until a later phase.

   **Flag.** New Live Brain setting `liveBrainMultiClarify`, off by default, read once per confirmed turn. It controls all four parts together: the prompt override, the exchange state, the pre-overlay `Ask:` gate, and the recovery call. Flag off means today's behaviour exactly: Flux can show one `Ask:`, pipeline never asks, the 10 s timer is unchanged.

   **State owner.** A new `ClarificationExchange` class in `premium/electron/liveBrain/` (pure, injected clock, no Electron imports). `meeting.ts` creates one per meeting session and passes it to `ResponseOrchestrator` (Flux) and to the pipeline through the active-session accessor in `LiveBrainRouting` (same pattern as `pipelineContext()`). The pipeline writer and streaming path are unchanged: the Auto Answer `dispatch` in `electron/main.ts` asks the exchange for the turn's classification and composed context before calling `runAutoAnswer`. With the flag on, `ResponseOrchestrator.pendingClarification` / `askPending` become views of the exchange.
   Per original question it holds: `exchangeId`, the original question plus applied corrections, the pending clarification (at most one), asked clarifications with their replies, the count (0-3), and whether the interviewer deferred ("you decide").

   **Classifying a confirmed interviewer turn** (deterministic, no model call), in this order:
   1. Filler (`isFillerOnly`): ignored. No slot, no reply recorded, does not resolve the pending ask, and does **not** cancel the 10 s timeout (today's `writerClarificationHeardSpeech` behaviour changes accordingly).
   2. Deferral ("you decide", "your call", "go ahead", "whatever you think", "doesn't matter", "proceed"): resolves the pending ask, counts a slot, sets `deferred`. The next write answers the original question under a stated assumption; no further asks in this exchange.
   3. Correction (`isCorrectionTurn`): updates the original question or constraint and keeps the count. A pending ask is dropped without counting.
   4. New question (`isUnrelatedNewTopicForClarification` and not a correction): closes the old exchange without answering it; the new question starts a fresh exchange at count 0.
   5. Anything else while an ask is pending, including a short "No.": a reply. It counts a slot and is recorded against that clarification.
   With no pending ask, rules 3 and 4 work as today (follow-up, correction, new question).

   **Timeout.** One pending ask at a time; the existing 10 s stated-assumption timer stays. If a real reply arrives while the timeout answer is still streaming, cancel it through the existing `answer_corrected` path and write again with the reply (the reply counts). After the timeout answer completes, a reply is an ordinary follow-up.

   **Skipped suggestions.** A suggestion the interviewer never answers costs nothing. The same clarification (normalised text) is never shown twice in one exchange; a repeat is handled like a fourth ask.

   **Candidate-initiated clarifications** (the candidate asking a different question aloud) are out of scope for Phase 6. No dependency on microphone speaker attribution.

   **Prompt.** Both routes reach `runWhatShouldISay`. Today the writer adds an `Ask:` instruction (`IntelligenceEngine.ts`, `handleSuggestionTriggerInner`) while the V3 composer says "Never ask the user to repeat, rephrase or clarify..." (`context-intelligence/generation/prompt-composer.ts`). With the flag on and a Live Brain turn, pass an `allowClarification` option that omits that V3 line for this request only, and choose the instruction from the exchange:
   - slots left and not deferred: "If a missing detail would materially change the answer and is not already in the conversation, start with Ask: and give one short clarification question. Otherwise answer directly."
   - cap reached or deferred: "Do not ask a question. State any assumption that matters in one short clause, then answer."
   The pipeline gets the same option (today it gets no `Ask:` instruction). Manual What to Answer and non-Live-Brain Auto Answer are unchanged.

   **Context into the answer.** `fluxTurnContext` (and the pipeline's `liveBrainNotebook`) carries the original question, corrections, and every asked clarification with its reply. Retrieval queries the original question plus the resolved constraints, never the bare reply ("No."). Mode instructions and reference-file grounding apply unchanged. `exchangeId`, the count and `deferred` are part of the draft `contextKey`, so an eager draft built before a reply or under a different cap is never adopted.

   **Pre-overlay `Ask:` gate.** One hook in `IntelligenceEngine`, used by both routes, where Live Brain tokens are first emitted as `suggested_answer_token`: the streaming token buffer in `runWhatShouldISayInner`, and the adopted-draft reveal in `completeSpeculativeRun`. Hold only until the opening is decided (up to about 16 characters; case-insensitive; tolerant of leading whitespace or markdown; split across chunks). If the opening cannot be `Ask:`, flush and stream normally. If it is `Ask:` and the exchange allows it, show the ask row and record the pending ask. If it is `Ask:` and the cap is reached, the exchange is deferred, or the question repeats an earlier one, nothing reaches the overlay: discard the generation and start the recovery call. `noteWriterClarification` stays for bookkeeping only.

   **Recovery call.** At most one per exchange, only after a suppressed ask. It carries the original question, corrections and all resolved details with the "Do not ask" instruction. If it asks again, errors, or is cancelled, there is no further retry: an ask or error shows the existing answer-failure UI; a cancel shows nothing. The normal path never makes an extra model call.

   **Reconnect and fallback in Phase 6.** Carry-over is deferred. On `endProviderTurn`, a Flux/pipeline handoff, or meeting stop, the exchange is closed: the pending timer is cancelled, a shown ask row stays as it is, and the next confirmed turn starts a fresh exchange. Late output from the closed exchange is dropped by the existing generation guard.

   **Tests** (fake clock and mocked streams, for **both Flux and pipeline**): 0, 1, 2 and 3 clarifications; a fourth `Ask:` split across chunks is suppressed before any overlay token, followed by exactly one recovery call; a recovery that asks again shows the failure UI with no second retry; filler then "No." (filler costs no slot and keeps the timer; "No." resolves the right ask); deferral; a correction keeps the count and a new question resets it; a repeated clarification is suppressed; timeout racing a real reply; stale output from a cancelled generation; a draft rejected after the count changes; the final answer context includes every resolved constraint; the retrieval query uses the original question plus constraints; prompt-level tests for slots left, cap reached and flag off (V3 line present, no `Ask:` instruction on pipeline); flag off leaves clear-question streaming and retrieval identical; a request counter showing no extra model call on the normal path; the gate's first-text overhead measured on clear questions.

   **Live acceptance** (Windows `dev:agent`, Flux + `codex-cli`, then forced pipeline fallback): S8 smoke (one ask appears; the timeout answers under an assumption) and S13 (scripted multi-turn: each reply uncovers a different consequential constraint; the final answer uses all of them; no fourth ask). Physical macOS verification is a separate open item.

---

## Test corpus (Phase 0 creates; all phases use)

| ID | Scenario | Expected |
|---|---|---|
| S1 | "How would you design a system that can handle…" (1.2 s pause) "…millions of concurrent users?" | No answer at pause; one answer after |
| S2 | URL shortener + high traffic + DB scaling in one question | One answer covering all parts |
| S3 | "Why did you choose Redis?" after a design discussion | Short, uses prior design, no repeat |
| S4 | "Use PostgreSQL. Actually, let's assume MongoDB." | Answer uses MongoDB only |
| S5 | Mid-answer: "Actually, caching is not allowed." | Old answer outdated; new answer without caching |
| S6 | Candidate talks over interviewer | Candidate speech never treated as the question |
| S7 | "Difference between horizontal and vertical scaling?" | Current Natively spoken style and length |
| S8 | "Design an e-commerce app." | One `[[ASK]]`; if no reply ~10 s → answer with stated assumption |
| S9 | 45-second question with pauses | Not cut off |
| S10 | 70-minute interview | Rollovers invisible; follow-ups keep context |
| S11 | Network drop 10 s / socket kill / quota exhausted | Fallback; no stuck UI |
| S12 | "mm-hmm", "okay", "right" during an answer | Answer not cancelled |
| S13 | "How would you scale this order service?" then, one per ask: "10,000 requests per second, mostly reads." / "No, stock can be a few seconds stale." / "Single region." | `liveBrainMultiClarify` on: up to three asks, each following the last reply; never a fourth; the final answer uses every stated constraint |

---

## Estimated total

≈ 26–35 developer days. First user-visible improvement: end of Phase 1. First Gemini Live experience: end of Phase 4.
