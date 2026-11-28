# Phase 10 — Shared Interview Context Audit Report

**Scope:** Commits `9a5bea58d` ("Share one interview history across all answering routes (Phase 10, stages 1-3)") and `e608ada63` ("Keep open realtime sessions in sync with shared history (Phase 10, stage 4)") on top of `449093e6b` (`feat/live-brain`).
**Working tree at audit start:** Clean (`nothing to commit, working tree clean`).
**Platform audited on:** Windows (`win32`).

---

## 1. Summary Verdict

The Phase 10 implementation meets the core architectural spec: `SessionTracker` maintains an isolated, epoch-scoped, bounded in-memory turn ledger (`MAX_MEETING_TURNS = 2_000`, `MAX_MEETING_TURN_FIELD_CHARS = 24_000`) while preserving legacy views (`contextItems`, `persistedTranscript`, 10-reply `assistantResponseHistory`, `<10`-char filter); `meeting-history-formatter.ts` projects provider-scoped history without raw images and preserves constraints/code angle brackets; and `BrainSupervisor` / `meeting.ts` synchronize open realtime sessions (`GeminiLiveBrain`, `RealtimeBrain` for OpenAI & ElevenLabs, `DeepgramVoiceAgentBrain`) and reseed `AmazonSonicBrain` with `writer` catch-up fallback.

**Primary acceptance case (`screenshot/extension → AI provider → spoken "Why did you use a heap?" → Live Brain → typed follow-up`):**
- **Not blocked on the happy path** for Gemini Live, OpenAI Realtime, ElevenLabs Realtime, Deepgram Voice Agent, Deepgram Flux, or Pipeline.
- **Blocks / Risks found:**
  1. **30 test failures in `npm run test:intelligence`** (27 directly caused by Phase 10 adding unguarded `this.session.beginMeetingTurn(...)` calls in `IntelligenceEngine.ts` and changing `addAssistantMessage` call signatures matched by `CutOffAnswerNotInRing2026_11_15.test.mjs`; 3 pre-existing in `IntelligenceFlags.test.mjs`).
  2. **`runLiveBrainAnswer` (`writer` fallback / Flux) writes `surface: 'what_to_answer'` instead of `'live_brain'`**, causing `SessionTracker` to re-broadcast Live Brain's own answers to `subscribeExternalMeetingAnswers` (triggering redundant `AmazonSonicBrain` reseeds).
  3. **`AmazonSonicBrain` standby reseed can loop as `history_stale`** if `noteMeetingSpeech` or `writer` advances `meetingHistoryRevision` while the standby Sonic session is still connecting.
  4. **Manual What to Answer early-exit paths** (`answerLLM`, `clarify`, `stubFallback`, `tagLeakFallback`, `honestFallback`) leave `question: ''` / `resolvedQuestion: undefined`, and secondary actions (`runFollowUp`, `runRecap`, `runClarify`, `runLiveHelper('sound_smart')`) are not wired to `formatProviderMeetingHistory` or `meetingTurn`.
  5. **Live provider execution is unverified** (all realtime provider checks are mock-socket/mock-transport only; no physical macOS or live-provider Windows run was performed).

---

## 2. Route Wiring Table (Task A)

