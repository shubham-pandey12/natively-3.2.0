# Phase 5: UI surfaces parity (F001–F023)

## Method

- Read `CLAUDE.md` and the reference `AREA-MAP.md`. The code-review-graph MCP tools were unavailable, so discovery used targeted `rg`, source reads, the supplied bundle comparator, and the supplied module split/diff scripts.
- Built local output in the required order: `npm run build:electron`, `npm run build`, `npm run build:electron`.
- Compared the 3.2.0 reference read-only. Bundle bytes were read as latin1; `diff -a` was used for generated bundle diffs. Renderer chunks were matched by filename without their Vite hash. For differing chunks, string and template literal sets were compared; generated asset-hash imports were treated as names, not UI copy.
- Compared window modules by esbuild `// <path>` headers, with bundler-generated numeric identifiers normalized for rename-only classification. Read the one real module difference.
- Compared `SETTINGS_NAV_ORDER`, route names, i18n string/key literals, stylesheet class/custom-property sets, and image asset names/content hashes.
- Runtime used `npm run dev:agent` and `AGENT_BROWSER_CONFIG=$PWD/agent-browser.json`. Before every snapshot, `location.search` was checked. Settings and an existing meeting were inspected read-only; no credential, provider, plan, licence, meeting-delete, or save controls were used. The existing meeting detail and its Notes window were opened and left unchanged. The app was quit through **Quit Natively**.

## Chunk counts

| Comparison | Local | Reference | Result |
|---|---:|---:|---|
| JavaScript renderer chunks | 77 | 77 | 0 missing, 0 extra |
| Identical after hash normalization | 67 | 67 | Identical |
| Differing after hash normalization | 10 | 10 | Listed below |

## Per-chunk results and string-set differences

| Chunk | Result after hash normalization | String/template set delta and feature classification |
|---|---|---|
| `App.js` | Differing | F001/F012: plan and pack copy differs, including “For two busy weeks…” and the local pack-hours explanation versus the reference’s shorter copy. Reference-only Pro gating/mode and pack-provider notices also differ. These are the documented billing/licence/plan/pack holds: **Expected**, not fixed. F001 also contains local trial copy whose reference-only counterpart is in `useResolvedTheme.js`; trial copy is a baseline hold. Remaining deltas are icon path/name literals and hash-bearing asset names, not text. |
| `AuxRoot.js` | Differing | Only hash-bearing imports for the same route chunks; **Expected rename-only**. |
| `Cropper.js` | Differing | Icon-vendor import hash/export alias only; no user-facing string delta; **Expected rename-only**. |
| `ModelSelectorWindow.js` | Differing | Hashed imports and generated export aliases only; no user-facing string delta; **Expected rename-only**. |
| `NativelyInterface.js` | Differing | Hashed imports and minifier identifier renames only; no user-facing string delta; **Expected rename-only**. This covers the overlay, TopPill wiring, capture notices, page-context labels, and Direct Assist copy. |
| `NotesWindow.js` | Differing | Local-only string `active`. Local inlines the guide-active predicate (`status === "active"` plus the four guide steps); the reference calls a shared helper implementing the same predicate. **Expected equivalent factoring**, no behavior gap established. No rendered-copy delta. |
| `SettingsPopup.js` | Differing | Hashed imports/export aliases only; no user-facing string delta; **Expected rename-only**. |
| `i18n.js` | Differing in raw bundler text | The 5,289 distinct string/key literals match exactly as sets; **Expected bundler ordering/formatting only**. |
| `icon-vendor.js` | Differing | Reference includes `CircleCheck`, `CircleDashed`, `CircleDollarSign`, and `CircleStop` exports and their SVG path literals; local and reference icon-vendor export sets differ. These are icon implementation literals, not missing text. The runtime snapshots rendered the sampled controls; **Extra/version churn**, not a proven UI gap. |
| `useResolvedTheme.js` | Differing | Reference-only trial messages/keys (`no_trial`, `trial_out`, `trial_unavailable`, “Your free trial…”, “Keep Natively Pro…”); **Expected** under the trial/licence hold. |

