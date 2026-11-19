# Phase 6 main, IPC, preload findings

The `code-review-graph` MCP tools were unavailable (tool inventory returned zero), so this audit used the recovered compiled bundles and local source/build. Recovered citations below are to `recovered/compiled/app/dist-electron/electron/` unless stated otherwise. These are **compiled structural comparisons**, not proof that source files are byte-identical.

## Feature catalogue and verdicts

| ID | 3.2.0 feature | Verdict | Local evidence | Recovered evidence | Finding |
| --- | --- | --- | --- | --- | --- |
| M001 | Preload `window.electronAPI` bridge | Implemented | `electron/preload.ts:1613`, compiled `dist-electron/electron/preload.js` | `preload.js:33` | Both compiled bridges contain 806 literal IPC calls, with identical channel sets; two answer-length method declarations are reordered. |
| M002 | Main startup, lifecycle, platform gates | Leave-dev | `electron/main.ts:15,87-130,174,840,947,9621` | `main.js` module banner `// electron/main.ts` | Main compiled diff includes dev wiring and billing registration, plus comments and declaration shape; no other functional diff found in normalized main module. |
| M003 | Window and overlay platform behavior | Implemented | `electron/WindowHelper.ts:135,350,557,633-634,929-984,2704-2770` | `WindowHelper.js` module banner `// electron/WindowHelper.ts` | Normalized compiled module has zero differing logic lines; both darwin and win32 branches present. `/tmp/natively-overlay-resize-trace.log` is present in both builds and remains a cross-platform risk. |
| M004 | Meeting persistence | Implemented | `electron/MeetingPersistence.ts` | `MeetingPersistence.js` module banner `// electron/MeetingPersistence.ts` | Only destructuring alias emitted differently at recovered module offset 720; same `offerTrainingMeeting` call. |
| M005 | IPC channel registration | Partial | `electron/ipcHandlers.ts:17971-17977` | `ipcHandlers.js` module banner `// electron/ipcHandlers.ts`, compiled module offset 11654-11660 | Both builds have the same 12 literal `ipcMain.handle/on` calls in this bundle and the same preload channel set. Local `guideSurfaceSet(surface)` runs before analytics; recovered calls it after the analytics try/catch. Copy the recovered order. |
| M006 | Licence, packs, Pro access and answer-length Pro registration | Leave-billing | `electron/main.ts`, `electron/ipcHandlers.ts`, `electron/services/proAccess.ts`, `electron/services/packs/` | `main.js`, `ipcHandlers.js`, corresponding service module banners | Numerous deliberate billing differences. Do not edit. |
| M007 | Development premium override | Leave-dev | `electron/services/devPremiumOverride.ts`, calls in `electron/ipcHandlers.ts` | absent from recovered compiled app | Standing local-only hold. Do not edit. |
| M008 | Packaged user-data pin guard | Leave-dev | `electron/utils/pinUserData.ts` | `main.js` module banner `// electron/utils/pinUserData.ts` | Local checks `app` existence and boolean `isPackaged`; recovered tests `app.isPackaged` directly. Hold. |
| M009 | Calendar OAuth credentials | Leave-secret | `electron/services/CalendarManager.ts` | compiled `CalendarManager.js` module | Recovered embeds a secret; local empty. Hold. |
| M010 | Manual profile intelligence topic extraction | Implemented | `electron/llm/manualProfileIntelligence.ts` | compiled `manualProfileIntelligence.js` module | Prefix regular-expression alternatives reordered, but same alternatives and matching behavior. |
| M011 | Spoken answer word bands and live deadlines | Implemented | `electron/llm/speakability.ts`, `electron/llm/liveDeadlines.ts` | respective compiled modules | Functions are reordered in output; bodies are unchanged. |
| M012 | Coding shape and provider error classification | Implemented | `electron/llm/codingShape.ts`, `electron/llm/providerErrorClassifier.ts` | respective compiled modules | Declaration order differs; constants and bodies match. |
| M013 | Intelligence engine speculative generation | Implemented | `electron/IntelligenceEngine.ts` | compiled `IntelligenceEngine.js` module | `onlySmallTalk` moved as a declaration and `nextRunIsAutomatic=false` crosses a calculation that does not read it. |
| M014 | Profile knowledge Pro gating | Leave-billing | `electron/services/knowledge/v3ProfileSources.ts` | compiled `v3ProfileSources.js` module | Gating declaration order differs; body matches. Billing hold applies. |

## Phase 5 Unsure re-examination in this scope

| Module | Phase 6 classification | Evidence |
| --- | --- | --- |
| `electron/config/constants.ts` | Identical-semantics | Normalized compiled segment has zero differing lines. |
| `electron/context-intelligence/orchestration/engine-bridge.ts` | Identical-semantics | Same regex declaration, moved. |
| `electron/context-intelligence/orchestration/orchestrator.ts` | Identical-semantics | `applyModeSourceContract(policy, req.modeSourceContract)` moved with no changed arguments. |
| `electron/context-intelligence/retrieval/mode-retrieval-port.ts` | Identical-semantics | Two constants reordered. |
| `electron/IntelligenceEngine.ts` | Identical-semantics | See M013. |
| `electron/ipcHandlers.ts` | Real-diff → M005; Leave-billing; Leave-dev | Full normalized module diff; guide ordering is the non-hold difference. |
| `electron/llm/codeVerification/localRunner.ts` | Identical-semantics | Zero differing normalized lines. |
| `electron/llm/codingShape.ts` | Identical-semantics | Same function moved. |
| `electron/llm/liveDeadlines.ts` | Identical-semantics | Same function moved. |
| `electron/llm/manualProfileIntelligence.ts` | Identical-semantics | Same regex alternatives reordered. |
| `electron/llm/providerErrorClassifier.ts` | Identical-semantics | Same constant moved. |
| `electron/llm/speakability.ts` | Identical-semantics | Same functions moved. |
| `electron/main.ts` | Leave-billing; Leave-dev; Identical-semantics | Main module diff consists of held registration/dev wiring, comments, and alias changes. |
| `electron/MeetingPersistence.ts` | Identical-semantics | Destructuring alias only. |
| `electron/preload.ts` | Identical-semantics | Answer-length declarations moved, same methods/channels. |
| `electron/services/CalendarManager.ts` | Leave-secret | Recovered secret vs local empty. |
| `electron/services/knowledge/v3ProfileSources.ts` | Identical-semantics; Leave-billing | Gating functions moved; body unchanged. |
| `electron/services/meeting/ChunkSummaryGenerator.ts` | Identical-semantics | Zero differing normalized lines. |
| `electron/services/meeting/v2FallbackNotes.ts` | Identical-semantics | Zero differing normalized lines. |
| `electron/services/RateLimiter.ts` | Identical-semantics | Constants reordered. |
| `electron/utils/onnxLoadSentinel.ts` | Identical-semantics | Zero differing normalized lines. |
| `electron/utils/onnxThreadConfig.ts` | Identical-semantics | Zero differing normalized lines. |
| `electron/utils/onnxWorkerShutdown.ts` | Identical-semantics | Zero differing normalized lines. |
| `electron/utils/pinUserData.ts` | Leave-dev | Packaged guard differs by standing rule. |

## Limits

The literal IPC set check does not establish that dynamic channels, arguments, return values, or every service implementation match. This pass did not execute the app on macOS or Windows. It also did not inspect native helpers or packaging; those belong to the separate native/packaging scope.
