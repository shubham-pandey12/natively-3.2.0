# Live Brain — End-to-End Review Plan

Branch `feat/live-brain` vs `fix/restore-premium-types`: 77 commits, 204 files, ~28k lines added.
This splits Live Brain into **10 review units**, ordered bottom-up so each unit only depends on units already reviewed.
Review one unit per session: read → list findings → fix → add tests → run tests → tick the box.

Spec reference: [ARCHITECTURE.md](ARCHITECTURE.md) (decisions D1–D18). If code and spec disagree, stop and ask.

---

## How each unit is reviewed

For every unit:

1. **Contract** — does the code match the ARCHITECTURE.md section listed?
2. **Bugs** — races, leaks (sockets/timers/listeners), unhandled promise rejections, stale state after stop/restart.
3. **Edge cases** — the unit's checklist below.
4. **Cross-platform** — macOS + Windows paths (CLAUDE.md). Mark what needs physical verification.
5. **Tests** — run existing tests; add a test for every bug fixed and every unchecked edge case.
6. **Record** — findings + result in the "Review log" at the bottom.

Base command: `npm run test:live-brain` (builds electron, runs all liveBrain tests + LiveBrainSettings).

---

## Unit 1 — Contracts, settings & credentials (foundation)

**Files**
- `premium/electron/liveBrain/types.ts`, `index.ts`
- `electron/services/liveBrainSettings.ts` (934 lines), `src/types/liveBrainSettings.ts`
- `electron/services/SettingsManager.ts`, `electron/services/CredentialsManager.ts` (Live Brain keys)
- Tests: `electron/services/__tests__/LiveBrainSettings.test.mjs`, `liveBrain/__tests__/Foundation.test.mjs`

**Checklist**
- [ ] Factory switch is exhaustive; unknown provider throws (no silent fallback).
- [ ] `liveBrainEnabled` defaults to **off**; with it off nothing Live Brain runs (D9).
- [ ] `resolveLiveBrainRuntime()` with: missing key, empty-string key, invalid model id, removed model (Nova Sonic v1, old ElevenLabs), unknown region, corrupt/old settings JSON.
- [ ] Deepgram BYO think: Codex / Antigravity / Ollama / localhost / 127.0.0.1 rejected (D16).
- [ ] Secrets stored only in CredentialsManager (keychain / DPAPI), never in settings JSON or logs.
- [ ] Settings migration from a pre-Live-Brain profile.

---

## Unit 2 — Instructions & response parsing (pure logic)

**Files**
- `instructions.ts`, `responseParser.ts`, `decideTurnTool.ts`, `fluxTurnContext.ts`, `interviewerAudio.ts`
- Tests: `RealtimeBrain.test.mjs` (parser parts), `InterviewerAudio.test.mjs`

**Checklist**
- [ ] Instructions reuse existing Natively prompts/answer style (D3); profile/resume/JD/mode included; empty profile OK.
- [ ] Deepgram 25,000-char cap respected; truncation keeps the rules, drops oldest context.
- [ ] Mandatory filler rule present for every realtime provider (D15).
- [ ] Parser: `Ask:` / `No action.` / answer split across deltas (`As` + `k:`), leading whitespace, markdown, lowercase, mixed languages.
- [ ] Is `decideTurnTool.ts` still used after D12? If dead code → remove or document.
- [ ] Audio resampling: 16k/24k/44.1k/48k input, odd-length buffers, empty buffer.

---

## Unit 3 — InterviewNotebook (memory)

**Files**: `InterviewNotebook.ts`; tests `InterviewNotebook.test.mjs`

**Checklist**
- [ ] Bounded growth in a 2-hour interview (memory + summary size).
- [ ] Rollover/fallback seeding contains the last ~3–5 min verbatim + summary.
- [ ] Candidate vs interviewer vs assistant roles never mixed (invariant 2).
- [ ] Summarizer failure/timeout does not block or crash the meeting.
- [ ] Reset on a new meeting (no leak across meetings).

---

## Unit 4 — Realtime transport & shared realtime brain

**Files**
- `electron/audio/realtimeTransport.ts`, `electron/audio/OpenAIStreamingSTT.ts` (refactored onto it)
- `brains/RealtimeBrain.ts`, `OpenAIRealtimeBrain.ts`, `ElevenLabsRealtimeBrain.ts`
- Tests: `RealtimeBrain.test.mjs`

**Checklist**
- [ ] **Regression:** OpenAI streaming STT still works with Live Brain off (shared transport refactor).
- [ ] Socket close codes: auth (401/1008), quota, rate limit, network drop, server close mid-response → correct `LiveBrainErrorCode` + `fatal` flag.
- [ ] Reconnect backoff bounded; no reconnect after `stop()`.
- [ ] `stop()` twice is safe; timers/listeners released (invariant 4).
- [ ] No `response_delta` after `response_done` (invariant 3).
- [ ] Output audio discarded, never played (D6).
- [ ] Barge-in: `cancelResponse` idempotent; cancel during connect.