The exact non-icon user-facing `App.js` text delta is limited to the held plans/packs/Pro/trial content above. For example, the reference’s “Unlock Pro to access 9 expert modes…” and Natively API pack-provider notice are absent locally; the local “2 meeting hours within 7 days” and longer pack explanation are absent from the reference. No non-held capture, window, settings-tab, or overlay copy delta was found. `NotesWindow.js`’s `active` literal is implementation state, not displayed copy.

## Navigation, routes, i18n, CSS, and assets

- `SETTINGS_NAV_ORDER` is identical on both sides: `general`, `plans`, `ai-providers`, `retrieval`, `audio`, `overlay`, `calendar`, `keybinds`, `phone-mirror`, `connections`, `intelligence`, `help`, `about`. Runtime labels in the same order were General, Plans & Billing, AI Providers, Retrieval, Audio, Overlay, Calendar, Keybinds, Companion, Connectors, Intelligence, Setup & Help, About.
- Both sides contain the same eight renderer routes: `launcher`, `overlay`, `overlay-pill`, `overlay-toggle`, `settings`, `cropper`, `model-selector`, `notes`. All eight were observed locally, including `?window=notes` after opening an existing meeting’s notepad. `?window=settings` is the small SettingsPopup; Settings tabs are in the launcher document.
- `i18n.js`: 5,289 distinct string/key literals on each side; sets equal.
- Stylesheet class/custom-property counts (local/reference): `App.css` 399/400 classes and 225/225 custom properties; reference-only class `api-tier-save-inline` is billing-related. `NativelyInterface.css` 69/69 and 70/70; `NotesWindow.css` 7/7 and 12/12; `useResolvedTheme.css` 45/45 and 33/33. `index.css` has 1,298/1,479 generated classes (no local-only class; 181 reference-only utility selectors) and 423/424 custom properties (reference-only `tw-divide-x-reverse`). The additional selectors are consistent with reference-only Pro/plan content and generated utilities; no missing local style was evidenced by the observed surfaces.
- Image/icon asset files: 28 on each side. Four local names repeat their hash suffix (`BE-black…`, `jd…`, `pro…`, `profile…`); each counterpart has the single suffix. SHA-256 contents match pairwise. No missing or extra image content.

## Window modules and main-process diff

Compared the nine window-related modules selected from `dist-electron/electron/main.js` and the reference bundle:

- **Identical: 1** — `electron/services/assist/reminderDraftWindow.ts`.
- **Rename-only: 7** — `electron/WindowHelper.ts`, `electron/SettingsWindowHelper.ts`, `electron/ModelSelectorWindowHelper.ts`, `electron/utils/notesWindowPolicy.ts`, `electron/NotesWindowHelper.ts`, `electron/CropperWindowHelper.ts`, `electron/services/foreignWindowCaptureGuard.ts`.
- **Real difference: 1** — `electron/main.ts`.

All seven window-helper differences reduce to generated identifier numbering. Window route construction, BrowserWindow options, and platform branches in those helpers match after that normalization. Local evidence: `electron/WindowHelper.ts:687,900,1800-1832`, `electron/SettingsWindowHelper.ts:254,276`, `electron/ModelSelectorWindowHelper.ts:306,328`, `electron/NotesWindowHelper.ts:193,210`, and `electron/CropperWindowHelper.ts:845,958`. Reference evidence: corresponding `asar/dist-electron/electron/{WindowHelper,SettingsWindowHelper,ModelSelectorWindowHelper,NotesWindowHelper,CropperWindowHelper}.js:1` modules.

The prior `electron/main.ts` answer-length difference was corrected after this comparison; the registration now resides in `electron/ipcHandlers.ts:1096-1097`, matching 3.2.0. See the correction below. IPC parity remains as recorded in [phase7-ipc.md](phase7-ipc.md).

The route set is shared: `?window=launcher`, `overlay`, `settings`, `model-selector`, `notes`, and `cropper` are explicit helper URLs; `overlay-pill` and `overlay-toggle` are the two auxiliary-window routes. The local and reference window helpers both use the same preload/resource-relative paths. The reference bundle does not expose separate Windows native `.node` artifacts; this phase does not inspect or load native binaries.

## Runtime results

