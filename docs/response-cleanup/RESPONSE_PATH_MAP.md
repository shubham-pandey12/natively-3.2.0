# Natively Response-Path Map (Generation → Display)

> **Scope:** Phase 2 evaluation preparation for shared response cleanup (starting from commit `42c56af2`).
> **Purpose:** Map where **Auto Answer**, **text replies**, and **Live Brain** generate, stream, finalize, clean, parse control messages, and render responses, and identify where **spoken** vs **text** cleanup fits.

---

## 1. Auto Answer (and Manual "What to Answer")

| Stage | File & Function | Behavior |
|---|---|---|
| **Trigger & gating** | `premium/electron/autoAnswer/SimpleAutoAnswer.ts` | Detects finished interviewer turn / correction; dispatches automatic answer trigger unless Live Brain owns the meeting. |
| **Orchestration** | `electron/IntelligenceEngine.ts` — `handleSuggestionTrigger`, `runWhatShouldISay`, `runWhatShouldISayInner` | Mints `generationId`, runs planner (`planAnswer` → `answerType`, `answerStyle`), builds context/prompts, and streams from the active AI provider. |
| **Speculative prefetch** | `electron/IntelligenceEngine.ts` — `completeSpeculativeRun` | Adopts an in-flight speculative run (`what_to_answer_question`, `suggested_answer_token`), runs `cleanAnswerArtifacts` on reveal. |
| **Streaming to UI** | `electron/IntelligenceEngine.ts` — `runWhatShouldISayInner` (`suggested_answer_token` emit) → `electron/main.ts` (`queueBatch('suggested_answer', ...)`) → `src/components/NativelyInterface.tsx` (`onIntelligenceSuggestedAnswerToken`) | Streams tokens in batches (after preamble/coding gates). |
| **Finalization & existing cleanup** | `electron/IntelligenceEngine.ts` — `runWhatShouldISayInner` (~L8273–8357) | Always-on minimal cleanup: `cleanAnswerArtifacts` + conditional `compressToSpeakable`. Flag-gated (`answerDiversityGuard`): `applyAnswerContract` in `electron/intelligence/OutputShapeNormalizer.ts` (`cleanAnswerArtifacts` → `compressToSpeakable` → `humanizeForAnswerType(answerType, text)` → `applySpeakabilityBudget` → `AnswerDiversityGuard`). |
| **Final delivery** | `electron/IntelligenceEngine.ts` (`showWtaAnswer` → `suggested_answer`) → `electron/main.ts` (`intelligence-suggested-answer`) → `src/components/NativelyInterface.tsx` (`onIntelligenceSuggestedAnswer`) | Replaces the streamed row in place by `generationId`. |
| **Control messages** | `electron/IntelligenceEngine.ts` (`Ask:` / `[[NO_ACTION]]` handling; coding `<verification_spec>` stripped via `stripVerificationSpec`) | Live Brain Flux/pipeline routes also share `runWhatShouldISayInner`. |

### Where shared cleanup fits (Auto Answer)
- **Mode:** `spoken` (except structured/coding/technical types already gated out by `shouldHumanizeOutput(answerType)`).
- **Fit point:** At sentence boundaries during streaming (for low-latency first-cleaned-sentence) and/or at the finalization boundary in `runWhatShouldISayInner` / `OutputShapeNormalizer.ts` (`applyAnswerContract`) before `suggested_answer` is emitted.

---

## 2. Text Replies (Typed Chat & Manual Surface)

| Stage | File & Function | Behavior |
|---|---|---|
| **Entry point** | `electron/ipcHandlers.ts` — `_geminiChatStreamHandler` (V3 prompt path and Legacy path) | Handles typed chat messages (`gemini-chat-stream`) across configured AI providers (`LLMHelper.streamChat`, including Codex CLI, Antigravity, Ollama, OpenAI, Anthropic, Gemini, Bedrock, etc.). |
| **Streaming to UI** | `electron/ipcHandlers.ts` (`event.sender.send('gemini-stream-token', visible, { streamId })`) → `electron/preload.ts` → `src/components/NativelyInterface.tsx` (`onGeminiStreamToken`) | Streams tokens directly to the chat bubble (gated by meta-preamble strip on V3). Phone mirror also forwards via `win?.webContents.send('gemini-stream-token', ...)`. |
| **Existing cleanup (V3 path)** | `electron/ipcHandlers.ts` (~L3538–3553) | Runs `runClaimVerifier` (when enabled) with `clean: cleanAnswerArtifacts`. Does **not** currently run `humanizeForAnswerType`. |
| **Existing cleanup (Legacy path)** | `electron/ipcHandlers.ts` (~L6685–6745) | Runs `cleanAnswerArtifacts(fullResponse)`, `humanizeForAnswerType(answerPlan.answerType, fullResponse)`, `compressTechnicalConcept` (for `technical_concept_answer`), and `applySpeakabilityBudget` (measure-only). |
| **Final delivery** | `electron/ipcHandlers.ts` (`event.sender.send('gemini-stream-done', { finalText, streamId, ... })`) → `src/components/NativelyInterface.tsx` | Atomically replaces the streamed bubble with `finalText` on `gemini-stream-done`. |
| **Secondary prose caller** | `premium/electron/knowledge/CoverLetterEngine.ts` (~L180–191) | Calls `humanizeSpokenAnswer` directly on generated cover-letter paragraphs, greeting, hook, and closing (currently without `{ speaker: 'candidate' }`). |

