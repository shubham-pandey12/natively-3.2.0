# Phase 8: Answering parity (F024–F039)

Reference: installed signed 3.2.0 at `/Users/shubhampandey/.codex/visualizations/2026/11/18/01a1ee13-ada0-71a0-8c34-3af68ba0e2ae/ref-3.2.0`.

The installed app is authoritative. Renderer reference chunks are minified, so their evidence locations are line 1 of the named chunk; main-process bundle locations below point to embedded module markers. Local line references point to source. The `code-review-graph` tools required by `AGENTS.md` were unavailable in this session; targeted AREA-MAP discovery, module comparisons, and source searches were used instead.

## Verdicts

This table preserves the initial Phase 8 audit. For F024, F026, F028, F034, F035, and F039, the final status and close-out evidence below supersede the initial verdict and basis.

| ID | Feature | Verdict | Local evidence | Installed 3.2.0 evidence | Basis |
| --- | --- | --- | --- | --- | --- |
| F024 | What to Say | Partial | `src/components/NativelyInterface.tsx:8361-8652`; `electron/IntelligenceEngine.ts:2306-7549` | `NativelyInterface-ikIwHUKF.js:1`; `main.js:235589-235619` | Trigger, typed input, and backend path exist. The runtime answer observed was the manual-chat answer; the quick-action path itself was not independently completed against typed context. |
| F025 | Auto Answer | Implemented | Prior audit: premium code byte-identical, 25/25 modules, 139 passing tests; integration at `src/components/NativelyInterface.tsx:1536-1538` and `electron/IntelligenceManager.ts:320-324` | `NativelyInterface-ikIwHUKF.js:1`; `main.js` Auto Answer integration; prior manifest `2026.11.14-student-yt2` | Prior verification retained. This phase checked UI access-notice and engine/manager integration only; the premium implementation was not re-audited. |
| F026 | Fast Response | Partial | `electron/LLMHelper.ts:14174-14373`; `src/components/SettingsPopup.tsx:445-453` | `main.js:172683-182666`; `NativelyInterface-ikIwHUKF.js:1` | Setting and text-answer routing exist. Full provider/fallback ordering and live toggle behavior were not exhaustively compared; route-order differences belong with F060. |
| F027 | Answer length and word caps | Implemented | `electron/llm/answerLength.ts:1-30`; `electron/IntelligenceEngine.ts:3675`; `electron/ipcHandlers.ts:9082-9089` | `main.js:159022-159064`; `ipcHandlers.js:1` | `answerLength` module is identical. IPC handler registrations/mappings match the installed build. |
| F028 | Modes and custom modes | Partial | `premium/src/ModesSettings.tsx:2670-2774`; `electron/services/ModesManager.ts:1440-1529`; `src/components/NativelyInterface.tsx:2313-2340` | `App-C2irX2ey.js:1`; `main.js:206720-206808` | Mode manager and UI exist. The compared module has only a documentation-comment difference; mode switching itself was not exercised. |
| F029 | Clarify | Implemented | `electron/IntelligenceEngine.ts:8296`; `electron/llm/ClarifyLLM.ts` | `main.js:231469-231472` | `ClarifyLLM` module identical. |
| F030 | Recap | Implemented | `electron/IntelligenceEngine.ts:8194`; `electron/llm/RecapLLM.ts` | `main.js:231729-231732` | `RecapLLM` module identical; focused action/prompt tests passed under Electron. |
| F031 | Follow-up | Implemented | `electron/IntelligenceEngine.ts:8554`; `electron/llm/FollowUpLLM.ts` | `main.js:231600-231603` | `FollowUpLLM` module identical. |
| F032 | Brainstorm | Implemented | `electron/IntelligenceEngine.ts:9000`; `electron/llm/BrainstormLLM.ts` | `main.js:231357-231360` | `BrainstormLLM` module identical. |
| F033 | Manual chat | Implemented | `electron/IntelligenceEngine.ts:8654-8703`; `src/components/NativelyInterface.tsx:6175-6684` | `main.js:535775`; `NativelyInterface-ikIwHUKF.js:1` | A typed prompt produced a complete answer in the overlay. |
| F034 | Stop and cancel | Partial | `src/components/NativelyInterface.tsx:5676,7430,7519`; `electron/IntelligenceEngine.ts:1813-1817` | `main.js:1`; `ipcHandlers.js:1` | Cancellation surfaces and paths exist; code-level cancellation tests ran, but stopping a live renderer stream was not exercised. |
| F035 | Regenerate and copy | Partial | `src/components/NativelyInterface.tsx:10485-10499` (answer-card/copy surface); `src/components/NativelyInterface.tsx:175-220` (code copy) | `NativelyInterface-ikIwHUKF.js:1`; code-copy chunk in `asar/dist/assets:1` | Regenerate and clipboard interaction were not exercised in CDP. |
| F036 | Code blocks | Implemented | `src/components/NativelyInterface.tsx:175-220,10305-10454` | `NativelyInterface-ikIwHUKF.js:1`; syntax/markdown chunks in `asar/dist/assets:1` | Renderer source and existing component tests cover code rendering/copy behavior. |
| F037 | Diagrams | Implemented | `src/components/NativelyInterface.tsx:10381-10454`; `src/components/diagram/DiagramAwareMarkdown.tsx:1` | `diagram-UQ7AKVKN.js:1` plus 32 companion chunks | All 33 diagram chunks matched. Diagram unit, card, and overlay stream checks passed on rerun. |
| F038 | Notices | Implemented | `src/components/NativelyInterface.tsx:584-665,7145-7319` | `NativelyInterface-ikIwHUKF.js:1` | Notice state/rendering paths exist; component tests passed. A full CDP notice matrix was not run. |
| F039 | Quiet notes | Partial | `src/components/NativelyInterface.tsx:608,8606` | `NativelyInterface-ikIwHUKF.js:1` | Quiet-note state/rendering exists; no direct runtime scenario was exercised. |