All snapshots were from local Electron on macOS. `agent-browser errors` returned no uncaught renderer errors. Console output included the expected dev-build Chromium security warnings (`webSecurity` disabled and `allowRunningInsecureContent`), React DevTools notices, and one Radix missing-dialog-description warning. Startup logged no configured Natively API key and the LLM client remained uninitialized; no AI request was made. Audio/STT capture was not started, so there are no capture/STT runtime log lines to report.

| Window / route | Runtime result |
|---|---|
| Launcher `?window=launcher` | Rendered “Natively”, “Start Natively”, calendar card, and existing meeting list. No meeting was started or deleted. |
| Overlay `?window=overlay` | Rendered “What to answer?”, Clarify, Recap, Follow Up Question, Speak, input, model picker, and mouse-passthrough control. Capture/shortcut behavior not activated. |
| Pill `?window=overlay-pill` | Rendered Natively, Hide, Stop. |
| Toggle `?window=overlay-toggle` | Rendered “Expand panel width”. |
| SettingsPopup `?window=settings` | Rendered Detectable, Fast Response, Transcript switches; values were read and left unchanged. |
| Cropper `?window=cropper` | Route loaded; interactive snapshot was an empty crop surface because no screenshot-selection gesture was initiated. |
| Model selector `?window=model-selector` | Rendered model list with Default (GPT-5.6-Luna) selected; selection unchanged. |
| Notes `?window=notes` | Opened from an existing meeting’s “Open in notepad”; rendered title, Today, Notes template, Copy, Share, Summary, My notes/Enhanced, and Ask anything. No edits. |
| Meeting details | Opened existing “Unstructured remarks”; Summary, Transcript, Usage, Share, evidence, and ask controls rendered. No action was taken. |

| Settings tab | Runtime result |
|---|---|
| General | “General settings”, Detectable, Open Natively when you log in, Auto Answer, Ambient AI Chat, Theme, Language, Version, Process Disguise. |
| Plans | “Plans & Billing” and licence/checkout controls rendered but left untouched; **Held**. |
| AI Providers | Provider tabs and cards rendered; all provider/key controls left untouched. UI strings/layout checked here; underlying provider parity is covered by [phase10-providers.md](phase10-providers.md). |
| Retrieval | Embedding/Reranker tabs and fallback switch rendered; unchanged. |
| Audio | Deepgram, speech model, Core Audio, microphone/speaker selectors, dictionary, and audio behavior switches rendered; unchanged. |
| Overlay | Meeting overlay/notepad radio controls, interface style, answer length, screenshot question rendered; unchanged. |
| Calendar | Calendar providers and detect/start/end/snapshot switches rendered; no connection action. |
| Keybinds | Keyboard shortcuts and Global shortcuts control rendered; no shortcut capture or change. |
| Phone mirror | Phone Mirror, LAN access, browser companion and detector controls rendered; unchanged. |
| Connections | Gmail/Slack/Notion/CRM/automation/MCP entries rendered; no connector action. |
| Intelligence | Skills, notes/answers, memory and provider-performance controls rendered; unchanged. |
| Help | Get started, guide list, shortcuts, and help cards rendered; no guide launch or external link. |
| About | What’s New, How Natively Works, Privacy & Data, Reviews and About Natively rendered; no external link. |

The local UI snapshot confirms the “Start Natively” CTA’s state, while source comparison confirms the behavior: local `Launcher.tsx:1127-1134` emits the meeting event and calls `onStartMeeting`; `App.tsx:1180-1200` calls `startMeeting` with saved input/output device IDs. Reference `App-C2irX2ey.js:1` has the same CTA event + start callback sequence. **3.2.0 also starts a meeting and requests the microphone through the start-meeting pipeline.** This CTA was not clicked in this read-only runtime.

The app was quit via the in-app Quit Natively button. Main logs showed `before-quit reason=user-quit`, cropper listener/window disposal, credential memory scrub, and `clean exit`; the app and its worktree-local renderer/helper processes were no longer running afterward.

## Per-feature verdicts and difference classification

