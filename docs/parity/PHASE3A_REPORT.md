# Phase 3a public upstream 3.2.1 merge

Merged `refs/upstream/v3.2.1` into `update/upstream-3.2.1`. Public renderer parity passed on Windows. The fork's `premium/` tree stayed byte-for-byte identical. No branch was pushed.

## Commits and scope

```text
> git merge --no-ff refs/upstream/v3.2.1
Automatic merge failed; fix conflicts and then commit the result.

> git log --oneline -5
87986a0e Merge public upstream Natively v3.2.1
713f454d Compare parity runs on stable signals, not launch noise
ab2e04f9 Record Phase 2 Windows parity results
097f3e5c Ignore volatile timestamps and diagnostic durations
1c434e2b Document and test parity harness behavior

> git status --short --branch
## update/upstream-3.2.1
```

`87986a0e` has parents `713f454d` (fork) and `61385ae0` (upstream). The merge changed 330 files relative to the fork because the merge base predates the upstream 3.2.0 tag. Added the upstream remote using the supplied URL and used the local refs. The report is a separate documentation commit.

The merge brings in the public trial hardware ID, pack/provider switching, connectivity diagnostics, Windows taskbar/audio changes, first-run guide and upstream LLM and notes pipeline. The tracked Windows binary, `dev:agent`, `.gitignore`, Vite watch exclusions, parity scripts and existing parity docs passed a path-scoped zero-diff check against `parity/harness`. The fork and merged Git trees both record `premium` as tree `4b3b3d02f89d73b5e50b0a7c21df823fb0c9ce25`. The existing public checkout's `natively-api` gitlink was advanced to upstream's `1b0f1003`. It stayed uninitialized locally.

Where Git auto-merged duplicate implementations, I removed the duplicate declarations and registered each IPC once. This included the language matrix, profile bridge, Answer length and first-run guide, including three fork recovery-only guide files superseded by upstream. I updated overlapping fork source tests against the upstream guide, retired two superseded guide-only pin files, and kept behavior assertions for help, notepad, shortcut mapping and stream arbitration. I also corrected two source pins for whitespace and conditional bracing without changing the logic they check.

## All 116 conflict resolutions

“Upstream” identifies the overlapping behavior selected. Nonconflicting fork work stayed in the merge. “Combined” identifies a conflict or file where a specific fork implementation or test contract was retained alongside upstream.