No clear, contained behavior gap was confirmed, so no product code or tests were changed. Partial verdicts identify incomplete runtime or route-depth coverage, not a confirmed missing implementation.

## Difference classification

### Expected

- `WhatToAnswerLLM` differs only in generated parameter names (`ms2`/`ms3`) in a timeout helper.
- `NativelyInterface` differs in import aliases and local variable names in the typed-request path. The visible request fallback remains “What should I say?”. These are bundler/minifier differences.
- `ClarifyLLM`, `RecapLLM`, `FollowUpLLM`, `BrainstormLLM`, `answerLength`, and all 33 diagram chunks compared identical.
- `ModesManager` differs only in the comment above `replaceNoteSectionsWith`; the compiled note-section code and behavior match.
- IPC registration comparison found 686 distinct handler channels, 699 registrations, and 139 main-to-renderer channels in both builds; all 825 comparison rows matched. This agrees with the Phase 7 result; generated occurrence counts and gated names are scanner-specific.

### Gap

- No confirmed F024–F039 code gap from the inspected module comparisons. F026/F060 source routing parity is closed in the Close-out section; the eligible Fast Response route remains untested at runtime.

## Prompt and default-value comparison

- What-to-answer, Clarify, Recap, Follow-up, Brainstorm, and answer-length module comparisons showed no prompt/default behavior change; the single What-to-answer diff is a local variable rename.
- The What-to-answer typed fallback string is present in both renderer builds. Stream start/abort lifecycle has local explicit handling in `IntelligenceEngine.ts` and `NativelyInterface.tsx`; full action-specific timeout/model/default tables were not exhaustively transcribed because the module diff reported no substantive prompt changes.
- Provider/model choice, fallback order, timeout values, and routing exclusions are closed by the F026/F060 source comparison in Close-out. The eligible fast route was not runtime-tested because the isolated profile had no configured provider/model.
- No Auto Answer model/default comparison was repeated. Phase 1 verification remains authoritative for F025.

## Runtime via agent-browser CDP

The isolated `npm run dev:agent` instance started with its worktree-local user data. Target selection was confirmed with `location.search` before snapshots.