---

## Unit 5 — Provider brains (one sub-review each)

Each provider is reviewed against the same checklist. Order by usage:

| Sub-unit | File | Spec | Test |
|---|---|---|---|
| 5a | `brains/GeminiLiveBrain.ts` | §4.1, D12 | `GeminiLiveBrain.test.mjs` |
| 5b | `brains/DeepgramFluxBrain.ts` | D17 | `DeepgramFluxBrain.test.mjs` |
| 5c | `brains/DeepgramVoiceAgentBrain.ts` | D16 | `DeepgramVoiceAgentBrain.test.mjs` |
| 5d | `brains/AmazonSonicBrain.ts` | D18 | `AmazonSonicBrain.test.mjs` |
| 5e | `brains/PipelineBrain.ts` | §4.3 | `Meeting.test.mjs` |

**Checklist (each)**
- [ ] Setup/config message matches current provider docs (model names, audio format, sample rate).
- [ ] Session time limit / goAway → `session_expiring` emitted in time.
- [ ] Keepalive correct (Voice Agent 8 s; Flux must NOT send KeepAlive; `CloseStream` on close).
- [ ] Interviewer transcript streaming + final; empty transcript turn.
- [ ] Interrupt while answering; interrupt while connecting; two questions back to back.
- [ ] Flux only: `EagerEndOfTurn` → `TurnResumed` → `EndOfTurn` sequence; duplicate/out-of-order `turn_index`.
- [ ] Sonic only: AWS credential chain missing/expired; Region without Sonic.
- [ ] Silence for 10+ minutes (idle timeouts).

---

## Unit 6 — AnswerWriter & IntelligenceEngine Live Brain path

**Files**
- `AnswerWriter.ts`
- `electron/IntelligenceEngine.ts` (`runLiveBrainAnswer`, draft cancel), `electron/IntelligenceManager.ts`
- `electron/llm/*` changes used by Live Brain (prompts, humanLikeness, interimInjectionGuard, whatToSaySourceSelector)

**Checklist**
- [ ] Private draft adopted **only** if session, turnKey, transcript and AI route all still match (D17).
- [ ] Draft cancelled on `TurnResumed`, provider switch, meeting end.
- [ ] Works with every AI provider: cloud, Codex CLI, Antigravity, Ollama, Bedrock, gateways.
- [ ] LLM error / timeout mid-stream → visible failure, not a stuck "thinking" card.
- [ ] Generation-id guards: old answer tokens never land in the new card.
- [ ] **Regression:** normal (Live Brain off) What-to-Answer and Cmd+Enter unchanged.

---

## Unit 6b — Context & intelligence grounding (answer correctness)

How Natively's "smartness" reaches each Live Brain route. **Two different paths:**

| Route | How context arrives |
|---|---|
| Realtime brains (Gemini, OpenAI, ElevenLabs, Voice Agent, Sonic) | **Baked once** into session instructions at meeting start (`main.ts` `startMeetingLiveBrain` → `instructions.ts` `contextBlocks`). Static text, no per-question retrieval. |
| Deepgram Flux, Pipeline | Per question through `IntelligenceEngine.runLiveBrainAnswer` → existing answer path (should get normal retrieval — verify). |

**Sources assembled at start** (`electron/main.ts` ~10895):
- Candidate name (`currentUserName`)
- Resume + JD grounding: `KnowledgeOrchestrator.getLiveInterviewProfileContext()` — only if knowledge mode is ON and the mode allows profile intelligence
- Mode: name, template, system prompt suffix, `ModesManager.buildActiveModeContextBlock()` (custom context + **reference files**, capped by `MAX_FILE_CHARS` / `MAX_TOTAL_CHARS`, truncated in file order)
- InterviewNotebook text (on rollover/fallback)

**Files**: `instructions.ts`, `meeting.ts`, `electron/main.ts` (`startMeetingLiveBrain`), `KnowledgeOrchestrator.ts` (`getLiveInterviewProfileContext`), `ModesManager.ts` (`buildActiveModeContextBlock`), `IntelligenceEngine.ts` (`runLiveBrainAnswer`), `ProfileJitPromptBuilder.ts`, `context-intelligence/generation/prompt-composer.ts`

