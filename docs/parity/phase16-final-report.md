# Final Natively 3.2.0 parity report

Branch: `fix/restore-premium-types`; reference: extracted signed `/Applications/Natively.app` 3.2.0. This report consolidates the phase evidence and read-only rechecks. The reference was treated as data. Verdicts describe evidence, not a promise that every path was physically exercised.

## Verdicts

| ID | Area / feature | Verdict | Evidence | Reason |
|---|---|---|---|---|
| F001 | Renderer windows: Launcher | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F002 | Renderer windows: Overlay / NativelyInterface | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F003 | Renderer windows: TopPill | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F004 | Renderer windows: Notes window | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F005 | Renderer windows: Settings popup | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F006 | Renderer windows: Cropper | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F007 | Renderer windows: Meeting list | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F008 | Renderer windows: Meeting details | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F009 | Renderer windows: Onboarding and welcome | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F010 | Renderer windows: First-run guide | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F011 | Settings tabs: General | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F012 | Settings tabs: Plans | Held (intentional) | [phase11-ui.md](./phase11-ui.md) | Intentional entitlement, development or OAuth credential hold; see hold policy below. |
| F013 | Settings tabs: AI providers | Implemented | [phase11-ui.md](./phase11-ui.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F014 | Settings tabs: Retrieval | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F015 | Settings tabs: Audio | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F016 | Settings tabs: Overlay | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F017 | Settings tabs: Calendar | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F018 | Settings tabs: Keybinds | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F019 | Settings tabs: Phone mirror | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F020 | Settings tabs: Connections | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F021 | Settings tabs: Intelligence | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F022 | Settings tabs: Help | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F023 | Settings tabs: About | Partial | [phase11-ui.md](./phase11-ui.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F024 | Answering: What to Say | Implemented | [phase8-answering.md](./phase8-answering.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F025 | Answering: Auto Answer | Implemented | [phase8-answering.md](./phase8-answering.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F026 | Answering: Fast Response | Implemented | [phase8-answering.md](./phase8-answering.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F027 | Answering: Answer length and word caps | Implemented | [phase8-answering.md](./phase8-answering.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F028 | Answering: Modes and custom modes | Implemented | [phase8-answering.md](./phase8-answering.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F029 | Answering: Clarify | Implemented | [phase8-answering.md](./phase8-answering.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F030 | Answering: Recap | Implemented | [phase8-answering.md](./phase8-answering.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F031 | Answering: Follow-up | Implemented | [phase8-answering.md](./phase8-answering.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F032 | Answering: Brainstorm | Implemented | [phase8-answering.md](./phase8-answering.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F033 | Answering: Manual chat | Implemented | [phase8-answering.md](./phase8-answering.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F034 | Answering: Stop and cancel | Partial | [phase8-answering.md](./phase8-answering.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F035 | Answering: Regenerate and copy | Partial | [phase8-answering.md](./phase8-answering.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F036 | Answering: Code blocks | Implemented | [phase8-answering.md](./phase8-answering.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F037 | Answering: Diagrams | Implemented | [phase8-answering.md](./phase8-answering.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F038 | Answering: Notices | Implemented | [phase8-answering.md](./phase8-answering.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F039 | Answering: Quiet notes | Partial | [phase8-answering.md](./phase8-answering.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F040 | Capture: Microphone | Implemented | [phase9-capture.md](./phase9-capture.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F041 | Capture: System audio macOS | Partial | [phase9-capture.md](./phase9-capture.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F042 | Capture: System audio Windows | Partial | [phase9-capture.md](./phase9-capture.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F043 | Capture: Device selection | Implemented | [phase9-capture.md](./phase9-capture.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F044 | Capture: Silence suppression | Partial | [phase9-capture.md](./phase9-capture.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F045 | Capture: Resampling | Partial | [phase9-capture.md](./phase9-capture.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F046 | Capture: Screenshots | Implemented | [phase9-capture.md](./phase9-capture.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F047 | Capture: Crop | Implemented | [phase9-capture.md](./phase9-capture.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F048 | Capture: Page context | Partial | [phase9-capture.md](./phase9-capture.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F049 | Capture: Direct Assist | Partial | [phase9-capture.md](./phase9-capture.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F050 | Speech and transcript: STT providers | Partial | [phase9-capture.md](./phase9-capture.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F051 | Speech and transcript: Rolling transcript bar | Partial | [phase9-capture.md](./phase9-capture.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F052 | Speech and transcript: Context terms | Implemented | [phase9-capture.md](./phase9-capture.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F053 | AI providers: Provider list | Implemented | [phase10-providers.md](./phase10-providers.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F054 | AI providers: Custom endpoints | Implemented | [phase10-providers.md](./phase10-providers.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F055 | AI providers: Ollama | Partial | [phase10-providers.md](./phase10-providers.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F056 | AI providers: Codex CLI | Implemented | [phase10-providers.md](./phase10-providers.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F057 | AI providers: Natively API | Partial | [phase10-providers.md](./phase10-providers.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F058 | AI providers: Model lists | Implemented | [phase10-providers.md](./phase10-providers.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F059 | AI providers: Key test/save/rollback | Partial | [phase10-providers.md](./phase10-providers.md) | Code paths match; save does not validate, and live rollback was not tested. |
| F060 | AI providers: Fallback order | Partial | [phase10-providers.md](./phase10-providers.md) | Fallback order matches; pre-token failure, cooldown and rescue ladder were not exercised. |
| F061 | Knowledge and retrieval: Knowledge spaces | Partial | [phase12-knowledge.md](./phase12-knowledge.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F062 | Knowledge and retrieval: Reembed | Partial | [phase12-knowledge.md](./phase12-knowledge.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F063 | Knowledge and retrieval: Live indexer | Partial | [phase12-knowledge.md](./phase12-knowledge.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F064 | Knowledge and retrieval: Natively search | Partial | [phase12-knowledge.md](./phase12-knowledge.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F065 | Knowledge and retrieval: Tavily search | Partial | [phase12-knowledge.md](./phase12-knowledge.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F066 | Knowledge and retrieval: Structured extractor | Partial | [phase12-knowledge.md](./phase12-knowledge.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F067 | Knowledge and retrieval: KnowledgeOrchestrator | Partial | [phase12-knowledge.md](./phase12-knowledge.md) | Source-contract order fixed in 99bb6621; live orchestration remains untested. |
| F068 | Knowledge and retrieval: Company research | Partial | [phase12-knowledge.md](./phase12-knowledge.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F069 | Knowledge and retrieval: Profile intelligence | Implemented | [phase12-knowledge.md](./phase12-knowledge.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F070 | Knowledge and retrieval: JD and resume flows | Partial | [phase12-knowledge.md](./phase12-knowledge.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F071 | Phone mirror: Pairing | Partial | [phase13-mirror-calendar.md](./phase13-mirror-calendar.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F072 | Phone mirror: Stream | Partial | [phase13-mirror-calendar.md](./phase13-mirror-calendar.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F073 | Phone mirror: Screenshot tray | Partial | [phase13-mirror-calendar.md](./phase13-mirror-calendar.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F074 | Phone mirror: Chat | Partial | [phase13-mirror-calendar.md](./phase13-mirror-calendar.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F075 | Calendar and connections: Google Calendar | Held (intentional) | [phase13-mirror-calendar.md](./phase13-mirror-calendar.md) | Intentional entitlement, development or OAuth credential hold; see hold policy below. |
| F076 | Calendar and connections: Outlook Calendar | Held (intentional) | [phase13-mirror-calendar.md](./phase13-mirror-calendar.md) | Intentional entitlement, development or OAuth credential hold; see hold policy below. |
| F077 | Calendar and connections: Meeting start | Partial | [phase13-mirror-calendar.md](./phase13-mirror-calendar.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F078 | Calendar and connections: Connections and integrations | Partial | [phase13-mirror-calendar.md](./phase13-mirror-calendar.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F079 | Shortcuts and lifecycle: Darwin keybind table | Partial | [phase14-lifecycle.md](./phase14-lifecycle.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F080 | Shortcuts and lifecycle: Windows keybind table | Partial | [phase14-lifecycle.md](./phase14-lifecycle.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F081 | Shortcuts and lifecycle: Startup | Partial | [phase14-lifecycle.md](./phase14-lifecycle.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F082 | Shortcuts and lifecycle: Single instance | Partial | [phase14-lifecycle.md](./phase14-lifecycle.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F083 | Shortcuts and lifecycle: Quit | Partial | [phase14-lifecycle.md](./phase14-lifecycle.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F084 | Shortcuts and lifecycle: Auto-update | Partial | [phase14-lifecycle.md](./phase14-lifecycle.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F085 | Shortcuts and lifecycle: Tray and menu bar | Partial | [phase14-lifecycle.md](./phase14-lifecycle.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F086 | Shortcuts and lifecycle: Dock and taskbar | Partial | [phase14-lifecycle.md](./phase14-lifecycle.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F087 | Shortcuts and lifecycle: Always on top | Partial | [phase14-lifecycle.md](./phase14-lifecycle.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F088 | Shortcuts and lifecycle: Click through | Partial | [phase14-lifecycle.md](./phase14-lifecycle.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F089 | Shortcuts and lifecycle: Content protection | Partial | [phase14-lifecycle.md](./phase14-lifecycle.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F090 | Shortcuts and lifecycle: Spaces and virtual desktops | Partial | [phase14-lifecycle.md](./phase14-lifecycle.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F091 | Native and packaging: Native module exports | Implemented | [phase15-native-packaging.md](./phase15-native-packaging.md) | Both local macOS native binaries expose the reference export set; internals remain opaque. |
| F092 | Native and packaging: macOS native helpers | Partial | [phase15-native-packaging.md](./phase15-native-packaging.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F093 | Native and packaging: Windows native helpers | Partial | [phase15-native-packaging.md](./phase15-native-packaging.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F094 | Native and packaging: Build targets | Partial | [phase15-native-packaging.md](./phase15-native-packaging.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F095 | Native and packaging: Extra resources | Partial | [phase15-native-packaging.md](./phase15-native-packaging.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F096 | Native and packaging: ASAR unpack | Partial | [phase15-native-packaging.md](./phase15-native-packaging.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F097 | IPC: ipcMain channels | Partial | [phase7-ipc.md](./phase7-ipc.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F098 | IPC: Preload electronAPI methods | Partial | [phase7-ipc.md](./phase7-ipc.md) | Matching or reviewed code with the runtime, native, packaging or Windows limit in the cited phase. |
| F099 | Intentional holds: Billing/trial/licence | Held (intentional) | [phase6-verification-report.md](./phase6-verification-report.md) | Intentional entitlement, development or OAuth credential hold; see hold policy below. |
| F100 | Intentional holds: forceTrialEnded | Held (intentional) | [phase6-verification-report.md](./phase6-verification-report.md) | Intentional entitlement, development or OAuth credential hold; see hold policy below. |
| F101 | Intentional holds: devPremiumOverride | Held (intentional) | [phase6-verification-report.md](./phase6-verification-report.md) | Intentional entitlement, development or OAuth credential hold; see hold policy below. |
| F102 | Intentional holds: pinUserData packaged guard | Held (intentional) | [phase6-verification-report.md](./phase6-verification-report.md) | Intentional entitlement, development or OAuth credential hold; see hold policy below. |
| F103 | Intentional holds: Calendar OAuth credentials | Held (intentional) | [phase6-verification-report.md](./phase6-verification-report.md) | Intentional entitlement, development or OAuth credential hold; see hold policy below. |
| F104 | Settings and IPC: Meeting surface setting and first-run guide update | Implemented | [phase7-ipc.md](./phase7-ipc.md) | Matching compiled/source behavior plus cited runtime or focused test evidence. |
| F105 | Native diagnostics: Capture lifecycle log export | Implemented | [phase15-native-packaging.md](./phase15-native-packaging.md) | Both macOS exports now match; live capture-log drain remains unobserved. |

**Totals:** Implemented 27; Partial 70; Held (intentional) 8; Missing 0; Unsure 0; total 105. “Held” includes F012, F075–F076 and F099–F103.

## Evidence reconciliation

- The early [Phase 6 verification report](./phase6-verification-report.md) counted 94 Unsure and reported a missing F105 export. Later feature phases examined those paths; [Phase 15](./phase15-native-packaging.md) rebuilt arm64 and supplied the identical reference x64 binary. The early counts and F105 binary inventory are superseded. The F105 catalogue location still says the local arm64 binary lacks the export; its later note and Phase 15 establish that this is stale.
- [Phase 8](./phase8-answering.md) initially listed F024, F026 and F028 as Partial; its close-out and [Phase 10 follow-up](./phase10-providers.md#runtime-follow-up) establish their Implemented verdicts. The catalogue reflects that later result.
- [Phase 11](./phase11-ui.md#correction-and-fix-2026-11-19) originally characterized answer-length registration as extra local behavior; commit `3d833258` moved it to the matching guarded IPC setup. [Phase 12](./phase12-knowledge.md#fix-2026-11-19) originally called source-contract order equivalent; commit `99bb6621` proved and fixed a behavior difference. Both old observations are superseded.
- F015 and F006 catalogue notes predate the Phase 9 device switch and crop run; their Partial verdicts remain because the full settings/native-window behavior was not proved. F059 is Partial despite matching test/save code because save does not validate a key and rollback was not completed.

## Code comparison by layer

| Layer / scope | Identical | Rename-only or equivalent | Real-difference leads | Evidence and limit |
|---|---:|---:|---:|---|
| Main startup/IPC/preload, Phase 6 | Not given as a whole-layer count | 15 of 91 non-identical entries classified equivalent | 0 then proven; 65 initially Unsure | [Phase 6 modules](./phase6-module-findings.md), [main](./phase6-main-findings.md); later phases resolve scoped paths. |
| Scoped main shortcut/lifecycle modules | 82 | 44 | 1 (`main.ts`, held) | [Phase 14](./phase14-lifecycle.md). |
| Provider service modules | 7 | 2 | 0 | [Phase 10](./phase10-providers.md); broader LLM scope 157 / 13 / 5. |
| Capture audio standalone modules | 81 | 0 | 0 (`MissingKeySTT.js` differs only by 2 JSDoc comments present in 3.2.0; corrected after review) | [Phase 9](./phase9-capture.md); main filter 54 / 21 / 1, IPC filter 47 / 28 / 0. |
| IPC channel and preload mappings | 1,569 matched rows | 4 held wrapper alias leads | 0 channel/method gaps | [Phase 7](./phase7-ipc.md), [appendix](./phase7-ipc-appendix.tsv); 688 handlers, 746 preload keys, 139 main-to-renderer channels each side. |
| Renderer chunks | 67 | 10 differing chunks classified by literals/identifiers | 0 proven non-held UI text gaps | [Phase 11](./phase11-ui.md); 77 matched; these are chunk counts, not whole-code equivalence. |
| Window modules | 1 | 7 | 1 (`main.ts`, later corrected/held) | [Phase 11](./phase11-ui.md), [Phase 14](./phase14-lifecycle.md). |
| Knowledge/retrieval modules | 262 | 24 | 10 inspected leads; one behavior difference fixed | [Phase 12](./phase12-knowledge.md); source-extension aliases 2/2; post-fix full recount not stated. |
| Models | 15 matching file hashes | 0 | 0 | [Phase 12](./phase12-knowledge.md); `resources/models` vs reference `models`. |
| Native | 26/26 macOS export names on arm64 and x64 | N/A | Binary bytes differ for rebuilt arm64 | [Phase 15](./phase15-native-packaging.md); x64 is identical reference binary; internal native semantics not recoverable. |

Counts are scoped and overlap; they must not be added into a repository-wide total. “Real-difference leads” records raw module findings before closer classification.

### Remaining real code and binary differences

- **Held:** `electron/main.ts` local pack-selection callback and entitlement wiring (F012/F100); `electron/ipcHandlers.ts` licence, Pro, pack and development branches (F099–F101); `electron/services/CalendarManager.ts` and `electron/services/calendar/providers/microsoftGraph.ts` credential defaults (F103). Related pack, Pro, and `pinUserData.ts` modules differ intentionally. No credential values are reproduced. Evidence: [Phase 7](./phase7-ipc.md), [Phase 13](./phase13-mirror-calendar.md), [Phase 14](./phase14-lifecycle.md).
- **MissingKeySTT (corrected):** Phase 9 called this a local extra. A direct `diff -a` against 3.2.0 shows the code is identical; 3.2.0 only carries two extra JSDoc comments (on `start()` and the dropped-audio note). Cosmetic, deferred with the other comment alignment.
- **Cosmetic or equivalent, deferred by user:** `smallTalk.ts` and `ModesManager.ts` comments; `liveDeadlines.ts`, `speakability.ts`, `codingShape.ts`, `StructuredExtractor.ts`, `mode-retrieval-port.ts` declaration/initialization ordering; `manualProfileIntelligence.ts` regex alternative order; `HeuristicExtractor.ts` NUL spelling; `KnowledgeOrchestrator.ts` Pro-key spelling/order; `NotesWindow` guide predicate factoring; generated identifiers, hashed assets and icon exports. See [Phase 10](./phase10-providers.md), [Phase 11](./phase11-ui.md), [Phase 12](./phase12-knowledge.md). These are raw code differences with no remaining proven behavior gap.
- **Native/build artifacts:** local rebuilt arm64 `.node` differs in bytes from the signed reference although exports match; local x64 `.node` is byte identical to the reference. The unsigned arm64-only `app.asar` has four fewer paths and unpacked tree has two fewer x64 prebuilds; the package stopped before helpers/extraResources/Info.plist comparison. See [Phase 15](./phase15-native-packaging.md).
- **Known proven non-held behavior gaps remaining:** none established by the phase reports after commits `3d833258` and `99bb6621`. F059 is an unverified save/rollback behavior limit, not a newly proven difference from 3.2.0.

## Parity commits and tests

Test paths below are files present in each commit, not a claim that every test was rerun in this reporting phase. `none` means the commit itself contained no test file.

| Commit | Change | Test file(s) in commit |
|---|---|---|
| `99bb6621` | Apply mode source contract after attachment extras, as 3.2.0 does | `electron/context-intelligence/__tests__/ModeSourceContractOrder320.test.mjs` |
| `3d833258` | Wire answer length in IPC setup with guarded fallback, as 3.2.0 does | `electron/llm/__tests__/AnswerLengthWiring320.test.mjs` |
| `4651f90e` | Ship the 3.2.0 Auto Answer decider manifest (2026.11.14-student-yt2) | none |
| `d7853616` | Bump to 3.2.0, add Windows NSIS CI build, phase 5 parity inventory | `electron/services/__tests__/FirstRunGuidePolicy2026_11_16.test.mjs` |
| `93972a14` | Restore 3.2.0 renderer behavior (parity phase 4b, full audit) | `electron/audio/__tests__/IndianLanguagesPicker2026_10_16.test.mjs`, `electron/services/__tests__/NoteTemplates2026_10_20.test.mjs`, plus 9 more (inspect commit) |
| `8de6813f` | Restore 3.2.0 renderer behavior (parity phase 4) | `electron/audio/__tests__/AnswersGoToOverlay2026_11_06.test.mjs`, `electron/services/__tests__/ModesReferenceFileStatusUi2026_11_07.test.mjs`, plus 9 more (inspect commit) |
| `c2d3ddac` | Restore 3.2.0 main-process and renderer behavior (parity R3, part 2) | `electron/context-intelligence/__tests__/CurrentScreenAfterHistory.test.mjs`, `electron/context-intelligence/__tests__/HotkeyTurnsRecorded2026_10_28.test.mjs`, plus 40 more (inspect commit) |
| `504bc2de` | Restore 3.2.0 main-process behavior (parity R3, part 1) | `electron/audio/__tests__/Recovered320Audio.test.mjs`, `electron/services/__tests__/R3MainParity2026_11_17.test.mjs` |
| `be9f3380` | Restore 3.2.0 Auto Answer UI (parity phase 2b) | `src/components/__tests__/AutoAnswerUiParity2026_11_17.test.mjs` |
| `37dea363` | Restore 3.2.0 licence/Pro services and Auto Answer boundary (parity phase 2) | `electron/llm/__tests__/FastModelPreferFast2026_09_23.test.mjs`, `electron/services/__tests__/AutoAnswerPremiumBoundary2026_11_13.test.mjs`, plus 3 more (inspect commit) |
| `9c35c88e` | Restore 3.2.0 modeSourceContract lookup and answer-length translations (parity phase 1) | `electron/context-intelligence/__tests__/EngineBridgeModeSourceContract2026_11_17.test.mjs`, `src/lib/__tests__/AnswerLengthI18n2026_11_17.test.mjs` |
| `189489a0` | Match 3.2.0 seedsCandidateBackground input exactly | none |
| `2651978e` | Port remaining deferred 3.2.0 items | `electron/services/__tests__/LocalEmbedderVectorsOutsideMeeting2026_09_19.test.mjs`, `electron/services/__tests__/ParityDeferredItems2026_11_17.test.mjs` |
| `7f893f51` | Port 3.2.0 section leave-out contract and rate-limiter background lane | `electron/services/__tests__/ModesManagerColdStartCompile.test.mjs`, `electron/services/__tests__/RateLimiterBackgroundLane2026_11_17.test.mjs`, `electron/services/meeting/__tests__/MeetingNotesV3.test.mjs` |
| `be9c9f9d` | Restore remaining 3.2.0 client behavior (parity phases 5-7) | `electron/context-intelligence/__tests__/WholePackReadOnRetrievingTurn2026_10_03.test.mjs`, `electron/llm/__tests__/CodingTemplateContract2026_08_18.test.mjs`, `electron/llm/codeVerification/__tests__/SyntaxCheckAndShapeRepair2026_09_30.test.mjs` |
| `1bfb0ac9` | Restore 3.2.0 LLMHelper, engine and composer behavior (parity phases 2-4) | `electron/context-intelligence/__tests__/AnswerPolicyLiveDenials2026_08_07.test.mjs`, `electron/llm/__tests__/CodingResponseShape2026_09_29.test.mjs`, plus 4 more (inspect commit) |
| `cb2d0622` | Restore more recovered 3.2.0 client behavior (parity audit phase 1) | `electron/audio/__tests__/Recovered320Handback.test.mjs`, `electron/audio/__tests__/Recovered320NepaliLanguage.test.mjs`, plus 9 more (inspect commit) |
| `acbd1f2c` | Restore recovered 3.2 client behavior and tests | `electron/audio/__tests__/AnswersGoToOverlay2026_11_06.test.mjs`, `electron/audio/__tests__/OnnxWorkerCooperativeShutdown2026_10_14.test.mjs`, plus 42 more (inspect commit) |
| `4eae567b` | fixed all the issues | `electron/audio/__tests__/AppleSpeechSTT.test.mjs`, `electron/llm/__tests__/TruncatedAnswerNotStored2026_08_12.test.mjs`, plus 19 more (inspect commit) |
| `8cfb23e3` | fix: preserve screenshot retries after answer failures | `electron/context-intelligence/__tests__/HotkeyTurnsRecorded2026_10_28.test.mjs`, `electron/context-intelligence/__tests__/ScreenshotMemory2026_09_08.test.mjs`, plus 8 more (inspect commit) |
| `f3e1eacf` | fix: prevent conversation history from overriding current screenshots | `electron/context-intelligence/__tests__/CurrentScreenAfterHistory.test.mjs`, `electron/llm/__tests__/DirectAssistImageDispatchIdentity.test.mjs`, `src/lib/__tests__/directAssistRenderer2026_08_29.test.mjs` |
| `6d3dc44e` | fix: keep What to Say grounded in current inputs | `electron/llm/__tests__/WhatToSayScreenshotFreshnessFix.test.mjs`, `electron/services/__tests__/IntelligenceEngineScreenContext.test.mjs`, plus 3 more (inspect commit) |
| `c7fb9fb5` | modes manager fixed and implemented | `electron/services/__tests__/ModesReferenceFileStatusUi2026_11_07.test.mjs` |
| `32eba4f3` | modes selection fixed | `electron/services/__tests__/ModesReferenceFileStatusUi2026_11_07.test.mjs` |
| `dd6b38d2` | modes manager | `electron/services/__tests__/ModesManagerHardening2026_11_06.test.mjs`, `electron/services/__tests__/ModesManagerRecoveredAudit2026_11_06.test.mjs`, `electron/services/__tests__/ModesSettingsR29Copy.test.mjs` |
| `7a069bdb` | technical modes manager as fallback | `electron/services/__tests__/DocumentChunkerDuration.test.mjs`, `electron/services/__tests__/ModesManagerRecoveredAudit2026_11_06.test.mjs`, plus 3 more (inspect commit) |
| `6ad49557` | fix(modes): harden modes manager — sort, guards, dialog, UI error handling | `electron/services/__tests__/ModesManagerHardening2026_11_06.test.mjs` |
| `a535397e` | company intel fixed | `electron/services/__tests__/CompanySearchProviderWiring.test.mjs`, `src/components/__tests__/CompanyResearchCtaWiring2026_09_21.test.mjs` |
| `f89c4aee` | profile intelligencee | none |
| `40ce1520` | fix: restore premium TypeScript, fix preload types, enable strict mode | `electron/audio/__tests__/StopKeepsNotepadInFront2026_10_31.test.mjs`, `electron/llm/__tests__/CustomButtons2026_10_30.test.mjs`, plus 7 more (inspect commit) |
| `340224bd` | feat: restore recovered premium features and development access | `scripts/recovery/recovery.test.cjs` |

The merge commits are omitted from this fix inventory; they merge existing history rather than isolate a parity fix. The full `main..HEAD` log was reviewed.

## Ranked open gaps and blockers

1. **macOS release packaging and helper proof:** Xcode first-launch status 69 prevents `actool`, completion of the full macOS package, afterPack Apple Speech/Parakeet helpers, Info.plist/extraResources comparison, and source-built x64 native binary. The local x64 binary is the signed 3.2.0 copy; it has not run on Intel hardware. [Phase 15](./phase15-native-packaging.md).
2. **Windows execution and release:** Windows capture/WASAPI, native module, UI/shortcuts, phone listener, OAuth callbacks, model loading and NSIS output were reviewed or branch-tested only. The Windows CI job has not run. [Phase 9](./phase9-capture.md), [Phase 13](./phase13-mirror-calendar.md), [Phase 14](./phase14-lifecycle.md), [Phase 15](./phase15-native-packaging.md).
3. **Capture and speech:** system-audio frames and the F105 native capture-log drain were not observed live; packaged Apple Speech was unavailable. Quiet notes F039 did not trigger in the meeting. [Phase 9](./phase9-capture.md), [Phase 15](./phase15-native-packaging.md).
4. **Provider failure handling:** F060 pre-token failure, cooldown and rescue ladder were not exercised because most providers were switched off in the isolated profile. F059 save does not validate the key; separate Test worked, but save/rollback was not repeated with the real key. [Phase 10 follow-up](./phase10-providers.md#runtime-follow-up).
5. **Other live integrations:** real phone pairing/stream/chat, Google/Outlook OAuth (held credentials), calendar auto-start, extension-backed page context, Direct Assist UI, knowledge indexing/search/reembed/JD ingestion, native window levels/click-through/Spaces, installer/update paths remain unexecuted or partial. See their feature rows above.
6. **Cosmetic source alignment:** equivalent comments, declaration order, generated names and renderer asset/icon churn were explicitly deferred; they do not currently establish user-visible gaps.
7. **Type/build diagnostics:** premium typecheck errors in `HeuristicExtractor.ts` are FIXED after review (`let cur = null as X | null` at lines 226 and 439; typecheck clean; compiled output unchanged except the known NUL spelling; 51/51 tests pass); broader RAG CLI tests earlier hit a `better-sqlite3` Node ABI mismatch. These are validation blockers, not evidence of changed 3.2.0 extraction behavior. [Phase 12](./phase12-knowledge.md).

## Read-only rechecks in this phase

- `npm run typecheck`: **not runnable**; package has no `typecheck` script (exit 1).
- `npm run typecheck:electron`: **pass** (0 errors).
- `npm run typecheck:premium`: initially **fail** (20 TS2339 in `HeuristicExtractor.ts`); after the review fix **pass**, 0 diagnostics.
- `node --test` on the five named native suites and two named parity suites: **19 pass, 0 fail, 0 skipped** (native 15/15; parity 4/4). No native build was run, so `native-module/index.js` and `index.d.ts` were not regenerated or restored.

## Cross-platform completion report

**Change summary:** Added this ignored report only; no source, configuration, credentials or `.agent/userdata` change. Shared and platform-specific modules were reviewed through the linked phases; documentation has no runtime impact. Potential regressions come from unverified release and hardware paths, not this report.

| Exact validation category | Evidence |
|---|---|
| Tested physically on macOS | Earlier phases ran local Electron meeting/mic, device switch, screenshot/crop, Codex answer, phone listener and selected UI paths; see linked phase reports. |
| Tested physically on Windows | No. |
| Covered by automated macOS branch tests | Phase-specific suites and this phase’s 19 focused tests passed on macOS; native 15 and parity 4. |
| Covered by automated Windows branch tests | Injected `win32` path/branch tests in earlier audio, provider, calendar, window and native-binding suites; simulated coverage only. |
| Build validated on macOS | Earlier Electron → renderer → Electron builds passed; Phase 15 arm64 native build passed, full macOS package failed at `actool`. No build rerun in this reporting phase. |
| Build validated on Windows | No; Windows CI has not run. |
| Reviewed but not executed on macOS | Apple Speech packaged helper, system-audio frame delivery, native log drain, fallback rescue, many OAuth/knowledge/phone/installer paths. |
| Reviewed but not executed on Windows | All Windows runtime capture, native helpers, UI/shortcut and package paths. |
| Requires physical macOS verification | Full signed package and helpers after Xcode repair, live system audio/native log, remaining integrations and window behavior. |
| Requires physical Windows verification | Windows `.node`, WASAPI and mic/permission flows, NSIS package, UI/shortcuts, providers and integrations. |

### Commands executed in this reporting phase

```text
git log --oneline main..HEAD
git show --pretty=format: --name-only <commit>  # each branch commit
npm run typecheck
npm run typecheck:electron
npm run typecheck:premium
node --test electron/audio/__tests__/SystemAudioNativeLogDrain2026_11_12.test.mjs electron/audio/__tests__/NativeBindingsCoverBothPlatforms2026_11_07.test.mjs electron/audio/__tests__/NativeModuleLoadFailureLog2026_10_21.test.mjs electron/audio/__tests__/NativeDodoSoftRequired.test.mjs electron/audio/__tests__/NativeAbiGuardStartupOrder.test.mjs electron/llm/__tests__/AnswerLengthWiring320.test.mjs electron/context-intelligence/__tests__/ModeSourceContractOrder320.test.mjs
```

## Ship verdict

This branch is close in the compared TypeScript/JavaScript paths but cannot yet ship with a defensible “3.2.0-equivalent” claim. Minimum release steps are to repair Xcode and complete/inspect a full macOS package with helpers and x64 native build, run the Windows CI/package and physical Windows capture checks, observe live macOS system-audio frames and native log drain, exercise F060 rescue with two enabled providers, and resolve the premium typecheck diagnostics. Held billing, licence, trial, pack, development and OAuth credential differences remain intentional release decisions.
