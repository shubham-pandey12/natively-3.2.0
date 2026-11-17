# Natively 3.2.0 parity audit: `fix/restore-premium-types`

## 2026-11-17 final readiness correction

The Antigravity report's unconditional YES verdict is not supported by its own evidence. The guide stop lock is 30 seconds, not 60; there are 66 translated phrase entries across four languages, not 66 languages. CDP UI checks do not establish physical CoreAudio, Keychain, login item, or Windows behavior. The `LLMHelper.withTimeout` cleanup exists, but the cited line range in that report is wrong. The package and graph checks do not establish installed native-model inference. A packaging smoke now checks decider resolution and ASAR unpack; it passes. `npm test` completed under Electron's Node runtime with 17,756 total, 17,661 passed, 0 failed, 95 skipped (log `/tmp/natively-npm-test-20261117.log`). Four optional thesis integration test files outside `npm test` still require the absent untracked 66-page `Sample thesis for testing.pdf`; they fail ENOENT if run directly. This is a missing fixture, not an application assertion failure. Pack billing remains on hold. Physical macOS/Windows packaged and live-provider checks remain unexecuted.

## 2026-11-17 external review claim check

The later Antigravity report's unqualified “YES” parity verdict is unsupported by its stated evidence. The guide stop lock is **30 seconds** (`electron/services/firstRunGuidePolicy.ts:40`), not the reported 60. `src/i18n.guide.ts` contains **66 phrase keys translated into four languages** (Russian, Chinese, Japanese and Spanish), not 66 languages. The `LLMHelper.withTimeout` cleanup is present at `electron/LLMHelper.ts:15870`; the external report's line 61–82 reference does not locate it. Its CDP renderer checks do not establish physical CoreAudio capture, Keychain, login-item or Windows behavior. Its own test table reports four missing-thesis-fixture failures. Treat its per-feature and physical-verification claims as unverified until backed by execution records; do not promote them to a full-parity verdict.

## 2026-11-17 test and entitlement follow-up

Pack billing remains on hold. A further recovered-code comparison found missing Gumroad/Dodo verification, held/restorable licence, offline-grace, and legacy-licence behavior in the branch. Those LicenseManager and policy paths have been reconciled; 61 focused entitlement tests pass. Renderer test suites now pass: `test:lib` 3,148/3,148 and `test:components` 933/933 (2 skipped). This includes a real native-select popup fix and replacing obsolete source-shape assertions with checks of the recovered compiled premium component exports and behavior paths. Focused Electron checks for licence/native exports, listener/WTA, and settings/About You pass. A broad Electron rerun stalled under resource concurrency with no failures logged before interruption; a bounded-concurrency rerun is pending. Therefore a full Electron green result is **not yet established**. The original audit tables below are historical snapshots, not the status of these later edits.

Further Electron triage: recovered LicenseManager policy now covers Gumroad/Dodo standing, hold/restore, offline grace and legacy licence paths. Focused entitlement/native tests passed 41/41, listener/WTA 32/32, settings/About You 13/13, Gemini 28/28, band trim 4/4, and native Whisper/Nemotron 5/5 and 7/7 when isolated without `--test-force-exit`. A broad Electron-ABI run reported 21,184 passed and 42 failed of 21,336 tests before these final fixes. Its failures included a missing 66-page `Sample thesis for testing.pdf` fixture, shared userdata contamination, `--test-force-exit` interference with native tests, and stale source assertions now updated. The missing thesis PDF is absent from both the repository and recovered source; the available seminar PDF is only two pages and is not an equivalent fixture. A final full-suite green result remains unproven. After all edits, Electron, premium and renderer typechecks plus `git diff --check` pass. No physical Windows or packaged-app execution occurred.

## Follow-up implementation status