| File | Decision | Reason |
| --- | --- | --- |
| `.github/workflows/build-smoke.yml` | Combined | Kept the fork’s unsigned Windows NSIS build and upstream’s restoration of the cross-platform native index before tests. |
| `electron/IntelligenceEngine.ts` | Upstream | Used the upstream answer coordinator and removed duplicate small-talk and typed-question declarations from the recovered implementation. |
| `electron/LLMHelper.ts` | Combined | Used upstream provider budgeting, fallback and Gemini key handling. Kept the fork’s structured-data scope check and timeout typing. Removed duplicate declarations. |
| `electron/SessionTracker.ts` | Upstream | Used upstream’s coding-problem tracking and acknowledgement handling. |
| `electron/audio/MissingKeySTT.ts` | Upstream | Used upstream’s no-key STT stand-in and renderer error contract. |
| `electron/audio/SonioxStreamingSTT.ts` | Upstream | Kept upstream’s unsupported language-hint guard. |
| `electron/audio/__tests__/AnswersGoToOverlay2026_11_06.test.mjs` | Upstream test hunk | Aligned coverage with answer delivery to the active overlay. |
| `electron/audio/__tests__/IndianLanguagesPicker2026_10_16.test.mjs` | Upstream test hunk | Aligned coverage with the provider/language matrix. |
| `electron/audio/micEchoGuard.ts` | Upstream | Used upstream’s speaker-bleed matcher with the upstream transcript dispatch. |
| `electron/audio/sttFailover.ts` | Upstream | Kept upstream’s recovered finals and handoff deduplication. |
| `electron/audio/sttGapRecovery.ts` | Upstream | Used upstream’s recovery timing and answer handoff contract. |
| `electron/audio/whisper/__tests__/ModelLanguageSupport.test.mjs` | Upstream test hunk | Aligned coverage with local Whisper language support. |
| `electron/config/languages.ts` | Upstream | Kept one upstream provider-language matrix with nullable provider support. |
| `electron/context-intelligence/__tests__/ScreenshotMemory2026_09_08.test.mjs` | Upstream test hunk | Aligned coverage with its screen-memory and incomplete-answer retention contract. |
| `electron/context-intelligence/__tests__/WholePackReadOnRetrievingTurn2026_10_03.test.mjs` | Upstream test hunk | Aligned coverage with whole-pack retrieval limits. |
| `electron/context-intelligence/debug/debug-config.ts` | Upstream | Used upstream log-path helpers and trace configuration. |
| `electron/context-intelligence/generation/context-packer.ts` | Upstream | Used upstream’s escaped evidence trimming and budget contract. |
| `electron/context-intelligence/generation/prompt-composer.ts` | Upstream | Used upstream’s profile gating, reference resolution and evidence budget. Removed the duplicated profile flag. |
| `electron/context-intelligence/orchestration/orchestrator.ts` | Upstream | Used upstream’s typed mode contract, attachment-first application order and retrieval budget. This preserves the fork’s attachment-order fix. |
| `electron/context-intelligence/policies/mode-policy-registry.ts` | Upstream | Kept upstream’s typed source-contract rules and reference-file ordering. |
| `electron/context-intelligence/question/conversation-state.ts` | Upstream | Kept one upstream previous-answer referent parser and resolution policy. |
| `electron/context-intelligence/question/turn-classifier.ts` | Upstream | Used upstream’s first-word and follow-up handling. |
| `electron/ipcHandlers.ts` | Combined | Used upstream pack billing, diagnostics, guide and Answer length IPC. Kept the fork’s dev-only simulated entitlement, usage and test entry points. Removed duplicated registrations. |
| `electron/llm/AnswerPlanner.ts` | Upstream | Used the release’s Answer length directives and coding-follow-up exemptions. |
| `electron/llm/ProfileJitPromptBuilder.ts` | Upstream | Used upstream’s length defaults and profile prompt contract. |
| `electron/llm/SourceBadge.ts` | Upstream | Used upstream’s badge derivation from rendered evidence. |
| `electron/llm/TurnPlanner.ts` | Upstream | Used upstream’s candidate-background seeding contract. |
| `electron/llm/WhatToAnswerLLM.ts` | Upstream | Used upstream’s screen coding, null-V3 refusal and exhausted-provider behavior. |
| `electron/llm/__tests__/CodingResponseShape2026_09_29.test.mjs` | Upstream test hunk | Aligned coverage with coding answer-shape detection. |
| `electron/llm/__tests__/CodingTemplateContract2026_08_18.test.mjs` | Upstream test hunk | Aligned coverage with the coding template contract. |
| `electron/llm/__tests__/EvidenceResolverWiringIdentity2026_07_12.test.mjs` | Upstream test hunk | Aligned coverage with identity evidence and source resolution. |
| `electron/llm/__tests__/FastModelPreferFast2026_09_23.test.mjs` | Upstream test hunk | Aligned coverage with the fast-provider selection contract. |
| `electron/llm/__tests__/NativelyLimitNotNoProvider2026_11_03.test.mjs` | Upstream test hunk | Aligned coverage with the provider-limit error result. |
| `electron/llm/__tests__/RepairReplaysAnswerCall2026_09_06.test.mjs` | Upstream test hunk | Aligned coverage with repair and replay routing. |
| `electron/llm/answerLength.ts` | Upstream | Used upstream’s Pro-gated settings, mode and profile length resolution. |
| `electron/llm/answerPathWarmup.ts` | Upstream | Used upstream’s scheduled warm-up and typed steps. |
| `electron/llm/codeVerification/__tests__/SyntaxCheckAndShapeRepair2026_09_30.test.mjs` | Upstream test hunk | Aligned coverage with syntax and shape repair behavior. |
| `electron/llm/codingFollowup.ts` | Upstream | Used upstream’s coding snapshot annotation and continuation matching. |
| `electron/llm/codingPromptSignals.ts` | Upstream | Kept one upstream screen-only and repeat-press classifier. |
| `electron/llm/customContextClassifier.ts` | Upstream | Used upstream’s pay, history and language disambiguation. |
| `electron/llm/diagramPromptSignals.ts` | Upstream | Kept upstream’s material lookup and optional result contract. |
| `electron/llm/index.ts` | Upstream | Aligned the barrel exports with upstream’s coding helpers. |
| `electron/llm/manualProfileIntelligence.ts` | Upstream | Used upstream’s question normalization. |
| `electron/llm/piTelemetry.ts` | Upstream | Used upstream’s Answer length telemetry field. |
| `electron/llm/providerCallBudget.ts` | Upstream | Used upstream’s per-turn budget and cross-turn circuit-breaker lifecycle. |
| `electron/llm/providerErrorClassifier.ts` | Upstream | Kept one upstream exhausted-provider classifier and fallback message. |
| `electron/llm/smallTalk.ts` | Upstream | Used upstream’s greeting, mic-check and filler patterns. |
| `electron/llm/speakability.ts` | Upstream | Used the release’s word bands and shared AnswerLength type. |
| `electron/llm/streamFallbackEngine.ts` | Upstream | Kept upstream’s already-aborted guard and hedge behavior. |
| `electron/llm/transcriptQuestionExtractor.ts` | Upstream | Used upstream’s interviewer task and generic-closer handling. |
| `electron/llm/userInstructionContract.ts` | Upstream | Kept one upstream language-directive parser and registered length policy. |
| `electron/main.ts` | Upstream | Used upstream’s STT, trial, diagnostics, taskbar and guide wiring. Upstream already carries the dev-agent user-data handling. |
| `electron/preload.ts` | Combined | Used the upstream 3.2.1 IPC surface and guide contract. Preserved the fork’s mode-index and profile result types and removed duplicate Answer length entries. |
| `electron/premium/autoAnswer.ts` | Upstream | Updated the public Auto Answer boundary for delayed finals. The private implementation stayed at the fork tree. |
| `electron/premium/featureGate.ts` | Upstream | Used upstream’s process-wide premium availability marker with equivalent fallback behavior. |
| `electron/services/ModesManager.ts` | Upstream | Used upstream’s stock section instructions, background compiles and lexical fallback hunks. Retained nonconflicting fork work. |
| `electron/services/RateLimiter.ts` | Upstream | Used upstream’s live-token reserve and background waiter policy. |
| `electron/services/SettingsManager.ts` | Upstream | Used one upstream settings schema with persisted pack stand-down, guide state and Answer length. |
| `electron/services/__tests__/AutoAnswerPremiumBoundary2026_11_13.test.mjs` | Upstream test hunk | Aligned coverage with the public Auto Answer boundary and deletion ownership. |
| `electron/services/__tests__/IntelligenceEngineScaffoldContaminationFallback.test.mjs` | Upstream test hunk | Aligned coverage with scaffold contamination fallback. |
| `electron/services/__tests__/LocalEmbedderVectorsOutsideMeeting2026_09_19.test.mjs` | Upstream test hunk | Aligned coverage with live and offline embedding behavior. |
| `electron/services/__tests__/ModesManagerColdStartCompile.test.mjs` | Upstream test hunk | Aligned coverage with stock note sections and cold-start compilation. |
| `electron/services/__tests__/NoteTemplates2026_10_20.test.mjs` | Upstream test hunk | Aligned coverage with shipped note templates and section instructions. |
| `electron/services/__tests__/OllamaLocalVision2026_10_01.test.mjs` | Upstream test hunk | Aligned coverage with Ollama’s local-vision contract. |
| `electron/services/__tests__/PackProRule2026_11_16.test.mjs` | Upstream test hunk | Aligned coverage with the updated pack entitlement state machine. |
| `electron/services/__tests__/ScreenPrepassSkip2026_11_06.test.mjs` | Upstream test hunk | Aligned coverage with the pinned snapshot and screen prepass. |
| `electron/services/__tests__/WhatToAnswerSnapshotWiring.test.mjs` | Upstream test hunk | Aligned coverage with the current generation and discard wiring. |
| `electron/services/firstRunGuideStore.ts` | Upstream | Used the full upstream typed guide store and transition callbacks. |
| `electron/services/knowledge/OkfPromptFormatter.ts` | Upstream | Used upstream’s evidence escaping and one-line field rules. |
| `electron/services/knowledge/v3ProfileSources.ts` | Upstream | Used the upstream raw-index and per-turn profile-read contract without duplicating gating. |
| `electron/services/meeting/ChunkSummaryGenerator.ts` | Upstream | Used upstream’s shared built-in and compiled section guidance. |
| `electron/services/meeting/MeetingSummaryV3.ts` | Upstream | Kept upstream’s empty-placeholder treatment. |
| `electron/services/meeting/SectionPromptCompiler.ts` | Upstream | Used upstream’s leave-out contract and placeholder checks. |
| `electron/services/meeting/__tests__/AboutYouProOnly2026_11_01.test.mjs` | Upstream test hunk | Aligned coverage with the Pro gate on About You notes. |
| `electron/services/meeting/__tests__/MeetingNotesV3.test.mjs` | Upstream test hunk | Aligned coverage with the current V3 notes instruction contract. |
| `electron/services/meeting/sectionInstructions.ts` | Upstream | Used the release’s shipped section text and lookup. |
| `electron/services/modes/ModeHybridRetriever.ts` | Upstream | Used upstream’s live vector lookup, lexical fallback and diagnostics. |
| `electron/services/packs/PackMeetingClock.ts` | Upstream | Used upstream’s current pack validity, accounting and selection transitions. |
| `electron/services/packs/packClockWiring.ts` | Upstream | Used the release’s process-wide pack clock across Electron bundles. |
| `electron/services/packs/packProRule.ts` | Upstream | Used the release’s provider checks and stand-down/restore behavior. |
| `electron/services/proAccess.ts` | Combined | Used upstream’s cached licence facts, pack rules and trial flow. Kept the fork’s dev-only override without changing packaged entitlement. |
| `electron/services/proEntitlementWiring.ts` | Combined | Used upstream pack activation wiring and retained the fork’s nonconflicting dev override. |
| `package-lock.json` | Upstream | Set the package and root-lock version to 3.2.1. SQLite, keytar and Electron pins are identical. |
| `package.json` | Combined | Used the 3.2.1 version and preserved fork parity, recovery and dev scripts plus fork test entry points. |
| `premium~refs_upstream_v3.2.1` | Fork | Removed the conflicted private gitlink from the index and verified the fork premium tree ID is unchanged. The existing .gitmodules has only natively-api. |
| `src/App.tsx` | Upstream | Used the upstream launcher guide and trial scheduling. Removed the duplicate recovered guide imports. |
| `src/components/AboutSection.tsx` | Upstream | Used upstream’s version 3.2.1 release notes and icons. |
| `src/components/Launcher.tsx` | Upstream | Used upstream’s launcher search focus and guide navigation with one copy of each anchor. |
| `src/components/NativelyInterface.tsx` | Upstream | Used upstream’s overlay guide and stale-answer guard. Restored the upstream session-only model picker and STT diagnostic copy. |
| `src/components/NotesWindow.tsx` | Upstream | Used upstream’s separate notepad guide hook and Stop countdown. Retired the duplicate inline implementation. |
| `src/components/OverlayAuxWindows.tsx` | Upstream | Used upstream’s guide highlighting and Stop lock in the auxiliary overlay. |
| `src/components/SettingsOverlay.tsx` | Upstream | Used upstream’s diagnostics, language gating, guide integration and Auto Answer settings state. |
| `src/components/__tests__/TrialEndedClaimsSlot2026_09_26.test.mjs` | Upstream test hunk | Aligned coverage with the trial-ended dialog’s scheduler priority. |
| `src/components/__tests__/TrialEndedSingleHost2026_09_26.test.mjs` | Upstream test hunk | Aligned coverage with the single trial-ended dialog host. |
| `src/components/meeting/__tests__/NotesHookTyping2026_10_20.test.mjs` | Upstream test hunk | Aligned coverage with the updated Notes hook contract. |
| `src/components/onboarding/OrchestratedToasterHost.tsx` | Upstream | Used upstream’s Plans dismissal and guide start transitions. |
| `src/components/settings/HelpSettings.tsx` | Upstream | Used the upstream Help restart action and removed duplicate props. |
| `src/components/settings/IntelligenceSettings.tsx` | Upstream | Used upstream’s Auto Answer and transcript sharing rows. |
| `src/components/settings/OverlaySettings.tsx` | Upstream | Used upstream’s Answer length row, focus controls and refusal feedback. |
| `src/components/ui/OverlayBanner.tsx` | Upstream | Used upstream’s Guide banner slot. |
| `src/components/ui/TopPill.tsx` | Upstream | Used upstream’s locked Stop timer, accessibility label and styling. |
| `src/i18n.answerLength.ts` | Upstream | Used the release language tables consumed by upstream i18n wiring. |
| `src/index.css` | Upstream | Kept upstream’s Settings surface tokens and guide-compatible styling. |
| `src/lib/__tests__/TrialPolicy2026_09_26.test.mjs` | Upstream test hunk | Aligned coverage with the upstream trial policy. |
| `src/lib/__tests__/directAssistRenderer2026_08_29.test.mjs` | Upstream test hunk | Aligned coverage with the active-generation discard predicate. |
| `src/lib/__tests__/screenshotPrompt.test.mjs` | Upstream test hunk | Aligned coverage with the overlay prompt and Answer length settings. |
| `src/lib/chatStreamGuard.mjs` | Upstream | Used the upstream stale-discard predicate with equivalent generation comparison. |
| `src/lib/demoVideoUrl.ts` | Upstream | Used upstream’s demo URL and speech/no-sound timing constants. |
| `src/lib/diagram/diagramRequest.d.mts` | Upstream | Kept upstream’s optional material return type. |
| `src/lib/diagram/diagramRequest.mjs` | Upstream | Kept the source documentation aligned with the optional material type. |
| `src/lib/onboarding/firstRunGuide.d.mts` | Upstream | Used the release’s typed guide steps, state and event API. |
| `src/lib/onboarding/firstRunGuide.mjs` | Upstream | Used the release’s guide reducer, resume policy and step timing. |
| `src/lib/sttErrorMapper.ts` | Upstream | Kept the expected no-key diagnostic text mapping. |
| `src/premium/index.tsx` | Upstream | Used upstream’s public optional Auto Answer component exports. |
| `src/types/electron.d.ts` | Combined | Used upstream’s IPC and guide contracts. Retained fork-only mode, licence and profile types plus required judgeViaNatively for the existing premium card. |
| `tailwind.config.js` | Upstream | Kept upstream’s Settings tile color token. |