| ID | Verdict | Difference classification / evidence |
|---|---|---|
| F001 Launcher | Partial | **Expected** held plan/trial promotional copy and icon/version churn in App; UI ran, but native window behavior still needs physical macOS/Windows checks. Local `Launcher.tsx:103,1127`; reference `App-C2irX2ey.js:1`. |
| F002 Overlay / NativelyInterface | Partial | **Expected** hash/identifier-only chunk differences; DOM rendered, but capture and native window behavior were not exercised. Local `NativelyInterface.tsx:10686,13525`; reference `NativelyInterface-ikIwHUKF.js:1`. |
| F003 TopPill | Partial | **Expected** import/icon implementation churn; DOM rendered, but drag/focus/window-level behavior needs physical checks. Local `ui/TopPill.tsx:42`; reference `NativelyInterface-ikIwHUKF.js:1`. |
| F004 Notes window | Partial | **Expected** equivalent local inline guide predicate versus reference shared helper; Notes rendered from an existing meeting, but native window behavior is unverified. Local `NotesWindow.tsx:149,186`; reference `NotesWindow-C6aKiJKb.js:1`, `useResolvedTheme-EStphwh1.js:1`. |
| F005 Settings popup | Partial | **Expected** hashed imports only; DOM rendered, but native window bounds/focus were not physically validated. Local `SettingsPopup.tsx:72`; reference `SettingsPopup-CLSGPgiv.js:1`. |
| F006 Cropper | Partial | **Expected** hash/export alias only; route loaded but crop gesture/capture was not exercised. Local `Cropper.tsx:319`, `CropperWindowHelper.ts:845,958`; reference `Cropper-IZeWKP0W.js:1`, `CropperWindowHelper.js:1`. |
| F007 Meeting list | Partial | No non-held string gap; list rendered, but profile-specific row data is not parity evidence. Local `Launcher.tsx:925`; reference `App-C2irX2ey.js:1`. |
| F008 Meeting details | Partial | No non-held string gap; existing detail rendered read-only, but no comparison of meeting-specific stored data is meaningful. Local `Launcher.tsx:973-975`, `MeetingDetails.tsx:1`; reference `App-C2irX2ey.js:1`. |
| F009 Onboarding and welcome | Partial | Static bundle/source comparison only; existing profile was not reset to trigger first-run onboarding. Local `App.tsx:1423-1444`; reference `App-C2irX2ey.js:1`. |
| F010 First-run guide | Partial | Help surface rendered, but the first-run guide was not forced by resetting profile state. Local `App.tsx:540,1589-1595`, `onboarding/LauncherGuide.tsx:56`; reference `App-C2irX2ey.js:1`. |
| F011 General | Partial | “General settings” UI rendered, but OS login behavior/settings were not changed or physically validated. Local `SettingsOverlay.tsx:460,4640`; reference `App-C2irX2ey.js:1`. |
| F012 Plans | Held | Billing/licence/plan/pack baseline hold; controls were not used. Local `SettingsOverlay.tsx:29,3432`; reference `App-C2irX2ey.js:1`. |
| F013 AI providers | Implemented | Tab UI text/layout rendered and matches the 3.2.0 string set; provider behavior evidence remains in Phase 10. Local `SettingsOverlay.tsx:25,460`; reference `App-C2irX2ey.js:1`; [Phase 10](phase10-providers.md). |
| F014 Retrieval | Partial | UI rendered; no model selection/fallback change was made. Local `SettingsOverlay.tsx:31`; reference `App-C2irX2ey.js:1`. |
| F015 Audio | Partial | UI rendered; no device switch, test sound, permission flow, or speech capture was initiated. Local `SettingsOverlay.tsx:26-28`; reference `App-C2irX2ey.js:1`. |
| F016 Overlay | Partial | UI rendered; answer-length provider registration now matches `ipcHandlers.ts` in 3.2.0. Window/display behavior needs physical verification. Reference `App-C2irX2ey.js:1`, `ipcHandlers.js:1`. |
| F017 Calendar | Partial | UI rendered; OAuth/connect and automatic-start behavior were not exercised. Local `SettingsOverlay.tsx:4`; reference `App-C2irX2ey.js:1`. |
| F018 Keybinds | Partial | UI rendered; shortcut registration/focus behavior was not exercised. Local `SettingsOverlay.tsx:460`; reference `App-C2irX2ey.js:1`. |
| F019 Phone mirror | Partial | UI rendered; LAN/pairing was not enabled or tested. Local `SettingsOverlay.tsx:30`; reference `App-C2irX2ey.js:1`. |
| F020 Connections | Partial | UI rendered; no OAuth/connector was initiated. Local `SettingsOverlay.tsx:5`; reference `App-C2irX2ey.js:1`. |
| F021 Intelligence | Partial | UI rendered; stateful options, downloads and calibrations were not activated. Local `SettingsOverlay.tsx:32`; reference `App-C2irX2ey.js:1`. |
| F022 Help | Partial | Help content rendered; guide playback/external navigation was not activated. Local `SettingsOverlay.tsx:24,4697`; reference `App-C2irX2ey.js:1`. |
| F023 About | Partial | About content rendered; external links were not opened. Local `SettingsOverlay.tsx:460`; reference `App-C2irX2ey.js:1`. |

