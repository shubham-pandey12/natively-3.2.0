# Final verification — INCOMPLETE

Exact parity has not been proven. No source was edited. This is an interim evidence report, not completion of the requested verification.

## Part A

Build sequence `npm run build:electron && npm run build && npm run build:electron`: passed (3/3). Type checks electron, premium and ts7: passed (3/3). No lint script exists. Renderer build warned about chunk size; calendar build credential warnings fall under F103.

| Runner | Tests | Pass | Fail | Skip | Todo |
| --- | ---: | ---: | ---: | ---: | ---: |
| recovery | 14 | 6 | 0 | 8 | 0 |
| intelligence | 3268 | 3257 | 0 | 2 | 9 |
| lib | 3151 | 3136 | 0 | 15 | 0 |
| components | 956 | 954 | 0 | 2 | 0 |
| scripts | 331 | 330 | 0 | 1 | 0 |
| vision-benchmark | 14 | 14 | 0 | 0 | 0 |
| core-smoke | 220 | 220 | 0 | 0 | 0 |
| company | 17 | 17 | 0 | 0 | 0 |

Realtime prompt runner exited 1: typed chat 35/36, failing `guard: a safety redirect does not carry it`, occurrences=1, at tests/realtime-prompt/e2e-typed-chat.cjs:113. Baseline/reference attribution is UNRESOLVED. Proposed investigation: trace mode instructions into the safety redirect dispatch and compare with 3.2.0 before proposing a source fix. Main `npm test` has not produced its summary at report creation; full-suite gate remains incomplete. Other specialized/live/browser runners remain unexecuted.

## Part B

Inventory row totals: {'REFERENCE ONLY': 30191, 'LOCAL ONLY': 5490, 'UNRESOLVED DIFFERENCE': 194, 'IDENTICAL': 933}. All files were SHA-256 hashed. Appendix includes all reference dependencies and native build intermediates, so unmatched files are inventory facts, not established gaps. Unequal pairs are explicitly UNRESOLVED DIFFERENCE; they have not been promoted to REAL DIFFERENCE or COSMETIC. Required source mappings and equivalence proofs remain incomplete.

Comparator electron: identical=804, differs=92, missing-locally=0, extra-locally=1. Renderer FULL code comparator: identical=67, differs=10, missing-locally=0, extra-locally=0. Comparator normalization is broader than byte equality; these totals differ from the appendix byte classification. No final rename-only/cosmetic/held/real-difference totals established.

Native comparator: both arm64 and x64 IDENTICAL, no missing/extra statically detected wrapper names. No native build was run, so no unsigned arm64 hash difference was introduced and no generated wrapper checkout was necessary. Runtime export invocation remains unverified. IPC derivation was started but is not a completed proof. Resource hashes appear in the appendix; exhaustive resource-path mapping remains incomplete.

## Part C

Launcher DOM was checked with CDP after confirming `?window=launcher`; all 13 settings-tab requests and snapshots were captured. This does not establish every control or paired 3.2.0 behavior. No API key was changed. F059/F060, live capture, native log drain, screenshot/crop gestures, F026/F016 generation, and paired installed-app lifecycle checks remain unverified. Installed app was not driven.

Verdicts: SAME (runtime-verified)=0, SAME (code-only)=0, HELD=6, DIFFERENT=0 established, BLOCKED=99. BLOCKED denotes unfinished evidence here, not a demonstrated product failure.