| Route | Writes Question | Writes Answer | Capture Text | Reads History | Evidence (`file:line`) | Gap |
|---|---|---|---|---|---|---|
| **Typed/pasted chat (`gemini-chat`)** | `beginMeetingTurn(strippedMessage, 'user')` | `addAssistantMessage(..., 'manual_chat', undefined, { meetingTurn })` | `hasVisualInput: true` if `imagePaths?.length` | `formatMeetingHistory(strippedMessage, meetingTurn)` | `electron/ipcHandlers.ts:2474-2505` | No `resolvedQuestion` / delayed OCR enrichment (legacy non-streaming path). |
| **Typed/pasted chat (`gemini-chat-stream`, V3 & Legacy)** | `beginMeetingTurn(message, 'user', historyStartedAt)` | `addAssistantMessage(..., 'manual_chat', undefined, answerHistory)` | `hasVisualInput: true`; V3 enriches `capture` (`capture` or `model_inferred`) + delayed `transcribeScreenForMemory` | `formatMeetingHistory(message, historyTurn)` + `meetingHistoryScopes(sharedHistory)` | `electron/ipcHandlers.ts:2589-2596, 3417-3431, 3699, 3724-3728, 5774-5780, 7808` | When `questionOnRecordAsSpeech` is true, creates a `'user'`/`'typed'` turn instead of linking to the interviewer speech turn. Legacy path (`7808`) skips `resolvedQuestion`/screen enrichment and records pre-repair `fullResponse`. |
| **Manual What to Answer (`generate-what-to-say` → `runWhatShouldISay`)** | `findMeetingQuestion(spokenQuestion)` or `beginMeetingTurn(question ?? '')` | `addAssistantMessage(..., 'what_to_answer', undefined, { meetingTurn })` | `hasVisualInput: true`; `domContext` as `extension_untrusted`; `recordLiveTurn` enriches `model_inferred` then `capture` | `formatProviderMeetingHistory` in `runWhatShouldISayInner` | `electron/IntelligenceEngine.ts:2825-2834, 2916, 2697, 2760, 8503-8509` | Early-exit paths (`3447, 3770, 5106, 6595, 6623, 6691, 7932`) do not enrich `resolvedQuestion`, leaving `question: ''` on `Cmd+1` presses. Unguarded `this.session.beginMeetingTurn` crashes when `session` is mocked. |
| **Direct Assist (`direct-assist-stream`)** | `beginMeetingTurn(request.currentRequest, 'user')` | `recordMeetingAnswer(directHistoryTurn, fullText, { surface: imagePaths?.length ? 'screenshot' : 'manual_chat' })` | `hasVisualInput: true`; `pageContext.dom/ocr` as `extension_untrusted`; delayed `transcribeScreenForMemory` as `capture` | `formatMeetingHistory(request.currentRequest, directHistoryTurn)` | `electron/ipcHandlers.ts:9179-9187, 9245-9246, 9370-9399` | Delayed screenshot transcription is skipped if `directCaptureText` is also present (`9397`: `!directCaptureText`). |
| **Screenshots (`runCodeHint`, `runBrainstorm`, WTA w/ images)** | `beginMeetingTurn(...)` | `addAssistantMessage(..., 'screenshot', undefined, { meetingTurn })` | `hasVisualInput: true` + `recordLiveTurn` delayed `capture` (`transcribeScreenForMemory`) | `formatProviderMeetingHistory` | `electron/IntelligenceEngine.ts:2828-2834, 10059-10145, 10182-10281` | `runCodeHint`/`runBrainstorm` enrich `resolvedQuestion` after `addAssistantMessage`; `runWhatShouldISay` early exits omit it. |
| **Extension via What to Answer (`generate-what-to-say` + `domContext`)** | `beginMeetingTurn(question ?? '')` | `addAssistantMessage(..., 'what_to_answer', undefined, { meetingTurn })` | `enrichMeetingTurn(meetingTurn, { capture: { text: options.domContext, origin: 'extension_untrusted' } })` | `formatProviderMeetingHistory` | `electron/ipcHandlers.ts:17956-18023`; `electron/IntelligenceEngine.ts:2831-2834` | `inputKind` remains `'typed'` when `imagePaths` is empty (formatter still renders `'Candidate typed or captured request'`). |
| **Extension via Direct Assist (`direct-assist-stream` + `pageContext`)** | `beginMeetingTurn(request.currentRequest, 'user')` | `recordMeetingAnswer(..., { surface: ... })` | `enrichMeetingTurn(..., { capture: { text: directCaptureText, origin: 'extension_untrusted' } })` | `formatMeetingHistory` | `electron/ipcHandlers.ts:9181-9187, 9245-9246, 9370-9375` | Same as Direct Assist above. |
| **Auto Answer (`runAutoAnswer` / `handleSuggestionTrigger`)** | `trigger.meetingTurn ?? findMeetingQuestion(trigger.lastQuestion) ?? beginMeetingTurn(..., 'interviewer')` | `addAssistantMessage(..., 'what_to_answer', undefined, { meetingTurn })` (or `revealSpeculativeAnswer`) | `hasVisualInput: true` if images | `formatProviderMeetingHistory` (or `liveBrainNotebook` if supplied) | `electron/IntelligenceEngine.ts:1637, 2070, 2125-2144, 2916, 8506` | `revealSpeculativeAnswer` (`2070`) passes `meetingTurn` properly; `this.session.getMeetingHistoryRevision()` invalidates stale prefetches (`1613`). |
| **Live Brain — Realtime (`Gemini`, `OpenAI`, `ElevenLabs`, `Deepgram VA`, `Sonic`)** | `identifyInterviewTurn` → `noteMeetingSpeech(..., 'interviewer', at, 'realtime')` | `recordInterviewAnswer` → `recordMeetingAnswer(..., { status, surface: 'live_brain', replaces })` | N/A (speech only) | `InterviewNotebook.projectHistory` → `formatProviderMeetingHistory` / `formatProviderMeetingHistoryMessages` | `electron/main.ts:10965-10973`; `premium/electron/liveBrain/ResponseOrchestrator.ts:488-499, 1218-1242`; `BrainSupervisor.ts:296-315` | `GeminiLiveBrain` buffers `addHistoryContext` while `providerTurnActive` after `BrainSupervisor` already cleared `pendingExternalHistory`. |
| **Live Brain — Flux writer & fallback writer** | `identifyInterviewTurn` (`ResponseOrchestrator.ts:785` / `meeting.ts:190`) | `IntelligenceEngine.ts:8506` (`'what_to_answer'`) + `meeting.ts:347` (`'live_brain'`) | N/A (speech only) | `notebook.projectHistory(question)` (`meeting.ts:192, 309, 381, 415`) | `premium/electron/liveBrain/meeting.ts:190-218, 309, 347, 415`; `IntelligenceEngine.ts:8506` | **Bug:** `IntelligenceEngine.ts:8506` writes `surface: 'what_to_answer'`, firing `externalMeetingAnswerListeners` for Live Brain's own writer answers. |
| **Phone Mirror (`phone-mirror` stream)** | `beginMeetingTurn(message, 'user')` | `addAssistantMessage(..., 'phone_mirror', undefined, { meetingTurn: phoneHistoryTurn })` | `recordPhoneTurn` → `recordLiveTurn` (`hasVisualInput` + delayed `capture`) | `formatMeetingHistory(message, phoneHistoryTurn)` + `meetingHistoryScopes` | `electron/ipcHandlers.ts:22623-22624, 22825, 22883, 22992-22999`; `IntelligenceEngine.ts:2599-2605` | Wired end-to-end. |
| **Custom actions (`runCustomButton`)** | `beginMeetingTurn(actionTurnQuestion(button.name))` | `recordMeetingAnswer(meetingTurn, full, { surface: imagePaths.length ? 'screenshot' : 'what_to_answer' })` | `recordLiveTurn` (`backupDescribe: 'manual_use_screen'`) | `formatProviderMeetingHistory` | `electron/IntelligenceEngine.ts:9652, 9659-9661, 9689, 9705` | Wired end-to-end. |
| **Manual Answer (`runManualAnswer` / `submit-manual-question`)** | `findMeetingQuestion(question) ?? beginMeetingTurn(question, 'user')` | `addAssistantMessage(answer, undefined, 'manual_chat', undefined, { meetingTurn })` | None | `formatProviderMeetingHistory` | `electron/IntelligenceEngine.ts:9829, 9846, 9975, 10027` | Wired end-to-end. |
| **Other actions (`runFollowUp`, `runRecap`, `runClarify`, `runLiveHelper('sound_smart')`)** | None | `addAssistantMessage(..., 'what_to_answer')` (no `meetingTurn`) | None | **No** (does not read `formatProviderMeetingHistory`) | `electron/IntelligenceEngine.ts:9268, 9431, 9521, 9616` | **Gap:** Not wired to read shared history; `addAssistantMessage` without `meetingTurn` or `skipMeetingLedger` can attach to an unrelated unanswered interviewer turn. |