## Validation on Windows

```text
> npm install --no-audit --no-fund
better-sqlite3@12.11.1 ✔
keytar@7.9.0 ✔
[rebuild-native] Rebuilding [better-sqlite3, keytar] for Electron 43.7.7, arch=x64 (from source)...
Error: Could not find any Python installation to use
node-gyp failed to rebuild 'C:\Users\dell\Desktop\shubham\natively-3.2.0\node_modules\better-sqlite3'
npm install exit=1
```

Both upstream tags and the fork pin SQLite 12.11.1, keytar 7.9.0 and Electron 43.7.7. The approved existing binaries were backed up before install and restored afterward, with equal SHA-256 hashes. A probe through Electron's Node mode opened an in-memory database and loaded the keytar API. The merge changed no model manifests or download script, so no model download was needed.

```text
> .\node_modules\electron\dist\electron.exe .parity\phase3a\check-native.cjs
{"abi":"148","electron":"43.7.7","sqlite":1,"keytar":"function"}

> npm run typecheck:ts7
> node node_modules/typescript7/lib/tsc.js -p tsconfig.json --noEmit
renderer exit=0

> npm run typecheck:electron
> node node_modules/typescript7/lib/tsc.js -p electron/tsconfig.json --noEmit
electron=0

> node node_modules/vite/bin/vite.js build --outDir .parity/phase3a/renderer-build
✓ 5181 modules transformed.
✓ built in 22.93s

> node .parity/phase3a/validate.mjs lint
Oxlint changed source file count: 308
Oxlint files=308 warnings=389 errors=0 exit=0

> git diff --check HEAD

> node --test "scripts/parity/tests/*.test.mjs"
ℹ tests 15
ℹ pass 15
ℹ fail 0
```