**Checklist — gaps to confirm or fix**
- [ ] **Per-question retrieval missing on realtime brains:** pipeline uses query-based retrieval (RAG, OKF profile packs, `modeContextRetriever.retrieve` with the question). Realtime brains get only the start-time block. Decide: accept, or inject relevant context per turn (`addHistoryContext`).
- [ ] **Reference files truncated by order, not relevance:** large/many files → later files silently cut. Measure what actually reaches Gemini for a real resume + 3 reference files.
- [ ] **Deepgram 25k cap** trims context — which part is lost first (profile vs reference files vs mode)?
- [ ] **Stale context mid-meeting:** upload resume / change JD / switch mode / toggle knowledge mode during a meeting → realtime session still uses old instructions? Rebuilt on rollover/fallback?
- [ ] Negotiation / salary engine, screenshot context, live meeting RAG — do any reach Live Brain? If not, document as known limitation.
- [ ] `buildSummarySafeModeContextBlock` drops sensitive custom context for summaries — is the **notebook summarizer** prompt protected the same way?
- [ ] Profile intelligence disallowed for a mode → nothing from resume/JD leaks via notebook or name.
- [ ] Flux/Pipeline: confirm `runLiveBrainAnswer` gets the **same** profile/RAG/mode context as normal What-to-Answer (no regression in answer quality).
- [ ] Anti-fabrication: a question about a skill not in the resume → answer doesn't invent experience (compare realtime vs pipeline).

**Test scenarios (physical, per provider)**
1. "Tell me about your last project" → names the project from the resume.
2. "Why do you want to join <JD company>?" → uses the JD.
3. Question answerable only from the 3rd reference file → found or not?
4. Change mode mid-meeting → next answer follows the new mode?
5. Knowledge mode off → no resume details in answers.

---

## Unit 7 — ResponseOrchestrator (what the overlay shows)

**Files**: `ResponseOrchestrator.ts` (711 lines), `overlayPort.ts`; tests `ResponseOrchestrator.test.mjs`, `LiveBrainCorrections.test.mjs`

**Checklist**
- [ ] D14: question bubble above its answer; outdated marking only if cut off while streaming within 1.5 s; pipeline path keeps 20 s rule.
- [ ] D15: filler-only turn → no answer, no bubble; short reply while `Ask:` pending is answered.
- [ ] D4: max 3 clarifications per question; 4th `Ask:` dropped → one recovery answer with stated assumption; correction keeps count; new question resets; "you decide" proceeds.
- [ ] Bubble fallback to STT final when provider gives no transcript.
- [ ] Response ids unique per brain instance (`responseNamespace`) across rollover/fallback.
- [ ] Late events from a stopped brain are ignored.

---

## Unit 8 — Meeting, BrainSupervisor & routing (lifecycle)

**Files**
- `meeting.ts`, `BrainSupervisor.ts`
- `electron/premium/liveBrain.ts` (`LiveBrainRouting`), `electron/premium/autoAnswer.ts`
- `electron/main.ts` Live Brain wiring (audio push, STT forward, meeting start/stop, toggle)
- Tests: `Meeting.test.mjs`, `BrainSupervisor.test.mjs`

**Checklist**
- [ ] Fallback chain: selected provider → (OpenAI if key) → pipeline; never loops; user sees status.
- [ ] Rollover (~14 min Gemini, ~110 min Voice Agent) without losing an in-flight answer.
- [ ] Toggle Live Brain on/off **during** a meeting; switch provider during a meeting.
- [ ] Meeting stop while connecting / while answering → no orphan socket.
- [ ] Auto Answer and Live Brain never both answer the same question.
- [ ] Mic text goes only via `addCandidateText`; system audio only via `pushInterviewerAudio`.
- [ ] Premium not loaded / premium missing → app works, Live Brain hidden.

---

## Unit 9 — IPC, preload & UI

**Files**
- `electron/ipcHandlers.ts`, `electron/preload.ts`, `src/types/electron.d.ts`
- `src/components/SettingsOverlay.tsx` (Live Brain card), `src/components/NativelyInterface.tsx`
- `src/lib/liveBrainChat.mjs`, `chatStreamGuard.mjs`, `src/i18n.liveBrain.ts`
- Tests: `LiveBrainToggle.test.mjs`, `liveBrainChat2026_11_26.test.mjs`, `NativelyInterfaceResetCancel.test.mjs`

**Checklist**
- [ ] Every IPC handler validates input types (provider id, model, region, key).
- [ ] Keys never sent back to renderer in full.
- [ ] Settings card: provider/model/region pickers, key entry, privacy notice (D5), disabled states.
- [ ] Overlay: question bubble, ask chip, outdated style, status, reset/cancel mid-stream.
- [ ] i18n strings present for all languages used.
- [ ] UI tested via `npm run dev:agent` + agent-browser (CLAUDE.md).

---

## Unit 10 — Auto Answer changes (Phase 1 corrections + side fixes)

**Files**: `premium/electron/autoAnswer/SimpleAutoAnswer.ts` (+1093), `AutoAnswerJudge.ts`, `AutoAnswerTypes.ts`, `decider/AutoAnswerDecider.ts`, and their ~20 new tests.