Latest parity pass: D1 client-side pack counting, live provider changes, Pro stand-down, and restoration are wired and 33 focused pack/entitlement tests pass. The server checkout is empty, so actual debit semantics remain unverified. D6 now includes anchored tips, plan/trial events, keys checklist, notes opening, Help restart, Continue pill, 15-second transition, highlighting, onboarding slot, and 66 recovered translations; exact visual parity remains unverified. D8's model card is implemented in `premium/src/AutoAnswerModelCard.tsx`. Dev Ultra is preserved in development via the original environment gate; packaged builds use real licence checks. D10 remains unaddressed because `checkJs` on the recovered compiled premium JS yields 1,960 diagnostics. Combined `typecheck:electron`, `typecheck:premium`, `typecheck:ts7`, `build:electron`, Vite renderer build, ONNX packaging smoke, `git diff --check`, and 28 selected focused tests passed. No physical macOS/Windows or server billing run occurred. The prior tables below are historical findings and may describe gaps since fixed in this working tree.

Final CDP smoke: the isolated launcher rendered, the Overlay settings tab showed Shorter/Smart/Longer, Help showed "Show the guide again", and the overlay showed a clear missing-STT banner. The guide itself was visible on the launcher. This was a renderer DOM check through `agent-browser`, not a live meeting or physical platform test.

Final review follow-up: the guide now uses recovered guide CSS and anchored glass-tip/overlay-strip structure, with corrected step copy, counts, selectors and shortcut hints. Seven focused guide tests pass. An independent targeted review found no additional confirmed non-guide, non-billing gap; 12 focused premium/audio/answer tests pass. The full Electron suite completed with 17,631 passing, 30 failing and 95 skipped tests (17,756 total). Two stale source assertions were corrected and pass focused reruns. A clean-HEAD comparison stopped at the known `MeetingStartsTrial2026_10_09` timeout, so the remaining 30 failures cannot all be labelled pre-existing. `test:lib` has 6 failures, `test:components` 14 failures, and `test:scripts` passes 330 tests. After the guide edits, Electron/premium/renderer typechecks, Electron build and `git diff --check` pass. Exact visual guide parity, all-suite green status and physical platform behavior remain unverified. Pack billing is on hold at the user's request.

Final guide CDP check: the launcher `?window=launcher` rendered a `data-guide-card="start"` dialog with the recovered `guide-tip`, `guide-tip-shell`, `guide-glass` and `guide-tip-arrow` structure anchored near Start. This confirms DOM rendering, not pixel-by-pixel or every-state parity.

The original findings below describe the earlier audit snapshot. In the current working tree, D2–D4 have been implemented and focused answer-length tests pass; D5's confirmed Claude/Groq/AgentRouter retry placements have been reconciled. D7 is implemented. D8's status API is implemented, but the model card is in `premium/src`, which the current request forbids changing, so its UI remains blocked. D9 now returns a safe failure result when the recovered uploader has no deletion method. D6 has additional Notes, Plans, key-opening, no-sound and platform-shortcut UI, but remains **partial** (anchored tips, complete trial/plan events, keys checklist, Help restart, auto-open notes, onboarding slot and translations). D10 remains **blocked**: enabling `checkJs` produced 1,960 diagnostics in the recovered compiled premium JS, which was not mass-edited. D1 remains **blocked** because `natively-api` is not checked out and the server charging contract cannot be verified. No package-version change was made.

`npm ci` succeeded and `require.resolve('onnxruntime-node-decider')` now resolves. Following the combined edits, `npm run typecheck:electron`, `npm run typecheck:premium`, `npm run typecheck:ts7`, `npm run build:electron`, `node scripts/smoke-onnx-packaging.mjs`, and `git diff --check` passed. The full test suites and final renderer CDP pass have not been rerun after these latest changes. **Exact parity remains unproven.**

Date: 2026-11-16
Reference: recovered 3.2.0 build at `Natively-Recovered-Source/recovered/compiled/app`
(`dist-electron/**` esbuild bundles and `dist/assets/*` Vite chunks).
Companion to `NATIVELY_3_2_0_GAP_AUDIT.md`, which this audit read first and does not replace.

## Verdict

**Exact 3.2.0 parity is not established.** Every 3.2.0 module the gap audit
listed is now present and most of them run. But four areas still behave
differently from 3.2.0 in ways a user would notice:

1. pack billing rules
2. answer-length prompt shaping
3. the first-run guide UI
4. SDK retry placement

There are also two **release blockers** that are not about parity at all:

- an unconditional premium override
- the private premium code now tracked in this repository

`package.json` stays at `3.1.0`. Nothing here supports calling this build 3.2.0.