The validation script invoked `node node_modules/oxlint/bin/oxlint --format=json` with the changed, extant JavaScript and TypeScript files. The machine-readable lint output, selected test file lists and test logs are under `.parity/phase3a/`. The unit selection includes added and changed public tests plus nearby tests for startup, native bindings, Windows taskbar, audio, modes, Direct Assist, diagnostics, pack entitlement, packaging and the first-run guide. The Electron tests ran in Electron Node mode with a scratch test profile. Renderer and script tests ran in Node.

```text
> node .parity/phase3a/validate.mjs electron
electron: 118 test files
tests 1550  pass 1542  fail 2  cancelled 4  skipped 2

> node .parity/phase3a/validate.mjs renderer
renderer: 36 test files
tests 346  pass 345  fail 0  cancelled 0  skipped 1

> npm run build:electron:core-smoke
[build-electron] Core smoke mode: private premium imports are external
[build-electron] Done in 28000ms

> node .parity/phase3a/validate.mjs electron upstream
electron-upstream: 5 test files
tests 55  pass 46  fail 3  cancelled 4  skipped 2
```

The baseline build and retry ran at the exact detached public upstream ref with the same installed dependencies. The baseline retry included all five files implicated in the first Electron test pass. The final fork run passed the seeder and Pro-gate pins after the source-test corrections. The public upstream tree could not provide the private licence bundle or several private test files. The private premium gitlink object is unavailable locally.

