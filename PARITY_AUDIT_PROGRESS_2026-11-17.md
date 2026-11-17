# Natively 3.2.0 parity audit — in progress

## Baseline and method

- Branch: `fix/restore-premium-types`; starting commit: `acbd1f2c0c5c0d156791095374ad1215b9274074`; starting working tree: clean.
- Reference: `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/compiled/app`.
- The repository `AGENTS.md` was read. `code-review-graph` MCP tools were not exposed in this session; targeted file searches were used. Graph impact and flow analysis remains outstanding.
- [PARITY_FILE_LEDGER_2026-11-17.tsv](PARITY_FILE_LEDGER_2026-11-17.tsv) inventories all 1,123 first-party recovered packaged files outside `node_modules`. The ledger is ordered by recovered path. Its source candidates are hypotheses until individually traced. `UNVERIFIABLE` means that semantic review has not established equivalence or a gap; it does **not** assert missing functionality.
- 839 files have `EXACT FILE MATCH` status against the fresh branch build after the fixes below. Eight modules have `BEHAVIOR MATCH WITH EVIDENCE`; four have `INTENTIONAL DIFFERENCE`; `IntelligenceEngine.js` and `LLMHelper.js` have `CONFIRMED GAP`; 270 files remain `UNVERIFIABLE`, including 79 with no same-path generated output. The latter may be renamed or combined bundles and are not automatically omissions.
- Generated `dist` and `dist-electron` files are untracked/ignored; exact hashes establish compiled-file identity under this build environment, not identity of reconstructed TypeScript source or physical runtime behavior.

## Confirmed gap and fix