---

## 3. Findings (Ranked by Severity)

### [HIGH-1] `runWhatShouldISay` unguarded `this.session.beginMeetingTurn` crashes mocked-session tests and breaks `test:intelligence`
- **File:** `electron/IntelligenceEngine.ts:2825-2834` (also `1637, 2916, 8503, 9652, 9829, 10059, 10182`) and `electron/context-intelligence/__tests__/CutOffAnswerNotInRing2026_11_15.test.mjs:39`
- **Status:** CONFIRMED (reproduced in `npm run test:intelligence`: 30 failed)
- **Scenario:** Any caller or test constructing `IntelligenceEngine` with a partial or omitted `session` (such as `HotkeyTurnsRecorded2026_10_28.test.mjs`, `ScreenshotMemory2026_09_08.test.mjs`, `SpeculativeAdoptionRecorded`) calls `runWhatShouldISay(...)`, which executes `this.session.beginMeetingTurn(question ?? '')` without optional chaining → `TypeError: Cannot read properties of undefined (reading 'beginMeetingTurn')`. Additionally, adding `, undefined, { meetingTurn: ledgerMeetingTurn }` to `addAssistantMessage` broke `CutOffAnswerNotInRing2026_11_15.test.mjs:39`'s source-regex check.
- **Fix direction:** Guard `this.session?.beginMeetingTurn?.(...)`, `findMeetingQuestion?.(...)`, `enrichMeetingTurn?.(...)`, and `getMeetingTurns?.() ?? []` in `IntelligenceEngine.ts`, and update `CutOffAnswerNotInRing2026_11_15.test.mjs` to allow the optional 4th/5th arguments.