| Remaining unit result | Upstream comparison | Classification |
| --- | --- | --- |
| `WhisperInternalsContract` internal 1, encoder helper | Same cancellation | Pre-existing on this host. The event loop resolved while a promise was pending. |
| `WhisperInternalsContract` internal 2, decoder-only forward | Same cancellation | Pre-existing on this host. Same timing and resource failure. |
| `WhisperInternalsContract` internal 3, encoder reuse in generate | Same cancellation | Pre-existing on this host. Same timing and resource failure. |
| `WhisperInternalsContract` worker repeated-failure guard | Same cancellation | Pre-existing on this host. Same timing and resource failure. |
| `SmallTalkNotDrafted` judge-eval asks fixture | Same `ENOENT` for `premium/electron/autoAnswer/__tests__/judge-eval` | Reproduced on public upstream. The private fixture is absent from both trees used in validation. |
| `LicenseNetworkCauseLogged` certificate-error log | Baseline test fails to import the unbuilt private `LicenseManager.js`. The upstream behavior assertion could not run. | The fork's retained implementation logs `fetch failed` without the certificate cause. Upstream release commit `2303a3f8` identifies the private licence update for this behavior. This is an observed Phase 3b gap, with upstream runtime comparison blocked. |

## Parity before and after

The before column uses the baseline recorded after the Phase 2 harness adjustments.