| ID | Verdict | Method / evidence limit | Feature |
| --- | --- | --- | --- |
| F001 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Renderer windows: Launcher |
| F002 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Renderer windows: Overlay / NativelyInterface |
| F003 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Renderer windows: TopPill |
| F004 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Renderer windows: Notes window |
| F005 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Renderer windows: Settings popup |
| F006 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Renderer windows: Cropper |
| F007 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Renderer windows: Meeting list |
| F008 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Renderer windows: Meeting details |
| F009 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Renderer windows: Onboarding and welcome |
| F010 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Renderer windows: First-run guide |
| F011 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Settings tabs: General |
| F012 | HELD | Intentional hold | Settings tabs: Plans |
| F013 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Settings tabs: AI providers |
| F014 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Settings tabs: Retrieval |
| F015 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Settings tabs: Audio |
| F016 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Settings tabs: Overlay |
| F017 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Settings tabs: Calendar |
| F018 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Settings tabs: Keybinds |
| F019 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Settings tabs: Phone mirror |
| F020 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Settings tabs: Connections |
| F021 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Settings tabs: Intelligence |
| F022 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Settings tabs: Help |
| F023 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Settings tabs: About |
| F024 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: What to Say |
| F025 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Auto Answer |
| F026 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Fast Response |
| F027 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Answer length and word caps |
| F028 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Modes and custom modes |
| F029 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Clarify |
| F030 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Recap |
| F031 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Follow-up |
| F032 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Brainstorm |
| F033 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Manual chat |
| F034 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Stop and cancel |
| F035 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Regenerate and copy |
| F036 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Code blocks |
| F037 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Diagrams |
| F038 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Notices |
| F039 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Answering: Quiet notes |
| F040 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Capture: Microphone |
| F041 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Capture: System audio macOS |
| F042 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Capture: System audio Windows |
| F043 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Capture: Device selection |
| F044 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Capture: Silence suppression |
| F045 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Capture: Resampling |
| F046 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Capture: Screenshots |
| F047 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Capture: Crop |
| F048 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Capture: Page context |
| F049 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Capture: Direct Assist |
| F050 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Speech and transcript: STT providers |
| F051 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Speech and transcript: Rolling transcript bar |
| F052 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Speech and transcript: Context terms |
| F053 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | AI providers: Provider list |
| F054 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | AI providers: Custom endpoints |
| F055 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | AI providers: Ollama |
| F056 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | AI providers: Codex CLI |
| F057 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | AI providers: Natively API |
| F058 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | AI providers: Model lists |
| F059 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | AI providers: Key test/save/rollback |
| F060 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | AI providers: Fallback order |
| F061 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Knowledge and retrieval: Knowledge spaces |
| F062 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Knowledge and retrieval: Reembed |
| F063 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Knowledge and retrieval: Live indexer |
| F064 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Knowledge and retrieval: Natively search |
| F065 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Knowledge and retrieval: Tavily search |
| F066 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Knowledge and retrieval: Structured extractor |
| F067 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Knowledge and retrieval: KnowledgeOrchestrator |
| F068 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Knowledge and retrieval: Company research |
| F069 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Knowledge and retrieval: Profile intelligence |
| F070 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Knowledge and retrieval: JD and resume flows |
| F071 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Phone mirror: Pairing |
| F072 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Phone mirror: Stream |
| F073 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Phone mirror: Screenshot tray |
| F074 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Phone mirror: Chat |
| F075 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Calendar and connections: Google Calendar |
| F076 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Calendar and connections: Outlook Calendar |
| F077 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Calendar and connections: Meeting start |
| F078 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Calendar and connections: Connections and integrations |
| F079 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Shortcuts and lifecycle: Darwin keybind table |
| F080 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Shortcuts and lifecycle: Windows keybind table |
| F081 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Shortcuts and lifecycle: Startup |
| F082 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Shortcuts and lifecycle: Single instance |
| F083 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Shortcuts and lifecycle: Quit |
| F084 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Shortcuts and lifecycle: Auto-update |
| F085 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Shortcuts and lifecycle: Tray and menu bar |
| F086 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Shortcuts and lifecycle: Dock and taskbar |
| F087 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Shortcuts and lifecycle: Always on top |
| F088 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Shortcuts and lifecycle: Click through |
| F089 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Shortcuts and lifecycle: Content protection |
| F090 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Shortcuts and lifecycle: Spaces and virtual desktops |
| F091 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Native and packaging: Native module exports |
| F092 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Native and packaging: macOS native helpers |
| F093 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Native and packaging: Windows native helpers |
| F094 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Native and packaging: Build targets |
| F095 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Native and packaging: Extra resources |
| F096 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Native and packaging: ASAR unpack |
| F097 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | IPC: ipcMain channels |
| F098 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | IPC: Preload electronAPI methods |
| F099 | HELD | Intentional hold | Intentional holds: Billing/trial/licence |
| F100 | HELD | Intentional hold | Intentional holds: forceTrialEnded |
| F101 | HELD | Intentional hold | Intentional holds: devPremiumOverride |
| F102 | HELD | Intentional hold | Intentional holds: pinUserData packaged guard |
| F103 | HELD | Intentional hold | Intentional holds: Calendar OAuth credentials |
| F104 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Settings and IPC: Meeting surface setting and first-run guide update |
| F105 | BLOCKED | Paired runtime verification not completed; prior phase evidence is not fresh proof | Native diagnostics: Capture lifecycle log export |

## Part D

`xcodebuild -checkFirstLaunchStatus` exited 69: full macOS package BLOCKED (Xcode first launch). No scratch package was produced. Windows build config and build-smoke workflow were inspected statically: Windows NSIS target and macos-latest/windows-latest matrix exist; packaged Windows checks are configured. Requires physical Windows verification.

## Validation categories