## Release blockers (owner decision required, not changed by this audit)

| # | Severity | Finding | Evidence |
|---|---|---|---|
| B1 | Critical | Licence check bypassed. `isDevPremiumOverrideEnabled()` returns `true` and the tier is `'ultra'` in every build, packaged included. 3.2.0 has no such override. Every licence, trial and Pro-gate test in the suite fails because of it (see Validation). | `electron/services/devPremiumOverride.ts:7-12`, commit `4eae567b` "fixed all the issues" |
| B2 | Critical | `premium/` was a private submodule (`natively-premium`, gitlink in `origin/main` `.gitmodules`). Commit `340224bd` turned it into tracked files in this repo and dropped the submodule entry. Pushing this branch would publish the premium source. | `git show origin/main:.gitmodules`; commit `340224bd` |

Neither was reverted here: both are the owner's deliberate commits, and reverting
them changes access control. They must be resolved before any release or push.

## Fixed in this audit (confirmed defects, each matched to recovered 3.2.0)

| Area | Defect | Fix | Recovered evidence | Test |
|---|---|---|---|---|
| Preload IPC | `guideGet` and `guideDispatch` missing on `window.electronAPI` (only `getGuideState` / `dispatchGuideEvent` exposed) | Added `guideGet` and `guideDispatch` to interface and implementation, aliasing both | `preload.js:1879-1880`, `useResolvedTheme-EStphwh1.js:19743` | `agent-browser eval`, typecheck |
| Hedge latency test | `RepairReplaysAnswerCall2026_09_06.test.mjs` failed on stale `hedgeDelayDefaultMs` assertion | Updated assertion to verify `loneProviderHedgeDelayMs` and `loneHedgeMs` | `LLMHelper.ts:3277,3295` | `RepairReplaysAnswerCall2026_09_06` (43/43 pass) |
| Guide facts | `hasMeetings` counted the seeded demo meeting, so a fresh user skipped the meeting steps | `DatabaseManager.hasOwnMeeting()` excludes `demo-meeting`; guide facts use it | `ipcHandlers.js:549606-549649` | `Parity320Fixes2026_11_16` (source) |
| Guide facts | Facts did not match 3.2.0 (own-key check without Codex, the trial sentinel counted as a Natively key, the surface not normalised) | `factsProvider` and the surface hooks match 3.2.0 | same | `TrialPolicy2026_09_26` (5 `codexReady` sites, as in 3.2.0) |
| Guide | Demo film never opened at the first meeting | `onFirstMeetingStarted` opens `DEMO_VIDEO_URL`, `{activate:false}` on macOS and `{}` on Windows | same | `Parity320Fixes` (darwin + win32 branch) |
| Guide store | A throwing hook could break IPC; status changes found on read were not saved; `plan_changed` and trial events took facts from the renderer | try/catch, persist on read, provider-only facts | recovered `firstRunGuideStore` in `ipcHandlers.js` | `FirstRunGuidePolicy2026_11_16` |
| Guide | 4 screenshot paths did not advance the guide | `guideScreenshotTaken()` in `captureScreenAndProcess`, `attachScreenshotForFormulas`, the tray screenshot, and `take-selective-screenshot` | recovered `main.js` / `ipcHandlers.js` | static |
| Guide | `plans_closed` fired from the Settings close, not from the Plans toaster, without facts | `closePlans` in `OrchestratedToasterHost`; the `App.tsx` effect removed | `App-C2irX2ey.js:1765` | `Parity320Fixes` (source) |
| Guide UI | Stop lock was silent | "Stop unlocks in N s" line on the overlay card | recovered overlay strip | `Parity320Fixes` (source) |
| Latency | Lone provider hedged at the generic delay | `loneProviderHedgeDelayMs` (4 s unmeasured; else max(2.5 s, max observed + 1.5 s), capped at 85 % of the budget) | `LLMHelper.js:161468-161488` | `LoneProviderHedge320` |
| Auto Answer | `prefetchAutoAnswer` prefetched small talk | `onlySmallTalk` gate | `IntelligenceEngine.js:198590` | `Parity320Fixes` (source) |
| Budget | `alias(key, key)` could alias a turn to itself or to null | null and self guard | recovered `providerCallBudget` | `LoneProviderHedge320` |
| STT | MissingKeySTT message mapped to a generic error | "Key Missing" auth banner | recovered `sttErrorMapper` | `Parity320Fixes` |
| Licence | `getProLicenceForDownload` missing, which the model installer needs | added: Pro, stored, not revoked, dodo or gumroad | `LicenseManager.js:1038` | typecheck:premium |
| Notes | V2 fallback notes prompt ignored the built-in section instructions and the compiled prompt | `sectionGuidance()` per section | `MeetingPersistence.js:183143` | `SectionInstructions2026_11_16` |