| Scenario | Before differences | After result | After differences | Expected after |
| --- | ---: | --- | ---: | ---: |
| api-surface | 63 | MATCH | 0 | 0 |
| licence | 0 | MATCH | 0 | 0 |
| modes | 0 | MATCH | 0 | 0 |
| settings-defaults | 1 | MATCH | 0 | 22 |
| screenshots | 0 | MATCH | 0 | 0 |
| console-errors | 0 | MATCH | 0 | 0 |

**Remaining DIFF paths:** none. The former settings gap was `/values/getLastConnectionNotice`. The installed and local apps both confirmed isolated profiles, exposed all seven renderer windows, loaded the same Dodo lifetime licence, captured 15 PNG pairs and logged zero captured renderer errors. Screenshot status measures capture success. The existing harness rules explain the 22 expected settings paths as updater availability and packaged-file versus dev-source diagnostic wording.

- `/values/getCanAutoUpdate/canAutoUpdate`
- `/values/getLocalFallbackPreflight/checks/10/message`
- `/values/getLocalFallbackPreflight/checks/11/message`
- `/values/getLocalFallbackPreflight/checks/12/message`
- `/values/getLocalFallbackPreflight/checks/3/message`
- `/values/getLocalFallbackPreflight/checks/4/message`
- `/values/getLocalFallbackPreflight/checks/5/message`
- `/values/getLocalFallbackPreflight/checks/6/message`
- `/values/getLocalFallbackPreflight/checks/7/message`
- `/values/getLocalFallbackPreflight/checks/8/message`
- `/values/getLocalFallbackPreflight/checks/9/message`
- `/values/getProviderStatuses/1/details/checks/3/message`
- `/values/getProviderStatuses/1/details/checks/4/message`
- `/values/getProviderStatuses/1/details/checks/5/message`
- `/values/getProviderStatuses/1/details/checks/6/message`
- `/values/getProviderStatuses/1/details/checks/7/message`
- `/values/getProviderStatuses/2/details/checks/0/message`
- `/values/getProviderStatuses/3/details/checks/0/message`
- `/values/getProviderStatuses/3/details/checks/1/message`
- `/values/getProviderStatuses/3/details/checks/2/message`
- `/values/getProviderStatuses/3/details/checks/3/message`
- `/values/getProviderStatuses/3/details/checks/4/message`