### [HIGH-2] Live Brain writer (`runLiveBrainAnswer`) records `surface: 'what_to_answer'` instead of `'live_brain'`, re-triggering `subscribeExternalMeetingAnswers`
- **File:** `electron/IntelligenceEngine.ts:8506`, `electron/SessionTracker.ts:300`, `premium/electron/liveBrain/meeting.ts:347, 669`, `premium/electron/liveBrain/BrainSupervisor.ts:107-120`
- **Status:** CONFIRMED (traced across all 4 files)
- **Scenario:** When Live Brain uses `writer` (either Flux's normal `AnswerWriter` or `dispatchBackup('writer')` during catch-up/disconnect on `amazon-sonic`), `runWhatShouldISayInner` calls `this.session.addAssistantMessage(finalWtaAnswer, wtaWriteDecision, 'what_to_answer', undefined, { meetingTurn })`. `SessionTracker.recordMeetingAnswer` (`SessionTracker.ts:300`) fires `externalMeetingAnswerListeners` whenever `options.surface !== 'live_brain'`. Consequently: (1) on `amazon-sonic`, `syncExternalHistory` treats Live Brain's own fallback answer as an external answer and calls `restartStandbyForHistory(lease)`, spawning another Sonic session; (2) `meeting.ts:347`'s subsequent `recordInterviewAnswer(..., 'live_brain')` is rejected as a duplicate write (`SessionTracker.ts:283-290`), leaving the turn's surface as `'what_to_answer'`.
- **Fix direction:** Pass `options?.liveBrain ? 'live_brain' : 'what_to_answer'` as the `surface` argument in `runWhatShouldISayInner` (or pass `surface` in `answered` to `recordMeetingAnswer`).

### [HIGH-3] `AmazonSonicBrain` standby reseed can loop as `history_stale` when speech or `writer` advances `meetingHistoryRevision` mid-connect
- **File:** `premium/electron/liveBrain/BrainSupervisor.ts:500-508`, `electron/SessionTracker.ts:214, 252`
- **Status:** CONFIRMED (traced)
- **Scenario:** An external screenshot answer triggers `restartStandbyForHistory` on an active `amazon-sonic` lease at revision `R`. While the standby Sonic session is connecting, the interviewer asks a follow-up (`noteMeetingSpeech` bumps `meetingHistoryRevision` to `R+1`) and `dispatchBackup('writer')` answers it (`R+2`). When standby becomes ready, `promote()` checks `projectedHistory.revision > replacement.historyRevision` (`R+2 > R`), discards the standby as `'history_stale'`, and calls `prepareFresh` again—causing repeated Bedrock `InvokeModelWithBidirectionalStream` connections until a quiet window occurs.
- **Fix direction:** Compare `replacement.historyRevision` against the revision of completed/captured turns (or `pendingExternalHistory` revisions) rather than raw `meetingHistoryRevision` bumped by unanswered `noteMeetingSpeech`, or allow promotion when the active `backupRun` is already handling the delta.

### [MEDIUM-1] `observePipelineTranscript` (system STT path) does not trigger `writer` catch-up when `hasPendingExternalHistory()` is true
- **File:** `premium/electron/liveBrain/meeting.ts:583` vs `premium/electron/liveBrain/meeting.ts:791`
- **Status:** CONFIRMED (traced)
- **Scenario:** If an external answer is pending sync (`supervisor.hasPendingExternalHistory() === true`, e.g., while `GeminiLiveBrain` or `AmazonSonicBrain` is connecting) and the interviewer speaks a follow-up that arrives via system STT (`observePipelineTranscript`) before/without a provider `interviewer_transcript` `final: true`, `meeting.ts:791` only dispatches backup if `realtimeDisconnected || status === 'Backup busy'`. When `realtimeDisconnected` is `false`, `writer` catch-up is not triggered on the STT path.
- **Fix direction:** Mirror `meeting.ts:583` in `meeting.ts:791`: if `notePendingTurn(text, at, false)` is true and `supervisor.hasPendingExternalHistory()`, call `dispatchBackup('writer')`.

### [MEDIUM-2] Manual What to Answer early-exit paths omit `resolvedQuestion`, and secondary actions (`runFollowUp`, `runRecap`, `runClarify`, `runLiveHelper('sound_smart')`) are unwired
- **File:** `electron/IntelligenceEngine.ts:2828, 3447, 3770, 5106, 6595, 6623, 6691, 7932, 9268, 9431, 9521, 9616`
- **Status:** CONFIRMED (traced)
- **Scenario:** (A) A manual `Cmd+1` press passes `question = undefined`, creating `beginMeetingTurn('')`. Only the main exit at `8503` calls `enrichMeetingTurn(..., { resolvedQuestion })`; any early exit (`answerLLM`, `clarify`, `stubFallback`, `tagLeakFallback`, `honestFallback`) leaves `question: ''` and `resolvedQuestion: undefined`. (B) `runFollowUp`, `runRecap`, `runClarify`, and `runLiveHelper('sound_smart')` do not read `formatProviderMeetingHistory` and call `addAssistantMessage(..., 'what_to_answer')` without `meetingTurn` or `skipMeetingLedger: true`, which `SessionTracker.ts:839-841` can attach to an unrelated unanswered interviewer speech turn.
- **Fix direction:** Enrich `resolvedQuestion` before early-exit `addAssistantMessage` calls in `runWhatShouldISayInner`, and pass `skipMeetingLedger: true` (or a dedicated `meetingTurn`) in `runFollowUp`/`runRecap`/`runClarify`/`runLiveHelper`.

### [MEDIUM-3] `GeminiLiveBrain` buffers `addHistoryContext` during `providerTurnActive`, but `BrainSupervisor` clears `pendingExternalHistory` immediately
- **File:** `premium/electron/liveBrain/brains/GeminiLiveBrain.ts:185-190, 421-426`, `premium/electron/liveBrain/BrainSupervisor.ts:92-95`
- **Status:** CONFIRMED (traced)
- **Scenario:** While Gemini is mid-response (`providerTurnActive === true`), an external screenshot answer arrives. `BrainSupervisor.flushExternalHistory` calls `lease.brain.addHistoryContext(history)` and immediately deletes the entry from `pendingExternalHistory`. Inside `GeminiLiveBrain`, `addHistoryContext` only pushes to `bufferedHistoryContext`. If the interviewer interrupts immediately and triggers a follow-up before Gemini's turn closes, `hasPendingExternalHistory()` is already `false`, so `writer` catch-up does not fire.
- **Fix direction:** Expose `hasPendingHistoryContext?(): boolean` on `LiveBrain` (returning `this.bufferedHistoryContext.length > 0` in `GeminiLiveBrain`) and include it in `BrainSupervisor.hasPendingExternalHistory()`, or flush on `interrupted` as well.

### [LOW-1] `DeepgramVoiceAgentBrain.addHistoryContext` drops history when `instructions >= 24,920` chars and slices mid-tag
- **File:** `premium/electron/liveBrain/brains/DeepgramVoiceAgentBrain.ts:253-267`
- **Status:** CONFIRMED (traced)
- **Scenario:** Under Deepgram-managed Think mode (`DEEPGRAM_MAX_MANAGED_PROMPT_CHARS = 25_000`), if `instructions.length >= 24_920`, `available` becomes `0` and `this.historyContext` is cleared to `''`. When `historyBudget > 0` and accumulated updates exceed it, `accumulated.slice(-historyBudget)` can slice mid-word or mid-`</interview_conversation>` tag.
- **Fix direction:** Reserve a minimum history budget (trimming `instructions` first) and trim `historyContext` at turn/block boundaries.

### [LOW-2] `SessionTracker.getMeetingTurns()` deep-clones up to 2,000 turns on every prompt/draft read
- **File:** `electron/SessionTracker.ts:232-234`
- **Status:** CONFIRMED (traced)
- **Scenario:** Every `eager_end_of_turn`, `decision`, `runWhatShouldISayInner`, and chat request calls `structuredClone([...this.meetingTurns.values()])`. In a 2,000-turn meeting with large capture strings, this allocates and clones megabytes on every keystroke/endpoint.
- **Fix direction:** Provide a `readonly` internal view for `formatProviderMeetingHistory` / `InterviewNotebook`, reserving `structuredClone` for external/test consumers.

### [LOW-3] `DirectAssist` skips delayed screenshot enrichment when `directCaptureText` is non-empty; `gemini-chat-stream` legacy skips `resolvedQuestion`/screen enrichment
- **File:** `electron/ipcHandlers.ts:9397`, `electron/ipcHandlers.ts:7805-7809`
- **Status:** CONFIRMED (traced)
- **Scenario:** When Direct Assist receives both extension `pageContext` and `imagePaths`, `!directCaptureText` prevents `transcribeScreenForMemory` from enriching `directHistoryTurn`. On `gemini-chat-stream` V3=0 (`7808`), `historyTurn` is not enriched with `resolvedQuestion` or screen text and records pre-repair `fullResponse`.
- **Fix direction:** Append screenshot transcription to `capture.text` when `directCaptureText` is present; enrich `historyTurn` on the legacy `gemini-chat-stream` exit.

---

## 4. Test Coverage Table (Task I)

| Stage 5 Scenario | Test Exists? | Inspects Actual Prompt/Session Payload? | Assessment / Weaknesses |
|---|---|---|---|
| **Screenshot → provider → spoken follow-up "why a heap?"** | Yes (`BrainSupervisor.test.mjs:75`, `Meeting.test.mjs:113`) | Yes (`addHistoryContext` payload / mock socket payload) | Uses `FakeLiveBrain` or direct `SessionTracker` calls; does not test full `ipcHandlers` → `IntelligenceEngine` → `LiveBrain` end-to-end. |
| **Extension via What to Answer & Direct Assist → spoken follow-up** | Partial (`MeetingHistoryProjection.test.mjs:13` tests formatter with `extension_untrusted`) | Formatter output only | No integration test exercising `ipcHandlers` (`generate-what-to-say` with `domContext` or `direct-assist-stream` with `pageContext`) → `SessionTracker` → `LiveBrain`. |
| **Typed answer → spoken "Why?"** | Yes (`MeetingHistoryProjection.test.mjs:59`, `Meeting.test.mjs:230+`) | Yes (`formatMeetingHistory` / `writer` `liveBrainNotebook`) | Covered at formatter and `meeting.ts` level; `ipcHandlers` `gemini-chat-stream` → `LiveBrain` not wired in one test. |
| **Live Brain answer → typed follow-up reaches regular provider prompt** | Partial (`SessionTrackerSurfaceIsolation2026_07_14.test.mjs:38`, `MeetingHistoryProjection.test.mjs:71`) | Formatter output only | No test executes `ResponseOrchestrator` (`live_brain`) → `SessionTracker` → `IntelligenceEngine.runManualAnswer` / `gemini-chat-stream` prompt payload. |
| **Auto Answer fallback → realtime recovers with fallback answer** | Yes (`Meeting.test.mjs` pending/fallback tests) | Yes (`writerRequests[0].liveBrainNotebook`) | Mocked `runLiveBrainAnswer` in `Meeting.test.mjs` manually calls `ledger.recordMeetingAnswer(..., { surface: 'meeting_auto_answer' })`, masking the `IntelligenceEngine.ts:8506` `'what_to_answer'` surface bug (`HIGH-2`). |
| **Provider switch / reconnect mid-turn: history survives, one answer per turn** | Yes (`BrainSupervisor.test.mjs`, `Meeting.test.mjs`) | Yes (`historyMessages` / `addHistoryContext` / `writerRequests`) | Mocked sockets/fakes; Sonic `history_stale` loop (`HIGH-3`) not exercised when speech + writer occur during connect. |
| **Long meeting: older question and exact constraints retrieved** | Yes (`MeetingHistoryProjection.test.mjs:45, 85`) | Yes (`formatMeetingHistory` / `notebook.projectHistory`) | Solid deterministic coverage for `1 <= n <= 10^5`, `vector<int>`, and 40+ turns. |
| **Correction / interruption / late result** | Yes (`SessionTrackerSurfaceIsolation2026_07_14.test.mjs:55, 108`, `ResponseOrchestrator.test.mjs:1096`, `Meeting.test.mjs`) | Yes (`ignoredRealtimeResponses` / `recordInterviewAnswer`) | Strong coverage in `ResponseOrchestrator` and `Meeting.test.mjs`. |
| **Delayed capture extraction enriches original turn** | Yes (`MeetingHistoryProjection.test.mjs:102`) | Yes (Flux `draft` vs `dispatch` `contextKey` & `liveBrainNotebook`) | Tested with direct `ledger.enrichMeetingTurn` call; `ipcHandlers` / `IntelligenceEngine.recordLiveTurn` async `transcribeScreenForMemory` path not exercised. |
| **New meeting: empty history** | Yes (`SessionTrackerSurfaceIsolation2026_07_14.test.mjs:72`, `MeetingHistoryProjection.test.mjs:138`) | Yes (`getMeetingTurns()`, `projectHistory()`) | Tested on `SessionTracker` and `InterviewNotebook`; `main.ts:8166` `startMeeting` reset verified by inspection. |
| **Each provider's update is silent and arrives before next answer** | Yes (`GeminiLiveBrain.test.mjs`, `RealtimeBrain.test.mjs`, `DeepgramVoiceAgentBrain.test.mjs`, `AmazonSonicBrain.test.mjs`) | Yes (mock WebSocket / stream frames) | Verifies `turnComplete: false` (Gemini), `conversation.item.create` without `response.create` (OpenAI), `contextual_update` (ElevenLabs), `UpdatePrompt` (Deepgram VA), and non-interactive pre-audio `USER`/`ASSISTANT` (Sonic). |

---

## 5. Commands Run & Exact Results

| Command | Result | Exact Counts / Notes |
|---|---|---|
| `git status` | Exit 0 | Clean working tree on `feat/live-brain` |
| `git diff --check 449093e6b..HEAD` | Exit 0 | 0 whitespace/conflict errors |
| `npm run typecheck:electron` | Exit 0 | Passed |
| `npm run typecheck:premium` | Exit 0 | Passed |
| `npm run build` | Exit 0 | `tsc -p tsconfig.json` + `vite build` passed (built in 38.88s) |
| `npm run test:live-brain` | Exit 0 | `build:electron` + **293 passed, 0 failed, 0 skipped** |
| `node --test electron/services/__tests__/SessionTrackerSurfaceIsolation2026_07_14.test.mjs premium/electron/liveBrain/__tests__/MeetingHistoryProjection.test.mjs` | Exit 0 | **20 passed, 0 failed, 0 skipped** (2 suites) |
| `node --test "electron/services/__tests__/SessionTracker*.test.mjs" "electron/context-intelligence/__tests__/AnswerTrace.test.mjs" "electron/context-intelligence/__tests__/LegacyTrace.test.mjs" "electron/llm/__tests__/DirectAssistCore2026_08_29.test.mjs" "electron/services/__tests__/DirectAssistIpcBridge2026_08_29.test.mjs"` | Exit 0 | **160 passed, 0 failed, 0 skipped** (11 suites; known non-failing `better-sqlite3` ABI warning logged) |
| `npm run test:core-smoke` | Exit 0 | **220 passed, 0 failed, 0 skipped** (16 suites) |
| `npm run test:auto-answer` | Exit 0 | **203 passed, 0 failed, 0 skipped** |
| `npm run test:realtime-prompt` | Exit 1 | V3=1: 29/29 passed; V3=0: 26/26 passed; typed-chat: **35/36 passed, 1 failed** (`guard: a safety redirect does not carry it -> occurrences=1`, pre-existing) |
| `npm run test:intelligence` | Exit 1 | **3275 passed, 30 failed, 2 skipped, 9 todo** (27 failures from `IntelligenceEngine.ts` unguarded `this.session.beginMeetingTurn` / `addAssistantMessage` signature in `HotkeyTurnsRecorded2026_10_28`, `ScreenshotMemory2026_09_08`, `SpeculativeAdoptionRecorded`, `CutOffAnswerNotInRing2026_11_15`; 3 pre-existing in `IntelligenceFlags.test.mjs` `72 !== 71`) |

*(Note: `npm run lint` does not exist in `package.json`. Cross-platform check: `git grep process.platform` in Phase 10 files returned 0 matches; no OS-specific paths or shell commands were introduced.)*

---

## 6. Validation Status (CLAUDE.md Categories & Per-Provider)

- **Covered by automated Windows branch tests:**
  - `SessionTracker` meeting ledger, epoch isolation, eviction, legacy view preservation, and surface isolation (`SessionTracker*.test.mjs`: 20+ tests).
  - `meeting-history-formatter.ts` & `InterviewNotebook` projection, constraints/code preservation, wrapper tag escaping, rolling summary, scope filtering (`MeetingHistoryProjection.test.mjs`).
  - `BrainSupervisor`, `ResponseOrchestrator`, `meeting.ts` (mocked sockets/writers/clocks: `test:live-brain` 293/293).
  - Electron & renderer TypeScript checks and production builds (`typecheck:electron`, `typecheck:premium`, `build:electron`, `build`).
- **Per-provider status:**
  - **Gemini Live:** Mock-tested (mock WebSocket); **not live-tested**.
  - **OpenAI Realtime:** Mock-tested (mock WebSocket); **not live-tested**.
  - **ElevenLabs Realtime:** Mock-tested (`contextual_update` on mock WebSocket); **not live-tested**.
  - **Deepgram Voice Agent:** Mock-tested (`UpdatePrompt` on mock WebSocket); **not live-tested**.
  - **Amazon Nova Sonic:** Mock-tested (mock bidirectional stream); **not live-tested**.
  - **Deepgram Flux:** Shared-snapshot & draft invalidation mock-tested; **not live-tested**.
- **Requires physical Windows verification:** All live-provider acceptance cases, WASAPI loopback + mic capture, and overlay rendering.
- **Requires physical macOS verification:** All live-provider acceptance cases, CoreAudio/ScreenCaptureKit capture, Apple Speech STT, and overlay rendering on `darwin`.

---

## 7. Live Checks Still Required (User Checklist)

### Windows (`win32`) & macOS (`darwin`) — Per-Provider Live Verification
- [ ] **Primary acceptance case (both OS):** Capture a coding problem via screenshot (and separately via browser extension What to Answer + Direct Assist) → get heap suggestion → ask aloud *"Why did you use a heap?"* → verify Live Brain answers using the problem constraints and heap suggestion → type a follow-up in chat → verify regular AI provider continues from Live Brain's answer.
- [ ] **Gemini Live:** Verify `clientContent` (`turnComplete: false`) mid-session update is silent (no unsolicited audio/text reply) and arrives before the next spoken question; verify buffering while Gemini is speaking.
- [ ] **OpenAI Realtime:** Verify `conversation.item.create` (no `response.create`) is silent and included in the next spoken answer.
- [ ] **ElevenLabs Realtime:** Verify `contextual_update` event is accepted silently by the live ElevenLabs WebSocket without triggering an unsolicited response.
- [ ] **Deepgram Voice Agent:** Verify `UpdatePrompt` within the 25k managed cap (and BYO mode) is accepted silently and informs the next answer.
- [ ] **Amazon Nova Sonic:** Verify fresh session pre-audio `USER`/`ASSISTANT` (`interactive: false`) seeding produces no unsolicited reply, and verify `writer` fallback when a follow-up arrives while Sonic is reseeding.
- [ ] **Deepgram Flux:** Verify each turn reads the updated shared ledger snapshot and invalidates stale eager drafts when delayed screenshot extraction lands.
- [ ] **Privacy & lifecycle (both OS):** Confirm `NATIVELY_PROMPT_DEBUG=1` / console logs contain no raw interview text or images; confirm starting a new meeting clears shared history.