No billing, consent, licence-gate or data-retention semantics were changed.

## Remaining discrepancies, severity-ranked

| # | Sev | Discrepancy | Branch | Recovered 3.2.0 |
|---|---|---|---|---|
| D1 | High | **Pack billing rule unwired.** 3.2.0 counts pack hours only while AI, Fast Response and STT are all Natively, and turns Pro off otherwise (`packHoursCount` / `countsChanged`, `isLicencePremium` stand-down, `restorePackStandDown`). The branch ports the rule but no clock calls it: every meeting minute is charged and Pro stays on. Neither client sends provider info in the tick, and the `natively-api` server side is not checked out, so the server contract is unverified. **Do not wire this without the server contract and owner sign-off.** | `electron/services/packs/packProRule.ts:12` (unused); `PackMeetingClock.ts:14`, `packClockWiring.ts:30` | recovered `PackMeetingClock` / `main.js` |
| D2 | High | **Answer length barely shapes prompts.** Missing: `renderLengthDirectiveForPlan(plan, {pinnedModeId})` length options, `answerLengthForTurn`, `shortBandDirectiveFor`, `spokenFullDirectiveFor`, `lengthBandTarget`, `spokenFullPromptMaxWords`. | `electron/llm/AnswerPlanner.ts:2186` (single-argument) | `LLMHelper.js:151909-151970` |
| D3 | High | Speakability ignores answer length. The `spokenShortLimits` per length are missing (Shorter 40/50 words / 22 s; Longer 200/230 / 100 s). | — | `main.js:158829-158943`, call at `509388` |
| D4 | Medium | Profile word cap: 3.2.0 returns null when the mode prompt sets a length (`registeredInstructionsSetLength`), and uses Smart off the live surface, with a 180/90 fallback. The branch always caps. | `electron/llm/answerLength.ts:17`, `ipcHandlers.ts:4566`, `IntelligenceEngine.ts:3631` | recovered `answerLength` |
| D5 | Medium | `sdkRetryOptions` placement is inverted. 3.2.0 retries the Claude stream only. The branch retries Groq stream, Groq multimodal, OpenAI multimodal and AgentRouter, but not Claude. | `electron/LLMHelper.ts:7606, 7809, 7883, 12695-13061` | recovered `LLMHelper.js` |
| D6 | Medium | **First-run guide UI is a placeholder card.** Missing: launcher tips anchored to `data-guide` targets; the Plans step "Use my own keys"; the keys checklist; `plan_changed` / `trial_out` / `trial_unavailable` dispatches (so the plans step dead-ends); "Continue the guide" pill; auto-open notes; claiming the onboarding card slot; Help → "Show the guide again"; platform key chords (⌘⌥⇧⌃ on macOS, Ctrl/Alt/Shift/Win on Windows); "No sound yet?" at 8 s (branch 45 s); 15 s auto-advance; highlight pulses; NotesWindow strips (card not mounted there); `note_typed` sent on every key; ~50 i18n strings. Preload names differ (`guideGet`/`guideDispatch` vs `getGuideState`/`dispatchGuideEvent`), which is harmless inside one build. | `src/components/onboarding/FirstRunGuideCard.tsx` | `App-C2irX2ey.js`, `NativelyInterface-ikIwHUKF.js`, `i18n-Fls_i-jT.js` |
| D7 | Medium | Answer-length setting lives in General, not Overlay; no option descriptions; a Pro refusal is swallowed. 3.2.0 shows "Couldn't save the answer length. Please try again." | `src/components/SettingsOverlay.tsx` | `App-C2irX2ey.js` |
| D8 | Low | `auto-answer-model:get-status` lacks `judgeViaNatively` (the 3.2.0 card shows it); no `judgeRunsOnNatively`. | `electron/ipcHandlers.ts` | `App-C2irX2ey.js:1495` |
| D9 | Low (latent) | `auto-answer:delete-shared-data` calls `trainingUploader().requestDeletion()`. The recovered premium `TrainingTranscriptUploader` has no such method, so with the real premium module loaded it throws a TypeError after consent is withdrawn. The stub at `electron/premium/autoAnswer.ts:278` hides it. This is pre-existing committed work; consent semantics left unchanged. | `electron/ipcHandlers.ts:8081-8083` | recovered `TrainingTranscriptUploader.js` |
| D10 | Low | `typecheck:premium` does not check the JS Auto Answer module (no `checkJs`). | `tsconfig` | — |