1. **Vision hedge cancellation (shared Electron LLM, user-visible latency/cost risk).** Recovered `dist-electron/electron/llm/streamFallbackEngine.js` aborts an already cancelled provider branch and refuses to start a hedge partner after cancellation. Before the fix, `electron/llm/streamFallbackEngine.ts` lacked both checks. A focused test in `electron/llm/__tests__/VisionStreamFallback.test.mjs` failed before the fix (`Missing expected rejection (AbortError)`, exit 1) and passed afterward. The rebuilt output is SHA-256 identical to the recovered compiled file: `c137f4e876a2c86006ed25cc27574e5aac8b45fa6426aaf0553c7bddeabc03f6`. Shared `openHedged` callers in vision fallback are affected on macOS and Windows; no platform-specific code changed. Physical behavior on either OS remains untested.
2. **Lazy chart material (shared diagram resolver).** The recovered `DirectAssistService.js` bundle evaluates function-valued `input.material` before chart input analysis. The branch passed the function itself, causing the resolver to treat conversation material as unknown. The focused `diagramRequest.test.mjs` test failed before the fix (0/1, exit 1) and passed afterward (1/1, exit 0). `src/lib/diagram/diagramRequest.mjs` and its type declaration now accept the recovered behavior. The rebuilt `DirectAssistService.js` is SHA-256 identical to the recovered file (`f629b30700c8e97fe1c26e509fae9a6d9d39e0d28b5aa3db58bb0dbd6177ac66`). Production callers inspected supply strings or omit `material`, so no live app path using a function was found; this restores the public resolver behavior. The resolver is shared on macOS and Windows.
3. **Spoken coding problem tracking (shared SessionTracker).** The recovered build recognizes “Implement an LRU cache with get and put.” and exposes it through `getActiveCodingProblem`; the branch recognized neither. A direct recovered-vs-branch runtime check showed `true` vs `false`, and the focused test failed before the fix because the method was absent. The tracker now follows the recovered statement boundaries, candidate-question exclusion, continuation handling, bounded `saidAfter`, and reset behavior. The focused test passes 1/1 and the durable-memory plus focused tests pass 10/10. Its consumer in `IntelligenceEngine` still needs wiring review/fix, so this is module-local recovery rather than complete feature parity.
4. **Nepali recognition and provider restrictions (shared audio, settings and notes controls).** The recovered language table offers Nepali (`ne-NP`) and excludes Nepali/Maltese from Soniox and the Natively relay. Branch behavior lacked the language, the provider filter and the Soniox auto-detect fallback. `Recovered320NepaliLanguage.test.mjs` failed 0/3 before the fix and passed 3/3 afterward. The shared language table, Soniox setter, failover filter, Deepgram Nova-2 catalogue, Whisper token map, Settings picker and Notes controls were updated. The five directly affected compiled modules now match recovered files byte for byte. An existing Whisper test fixture omitted the official Nepali token; the [OpenAI Whisper tokenizer](https://github.com/openai/whisper/blob/main/whisper/tokenizer.py) confirms `ne` maps to `nepali`, and the fixture was updated. Related tests pass 38/38. Real provider behavior and UI are not physically verified.

## Work still required

- `CropperWindowHelper.js` was reviewed first: an initial 771-line partial comparison was replaced with a comparison from its sole source marker through bundle end (974 lines), identical after normalizing only generated import variable numbers. Both platform branches, main caller, preload IPC and renderer consumer were located. This establishes module-local compiled equivalence; changed dependencies and native window behavior remain separate questions.
- `IntelligenceEngine.js` was reviewed next and has 54 semantic diff hunks in its own bundled section. Confirmed differences include the no-document claim verifier gate, separate speculative decline cooldown, automatic trigger cooldown bypass, source badge forwarding, and turn history/outcome handling. Its ledger status is `CONFIRMED GAP`; focused tests and fixes are still required. The next first `UNVERIFIABLE` entry is `LLMHelper.js`. Do not mistake moving the ledger cursor for resolving the IntelligenceEngine gap.
- `LLMHelper.js` has confirmed differences in privacy scope recognition/scrubbing, structured generation scope handling, and provider-exhaustion error reporting. Its ledger status is `CONFIRMED GAP`; focused tests and fixes are still required.
- `MeetingPersistence.js` differs by branch-only emergency transcript backup on failed saves and a `meeting_saved` first-run guide event. These are deliberate tested additions, so its status is `INTENTIONAL DIFFERENCE`; Electron-runtime calendar save tests pass 8/8. Running the same test with ordinary Node failed because `better-sqlite3` was built for Electron's ABI; that is an invalid test runner, not an app failure. The next `UNVERIFIABLE` entry is `ScreenshotHelper.js`.
- `ScreenshotHelper.js` has branch-only strict display identity/layout checks and request-scoped screenshot retention. These deliberately change the recovered fallback to the first/indexed display source and protect in-flight images from eviction. Its status is `INTENTIONAL DIFFERENCE`; capture runtime tests pass 8/8 and queue/screen-choice tests pass 24/24. Physical mixed-DPI and Windows source-ID behavior remain unverified. The next `UNVERIFIABLE` entry is `SessionTracker.js`.
- `SessionTracker.js` was recovered as above. Its generated module still differs in comments, local naming, last-array-element syntax, and a diagnostic log. Its status is `BEHAVIOR MATCH WITH EVIDENCE` for module-local behavior. The next `UNVERIFIABLE` entry is `IntelligenceManager.js`.
- `IntelligenceManager.js` has a 541-line generated facade identical after normalizing only generated import variable numbers. Its main-process construction/event consumers and the SessionTracker dependency were traced; it has no platform branch. Its status is `BEHAVIOR MATCH WITH EVIDENCE` locally, while the IntelligenceEngine dependency remains a gap. The next `UNVERIFIABLE` row is `ModelSelectorWindowHelper.js`.
- `ModelSelectorWindowHelper.js` has a 525-line generated module identical after normalizing only generated import variable numbers. Main callers, both platform branches and existing window tests were identified. Native focus and z-order remain physically unverified. The next `UNVERIFIABLE` row is `NotesWindowHelper.js`.
- `NotesWindowHelper.js` has a 400-line generated module identical after normalizing only generated import variable numbers. Main event/visibility callers, both platform branches and notes-window policy tests were identified. Its status is `BEHAVIOR MATCH WITH EVIDENCE` locally; native focus and z-order remain unverified. The next `UNVERIFIABLE` row is `ProcessingHelper.js`.
- `ProcessingHelper.js` has a 296-line generated module identical after normalizing only generated import variable numbers. Main construction, LLM and credentials consumers were traced; the separate `LLMHelper` gap remains. Its status is `BEHAVIOR MATCH WITH EVIDENCE` locally. The next `UNVERIFIABLE` row is `SettingsWindowHelper.js`.
- `SettingsWindowHelper.js` has a 495-line generated module identical after normalizing only generated import variable numbers. Main callers, platform branches and existing tests were identified. `WindowHelper.js` differs only in replacing the recovered hardcoded `/tmp` trace path with `path.join(os.tmpdir(), ...)`, a deliberate cross-platform correction. Their statuses and physical window risks are in the ledger. The next `UNVERIFIABLE` row is `audio/AppleSpeechSTT.js`.
- `AppleSpeechSTT.js` differs only in a defensive Windows child-process shutdown branch. The helper is gated to macOS at its availability and startup checks; the macOS stop path remains SIGKILL. Its tests pass 30/30, including simulated Windows rejection. Native helper execution and packaging remain unverified. The next `UNVERIFIABLE` row is `audio/DeepgramStreamingSTT.js`.
- Eleven provider/recovery modules with identical complete generated sections were recorded individually under the STT comparison section below. Literal production consumers, test files and platform references are listed in each ledger row. The next `UNVERIFIABLE` row is `audio/MissingKeySTT.js`.
- `MissingKeySTT.js` has equivalent generated behavior; its diff is comments, import alias, unused parameter name and formatting. Main missing-key selections were traced. Recovered320Audio tests pass 3/3. The next `UNVERIFIABLE` row is `audio/SonioxStreamingSTT.js`.
- The Nepali fix made 26 additional packaged Electron outputs byte-identical, including 11 STT providers previously recorded as module-local matches. Their ledger rows were upgraded to `EXACT FILE MATCH` only after re-hashing the final local Electron build. The next `UNVERIFIABLE` row is determined from the ledger after this checkpoint.
- `micEchoGuard.js` differed only by a missing source comment and is now byte-identical. `sttFailover.js` lacked the recovered 10-second primary handback deduplication, and `sttGapRecovery.js` lacked the recovered `repeatsLiveText` and 60-second recovered-line answer gate. Main also omitted the recovered auto-answer ingestion of recent system lines. `Recovered320Handback.test.mjs` failed 0/2 before the fix and passed 2/2 afterward; the grouped STT suites passed 40/40. Fresh compiled output for all three audio files is byte-identical. The main-process bundle has other differences and is not claimed identical. Next `UNVERIFIABLE`: `dist-electron/electron/context-intelligence/debug/debug-config.js`.
- `context-intelligence/debug/debug-config.js` lacked the recovered log redaction and cross-platform basename helpers. `Recovered320DebugConfig.test.mjs` failed 0/1 before and passed 1/1 after; the existing context debug suite and new test passed 34/34. The fresh compiled file is byte-identical. Next `UNVERIFIABLE`: `dist-electron/electron/context-intelligence/generation/context-packer.js`.
- `context-intelligence/generation/context-packer.js` dropped the first oversized evidence block where the recovered build trims it with a visible marker. `Recovered320ContextPacker.test.mjs` failed 0/1 before and passed 1/1 after; grouped prompt composition tests passed 25/25. The fresh compiled file is byte-identical. Next `UNVERIFIABLE`: `dist-electron/electron/context-intelligence/generation/prompt-composer.js`.
- `prompt-composer.js` comparison started: 22 generated diff hunks span bundled turn classification, instruction parsing, screen-context guidance and profile absence notices. No status change yet because its source modules and callers still need individual review. Its branch output is 205,947 bytes versus 206,003 recovered bytes; these sizes alone do not establish behavior.
- `codingShape.ts`, `codingFollowup.ts`, `codingPromptSignals.ts`, `llm/index.ts`, `LLMHelper.ts`, `DatabaseManager.ts`, `userInstructionContract.ts`: Recovered semantics implemented this session. `codingShape.ts` exports `namesCodingShape`. `codingFollowup.ts` exports `ACTIVE_CODING_PROBLEM_NOTE_RE`, `withActiveCodingProblem`, `isActiveCodingProblemFollowUp`. `codingPromptSignals.ts` exports `isScreenOnlyAsk`, `isImageCodingAsk`, `isRepeatPressAsk` and updates `isPromotedScreenCodingTurn` to gate image promotion on `isImageCodingAsk`. `LLMHelper.ts` uses `isImageCodingAsk` for image coding promotion (both instances). `DatabaseManager.ts` changes `saveMeeting` DB-not-ready path from throw to silent return. `userInstructionContract.ts` adds `GO_LANGUAGE_OPEN_RE`/`opensImperative`, updates `isImperativeOrWish`/`isDirectiveShaped`/`detectAnswerStructure` to use `opensImperative`, adds `namesLanguage`/`isBareLanguageName` with `BARE_NAME_CLAUSE_RE`/`LANGUAGE_MENTION_RE`, updates `detectProgrammingLanguages` to skip bare-name clauses when no directive clause exists, and moves `registeredInstructionsSetLength` to after `getRegisteredUserInstructions`. Both typechecks pass; build passes; all 72 affected tests (VisionStreamFallback, ProviderDataScope, Recovered320Handback, Recovered320NepaliLanguage, Recovered320ContextPacker, Recovered320DebugConfig, SessionTrackerRecoveredCodingProblem, diagramRequest, ModelLanguageSupport) pass.
- Independently search each completed domain for unmapped IPC channels, flags, UI strings, settings keys, telemetry, schema changes, assets, native exports, and package resources.
- `DirectAssistService.js` material handling was resolved as above. Its compiled file now matches exactly; function-valued material was not found in inspected production callers.
- Pack billing debit and server charging integration are on hold. Audit only; do not change charging behavior. Development Ultra plan mode must remain.
- Four integration test files reference the missing `Sample thesis for testing.pdf`: `OkfPhase2KnowledgePacks.test.mjs`, `OkfPhase3Retrieval.test.mjs`, `OkfPhase4Graph.test.mjs`, and `OkfSeniorReviewFixes.test.mjs`. Report fixture-related failures separately; do not count the absent PDF as an application defect.
- Full lint, unit/integration suite, packaged macOS and Windows builds, renderer CDP tests, and physical macOS and Windows checks have not yet run. No `lint` package script exists.

## Commands and results so far

| Command | Result |
| --- | --- |
| `git status --short --branch && git rev-parse HEAD` | exit 0; clean initial tree, branch and SHA above |
| `npm run build && npm run build:electron` | exit 0 before fix; renderer and Electron builds |
| `node --test --test-name-pattern='pre-aborted turn' electron/llm/__tests__/VisionStreamFallback.test.mjs` | exit 1 before fix; 0 pass, 1 fail |
| `npm run build:electron && node --test --test-name-pattern='pre-aborted turn' electron/llm/__tests__/VisionStreamFallback.test.mjs` | exit 0 after fix; 1 pass, 0 fail |
| `npm run typecheck:electron` | exit 0 after fix |
| `node --test electron/llm/__tests__/VisionStreamFallback.test.mjs` | exit 0 after fix; 44 pass, 0 fail |
| `node --test --test-name-pattern='chart input analysis accepts lazy' src/lib/diagram/__tests__/diagramRequest.test.mjs` | exit 1 before fix (0/1), exit 0 after fix (1/1) |
| `npm run build:electron` | exit 0 after lazy-material fix; DirectAssistService compiled hash matches |
| `node --test electron/services/__tests__/CalendarLinkedMeetingSave2026_09_27.test.mjs electron/services/meeting/__tests__/MeetingNotesSavedGuide.test.mjs` | exit 1; ordinary Node cannot load Electron-ABI better-sqlite3 (module ABI 148 vs Node 137) |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/services/__tests__/CalendarLinkedMeetingSave2026_09_27.test.mjs` | exit 0; 8 pass, 0 fail |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/services/__tests__/ScreenshotQueueExternalImage2026_09_27.test.mjs electron/services/__tests__/ScreenshotScreenChoice2026_10_29.test.mjs` | exit 0; 24 pass, 0 fail |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/services/__tests__/ScreenshotCaptureRuntime.test.mjs` | exit 0; 8 pass, 0 fail |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/audio/__tests__/AppleSpeechSTT.test.mjs` | exit 0; 30 pass, 0 fail |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/audio/__tests__/Recovered320Audio.test.mjs` | exit 0; 3 pass, 0 fail |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/audio/__tests__/Recovered320NepaliLanguage.test.mjs` | exit 1 before fix (0/3), exit 0 after fix (3/3) |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/audio/__tests__/Recovered320NepaliLanguage.test.mjs electron/audio/__tests__/IndianLanguagesPicker2026_10_16.test.mjs electron/audio/__tests__/SttLanguageFailover2026_10_16.test.mjs electron/audio/__tests__/SonioxPinnedLanguageStrict2026_08_24.test.mjs electron/audio/whisper/__tests__/ModelLanguageSupport.test.mjs` | exit 1 after initial fix (37/38; official-name fixture omitted Nepali), then exit 0 after fixture update (38/38) |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/services/__tests__/SessionTrackerRecoveredCodingProblem.test.mjs` | exit 1 before fix (missing method), exit 0 after fix (1 pass) |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/intelligence/__tests__/DurableMemoryWiring.test.mjs electron/services/__tests__/SessionTrackerRecoveredCodingProblem.test.mjs` | exit 0; 10 pass, 0 fail |
| `git diff --check` | exit 0 after fix |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/audio/__tests__/Recovered320Handback.test.mjs` | exit 1 before STT handback/recovery fix; 0 pass, 2 fail |
| `npm run build:electron` | exit 0 after STT handback/recovery fix; three audio modules byte-identical to recovered |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/audio/__tests__/Recovered320Handback.test.mjs electron/audio/__tests__/SttFailover2026_10_15.test.mjs electron/audio/__tests__/SttGapRecovery2026_10_15.test.mjs` | exit 0; 40 pass, 0 fail |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/context-intelligence/__tests__/Recovered320DebugConfig.test.mjs` | exit 1 before debug-config fix; 0 pass, 1 fail |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/context-intelligence/__tests__/Recovered320DebugConfig.test.mjs electron/context-intelligence/__tests__/ContextDebugLogging2026_08_01.test.mjs` | exit 0 after fix; 34 pass, 0 fail |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/context-intelligence/__tests__/Recovered320ContextPacker.test.mjs` | exit 1 before context-packer fix; 0 pass, 1 fail |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/context-intelligence/__tests__/Recovered320ContextPacker.test.mjs electron/context-intelligence/__tests__/PromptComposition.test.mjs` | exit 0 after fix; 25 pass, 0 fail |
| `npm run typecheck:electron` | exit 0 on current working tree |
| `npm run typecheck:ts7` | exit 0 on current working tree |
| `git diff --check` | exit 0 on current working tree |
| `npm run typecheck:electron && npm run typecheck:ts7` | exit 0 after codingShape/codingFollowup/codingPromptSignals/userInstructionContract session changes |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/llm/__tests__/VisionStreamFallback.test.mjs electron/services/__tests__/ProviderDataScopeOutbound2026_08_01.test.mjs` | exit 0; 64 pass, 0 fail |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test electron/audio/__tests__/Recovered320Handback.test.mjs electron/audio/__tests__/Recovered320NepaliLanguage.test.mjs electron/context-intelligence/__tests__/Recovered320ContextPacker.test.mjs electron/context-intelligence/__tests__/Recovered320DebugConfig.test.mjs electron/services/__tests__/SessionTrackerRecoveredCodingProblem.test.mjs` | exit 0; 8 pass, 0 fail |
| `ELECTRON_RUN_AS_NODE=1 node_modules/.bin/electron --test src/lib/diagram/__tests__/diagramRequest.test.mjs electron/audio/whisper/__tests__/ModelLanguageSupport.test.mjs` | exit 0; 69 pass, 0 fail |
| `npm run build:electron` | exit 0 after all session changes; 7538ms |

## Interim verdict

**NO**: the branch is not ready to call 3.2.0 parity complete. The ledger proves identity for 839 recovered compiled files in the local build, module-local equivalence for eight bundled files, and documents seven fixed differences. The remaining 270 unverified files, two confirmed gap files and native/runtime behavior require further work. No physical macOS or Windows execution is claimed.

## STT provider module-local comparisons

- `dist-electron/electron/audio/DeepgramStreamingSTT.js`: 370 generated lines match after import-number normalization; 15 literal production references and 13 test files located. Caller/dependency and runtime behavior remain separate.
- `dist-electron/electron/audio/ElevenLabsStreamingSTT.js`: 395 generated lines match after import-number normalization; 6 literal production references and 7 test files located. Caller/dependency and runtime behavior remain separate.
- `dist-electron/electron/audio/GoogleSTT.js`: 700 generated lines match after import-number normalization; 18 literal production references and 18 test files located. Caller/dependency and runtime behavior remain separate.
- `dist-electron/electron/audio/LocalWhisperSTT.js`: 1257 generated lines match after import-number normalization; 49 literal production references and 30 test files located. Caller/dependency and runtime behavior remain separate.
- `dist-electron/electron/audio/NativelyProSTT.js`: 990 generated lines match after import-number normalization; 30 literal production references and 34 test files located. Caller/dependency and runtime behavior remain separate.
- `dist-electron/electron/audio/NvidiaNimStreamingSTT.js`: 305 generated lines match after import-number normalization; 7 literal production references and 5 test files located. Caller/dependency and runtime behavior remain separate.
- `dist-electron/electron/audio/OpenAIStreamingSTT.js`: 1089 generated lines match after import-number normalization; 10 literal production references and 12 test files located. Caller/dependency and runtime behavior remain separate.
- `dist-electron/electron/audio/QwenRealtimeSTT.js`: 286 generated lines match after import-number normalization; 6 literal production references and 3 test files located. Caller/dependency and runtime behavior remain separate.
- `dist-electron/electron/audio/RestSTT.js`: 673 generated lines match after import-number normalization; 19 literal production references and 14 test files located. Caller/dependency and runtime behavior remain separate.
- `dist-electron/electron/audio/sttRecoveryTranscribers.js`: 363 generated lines match after import-number normalization; 6 literal production references and 2 test files located. Caller/dependency and runtime behavior remain separate.
- `dist-electron/electron/audio/whisper/whisperWorker.js`: 525 generated lines match after import-number normalization; 30 literal production references and 15 test files located. Caller/dependency and runtime behavior remain separate.

## Phase 1 — Provider reliability (2026-11-17)

| Item | Result | Evidence |
|---|---|---|
| `electron/llm/providerCallBudget.ts` | Rewritten to recovered structure (threshold/window/cooldown getters, split `admit`, `wasProbe` failure path, non-exported `isHedgeLoss`, IIFE generator in `guardProviderOpen`) | Built `dist-electron/electron/llm/providerCallBudget.js` byte-identical to recovered |
| `providerErrorClassifier.ts` | Added `PROVIDERS_EXHAUSTED_CODE`, `isProvidersExhaustedError`, exhausted-cause handling in `providerFailureUserMessage` | Bundled module section in `LLMHelper.js` identical to recovered |
| `LLMHelper.exhaustedChainError(lastProviderError)` | New signature; returns `PROVIDERS_EXHAUSTED` error with `cause`/`firstProviderError` | Compiled method identical; `lastProviderError` refs 10 built / 10 recovered |
| `lastProviderError` tracking | Recorded at TTFT race, Gemini cascade, Natively last resort, configured custom last resort | Same as recovered rung loop |
| Budget/breaker wiring in LLMHelper | Already present (`providerBreakerFor`, `guardProviderOpen`, `sdkRetryOptions` counts match) | grep counts match recovered |

Tests: `NativelyLimitNotNoProvider2026_11_03` updated to the 3.2.0 signature; new `ProvidersExhausted320.test.mjs` (3 pass). LLM + services suites: 13722 tests, 9 fail before the test update; the 8 that remain also fail on the unmodified tree (git stash check: FastModelPreferFast, CodingTemplateContract, InstructionAnalysisAdversarial).
Billing/charging paths untouched. Pure TypeScript logic: no platform branches. Reviewed but not executed on Windows.

## Phase 2 — Remaining LLMHelper gaps (2026-11-17)

Compiled diff of the `LLMHelper.ts` section, built vs recovered: **38 hunks → 3**.

| Item | Result |
|---|---|
| Gemini summary cascade `geminiKeyDead` | Added: a permanent key error (invalid/expired/billing) stops Flash-Lite → Flash → Pro instead of retrying ~11 times |
| Custom provider pre-commit error | Now yields `Error: Custom Provider returned HTTP <status>` / `Error streaming from custom provider.` (3.2.0) instead of throwing |
| CONTEXT-OS refusal policy | `_refusalYieldsLLM` via `packGovernsGeneration`: a refusal pack that does not govern dispatches to the model |
| `judgeRunsOnNatively` / `fastResponseFamilyNow` | Logic split and positions matched to 3.2.0, with doc comments |
| `withTimeout` | Matched 3.2.0 (clear on resolve, no `unref`) |
| `sdkRetryOptions` | Moved from the OpenAI vision call to the AgentRouter stream call (the prior session put it on the wrong call) |
| Turn budget alias on answer retry; budget/breaker accessor placement; scope-push order; guard wrappers; import/init order; exhausted-chain doc | Matched |

Remaining 3 hunks, all intentional:
- `BrowserWindow6` vs `BrowserWindow4`: esbuild renaming noise.
- `answerTurn` excludes `project_link_answer`: main commit 4eae567b (2026-11-08), newer than the 3.2.0 build. Kept.
- `[DISPATCHED IMAGE IDENTITIES]` block: main commit f3e1eacf (2026-11-07), newer than the 3.2.0 build. Kept.

Tests: `EvidenceResolverWiringIdentity2026_07_12` now expects 3.2.0 dispatch on a non-governing refusal pack (legacy-retrieval bans kept). `CodingTemplateContract2026_08_18` now checks `isImageCodingAsk`. LLM + services suites: 13725 tests, 7 failures remain, all of them pre-existing (6 `InstructionAnalysisAdversarial` language cases, 1 `FastModelPreferFast` source check), for a later phase.
Billing/charging paths untouched. No platform branches changed. Reviewed but not executed on Windows.

## Phase 3 — IntelligenceEngine (2026-11-17, uncommitted)

Compiled `electron/IntelligenceEngine.ts` section diff vs recovered 3.2.0: **78 → 38 hunks**.

Ported from 3.2.0:
- `SourceBadge.sourceLabelFromEvidenceBlock` / `computeAnswerSourceLabel`; engine `answerSourceLabel()` labels the transport-error, final and held (speculative) answers; the reveal of an adopted prefetch now carries its badge (F-ACC-04). Replaces the local "Reference material" V3 label.
- `turnOut.writeDecision` set on stub / transport / tag-leak / final paths, plus `isWtaSuperseded()` yield before each store; wrapper warns when a turn is not recorded.
- `questionTyped` (manual_input source and typedPress only for presses the user typed).
- `v3ProfileSources.profileReadableForAnswers` / `collectProfileSourcesForIndex`: profile docs ground answers only under Pro/trial (dev Ultra override passes via `isProOrTrialActive`); raw-text index still reads all docs. Engine snapshot uses `snapshotReadableKnowledge`.
- `wtaV3ExpectedToCompose` skips the legacy mode prefetch, knowledge-mode block and context-OS multi-family pack on V3 turns.
- Coding continuation uses `getActiveCodingProblem` + `withActiveCodingProblem(…, saidAfter)`.
- `maxAnswerWords` null when the mode's Real-time prompt sets a length (ProfileJitPromptBuilder accepts null); `seedCandidateBackground ?? false` (F-ACC-12).
- `v3ModeRetrievalContext(screen, snapshot)` uses the press-time mode/files (F-CTX-11); `pinnedModeId ?? null`; `isRepeatPressAsk` for the repeat-press directive (engine + WhatToAnswerLLM).
- WhatToAnswerLLM: V3-composed turns skip mode-context retrieval; refusal policy dispatches; exhausted-chain user line. transcriptQuestionExtractor: generic-closer anchoring.

Kept intentionally (local, newer than or parallel to 3.2.0):
- `setOutcome` / `outcomeOut` What-to-say outcome reporting and the extra `outcome` emit arg.
- `decideSessionWritePolicy` on speculative empty, invalid identity and non-answer paths; no-context message not stored as an assistant turn.
- Nov 7 `_wtaUserBase` screen-instruction prefixing in WhatToAnswerLLM; `recordLiveTurn` 'user' vs 'meeting'; image-press default question.
- `?? ''` type guards on `isRepeatPressAsk` (compile noise only); `onlySmallTalk` placement (ordering only).

Tests updated to 3.2.0 behaviour: CodingResponseShape2026_09_29 (repeat-press regex), ScreenPrepassSkip2026_11_06 (snapshot arg), IntelligenceEngineScaffoldContaminationFallback (superseded run yields `null`).

Validation: `tsc` clean; `npm run build:electron` ok; LLM + services suites 13725 tests, 7 failures — the same pre-existing 7 (6 InstructionAnalysisAdversarial language cases, 1 FastModelPreferFast).
Not covered: `services/meeting/sectionInstructions.ts` (missing locally) is deferred to Phase 5. Reviewed but not executed on Windows; no platform branches touched.

## Phase 4 — prompt-composer (2026-11-17, uncommitted)

Compiled `context-intelligence/generation/prompt-composer.js` vs recovered 3.2.0: **25 → 11 diff hunks**, all remaining are the kept Nov 7 screenshot fix (`isScreenPointerQuestion` / `isCurrentScreenRequest`, main f3e1eacf) or esbuild renames (`FIRST_PERSON_RE` ↔ `FIRST_PERSON_RE2`, `init_turn_classifier`).

Ported:
- `userInstructionContract.ts`: replaced the Phase 1 approximation of bare language-name handling with the exact 3.2.0 logic (`BARE_NAME_CLAUSE_RE`, `namesLanguage`, `isBareLanguageName`; a bare name is skipped only when another clause already names a language). This clears the 6 long-standing InstructionAnalysisAdversarial language failures.
- `turn-classifier.ts`: identifier heads detect capitals after the first letter or any digit (a sentence-initial word is no longer an identifier).
- `prompt-composer.ts`: `profileFeatureAvailable` input threads through `noEvidenceNotice` / `absenceNoticeBody`; with no Profile Intelligence in the build the notice neither claims a profile could serve nor suggests adding one (F-ACC-14). Unused conversation budget is added to the evidence budget. Conversation header now says follow-up references resolve to what the latest assistant line named.
- `engine-bridge.ts`: `profileFeatureAvailable()` via `premium/featureGate.isPremiumAvailable`; passed to the composer and traced as `profileFeature`.

Test updated: AnswerPolicyLiveDenials2026_08_07 "exact strict wording" — the Profile Intelligence remedy is now build-dependent (absent under the test runner where premium modules cannot initialise).

Validation: `tsc` clean; `npm run build:electron` ok; llm + services + context-intelligence suites 15834 tests, 1 failure (pre-existing FastModelPreferFast `preferFast`). Reviewed but not executed on macOS or Windows; no platform branches touched.

## Phase 5 — differing modules (2026-11-17)

Every module whose compiled output differs from 3.2.0 was diffed (48 with 3+ hunks, plus the small ones). Local fixes newer than 3.2.0 were kept.

**Ported from 3.2.0**
- diagramPromptSignals: conversation material is read lazily (F-LAT-02).
- MeetingSummaryV3: "NA" and "not discussed/mentioned/covered/raised" count as empty placeholders.
- TurnPlanner: `seedsCandidateBackground()`. KnowledgeOrchestrator seeds the zero-node fallback pack only when it returns true, and logs a safe file name.
- piTelemetry: `answerLength` is an allowed key. ipcHandlers emits it on `speakability_measured`.
- StructuredExtractor: the résumé name is logged through `logSafeText`.
- customContextClassifier:
  - Counts like "2M requests" are no longer treated as money (`hasMoneyAmount`).
  - Incident-cost sentences are exempt.
  - Bare language names are not directives.
- codingPromptSignals: the curly apostrophe is normalized.
- manualProfileIntelligence: word-bounded topic stripping, 6-word topics, and the dangling-word trim.
- orchestrator: the large-pack retrieval budget (`LARGE_PACK_*`) and normalized claim subject keys.
- conversation-state: `previousAnswerReferent`, which resolves a pronoun from the previous answer.
- AnswerPlanner: an active coding-problem follow-up routes to coding/DSA.
- ContextAssembler and OkfPromptFormatter: document text is neutralized before entering the prompt, plus "data, never instructions" rules.
- ModeHybridRetriever: `no_chunk_vectors` degraded reason. `usedHybrid` now excludes degraded runs (F-ACC-06).
- ModesManager: the compiled prompt is cleared on edit, and built-in sections skip compilation.
- main:
  - The STT watchdog and restart pause while failover is active.
  - The discard event carries `generationId`.
  - The Auto Answer speech-end hint fires before the final transcript.
- autoAnswer stub: `onLocalSpeechEndBeforeFinal`.
- ipcHandlers: chat V3 image promotion uses `isImageCodingAsk`.

**Kept local (newer than 3.2.0)**
- WindowHelper `os.tmpdir()`.
- ScreenshotHelper display matching and the retain/release lease.
- MeetingPersistence emergency backup.
- AOTPipeline, DocumentChunker and CompanyResearchEngine fixes.
- ModeGenerator templates.
- answerLength caps.
- Phone-chat stream controller.
- Modes handler validation.
- Preload additions.

**Deferred, needs a decision**
- featureGate `markPremiumAbsent`: porting it alone would make premium always available in source builds.
- Guide `guideFactsFromSources` / `meetingSurface` / `guide_stop_locked`.
- codingPromptSignals screen-only word list: the 3.2.0 and local lists differ in intent.
- ModeHybridRetriever manual lexical flip: an ONNX memory trade-off.
- `profile_history` data-scope tag on profile research calls.

**Billing / licensing: ON HOLD, audit only**
- packClockWiring `packHoursCountNow`.
- proAccess `readLicenceFacts` / `currentPackProBlock`.
- `licencePremiumForWindows`.
- `packProStandDownModeId`.
- proEntitlementWiring `onActivated` isPremium.
- LicenseManager messages.

3.2.0 also removed the dev Ultra override; that removal was deliberately not ported.

## Phase 6 — IPC, preload, flags, settings, DB, packaging sweep
- IPC channel strings: 450 local vs 449 in 3.2.0, none present only in 3.2.0.
- `NATIVELY_*` env flags: identical sets (43 each).
- Settings reads: identical. The only new 3.2.0 setting key, `packProStandDownModeId`, is billing.
- package.json: dependencies identical. Version is 3.1.0 locally vs 3.2.0 and was not bumped (release decision).
- No new DB migrations.
- Modules present only in 3.2.0 are premium `.js` files present locally, plus firstRunGuide, which is equivalent to `firstRunGuidePolicy.ts`.

## Phase 7 — validation
- `npx tsc -p electron/tsconfig.json --noEmit`: clean.
- `npm run build:electron`: OK.
- Full suite: 15834 tests, 15778 pass, 1 fail. The failure is the pre-existing FastModelPreferFast `preferFast` source check.
- Three source-shape tests were updated to the 3.2.0 contract: CodingTemplateContract, SyntaxCheckAndShapeRepair and WholePackReadOnRetrievingTurn.
- Reviewed but not executed on Windows. Automated tests ran on macOS only.
- None of the ported changes adds a platform branch. The STT failover and watchdog change and the Auto Answer hint still require physical macOS and Windows verification.

## Follow-up — deferred items ported (2026-11-17)
- SectionPromptCompiler: an absent section is left out, with no "Not discussed." placeholder. A compiled instruction that asks for a placeholder is rejected. This matches the chunk extractor's existing "omit the section" contract.
- RateLimiter: a background lane (`runAsBackgroundLlmWork` / `isBackgroundLlmWork`, AsyncLocalStorage).
  - Background acquires never take the last 25% of the bucket.
  - They wait until live acquires have been quiet for 10 s.
  - `destroy()` rejects both queues.
- ModesManager: section-prompt compiles run in the background lane.
- Tests: MeetingNotesV3 and ModesManagerColdStartCompile were updated, and RateLimiterBackgroundLane2026_11_17 was added.
- Results: 16215 tests, 16159 pass, 1 fail. The failure is the pre-existing FastModelPreferFast check.
- Platform: no platform branches. `node:async_hooks` is available on both. Reviewed but not executed on Windows.