### Where shared cleanup fits (Text Replies)
- **Mode:** `text` (preserving useful Markdown headings, lists, code blocks, and formulas).
- **Fit point:** Unified post-stream / sentence-boundary cleanup before `gemini-stream-done` (`finalText`) on both V3 and Legacy chat paths, rather than running `humanizeForAnswerType` only on the Legacy branch.

---

## 3. Live Brain (Realtime Brains, Flux + AnswerWriter, and Pipeline Fallback)

| Route | Generation & Streaming | Control Messages | Existing Cleanup | Display Delivery |
|---|---|---|---|---|
| **Realtime audio-to-text brains** (`GeminiLiveBrain`, `ElevenLabsRealtimeBrain`, `DeepgramVoiceAgentBrain`, `AmazonSonicBrain`) and **Realtime text** (`OpenAIRealtimeBrain`) | Provider WebSocket/stream managed by `BrainSupervisor` (`premium/electron/liveBrain/BrainSupervisor.ts`) → emits `response_started` / `response_delta` / `response_done` to `ResponseOrchestrator` (`premium/electron/liveBrain/ResponseOrchestrator.ts`). | `createResponseParser` (`premium/electron/liveBrain/responseParser.ts`) strips/parses `[[NO_ACTION]]`, `No action.`, `[[ASK]]`, `Ask:` before emitting text; `isFillerOnly` (`ResponseOrchestrator.ts`) suppresses filler turns. | **None** on `response_delta` / `response_done`. | `ResponseOrchestrator` → `createLiveBrainOverlayPort` (`premium/electron/liveBrain/overlayPort.ts`) → `what_to_answer_question` (`responseText` / `clarification`) → `electron/main.ts` (`intelligence-what-to-answer-question`) → `NativelyInterface.tsx`. |
| **Deepgram Flux + My AI Provider** (`DeepgramFluxBrain`) | `DeepgramFluxBrain` emits `eager_end_of_turn` / `decision: { action: 'answer' }` → `ResponseOrchestrator` → `AnswerWriter` (`premium/electron/liveBrain/AnswerWriter.ts`) → `IntelligenceEngine.runLiveBrainAnswer` → `handleSuggestionTrigger` → `runWhatShouldISayInner`. | `isFillerOnly` in `ResponseOrchestrator`; `Ask:` sentinel detected on `onComplete` in `meeting.ts` (~L131) and `noteWriterClarification`. | Same as Auto Answer (`runWhatShouldISayInner` finalization). | `suggested_answer_token` / `suggested_answer` + `overlayPort` (`setOutdated`, `showQuestion`). |
| **Pipeline fallback** (`PipelineBrain`) | `BrainSupervisor` falls back to `PipelineBrain` → `SimpleAutoAnswer` → `IntelligenceEngine`. | `SimpleAutoAnswer` + `isInertUtterance`. | Same as Auto Answer. | Same as Auto Answer (`suggested_answer_token` / `suggested_answer`). |

### Where shared cleanup fits (Live Brain)
- **Mode:** `spoken`.
- **Fit point:**
  - For **realtime brains**, inside `ResponseOrchestrator` **after** `createResponseParser` and `isFillerOnly` have handled `Ask:` / `No action.` / filler suppression (on completed sentences as deltas arrive, and on `response_done` for any trailing text) so control sentinels are never altered before parsing.
  - For **Deepgram Flux + `AnswerWriter`** and **`PipelineBrain`**, reuse the shared Auto Answer hook in `runWhatShouldISayInner` (also after `Ask:` detection).