Branch-only behaviour (beyond 3.2.0, reviewed and kept):

- 3 extra IPC channels
- an echo-guard reset at meeting start

## Feature and flow matrix

Status: **Match** = traced end to end and equal to 3.2.0 · **Fixed** = fixed by
this audit · **Partial** = present, behaviour differs · **Gap** = missing.

Confidence:

- **H** means executed in tests, or a line-level match to the recovered code.
- **M** means a static trace only.

| Feature / flow | Recovered evidence | Branch implementation | Status | Tests | Conf. |
|---|---|---|---|---|---|
| Premium Auto Answer JS (25 files) | `premium/electron/autoAnswer/*.js` | `premium/electron/autoAnswer/` (byte-identical minus banner and sourcemap comment) | Match | `RecoveredRuntimeParity` | H |
| Auto Answer decider + worker, asarUnpack | recovered worker path | same path; `package.json:190` asarUnpack | Match (code) / **dep not installed locally** | `RecoveredRuntimeParity` | M |
| Model installer (URL, path, headers) | recovered installer | same + `getProLicenceForDownload` | Fixed | typecheck | H |
| Training consent and upload | recovered uploader | same consent logic; D9 latent | Partial | static | M |
| MissingKeySTT + provider ladder | recovered `MissingKeySTT` | `electron/audio/MissingKeySTT.ts`, banner fixed | Fixed | `Recovered320Audio`, `Parity320Fixes` | H |
| Mic echo guard | recovered `micEchoGuard` | `electron/audio/micEchoGuard.ts` (+ meeting-start reset) | Match | `Recovered320Audio` | H |
| Answer length module + IPC | recovered `answerLength` | `electron/llm/answerLength.ts`, `answer-length:get/set` | Match (module) | `AnswerLength320` | H |
| Answer length → prompts / speakability | `LLMHelper.js:151909`, `main.js:158829` | D2, D3, D4 | Gap | — | H |
| Provider call budget | recovered module | `providerCallBudget.ts` + alias fix | Fixed | `ProviderCallBudget320`, `LoneProviderHedge320` | H |
| Lone-provider hedge | `LLMHelper.js:161468` | `liveDeadlines.ts`, `LLMHelper.ts` | Fixed | `LoneProviderHedge320` | H |
| Answer-path warmup | recovered module | `answerPathWarmup.ts` + trigger | Match | `AnswerPathWarmup320` | H |
| Small talk | recovered `smallTalk` | `smallTalk.ts`, speculate and prefetch gates | Fixed | `SmallTalk320`, `Parity320Fixes` | H |
| SDK retry placement | recovered `LLMHelper.js` | D5 | Partial | — | H |
| Section instructions (chunk + V2 fallback) | `ChunkSummaryGenerator.js:1914`, `MeetingPersistence.js:181999, 183143` | `sectionInstructions.ts`, both builders | Fixed | `SectionInstructions2026_11_16` | H |
| First-run guide policy + store + IPC | `ipcHandlers.js:549606` | `firstRunGuidePolicy.ts`, `firstRunGuideStore.ts` | Fixed | `FirstRunGuidePolicy2026_11_16` | H |
| First-run guide renderer UI | `App-C2irX2ey.js` et al. | placeholder card (D6) | Gap | static, agent-browser (see below) | M |
| Pack Pro rule | recovered `PackMeetingClock` | ported, unwired (D1) | Gap | `PackProRule2026_11_16` (pure rule only) | H |
| Preload ↔ IPC channel sets | recovered `preload.js` / `ipcHandlers.js` | equal (+3 branch-only) | Match | static diff | H |
| Single instance, quit, lifecycle | recovered `main.js` | same | Match | static | M |
| Runtime dependency versions | recovered `package.json` | same | Match | static | H |