## Fixes made

No source fixes. No proven, contained gap was found. No tests were added because no implementation changed.

## Completion report

### Change summary

- Files changed: this report and the F001–F023 rows in `phase6-feature-catalogue.md` only. `.gitignore` was not edited.
- Behavior changed: none. No shared or platform-specific implementation changed.
- Impact radius: documentation only; renderer windows and settings tabs reviewed. Existing audio/capture and native code remain untouched.

### Cross-platform analysis

- macOS and Windows main-process window-helper branches were compared; the seven window helper modules match after generated-name normalization. The answer-length registration now resides in IPC handlers as in 3.2.0.
- No Windows execution occurred. Current-Mac DOM results do not validate native focus, click-through, Spaces/virtual desktops, window levels, privacy prompts, or capture hardware.
- Potential regressions from this documentation-only change: none. Window/capture parity remains physically unverified at platform boundaries.

### Validation

- `Tested physically on macOS` — local Electron renderer surfaces inspected via CDP on macOS; no physical capture/shortcut/window-level interaction.
- `Build validated on macOS` — required electron / renderer / electron build sequence passed.
- `Reviewed but not executed on Windows` — both-platform source/window helper comparison only.
- `Requires physical macOS verification` — native window focus/levels/click-through/Spaces, screenshot/crop gesture, and any capture path.
- `Requires physical Windows verification` — Windows window behavior and all Windows-only UI/capture/device paths.

Automated macOS/Windows branch-test categories do not apply: no code was changed and no tests were run. No Windows build was run.

### Commands executed

- `npm run build:electron`
- `npm run build`
- `npm run build:electron`
- `node $REF/../tools/compare.mjs dist/assets $REF/asar/dist/assets`
- `node modcmp.mjs dist-electron/electron/main.js $REF/asar/dist-electron/electron/main.js 'electron/(WindowHelper|main|.*Window.*Helper|.*Window.*|.*Cropper.*)\.ts'`
- `node moddiff.mjs dist-electron/electron/main.js $REF/asar/dist-electron/electron/main.js electron/main.ts …`
- `agent-browser skills get core`
- `agent-browser skills get electron`
- `npm run dev:agent`
- `AGENT_BROWSER_CONFIG=$PWD/agent-browser.json agent-browser … tab/eval/snapshot/console/errors/click`
- `shasum -a 256` on the four renamed image assets and their reference counterparts.

### Remaining risks

- Native macOS window/capture behavior and all physical Windows behavior remain unverified.
- Onboarding/first-run guide was not forced because that requires profile reset. Crop gesture and capture were not exercised.
- No reference runtime was launched; comparison uses the extracted signed 3.2.0 bundles and module data only.
- `docs/parity/phase11-ui.md` is ignored by the existing `.gitignore` rule `docs/parity/*`; per instruction it was not unignored.

## Correction and fix (2026-11-19)

Earlier this report called the answer-length wiring "extra local behaviour". That was wrong.

- **What 3.2.0 does:** it registers the same provider in `electron/ipcHandlers.ts`, right after the modes Pro check. The call is inside a try/catch that logs `[IPC] Answer length not wired, answers stay Smart` (reference `main.js:506025`).
- **What the local build did:** it registered the provider in the `AppState` constructor in `electron/main.ts`, with no guard.
- **Fix:** the registration now sits in `ipcHandlers.ts` with the 3.2.0 guard. The compiled line is byte-identical to the reference.
- **Test:** `electron/llm/__tests__/AnswerLengthWiring320.test.mjs`.