- Overlay document: `?window=overlay`; launcher document: `?window=launcher`.
- Typed prompt was submitted through the overlay composer and returned a complete answer. This verifies the manual-chat path (F033). It does not establish a completed What-to-Say action (F024).
- The Modes button opened the Modes Manager. No mode was changed or persisted.
- The “Start Natively” launcher CTA unexpectedly began a meeting and the app started microphone capture automatically. The instance was stopped through the launcher process; audio/capture was not part of the intended renderer subset and is not considered verified. Its isolated test profile/database was left untouched.
- Regenerate, copy, stop/cancel, code-block response, diagram response, and all notices were not manually driven in this CDP session. Diagram stream/card/repair behavior was covered by automated renderer checks instead.
- Captured console/errors included standard Electron security warnings, update-check errors (`Please check update first`), an unavailable preload during a stale Vite renderer reload, a `getCanAutoUpdate` launcher render error during that reload, and a 401 from a stored Claude model-catalog request. No answering-path uncaught error was observed during the successful typed response. These are runtime observations, not conclusions about 3.2.0 parity.
- Network capture showed local renderer assets and analytics collection. No live audio was intentionally enabled through the microphone toggle.

## Validation

- `npm run typecheck:electron` — passed.
- `npm run typecheck:premium` — failed only on the known `premium/electron/knowledge/HeuristicExtractor.ts` `never` property errors (`bullets`, `role`, `start_date`, `end_date`, `company`, `degree`, `gpa`, `institution`).
- `npm run test:llm` — 6,713 passed, 34 skipped, 1 failed. The failure was `QuickActionTurnRequest2026_10_09.test.mjs`'s legacy mode-template fixture under plain Node; its file documents that this fixture needs Electron. Re-run with Electron passed 27/27.
- `npm run test:components` — 954 passed, 2 skipped.
- `npm run test:intelligence` — 3,255 passed, 2 skipped, 9 todo. Plain Node logged expected native `better-sqlite3` ABI mismatch diagnostics (`NODE_MODULE_VERSION 148` vs 137) in database-backed fixtures; the suite completed successfully.
- `npm run test:diagram` — all diagram unit, contract, render, and card checks passed; the overlay timing subcheck failed three assertions on its first run. Re-running `node tests/diagram/overlay-stream.check.mjs` passed all checks.
- `npm run build:electron && npm run build && npm run build:electron` — passed in the requested order. The renderer build emitted the existing large-chunk warning.
- Post-build comparisons: action modules and answer length as listed above; 33/33 diagram chunks identical; IPC comparison rows matched.

### Cross-platform analysis

- **Expected macOS behavior:** `CommandOrControl+1` invokes What to Answer; renderer clipboard actions use the shared Electron clipboard bridge and the app's native clipboard provider.
- **Expected Windows behavior:** the same `CommandOrControl+1` mapping resolves to Ctrl, and clipboard actions use the same Electron bridge backed by Windows clipboard behavior.
- **Implementations reviewed:** shared keybind table `electron/services/KeybindManager.ts:24-51`; main-process handling `electron/main.ts:2357-2406`; clipboard API `electron/preload.ts:1013-1014,3200,3458-3459`; source `src/lib/copyText.ts:17-28`. No platform adapter or shortcut implementation was changed.
- **Affected flows:** global quick-action shortcut → main-process dispatch → `IntelligenceManager`/`IntelligenceEngine` → answer stream → renderer answer card; typed composer → manual-chat path; mode manager → persisted active mode; clipboard bridge → copy action.
- **Impact radius and regressions:** documentation only, so runtime behavior has no new regression surface. The unresolved risks are coverage of provider selection, stop/cancel UI timing, and clipboard interaction on the two operating systems.
- **Tested physically on macOS:** renderer interaction via CDP for launcher/overlay selection, typed manual chat, and Modes Manager opening. The app also started microphone capture after the launcher CTA; this is recorded as an unintended side effect, not as feature verification.
- **Reviewed but not executed on Windows:** shared renderer, shortcut abstractions, IPC mappings, and answer code. No Windows execution environment or Windows packaged reference was available in this session.
- **Requires physical macOS verification:** stop/cancel during active streaming, shortcut-driven What-to-Say, clipboard permission/behavior, and non-renderer window interactions.
- **Requires physical Windows verification:** the same interactions, including Ctrl modifier mapping, clipboard behavior, and native window/focus behavior.