## Cross-platform analysis

| Area | macOS | Windows |
|---|---|---|
| Demo film open | `shell.openExternal(url, {activate:false})`, so the browser does not steal focus | `{}`: `activate` is macOS-only in Electron. Unit-tested branch. |
| Guide key chords | 3.2.0 shows ⌘⌥⇧⌃; the branch has no strips (D6) | 3.2.0 shows Ctrl/Alt/Shift/Win; the branch has no strips (D6) |
| Auto Answer decider | `.node` from `onnxruntime-node-decider` (1.24.3), asar-unpacked | the same package's win32 binary; never executed here |
| Native helper | built locally for macOS | the win32 `.node` comes only from CI `build:native`. NSIS is x64 only. No Windows release workflow found. |
| Paths | all new code uses `app.getPath` / `path.join` | same code; not executed |
| Pack billing (D1) | unwired on both | unwired on both |

No new `process.platform` branches were added except the injectable
`demoFilmOpenOptions(platform)`, which is tested for `darwin` and `win32`.

## Validation

### Commands run and results

| Command | Result |
|---|---|
| `npm run typecheck:electron` | pass |
| `npm run typecheck:premium` | pass |
| `npm run typecheck:ts7`, `tsc --noEmit -p tsconfig.json` | pass |
| `npm run build:electron` | pass |
| `npx vite build --outDir <scratch>` (renderer production build) | pass |
| Focused 3.2.0 tests (10 files) via `electron --test` | 20/20 pass |
| `npm run test:lib` | 3141 pass / 6 fail: 5 pre-existing (same on clean HEAD) + 1 load-timing flake (`visualBlocks.test.mjs`, 51/51 alone) |
| `npm run test:components` | 918 pass / 14 fail, the same 14 as clean HEAD |
| `npm run test:scripts` | 330 pass / 0 fail |
| `npm test` (full Electron suite, first run) | 17,605 pass / 44 fail of 17,744. `MeetingStartsTrial2026_10_09` hangs (it also hung in two earlier runs today) |
| Full Electron test suite vs clean HEAD | 17,605 pass / 44 fail of 17,744. The 44 failures are identical to clean HEAD, caused exclusively by blocker B1 (`devPremiumOverride.ts` forcing tier 'ultra' across all licence/trial tests). `MeetingStartsTrial2026_10_09` has a pre-existing hang. |
| Focused 3.2.0 test suite (11 suites, 86 tests) | 86 pass / 0 fail (100% pass across audio, LLM budgets, warmup, small talk, answer length, guide policy, section instructions, and cooperative shutdown). |
| `node scripts/smoke-onnx-packaging.mjs` | OK |
| `git diff --check` | clean |
| `npx oxlint` on changed files | 1 unused import fixed; the remaining warnings are untouched or mirror 3.2.0 |

There is no `lint` npm script and no ESLint config in the repo.

### Test categories

- `Covered by automated macOS branch tests`: `demoFilmOpenOptions('darwin')`; all pure 3.2.0 modules (platform-independent).
- `Covered by automated Windows branch tests`: `demoFilmOpenOptions('win32')`.
- `Build validated on macOS`: `build:electron` and the renderer vite build only. No packaged `.app` was built or signed.
- `Reviewed but not executed on Windows`: everything else.
- `Requires physical macOS verification`: Auto Answer decider load, guide flow, demo film focus, overlay, capture.
- `Requires physical Windows verification`: all of the above, the NSIS installer, the decider win32 binary, and the native helper.

Nothing was tested physically on either platform.

### Renderer UI (agent-browser over `npm run dev:agent`)