The [successful run report](../../.parity/runs/2026-11-20T16-19-40.903Z-GfmOKX/report.md) includes raw values, skips and screenshot pairs.

```text
> npm run parity
[parity] local launcher never loaded
parity exit=1

> npm run parity
[parity] installed PID 25468, CDP 62420
[parity] local PID 32412, CDP 62421
[parity] Cleanup verified: PIDs [23572, 30716, 29128, 19840, 25468, 16192, 11228, 7924, 26852, 8708, 29136, 30120, 34648, 31360, 32412, 31480, 27536, 2180, 13956, 32372, 29456, 2748, 22868, 27408] exited; ports [62380, 62420, 62421] closed
[parity] Report: .parity\runs\2026-11-20T16-19-40.903Z-GfmOKX\report.md
parity exit=0
```

The first attempt timed out waiting for the local launcher while other builds were active. It verified cleanup and produced no valid comparison. The retry finished normally. A post-run `Get-CimInstance Win32_Process -Filter "Name = 'Natively.exe' OR Name = 'electron.exe'"` matched only the twelve pre-existing Natively processes with IDs `17560, 18776, 22344, 23208, 23704, 25180, 25304, 25460, 31440, 32080, 32600, 33672`. No harness process remained.

## CLAUDE.md coverage and risks

- **Tested physically on Windows** for the isolated renderer run, local build, packaged reference and tracked process/port cleanup.
- **Build validated on Windows** for the dev Electron bundle and Vite renderer. The native compilation and Windows installer were outside the successful build checks.
- **Covered by automated Windows branch tests** and **Covered by automated macOS branch tests** for platform paths, startup policy, shortcuts and packaging-helper logic in the selected suites.
- **Reviewed but not executed on macOS**. **Requires physical macOS verification** for the guide on the live windows, DMG Finder/retry changes, signing and notarization. Reviewed the macOS and Windows paths in the STT, native speaker and packaging changes. The macOS STT branch retains its previous thresholds while upstream changes the Windows thresholds.
- **Requires physical Windows verification** for the updated Rust loopback fallback, actual STT capture and taskbar/installer behavior. The tracked 3.2.0 Windows native binary is preserved, so the harness cannot prove the newly merged Rust behavior.
- The code-review-graph tools were unavailable. The review used the Git merge index, upstream/fork diffs and targeted source checks.
- Phase 3a renderer parity does not execute all provider, billing, native, and premium workflows. The retained private licence logging failure and unavailable baseline fixtures limit that comparison.