These statements distinguish code review and automation from device execution; no Windows behavior is claimed as physically verified.

## Hand-off list

- **F026/F060 — runtime route only:** source/provider/model/fallback/timeout/exclusion comparison is complete and identical apart from the generated parameter alias; runtime fast routing still needs an isolated profile with an eligible configured model.
- **F034/F035/F039 — remaining UI coverage:** direct Stop and timed post-cancel chunk checks, regenerate/copy plus clipboard readback, and quiet notes remain open. Quiet-note live-stream cases require a meeting and are deferred to Phase 3.
- **F025 — no repeat audit:** retain the prior `2026.11.14-student-yt2` verification; only revisit if integration changes.
- **F040+ — capture:** investigate the meeting/microphone startup observed during the CTA only in the capture phase; no capture implementation was changed here.

## Change summary

- Files changed: `docs/parity/phase8-answering.md` (this report) and F024–F039 verdict rows in `docs/parity/phase6-feature-catalogue.md`.
- No product source, tests, fixtures, build settings, or platform adapters changed. No changes were staged or committed.
- Impact radius: documentation only. No user data was deleted or rewritten; the isolated dev profile was retained.
- Remaining risk: runtime Fast Response routing, Stop/cancel timing, clipboard controls, and meeting-dependent quiet notes remain incomplete. Windows was reviewed but not physically executed.

## Commands executed

- Repository/area discovery: `git status --short --branch`, `cat CLAUDE.md`, AREA-MAP reads, and targeted `rg` searches.
- Reference comparisons: `tools/compare.mjs` on `IntelligenceManager.js`, `LLMHelper.js`, `main.js`, `ipcHandlers.js`, renderer asset directories, and the What-to-answer/Clarify/Recap/Follow-up/Brainstorm/ModesManager/answerLength filters.
- Runtime: `agent-browser skills get core`, `agent-browser skills get electron`, `npm run dev:agent`, and configured agent-browser tab/snapshot/eval/read/console/errors/network commands.
- Cross-platform source review: targeted `rg` searches in `electron/services/KeybindManager.ts`, `electron/main.ts`, `electron/preload.ts`, and `src/lib/copyText.ts` for both platform-sensitive shortcut dispatch and clipboard API paths.
- Validation: typechecks, `npm run test:llm`, `npm run test:components`, `npm run test:intelligence`, `npm run test:diagram`, `ELECTRON_RUN_AS_NODE=1 npx electron --test electron/llm/__tests__/QuickActionTurnRequest2026_10_09.test.mjs`, `node tests/diagram/overlay-stream.check.mjs`, and the three-build sequence above.

## Close-out

Close-out run against the installed 3.2.0 reference above. The app used the real licence in its isolated worktree profile (`.agent/userdata`); `NATIVELY_DEV_PREMIUM` was unset. No meeting, microphone, or system-audio capture was started. The active mode and Fast Response setting were restored to their original profile state before quitting through the launcher's **Quit Natively** control. The original custom mode `Flow Test Renamed` retained its prompt and ID. No custom mode was created or deleted.