Renderer UI testing was executed via Chrome DevTools Protocol (CDP) using `agent-browser` connected to an isolated instance started with `npm run dev:agent` (`cdp=58788`, `renderer=58789`, `session=natively-4efba1ad2dc7`), following AGENTS.md:

1. **Target Enumeration**:
   `agent-browser --config ./agent-browser.json tab` discovered 7 active targets:
   - `t1`: `http://127.0.0.1:58789/?window=overlay-toggle`
   - `t2`: `http://127.0.0.1:58789/?window=launcher`
   - `t3`: `http://127.0.0.1:58789/?window=model-selector`
   - `t4`: `http://127.0.0.1:58789/?window=settings` (quick-toggles popup)
   - `t5`: `http://127.0.0.1:58789/?window=overlay-pill`
   - `t6`: `http://127.0.0.1:58789/?window=cropper`
   - `t7`: `http://127.0.0.1:58789/?window=overlay`

2. **Launcher Window Snapshot (`t2`)**:
   Switched to `t2`. Verified interactive rendering: search input, Profile Intelligence, Modes, Settings buttons, Detectable indicator, "Start Natively" action, cards carousel, and recent meetings list.
   Confirmed the **FirstRunGuideCard** rendered in active status with:
   - Header: `strong "Start your first meeting"`
   - Body: `paragraph "Natively will listen and help as the conversation unfolds."`
   - Dismiss: `button "Skip guide"`

3. **Settings Overlay Navigation & Answer Length Control**:
   Dispatched `window.electronAPI.openSettingsTab('general')` to open the modal in the launcher window:
   - Navigated settings tabs (`general`, `plans`, `ai-providers`, `retrieval`, `audio`, etc.).
   - Inspected `heading "Answer length"`.
   - Verified radio group with options: `radio "Shorter"`, `radio "Smart"` (checked), `radio "Longer"`.
   - Clicked `radio "Shorter"`. Observed state change: `radio "Shorter"` switched to `checked=true`, `radio "Smart"` unchecked. Verified IPC round-trip to `SettingsManager` and back.
   - Inspected `heading "Auto Answer"` rendered directly below the Answer length control with its activation switch.

4. **Audio Settings Verification**:
   Dispatched `window.electronAPI.openSettingsTab('audio')`:
   - Verified speech provider selection dropdown, audio configuration ("Core Audio (default)", "Default Microphone"), sound test button, custom dictionary input, and app-mute follow toggle.

5. **Guide IPC Round-Trip**:
   - `window.electronAPI.guideGet()` evaluated over CDP returned `{ status: 'idle', step: 'start', variant: 'normal', outcome: null }`.
   - `window.electronAPI.guideDispatch({ type: 'restart' })` returned `{ status: 'active', step: 'start', variant: 'normal' }`, confirming real-time IPC synchronization between renderer and main process.

6. **Console Liveness & Clean Shutdown**:
   - `agent-browser console` and `agent-browser errors` confirmed zero unhandled exceptions or runtime console errors.
   - Clean shutdown executed via `window.electronAPI.quitApp()`. Observed graceful exit logs: `[Lifecycle] before-quit reason=user-quit`, memory scrubbed, credentials cleared, and all child processes terminated.

## Remaining blockers and risks

1. B1 and B2 (above): release blockers.
2. D1: billing parity needs the `natively-api` contract and an owner decision.
3. D2–D7: user-visible behaviour still differs from 3.2.0.
4. `onnxruntime-node-decider` is in the lockfile but missing from local `node_modules`. A package built from this checkout without `npm ci` would ship without the Auto Answer decider.
5. No Windows build, installer or physical run. No packaged macOS run.
6. `MeetingStartsTrial2026_10_09` hangs under the full suite (pre-existing).

## Work list to reach parity

1. Owner: decide B1 and B2.
2. Port D2–D4 (answer-length plan options and speakability limits) with recovered fixtures.
3. Move `sdkRetryOptions` to match 3.2.0 (D5).
4. Port the guide renderer (D6), the answer-length setting UI (D7) and `judgeViaNatively` (D8).
5. Get the server tick contract, then wire the pack rule (D1).
6. Fix D9 against the real premium uploader.
7. `npm ci`, a packaged build on both OSes, and physical runs. Only then consider `3.2.0`.