**Checklist**
- [ ] Corrections replace stale answers (Phase 1) only when `correctionsEnabled`.
- [ ] One answer per spoken question; split/lost questions; manual press settle.
- [ ] **Regression:** Auto Answer behaviour with Live Brain off is identical to before.

---

## Out of scope (separate review)

Changes on this branch that are **not** Live Brain — review separately:
Bedrock provider (`BedrockProvider.ts`, `BedrockSettingsCard.tsx`), response cleanup (`responseCleanup.ts`, `docs/response-cleanup/`), launcher show gate, screenshot retry / WindowsFrameGrabber, CropperWindowHelper, WindowHelper.

---

## Final: end-to-end scenarios

After all units, run the scenario corpus `tests/live-brain/scenarios/scenarios.json` physically per provider:

| Scenario | Gemini | Flux | Voice Agent | Sonic | OpenAI | ElevenLabs | Pipeline |
|---|---|---|---|---|---|---|---|
| Simple question | | | | | | | |
| Correction ("actually, use MongoDB") | | | | | | | |
| Interrupt mid-answer | | | | | | | |
| Filler ("mm-hmm") | | | | | | | |
| Clarification ×3 cap | | | | | | | |
| 30+ min session (rollover) | | | | | | | |
| Network drop → fallback | | | | | | | |
| Bad key → fallback + message | | | | | | | |

Each cell: `Windows ✅/❌` · `macOS ✅/❌`.

---

## Review log

Process: Antigravity + Codex reviewed each unit; findings were merged and checked against the code; Codex applied fixes; each fix round was re-read (diff) and re-tested before the next unit.
macOS column: all units are **Reviewed but not executed on macOS** — physical verification pending. Windows column: automated tests on Windows; no live provider / live audio run yet.

| Unit | Date | Findings | Fixed | Tests added | macOS | Windows |
|---|---|---|---|---|---|---|
| 1 | 2026-11-27 | 6 (Sonic region/model on read, stale models, BYO options, unknown provider enable, secret in quarantine log, BYO key gate) | 6 | yes | Reviewed only | Automated ✅ |
| 2 | 2026-11-27 | 6 ("No action…" answers swallowed, sentinel prefix limit, Flux `without` = correction, Deepgram trim, filler rule conflict, dead decider marked deprecated) | 6 | yes | Reviewed only | Automated ✅ |
| 3 | 2026-11-27 | 7 (seed lost summary, filler closed clarification, suppressed text in memory, stale summary, clock jump, STT-fallback question not recorded, CJK) | 7 | yes | Reviewed only | Automated ✅ |
| 4 | 2026-11-27 | 6 + 2 follow-up regressions (retry reset, 1008, silent failed turn, backpressure, reentrant stop, odd PCM byte) | 8 | yes | Reviewed only | Automated ✅ |
| 5a–e | 2026-11-27 | 5a: 6 · 5b/5c: 4 shared transport + 5 provider · 5d/5e: 8 + 2 handoff follow-ups | all | yes | Reviewed only (Gemini IPv4 DNS needs physical check) | Automated ✅ |
| 6 | 2026-11-28 | 7 (draft key, route key, cURL abort, cancel during validation, cut-off answer in notebook, JD-vs-résumé rule, WTA stateless audit) + 2 type errors | all | yes | Reviewed only | Automated ✅ |
| 6b | 2026-11-28 | 2 privacy (résumé name leak, stale context after revocation); per-question retrieval for realtime = accepted limitation | 2 | yes | Reviewed only | Automated ✅ |
| 7 | 2026-11-28 | 4 + flaky draft-key test (notebook hash) | all | yes | Reviewed only | Automated ✅ |
| 8 | 2026-11-28 | 7 + 2 follow-ups (standby release cancelled active answer, Sonic discard loop); provider change = "applies from next meeting" | all | yes | Reviewed only | Automated ✅ |
| 9 | 2026-11-28 | 4 (D5 notice, reset guard, IPC validation, ru/zh/ja/es strings) | 4 | yes | Reviewed only | Automated + Settings UI via agent-browser ✅ |
| 10 | 2026-11-28 | 4 (candidate id repeat, telemetry regex, judge abort, judge cap verified safe) | 4 | yes | Reviewed only | Automated ✅ |

Deferred by spec: D4 multi-clarification cap (Phase 6). Known limitations: realtime brains have no per-question retrieval; reference files beyond the 40k budget are dropped in upload order.
Out of scope, still to review before merge: Auto Answer reliability changes that run with Live Brain OFF (dispatch watchdog, manual settle, judge changes), Bedrock provider, response cleanup.
Full `npm test` on this branch has ~33 failures that also fail on the previous commit (keychain, calendar, RAG, trials — load-sensitive; the failing set changes between runs). Not caused by Live Brain.