| ID | Runtime steps and evidence | 3.2.0 comparison / limitation | Close-out verdict |
| --- | --- | --- | --- |
| F024 | In `?window=overlay`, entered context in the composer and clicked **What to answer?**, not Send. Console recorded `[Analytics] command_executed {command_type: "what_to_say"}` and network capture showed the matching `command_executed` analytics request (204). The UI rendered a complete response: “What are you responding to? Share the message or situation, and I’ll help you draft a reply.” | The response is the empty-context fallback: the quick action does not consume the unsent composer draft, and there was no meeting transcript. The What-to-answer implementation comparison was identical apart from generated names. No runtime or source gap against 3.2.0 was found. | **Implemented** — quick action path and complete response exercised; typed draft is not WTS context without a live source, matching 3.2.0. |
| F026 | Opened launcher **Settings → AI Providers** and inspected the current profile. The active model was Codex CLI, `getFastModel()` returned `{model:null}`, provider credentials were empty, integrations were disabled, and the Fast Response Mode switch was disabled. SettingsPopup's Fast Response toggle changed state in the earlier part of this isolated run, but no eligible fast model could be routed on the next answer request. A final profile check showed the SettingsPopup Fast Response toggle off, its initial state. | `compare.mjs ... --filter LLMHelper` found only a generated callback-parameter rename (`ms3` locally vs `ms2` in 3.2.0) in the first-token timing helper; this is a bundler/minifier-only difference. Provider/model choice, fallback order, timeout values, and routing exclusions are identical. The scanner's local-only module-path rows are dependency-resolution artifacts, not missing reference logic. **F060 shares this source-parity result.** | **Implemented (source parity)** — routing behavior is identical to 3.2.0. Fast-route runtime proof remains unavailable because this isolated profile has no eligible provider/model. |
| F028 | Opened **Modes**, selected built-in **General**, and pressed **Set active**. `modesGetActive()` returned `id:"mode_general_default", name:"General", isActive:true`. A subsequent typed overlay answer rendered: “I led a five-person team that streamlined our onboarding process, reducing the time required by 30% while maintaining a strong employee experience.” Then selected the original **Flow Test Renamed** custom mode, pressed **Set active**, and verified the original mode ID/name and `isActive:true` through `modesGetActive()`. | Local/installed ModesManager comparison differed only in a documentation comment; no behavioral difference. The test profile was restored. | **Implemented** — built-in switching and the following manual answer were exercised; original custom mode restored. |
| F034 | Submitted a 2,000-word transit-history essay request in the overlay. While partial sections were streaming, pressed **Meta+R** (macOS `CommandOrControl+R`, the General Reset / Cancel binding). The next snapshot showed an empty answer area and composer returned idle; `agent-browser errors` had no renderer errors. No Stop control was exposed. The post-cancel snapshot was idle; a separate timed assertion for zero subsequent chunks was not made. | Cancellation handler and reset binding are present in local and 3.2.0 code/IPC. The direct Stop-button path could not be exercised because the renderer exposed no Stop button; key injection is renderer automation, not physical keyboard verification. | **Partial** — shortcut cancellation exercised; direct Stop, zero-later-chunk timing, and physical shortcut behavior remain unverified. |
| F035 | Generated a JavaScript code-block answer. Snapshot showed the answer and code, but no regenerate or answer-copy control. The current theme rendered a language header and no code-copy button; therefore neither requested clipboard readback could be performed through the app's controls. | Source/bundle comparison did not identify a 3.2.0 difference. The source explicitly documents that answer cards have no copy button; the code-copy control is theme-dependent and was not exposed by this renderer state. | **Partial** — regenerate, answer-copy, code-copy, and clipboard contents were not runtime-verified. |
| F039 | Exercised What to Say without starting a meeting. It returned the normal complete empty-context fallback above; no quiet note rendered. | Exact local triggers: `noneYet` when `generateWhatToSay()` resolves with `answer == null` (`NativelyInterface.tsx:8606`); `stopped` when a Direct Assist answer is cancelled (`:7181`, only retained as a note when there is partial answer text); `superseded` when a newer Direct Assist request replaces the active one (`:7423`, likewise retained for partial text); and `late` when a stale answer arrives after its original live row is gone or needs its question attached (`:2439-2440,7963`). The renderer comparison found no difference from 3.2.0. | **Partial** — the safe no-meeting request returned non-null answer text. `noneYet` needs a null WTS result; stopped/superseded/late cases require a cancelled, replaced, or stale Direct Assist answer lifecycle. These triggers were not produced safely in this profile; live-stream cases are deferred to Phase 3. |