- Tested physically on macOS: not established by this report
- Tested physically on Windows: not established by this report
- Covered by automated macOS branch tests: not established by this report
- Covered by automated Windows branch tests: not established by this report
- Build validated on macOS: yes, development renderer/Electron build only
- Build validated on Windows: not established by this report
- Reviewed but not executed on macOS: not established by this report
- Reviewed but not executed on Windows: not established by this report
- Requires physical macOS verification: required
- Requires physical Windows verification: required

## Profile and repository

Profile backed up before launch; backup location is recorded in `/tmp/natively-final-verification/profile-backup-path`. No settings controls or saved keys were changed. After launcher quitApp(), settings/config/credential filename hash comparison against backup returned 0 differences. This is a scoped hash comparison, not a full profile byte equality claim. Native wrapper files are clean. Git status contains only the two report files at report creation.

Raw evidence remains in `/tmp/natively-final-verification`; it may contain application diagnostics and should not be published without redaction.

Bottom line: exact parity remains unproven; unresolved code differences, one failing typed-chat assertion, incomplete full-suite and paired runtime verification, blocked macOS packaging, and physical Windows verification remain.

## Independent review (2026-11-19)

Corrections to the claims above, re-measured against `ref-3.2.0`:

1. **Native binaries are not both byte-identical.** The x64 file is identical (`b33d73ff…`). The arm64 file is a local unsigned rebuild (`78c8eec2…` vs `7cebc25b…`) with the same 26 exports.
2. **The inventory counts are skewed by scope.**
   - The 30,191 "reference only" files are `node_modules` (27,724 in `asar/`, 2,461 in `app.asar.unpacked/`), which were never inventoried locally, plus 4 hashed assets, 1 leftover `.node` and a `.DS_Store`.
   - The 5,490 "local only" files are 4,553 Rust build files in `native-module/target`, 897 `.map` files (3.2.0 ships none), Rust sources and the held `devPremiumOverride.js`.
   - None of these is a code gap.
3. **The 194 unresolved pairs are now classified.**
   - 2 are the arm64 `.node` (see item 1).
   - 86 are equivalent after normalising identifiers, comments, whitespace and hashed chunk names, the esbuild `0 && module.exports` annotations, and `init_x()/__toCommonJS` vs `require_x()`.
   - 14 are the same lines in a different order: the known cosmetic items `liveDeadlines`, `speakability`, `codingShape`, `StructuredExtractor`, `ChunkSummaryGenerator`, `v2FallbackNotes`, `mode-retrieval-port`, `orchestrator`, `manualProfileIntelligence`, the `preload` answer-length order, and the CSS.
   - The remaining 92 were split into their embedded modules. Every module-level difference falls into one of three groups:
     - **Held (F099–F103, F012):** `proAccess`, `packProRule`, `packClockWiring`, `PackMeetingClock`, `proEntitlementWiring`, `ProEntitlementReconciler`, `LicenseManager`, `devPremiumOverride`, `pinUserData`, `CalendarManager` / `microsoftGraph`, and the licence, pack and Pro branches inside `ipcHandlers` and `main`. These include `licencePremiumForWindows`, the stored `packProStandDownModeId`, `setLiveAiModelReader` vs `setPackProviderReaders`, the dev quota stub and `packSelectionChanged()`.
     - **Bundler layout only:** the premium Auto Answer sources here are JavaScript recovered from 3.2.0's compiled output.
       - Each of the 25 recovered files equals 3.2.0's compiled file except for the `NATIVELY_UI_EVAL` banner line, which `scripts/build-electron.js:173` adds back at build time.
       - Because they're rebuilt from `.js` rather than `.ts`, esbuild labels them `.js`, splits declarations differently, and inlines or lazily wraps some shared modules differently (`onnxThreadConfig`, `onnxLoadSentinel`, `onnxWorkerShutdown`, `workerStatus`, `config/constants`, the `TavilySearchProvider` and `NativelySearchProvider` path labels).
       - The code lines are the same; only the wrapper exports and object-pattern spelling differ (`{a}` vs `{a:a}`).
     - **Cosmetic:** comments and reorderings, including the `IntelligenceEngine.onlySmallTalk` method position.
   - No non-held behaviour difference was found in `dist-electron`.
4. **The typed-chat failure is not a parity gap.** I ran `tests/realtime-prompt/e2e-typed-chat.cjs` against 3.2.0's own compiled code (`TC_ROOT=ref-3.2.0/asar`). It fails the same assertion: 35/36, "guard: a safety redirect does not carry it". 3.2.0 behaves the same way, so the test expectation is stale.
5. **Not re-done in this review:**
   - The 10 renderer chunks were compared only by their string literals (Phase 11). Their minified identifiers differ arbitrarily, so line normalisation can't prove them.
   - Part C (runtime) and Part D (packaging) remain BLOCKED as stated above.
