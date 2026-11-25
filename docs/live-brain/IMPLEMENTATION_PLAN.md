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
node --test premium/electron/liveBrain/__tests__/        # added in Phase 2+ (after build, per repo convention)
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

**Objective:** fix the most visible gap for every user, and make PipelineBrain a good fallback.

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

**Objective:** contracts, settings, instructions, parser — no provider yet.

Tasks:
1. `premium/electron/liveBrain/types.ts` exactly per ARCHITECTURE §4.
2. `instructions.ts` per §5 — composes existing prompt constants; produces `full` and `trimmed` variants.
3. `responseParser.ts` per §6 (streaming sentinel detection).
4. `index.ts` factory with exhaustive switch (§3).
5. **Live Brain switch** exactly per ARCHITECTURE §9a:
   - Settings → **General**, new row directly below the Auto Answer row in `src/components/SettingsOverlay.tsx`, same markup pattern (icon tile, title "Live Brain", "Beta" badge, description, `SettingsToggle`, optimistic update + rollback).
   - Persist `liveBrainEnabled` (default `false`) in the existing settings store; `appState.getLiveBrainEnabled()/setLiveBrainEnabled()`.
   - IPC `live-brain:get-enabled` / `live-brain:set-enabled` in `electron/ipcHandlers.ts` (boolean-only validation); preload `getLiveBrainEnabled` / `setLiveBrainEnabled` with types.
   - Missing key for the selected brain → inline message, switch stays off.
   - Settings → **Audio**: "Live Brain Provider" section after Speech Provider, per ARCHITECTURE §9b — provider selector (`gemini-live` default | `openai-realtime` | `pipeline`), per-provider masked key fields saved via `CredentialsManager`, "Use my AI Providers key" fallback, model, instruction variant, Test connection (stub until Phase 4), status. Same components/styles as Speech Provider. Raw keys never returned to the renderer.
   - In this phase the switch only persists and broadcasts; runtime start/stop is wired in Phase 4/5.
6. A `FakeLiveBrain` for tests.

Tests: parser (split sentinels across chunks, whitespace/markdown, no sentinel, mid-text sentinel); instructions include the current answer contract and clarification/correction rules; factory throws on unknown id; `liveBrainEnabled` defaults to false and persists; keys stored via `CredentialsManager` and never returned raw by `live-brain:get-config`; "Use my AI Providers key" resolution order; IPC rejects non-boolean; renderer toggle rollback on failure (agent-browser check of Settings → General per CLAUDE.md).
Acceptance: unit tests green; flag-off parity; the row appears directly under Auto Answer in General.

---

## Phase 3 — ResponseOrchestrator + overlay  *(≈3–4 days)*

**Objective:** correct on-screen behaviour, driven by `FakeLiveBrain`.

Tasks:
1. `ResponseOrchestrator.ts` per ARCHITECTURE §7 (generation ids, interviewer-speaking marker, replace-in-place, filler restore, clarification timeout, status line).
2. Deliver through existing overlay channels; add `ask` kind, `outdated`, `interviewerSpeaking` to the renderer `Message` model. **UI must be identical to Auto Answer** (ARCHITECTURE §7 "UI rule"): reuse the automatic-answer row, styles and delivery; only the minimal "Ask:" label, dimmed outdated row with "Updated" label, and interviewer-speaking marker, all from existing styles. Verify visually against an Auto Answer answer side by side.
3. Never display text before `response_started`.

Tests (fake clock + FakeLiveBrain): late deltas from cancelled response dropped; duplicate `response_done`; interruption → marker ≤ 300 ms (logical time); `[[NO_ACTION]]` restores previous answer; `[[ASK]]` shows tip; clarification timeout triggers assumption request; renderer helper tests in `src/lib/__tests__/`.
Acceptance: all orchestrator scenarios pass; overlay renders the new kinds in dev (agent-browser snapshot per CLAUDE.md CDP instructions).

---

## Phase 4 — GeminiLiveBrain  *(≈6–8 days)*

**Objective:** the main brain.

Tasks:
1. `brains/GeminiLiveBrain.ts` using the protocol facts recorded in Phase 0 (§4.1): setup, audio streaming (resample to required rate via existing resampler utilities), candidate text turns without response, response streaming (TEXT or AUDIO+transcription per Phase 0 decision; audio bytes discarded), interruption mapping, `goAway` → `session_expiring`, error classification (auth/quota/rate_limited/network/protocol).
2. Reconnect with exponential backoff (reuse the backoff policy style of existing STT providers).
3. Wire into `main.ts` behind `liveBrainEnabled`: tap interviewer PCM to the brain; send candidate finals; suppress the old engine's automatic dispatch while a non-pipeline brain is active; react to the switch mid-meeting (start/stop immediately, hand automatic answering back to existing behaviour on off) per ARCHITECTURE §9a.
4. Prompt Debugger: record instructions + per-response timings.

Tests: mock WebSocket server replaying recorded Gemini event sequences (from the Phase 0 spike): normal answer, ask, no-action, interruption, goAway, 429, auth failure, socket drop mid-response.
Manual: S1–S9 with a real free key on Windows; record latency in PROGRESS.md.
Acceptance: scenarios pass manually; latency recorded vs ARCHITECTURE §11 targets; flag-off parity.

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

## Phase 6 — OpenAIRealtimeBrain (optional paid backup)  *(≈3–4 days)*

Tasks:
1. Extract reusable socket/backoff/quota/resample helpers from `electron/audio/OpenAIStreamingSTT.ts` into a shared module **without behaviour change** (its existing tests, e.g. `OpenAISttSocketAndQuota2026_09_26`, must stay green).
2. `brains/OpenAIRealtimeBrain.ts` per §4.2.
3. Add to fallback chain when an OpenAI key exists.

Tests: mock WebSocket for Realtime events (text deltas, `speech_started` cancel, `response.done` cancelled, quota).
Acceptance: same scenario behaviour as Gemini in mocks; STT tests unchanged.

---

## Phase 7 — Tuning & physical validation  *(≈3–4 days)*

Tasks:
1. Run the corpus on Gemini (full vs trimmed instructions) and PipelineBrain; pick defaults; record in PROGRESS.md.
2. Tune VAD/eagerness and clarification behaviour against targets.
3. Practice interviews on the user's **Windows** machine (dev + packaged build). Document results.
4. Full regression: `npm run test:ci`.

Acceptance: targets met or gaps documented with numbers; completion report with macOS marked `Requires physical macOS verification`.

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

---

## Estimated total

≈ 26–35 developer days. First user-visible improvement: end of Phase 1. First Gemini Live experience: end of Phase 4.