### F026 routing comparison detail

Compared local `electron/LLMHelper.ts:14174-14373` with installed `main.js:172683-182666` using the reference `tools/compare.mjs` from the repository root. The module comparison reported a single semantic-neutral generated parameter-name change in the first-token timing helper. The following behavior is identical in the compared module: Fast Response provider and model selection; fallback ordering when a pick is unavailable; timeout constants and handling; and the active-model/provider exclusions (including the Codex CLI and self-hosted Auto-pick exclusions). `--filter Fast` also reported the `autoFastRanking.js` module identical. The remaining local-only dependency path rows are scanner artifacts. This closes the source comparison for F026 and F060, but not the runtime fast-route proof.

### Runtime diagnostics and profile state

- `agent-browser console` after clearing the overlay log showed local asset loads, the `what_to_say` command analytics event, and its successful analytics POST. `agent-browser errors` returned no renderer errors after the exercised answering scenarios.
- `agent-browser network requests` showed local renderer assets and analytics collection; no provider request occurred for the ineligible Fast Response route. The earlier app stdout contained the known stored Claude model-catalog 401 and development update-check noise. These were pre-existing and unrelated to the typed answer interactions. Shutdown emitted Chromium/macOS task-policy diagnostics after the app logged `[Lifecycle] clean exit (preserved quitReason=user-quit)`; no capture session was active.
- Startup confirmed licence validation `status=200, valid=true`; no dev-premium override was used. Stability heartbeats reported `isMeetingActive:false`. A final run confirmed the SettingsPopup Fast Response toggle was off, matching its original state; the original custom mode was still active. The launcher quit control shut down the app cleanly and retained the isolated profile.

### Platform and validation report

- **Tested physically on macOS:** launcher and renderer UI interactions via CDP for F024, F028, F034, F035 and settings inspection for F026. The keyboard shortcut was injected through renderer automation; it is not counted as a physical keyboard event. Quiet-note live lifecycle and native clipboard behavior were not exercised.
- **Reviewed but not executed on Windows:** shared implementation and platform abstractions. No Windows app or hardware was available in this session.
- **Requires physical macOS verification:** actual keyboard shortcut event delivery, direct Stop UI if available in a meeting, clipboard readback, and quiet-note behavior with a live meeting.
- **Requires physical Windows verification:** shortcut/modifier delivery, clipboard, direct Stop, and any live-meeting quiet-note path.
- No source, test, fixture, build, or configuration files changed in this close-out; no tests or builds were run for this documentation-only change.

### Commands run for this close-out

- `AGENT_BROWSER_CONFIG=$PWD/agent-browser.json agent-browser skills get core`
- `AGENT_BROWSER_CONFIG=$PWD/agent-browser.json agent-browser skills get electron`
- `npm run dev:agent` (three launches across the close-out, including the safe restart and final profile-state check; same isolated user-data directory)
- Configured `agent-browser` tab selection, `eval location.search`, `snapshot -i`, typed-composer, click, console, errors, and network commands; no `--auto-connect` and no browser close command.
- `node /Users/shubhampandey/.codex/visualizations/2026/11/18/01a1ee13-ada0-71a0-8c34-3af68ba0e2ae/tools/compare.mjs dist-electron/electron /Users/shubhampandey/.codex/visualizations/2026/11/18/01a1ee13-ada0-71a0-8c34-3af68ba0e2ae/ref-3.2.0/asar/dist-electron/electron/main.js --filter LLMHelper` (scanner exit 1 due to one parameter-name-only diff and local-only path rows)
- Same `compare.mjs` invocation with `--filter Fast` (scanner exit 1 due to local-only path rows; `autoFastRanking.js` identical)
- Targeted source inspections of `LLMHelper.ts`, `NativelyInterface.tsx`, `KeybindManager.ts`, and `IntelligenceEngine.ts`.
- `git diff --check` (passed)

No changes were committed. The working changes to this report and the feature catalogue remain unstaged; pre-existing staged changes were left untouched.
