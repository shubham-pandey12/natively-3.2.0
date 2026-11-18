# Phase 4b Full Renderer Parity Findings (vs Natively 3.2.0)

Source of truth:
- Primary (readable): `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/reconstructed/readable/dist/assets`
- Confirmed against (compiled): `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/compiled/app/dist/assets`

Audit split across 14 parallel full-branch audit units covering every scope item (1–9) plus compiled CSS diffing. Duplicates across overlapping scopes have been merged below.

---

## Summary by Action

- **`copy`**: 53 deduplicated parity fixes across `src/index.css`, `src/components/SettingsOverlay.tsx`, `src/components/settings/OverlaySettings.tsx`, `src/components/settings/SettingsRow.tsx`, `src/components/settings/PhoneMirrorSettings.tsx`, `src/components/settings/help/HelpGraphics.tsx`, `src/components/ProfileIntelligenceSettings.tsx`, `src/components/NativelyInterface.tsx`, `src/lib/chatStreamGuard.mjs`, `src/types/electron.d.ts`, `src/components/OverlayAuxWindows.tsx`, `src/components/ui/TopPill.tsx`, `src/components/overlay/useOverlayFirstRunGuide.tsx`, `src/components/onboarding/useRecoveredGuide.ts`, `src/components/NotesWindow.tsx`, `src/App.tsx`, `src/components/MeetingDetails.tsx`, `src/lib/onboarding/firstRunGuide.mjs`, `src/lib/onboarding/shortcutKeys.mjs`, `src/lib/demoVideoUrl.ts`, and `premium/src/ModesSettings.tsx`.
- **`remove`**: 14 deduplicated local-only items removed across `src/components/settings/AIProvidersSettings.tsx`, `src/components/settings/HelpSettings.tsx`, `src/components/SettingsOverlay.tsx`, `src/components/ProfileIntelligenceSettings.tsx`, `src/components/NativelyInterface.tsx`, `src/App.tsx`, `src/lib/guideShortcutLabel.ts` (+ its local-only test `src/lib/__tests__/GuideShortcutLabel320.test.mjs`), and `premium/src/ModesSettings.tsx`.
- **`leave-billing`**: Billing, packs, plans, Pro gate, `packProRule`, trial UI, and `forceTrialEnded` (strictly never touched).
- **`leave-format`**: Build version metadata (`3.1.0` vs `3.2.0`), Vite-stripped `import.meta.env.DEV` guards, constant-folded flags, `.displayName` metadata, and tree-shaken unused local declarations/exports.
- **`unsure`**: Unimported legacy files that pre-date local-only parity commits and cannot be confirmed absent from 3.2.0 source via compiled dist assets (left untouched).

---

## Scope 1: Settings `general` & Theme CSS Tokens

| local file:line | recovered asset:line | difference | action |
| --- | --- | --- | --- |
| `src/components/SettingsOverlay.tsx:2656,2712,2739,2774,2825,2848,2910,2976,3053,3076,3101,3122,3143,3169,3193,3224,3291` | `App-C2irX2ey.js:65236..65955` | All 17 General tab 40×40 icon tiles use `bg-bg-item-surface` locally instead of `bg-bg-settings-tile` in 3.2.0. (Export button at L3322 and Ghost SVG strokes at L2672–2673 match 3.2.0.) | `copy` |
| `src/components/SettingsOverlay.tsx:3339` | `App-C2irX2ey.js:65998` | Process Disguise card wrapper uses `${isLight ? 'bg-bg-card' : 'bg-bg-item-surface'} rounded-xl p-5 border border-border-subtle` instead of unconditional `bg-bg-card rounded-xl p-5 border border-border-subtle`. | `copy` |
| `src/index.css:319-320` | `compiled/index-WC6tpguN.css` (offset 152850) | Dark `[data-settings-theme="periwinkle"]` is missing `--bg-card: #27272A;`. | `copy` |
| `src/index.css:479-480` | `compiled/index-WC6tpguN.css` (offset 158568) | Light `[data-theme='light'] [data-settings-theme="periwinkle"]` is missing explicit `--bg-card: #FBFBFD;`. | `copy` |
| `src/components/SettingsOverlay.tsx:4733` | `App-C2irX2ey.js:65002` | `{isOpen && <LauncherSettingsGuide />}` is placed after `</GenieModal>` locally instead of immediately after `{confirmDialog}` (before `<AutoAnswerStopSharingDialog>` / `<GenieModal>`). | `copy` |
| `src/components/SettingsOverlay.tsx:2982` | `App-C2irX2ey.js:48873,65615` | `packageJson.version` is `"3.1.0"` locally vs `"3.2.0"` in recovered build metadata. | `leave-format` |

---

## Scope 2: Settings `ai-providers`

All cloud providers (Gemini, Fluxion/Sidrune, AgentRouter, Groq, OpenAI, Claude, DeepSeek, Nvidia Nim, OpenRouter), Google Antigravity, LiteLLM, 9Router, Ollama, Custom (cURL), Hero cards, Privacy tab, Diagnostics, `ProviderCard`, `ProviderPerformanceSettings`, `KeyResendHelp`, and `visionLine` verified at full-branch depth.

| local file:line | recovered asset:line | difference | action |
| --- | --- | --- | --- |
| `src/components/settings/AIProvidersSettings.tsx:4834-4838` | `App-C2irX2ey.js:44585` | `handleCodexAuthAction` runs an extra local-only OAuth re-read on success (`if (action === 'status' \|\| action === 'logout') { const status = await readCodexSignInStatus(); if (status) setCodexOauthStatus(status); }`). Absent in 3.2.0. | `remove` |
| `src/components/settings/NativelyApiSettings.tsx:934` | `App-C2irX2ey.js:22299` | `PACK_LOOK.pack_heavy.blurb` copy (`two busy weeks` vs `a busy week`). Pack UI. | `leave-billing` |
| `src/components/settings/NativelyApiSettings.tsx:981-984` | `App-C2irX2ey.js:22400-22407` | `ProPacks` footer copy and `data-pack-provider-rule` paragraph. Pack/Pro rule UI. | `leave-billing` |
| `src/components/settings/NativelyApiSettings.tsx:1802-1811` (+ `apiTier.css`) | `App-C2irX2ey.js:22898-22913` (`App-DCscU86D.css`) | Yearly `"2 months free"` pill rendered as sibling `<p className="api-tier-save">` vs inline `<span className="api-tier-save api-tier-save-inline">`. Plans tab UI. | `leave-billing` |
| `src/components/settings/NativelyProSettings.tsx:474,520-526,783-786,1038,1045-1047` | `App-C2irX2ey.js:52886,52904,53032-53036,53271,53282-53285` | `packProPaused` (`data-pack-pro-paused`), 4th `api-tier-tray` item (`Auto Answer`), and BYOK Auto Answer footnote. Plans/pack UI. | `leave-billing` |
| `src/components/settings/NativelyApiSettings.tsx:389-412,610-636,1029-1041`, `NativelyProSettings.tsx:125-375,732-759` | `App-C2irX2ey.js:21649-23444,52852-53289` | Tree-shaken unused local declarations (`cardContainerVariants`, `PlanAllowances`, `Price`, `ProOverlayPoster`, `MeterBar`, `SourceCard`, `itemVariants`, `priceTickAnim`, `lifetimePulseShadow`). | `leave-format` |

---

## Scope 3: Settings `overlay`

`OverlayCustomButtons.tsx`, `OverlayMockup.tsx`, `overlayAppearance.ts`, `overlayButtonOrder.ts`, `overlayCustomButtons.ts`, `overlaySizeSetting.ts` verified with zero differences.

| local file:line | recovered asset:line | difference | action |
| --- | --- | --- | --- |
| `src/components/settings/OverlaySettings.tsx:20,582,721-723,764-768` | `App-C2irX2ey.js:6,61938-62017,62131-62140,62178` | Missing `AlignLeft` & `failureText` imports, `ANSWER_LENGTHS`, and `AnswerLengthRow` (with `SETTINGS_CARD`, `SettingsRow`, 3-column sliding segmented `radiogroup`, roving `tabIndex`, arrow-key navigation, `descriptionKey`, `getAnswerLength` null-guarded, `setAnswerLength` optimistic update/rollback with `failureText`), rendered in both `notepad` (after `NotepadPreview`) and `overlay` (after `opacityControl`) branches before `<ScreenshotQuestionRow />`. | `copy` |
| `src/components/SettingsOverlay.tsx:790-792,4637-4674` | `App-C2irX2ey.js:61951-61960,67480-67487` | Local-only `answerLength`/`answerLengthError` state, `getAnswerLength` effect, and unstyled inline Answer length block rendered outside `<OverlaySettings />` in `SettingsOverlay.tsx`. In 3.2.0 `activeTab === 'overlay'` renders bare `<OverlaySettings ... />`. | `remove` |
| `src/components/SettingsOverlay.tsx:2318` | `App-C2irX2ey.js:64955` | `opacityCard` (`#opacity-slider-card`) uses conditional `${isLight ? 'bg-bg-card' : 'bg-bg-item-surface'}` locally instead of unconditional `bg-bg-card rounded-xl p-5 border border-border-subtle`. | `copy` |
| `src/components/settings/SettingsRow.tsx:399` | `NotesWindow-C6aKiJKb.js:623` | Shared `SettingsRow` 40×40 icon tile uses `bg-bg-item-surface` locally instead of `bg-bg-settings-tile` in 3.2.0. | `copy` |
| `src/components/SettingsOverlay.tsx:4748` | `App-C2irX2ey.js:67539` | `resolveMeetingInterfaceTheme` called with unused 2nd arg `_appTheme`. | `leave-format` |

---

## Scope 4 & 5: Settings `help`, `about`, `retrieval`, `audio`, `keybinds`, `calendar`, `phone-mirror`, `connections`, `intelligence`, Shell

Verified with zero differences: `HelpParts.tsx`, `helpClips.ts`, `HowItWorksRefund.tsx`, `helpContent.mjs`, `helpSetupStatus.mjs`, `RetrievalSettings.tsx`, `EmbeddingSettings.tsx`, `RerankerSettings.tsx`, `rerankCandidateControl.mjs`, `SkillsSettings.tsx`, `OwnAnswersSection.tsx`, `SpeechDictionarySettings.tsx`, `dictionaryField.mjs`, `LocalWhisperModelPanel.tsx`, `RoomSpeakersSettings.tsx`, `roomSpeakersProviders.ts`, `FollowMicDeviceSettings.tsx`, `SettingsOverlay.tsx` (keybinds tab), `useShortcuts.ts`, `keyboardUtils.ts`, `KeyRecorder.tsx`, `CalendarSettings.tsx`, `ConnectorMark.tsx`, `ConnectionsSettings.tsx`, `connectors/*`, `IntelligenceSettings.tsx`, `SettingsToggle.tsx`, `useToggleInit.ts`.

| local file:line | recovered asset:line | difference | action |
| --- | --- | --- | --- |
| `src/components/settings/help/HelpGraphics.tsx:105` | `App-C2irX2ey.js:50123` | `FlowStage` icon tile uses `bg-bg-item-surface` locally instead of `bg-bg-settings-tile`. | `copy` |
| `src/components/settings/HelpSettings.tsx:1148` | `App-C2irX2ey.js:52247` | `Show the guide again` row passes `size={20}` to `<NativelyGlyph size={20} />`; 3.2.0 renders `<NativelyGlyph />` (default `size = 14`). | `remove` |
| `src/components/SettingsOverlay.tsx:4722` | `App-C2irX2ey.js:67515-67519`, `useResolvedTheme-EStphwh1.js:959-961` | `HelpSettings` `onShowGuide` omits `.catch?.(() => {})` on `guideDispatch` (3.2.0 calls shared `dispatchGuide({ type: 'restart' })` then `onClose()`). | `copy` |
| `src/components/SettingsOverlay.tsx:114,1546` | `App-C2irX2ey.js:64588`, `NotesWindow-C6aKiJKb.js:26298-26305` | `showsAutoFallback` omits `\|\| sttProviderRejectsLanguage(sttProvider, recognitionLanguage)` (and omits importing `sttProviderRejectsLanguage` from `../../electron/config/languages`). | `copy` |
| `src/components/SettingsOverlay.tsx:4559,4589` | `App-C2irX2ey.js:67410,67443` | Audio tab "Follow the meeting app's mute" (`4559`) and "Dictation" (`4589`) icon tiles use `bg-bg-item-surface` locally instead of `bg-bg-settings-tile`. | `copy` |
| `src/components/settings/PhoneMirrorSettings.tsx:556` | `App-C2irX2ey.js:54510` | `CompanionRow` icon tile uses `bg-bg-item-surface` locally instead of `bg-bg-settings-tile`. | `copy` |
| `src/components/ProfileIntelligenceSettings.tsx:2221,2561,2565,2568,3321-3325` | `App-C2irX2ey.js:73102-73105,73263-73274,74569-74570` | Local-only `companyResearchError` state, error assignment in `doCompanyResearch`, and `<div role="alert">` error banner in `renderCompany`. 3.2.0 swallows `catch {}` and has no error banner. | `remove` |
| `src/components/ProfileIntelligenceSettings.tsx:2497-2504` | `App-C2irX2ey.js:73235-73238` | `doJdUpload` calls `Promise.all([profileGetProfile(), profileGetStatus()])` + `setProfileStatus(status)`. 3.2.0 only awaits `profileGetProfile()`. | `copy` |
| `src/components/ProfileIntelligenceSettings.tsx:2688-2698` | `App-C2irX2ey.js:73410-73416` | Resume delete awaits `Promise.all([profileGetProfile(), profileGetStatus()])`. 3.2.0 immediately calls `setProfileStatus({ hasProfile: false, profileMode: false })` after `profileDelete()`, then awaits only `profileGetProfile()`. | `copy` |
| `src/components/ProfileIntelligenceSettings.tsx:2804-2811` | `App-C2irX2ey.js:73602-73604` | JD delete awaits `Promise.all([profileGetProfile(), profileGetStatus()])`. 3.2.0 only awaits `profileGetProfile()`, then updates `profileData` and clears `companyDossier`. | `copy` |
| `src/components/AboutSection.tsx:198-199,390` | `App-C2irX2ey.js:17681,17686,49247-49248,49394` | Package version metadata (`3.1.0` / `3.1` vs `3.2.0` / `3.2`). | `leave-format` |
| `src/components/ProfileIntelligenceSettings.tsx:1205-1207,2913-2915`, `src/components/SettingsOverlay.tsx:1984-1994`, `src/components/settings/Sidebar.tsx:1-49` | Absent from dist | Tree-shaken unused local declarations/dead file (`Divider`, `sectionLabel`, `handleRemoveTavilyKey`, `Sidebar.tsx`). | `leave-format` |
| `src/components/ui/KeyBadge.tsx:1-51` | Absent from dist | Pre-existing unimported file (`d1ab5b86`); cannot confirm from compiled dist whether 3.2.0 source retained or removed it. | `unsure` |

---

## Scope 6: `NativelyInterface` & Overlay Aux Windows

Verified with zero differences: `overlayButtons.ts`, `DynamicActionBar.tsx`, `DynamicActionCard.tsx`, `ScreenshotTray.tsx`, `PageContextChip.tsx`, `TabPicker.tsx`, `DirectAssistNotice.tsx`, `useStreamBuffer.ts`, `RollingTranscript.tsx`, `AmbientChatNotice.tsx`, `AutoStopNotice.tsx`, `LastTimeRecapNotice.tsx`, `ChromeFold.tsx`, `overlayBannerSlots.mjs`, `audioWarningSlots.mjs`, `sttBannerKeys.mjs`, `useMeetingMute.ts`, `useOverlayTrial.ts`, `TrialNotice.tsx`, `OverlayBanner.tsx`, `ResizeToggle.tsx`, `ClickThroughToggle.tsx`, `chatMarkdown.tsx`, `DiagramArtifact.tsx`, `DiagramAwareMarkdown.tsx`, `AuxRoot.tsx`, `ModelSelectorWindow.tsx`, `ModelSelectorLabel.tsx`, `modelSelectorGroups.ts`, `modelSelectorLabelText.ts`, `HeroGlassButton.tsx` (`useLensTracking`/`HeroGlassButton`).

| local file:line | recovered asset:line | difference | action |
| --- | --- | --- | --- |
| `src/components/NativelyInterface.tsx:7072-7084,7100,7104,7445,7519,9793` | `NativelyInterface-ikIwHUKF.js:6106-6120,6296,6345,7314` | Local-only `releasePhoneOverlayAnswer` callback and its 3 call sites (`tryBeginOverlayAction`, `beginDirectAssist`, `handleManualSubmit`) and hook dependency entries. Absent in 3.2.0. | `remove` |
| `src/components/NativelyInterface.tsx:7990-8010`, `src/lib/chatStreamGuard.mjs:228-230`, `src/types/electron.d.ts:904` | `NativelyInterface-ikIwHUKF.js:1226-1228,6472-6474` | `onIntelligenceSuggestedAnswerDiscard` ignores event payload; 3.2.0 accepts `data` and gates discard on `Eh(liveAnswerGenIdRef.current, data?.generationId)` (`typeof incomingId !== 'number' \|\| typeof activeId !== 'number' ? true : incomingId >= activeId`). | `copy` |
| `src/components/NativelyInterface.tsx:8428-8430` | `NativelyInterface-ikIwHUKF.js:6664-6672` | In `handleWhatToSay` with attachments, local uses `dynamicPromptInstruction ? (QUICK_ACTION_LABELS[dynamicPromptInstruction] \|\| dynamicPromptInstruction) : resolveScreenshotPromptText()`. 3.2.0 unconditionally uses `resolveScreenshotPromptText()`. | `copy` |
| `src/components/NativelyInterface.tsx:13036,13062` | `NativelyInterface-ikIwHUKF.js:8930-8937,8958-8966` | Quick action chips (both Lavender `<HeroGlassButton>` and standard `<button>`) omit `data-guide={id === 'what_to_answer' ? 'what-to-answer' : undefined}`, breaking guide highlight on step `answer`. | `copy` |
| `src/components/NativelyInterface.tsx:10703`, `src/components/overlay/useOverlayFirstRunGuide.tsx:1-82` | `NativelyInterface-ikIwHUKF.js:1792-1930,4081-4083` | `useOverlayFirstRunGuide` takes positional callback and defines inline `guideKeys`/constants instead of 3.2.0's `{ whatToAnswer } = {}` signature, shared `useGuideShortcuts`, `DEMO_VIDEO_URL`, `GUIDE_SILENT_DEMO_DELAY_MS`, `GUIDE_AUTO_ANSWER_DELAY_MS`, and `GUIDE_STOP_LOCK_MS`. | `copy` |
| `src/components/OverlayAuxWindows.tsx:251-314` | `useResolvedTheme-EStphwh1.js:1007-1037,1250-1302` | `OverlayPillWindow` is missing `RecoveredGuide.css` import, `useRecoveredGuide()`, `useGuideStopLock()`, `useGuideHighlight` for `[data-guide="overlay-stop"]`, and passing `stopLockSeconds`/`stopLockLabel` to `<TopPill>`. | `copy` |
| `src/components/ui/TopPill.tsx:6-34,61-67,139-153` | `useResolvedTheme-EStphwh1.js:215-252,290-299,361-379` | `TopPill` is missing `stopLockSeconds`/`stopLockLabel` props, `StopGlyph` (`span.guide-stop-count`), `stopLocked`/`stopProps`, `data-guide="overlay-stop"`, dynamic `aria-label`, and conditional red hover class on the non-Lavender Stop button. | `copy` |
| `src/components/NativelyInterface.tsx:1328,7629,9075,9362,10008-10010,10092-10093`, `DynamicActionCard.tsx:179`, `DiagramArtifact.tsx:42`, `ModelSelectorWindow.tsx:41`, `audioWarningSlots.mjs:101-107` | Various | Constant-folded `flushImmediatelyOnComplete`, unused local variables/imports/exports, TS-only properties, unused 2nd param. | `leave-format` |
| `src/components/overlay/heroGlass/HeroGlassButton.tsx:175-192` (`HeroGlassPill`), `src/components/NativelyInterfaceCard.tsx`, `src/components/ui/ModelSelector.tsx`, `src/components/SuggestionOverlay.tsx` | Absent from dist | Pre-existing unimported legacy components/exports; cannot confirm from compiled dist whether 3.2.0 source retained or removed them. | `unsure` |

---

## Scope 7: `NotesWindow`, `App.tsx`, `Launcher.tsx` & Subcomponents

Verified with zero functional differences (29 files): `main.tsx`, all 13 `src/components/notes/*` files, `Launcher.tsx`, `StartupSequence.tsx`, `TopSearchPill.tsx`, `WindowControls.tsx`, `HindsightStatusBanner.tsx`, `NativelyQuotaBanner.tsx`, `UpdateBanner.tsx`, `UpdateModal.tsx`, `ReviewModal.tsx`, `ReviewPromptHost.tsx`, `ProviderChangeNotice.tsx`, `GlobalChatOverlay.tsx`, `AssistToday.tsx`, `useLastTimeRecap.ts`, `UpcomingCalendarCard.tsx`.

| local file:line | recovered asset:line | difference | action |
| --- | --- | --- | --- |
| `src/components/NotesWindow.tsx:142-172` | `NotesWindow-C6aKiJKb.js:24455-24536` | `useNotesGuide` omits `live` from its return object, takes positional `off` instead of `{ off = false } = {}`, and hardcodes step numbers instead of shared `GUIDE_STEP_NUMBER`/`GUIDE_STEP_TOTAL`. | `copy` |
| `src/components/NotesWindow.tsx:513-515` | `NotesWindow-C6aKiJKb.js:27619-27621` | `onAskOpened` effect checks `if (askEngaged)` with deps `[askEngaged, notesGuide.onAskOpened]` instead of `if (askOpen && phase === 'live')` with deps `[askOpen, phase, notesGuide.live, notesGuide.onAskOpened]`. | `copy` |
| `src/components/NotesWindow.tsx:611-627` | `NotesWindow-C6aKiJKb.js:26942-26943,27272-27307` | `runRecipe` calls `notesGuide.onRecipeRun()` before `npTrack('recipe', recipe.id)` and puts it in deps instead of using `onRecipeRunRef` called after `npTrack`. | `copy` |
| `src/components/NotesWindow.tsx:1099-1115` | `NotesWindow-C6aKiJKb.js:26941,27749-27769`, `useResolvedTheme-EStphwh1.js:864-867,1007-1034` | Stop button (`data-guide="notes-stop"`) is missing `useGuideStopLock()` countdown (`span.guide-stop-count`), dynamic `aria-label`/`title`, `aria-disabled`, and `if (stopLock.seconds > 0) return;` click guard. | `copy` |
| `src/components/NotesWindow.tsx:1389` | `NotesWindow-C6aKiJKb.js:28177` | `<NotesEditor>` `className` omits `${notesGuide.live === 'notepad' ? ' guide-write' : ''}`. | `copy` |
| `src/components/NotesWindow.tsx:1681-1690` | `NotesWindow-C6aKiJKb.js:27618,28629-28647` | Live listening pill folds on `askOpen` instead of `foldListening = askOpen && notesGuide.live !== 'stop2'`. | `copy` |
| `src/App.tsx:360-371` | `App-C2irX2ey.js:78460-78490` | Local-only `useEffect` calling `guideGet`/`onGuideChanged` to auto-open meeting notes on `notes`/`notes2` (owned by `LauncherGuide` in 3.2.0). | `remove` |
| `src/App.tsx:372-386` | `App-C2irX2ey.js:78604-78623` | `first_run_guide` external card claim uses raw `guideGet`/`onGuideChanged` and re-claims on every notify; 3.2.0 uses `useRecoveredGuide()` + `guideActive`, claims once, and also dispatches `{ type: 'trial_out' }` when `guideActive && (showTrialExpiredModal \|\| trialEndedDue)`. | `copy` |
| `src/App.tsx:639-642` | `App-C2irX2ey.js:78685-78688` | `setOrchestratorUserState({ trialEndedOpen: ... })` omits `&& !guideActive`. | `copy` |
| `src/App.tsx:1486,1598-1602` | `App-C2irX2ey.js:78465-78470,79269-79273` | `<LauncherGuide>` is mounted inside `#launcher-container` gated on `!isSettingsOpen && !isManagerOpen` (breaking Settings guide tips) and `onShowHome` doesn't close Settings. 3.2.0 mounts it outside `#launcher-container` gated on `!isolateOnboarding && showWelcome === false && (isLauncherWindow \|\| isDefault)` with `showLauncherHome` closing Settings. | `copy` |
| `src/App.tsx:1602` | `App-C2irX2ey.js:79273` | `<FreeTrialModal>` render guard omits `&& !guideActive`. | `copy` |
| `src/App.tsx:503-505` | `App-C2irX2ey.js:78544` | `forceTrialEnded` dev query override. | `leave-billing` |
| `src/App.tsx:109-117,654,678,1278`, `UpdateBanner.tsx:136-184`, `ReviewPromptHost.tsx:249-278`, `Launcher.tsx`, `UpdateModal.tsx` | Various | `import.meta.env.DEV` guards, unused 2nd arg, build version metadata. | `leave-format` |

---

## Scope 8: `premium/src/ModesSettings.tsx` (Visual & Branch Audit)

| local file:line | recovered asset:line | difference | action |
| --- | --- | --- | --- |
| `premium/src/ModesSettings.tsx:42,76` | `App-C2irX2ey.js:31527-31573` | Local-only `--mm-sidebar-border` CSS custom property not in 3.2.0. | `remove` |
| `premium/src/ModesSettings.tsx:60,94` | `App-C2irX2ey.js:31547,31571` | `--mm-active-blue` has fallback hex `#818cf8`/`#4f46e5`; 3.2.0 uses `var(--periwinkle-300)` / `var(--periwinkle-600)`. | `copy` |
| `premium/src/ModesSettings.tsx:172-175` | `App-C2irX2ey.js:31720-31728` | Unused local-only CSS rules `.mm-file-removing`, `@keyframes mm-file-collapse`, `.mm-status`, `@keyframes mm-status-in`. | `remove` |
| `premium/src/ModesSettings.tsx:203-384` | `App-C2irX2ey.js:31767-32190,33023-33074` | Embedded `CSS` diverges from 3.2.0 `AD`: `.mm-banner-slot`/`.mm-banner`, `.mm-save-fail`, `.mm-prompt-foot`, `.mm-check-slot`/`.mm-active-check`, `.mm-panel-content`/`.mm-cascade` + `[data-switch='true']`, `.mm-pill*`, `.mm-dropdown` + `mm-pop-out`, `.mm-notes-applying`, `.mm-saved-check`, `.mm-tpl-chevron`, `.mm-input-box`, `.mm-spinner`, full reduced-motion block; dot-selector CSS should be injected once via `<style id="mm-dot-selector-styles">`. | `copy` |
| `premium/src/ModesSettings.tsx:14-35,556-605` | `App-C2irX2ey.js:30821-30909` | 6 of 8 `TEMPLATES` icons differ (`Briefcase`, `Users`, `MessageSquare`, `Search`, `CodeXml`, `Presentation`); `Loader2` unused. | `copy` |
| `premium/src/ModesSettings.tsx:626-640,1628` | `App-C2irX2ey.js:34228` | Local custom `useTheme()` instead of shared `useResolvedTheme()`. | `copy` |
| `premium/src/ModesSettings.tsx:664-770` | `App-C2irX2ey.js:35283-35585` | Inline style object `S` vs `Is` (`modeItem`, `textarea`, `iconBtn`, `saveBtn`, `addSectionBtn`, `fileRow: '13px 1fr 104px 42px 20px'`, `dotsDeleteBtn`, `uploadBtn`, `dotsDropdown`). | `copy` |
| `premium/src/ModesSettings.tsx:794,803,828,842,1466,1478,1532,2574,2578` | `App-C2irX2ey.js:30910-30947,35116-35248,34925-34955` | Local-only accessibility extras (`InlineEdit` `ariaLabel`/`aria-label`/`fontFamily`, `NewSectionForm` `aria-label`s, `SectionCard` delete `aria-label`, Knowledge Pack `aria-expanded`/`aria-label`, Delete file `aria-label`). | `remove` |
| `premium/src/ModesSettings.tsx:860-868,2332-2349` | `App-C2irX2ey.js:32979-32997,34455-34485` | `BannerSlot` missing `aria-hidden={!open}` & `inert`, uses wrong padding (`0 8px` vs `16px 32px 12px`) and places `mm-banner` on wrapper instead of card div. | `copy` |
| `premium/src/ModesSettings.tsx:898-940` | `App-C2irX2ey.js:33556-33655` | `ActivateBtn` lacks measured-width 3-label blur crossfade (`setActive`/`active`/`deactivate`), `aria-hidden={true}` on check wrapper, and 250ms transition. | `copy` |
| `premium/src/ModesSettings.tsx:943-957` | `App-C2irX2ey.js:32584-32592,35455-35466` | `DropdownMenu` unmounts abruptly instead of `useClosingPresence(open, 150)` + `mm-dropdown` + `data-closing` + `S.dotsDropdown`. | `copy` |
| `premium/src/ModesSettings.tsx:960-974` | `App-C2irX2ey.js:33075-33098` | `DotSelector` uses fake span checkbox + `mm-dot-checked` instead of real `<input className="mm-dot-native mm-dot-input" data-testid="dot-selector">` + injected `mm-dot-selector-styles`. | `copy` |
| `premium/src/ModesSettings.tsx:977-1022,2143-2153` | `App-C2irX2ey.js:33109-33217,34798-34816` | `KnowledgeSource` vertical column vs horizontal row, omits `defaultOwner: 'reference_files'` in `onSave`, omits `error: 'failed_to_build_contract'`. | `copy` |
| `premium/src/ModesSettings.tsx:1025-1061` | `App-C2irX2ey.js:33218-33288` | `AnswerPolicyV3` box padding/radius/opacity, `DotSelector` disabled prop, and missing `source === 'user_choice'` default-note condition + `<span style={{ fontSize: 11, opacity: 0.6 }}>`. | `copy` |
| `premium/src/ModesSettings.tsx:1066-1204` | `App-C2irX2ey.js:33289-33555` | `WritingStyle` 8 diffs: always render heading, `-5px 0` header wrapper + `animate-spin`, `mm-input-box` + `contentBox` + `minHeight: 160`, textarea `flex: 1` + `minHeight: 56`, status `minWidth: 0` + `paddingLeft: 4` + `title`, `MorphLabel` + `SavedCheck` on Add sample, `result?.message` error toast helper, `data-sample-row` + `PenLine` + `S.iconBtn` + `collapseAndRun(..., 6)`. | `copy` |
| `premium/src/ModesSettings.tsx:1217-1227,1316-1317,1376,1415,1490-1547,2352` | `App-C2irX2ey.js:32539-32567,32813-32819,30962,31046-31054,34485-34495,35158-35248` | `MorphLabel` accepts `React.ReactNode`; `NotesTemplatePicker` focus before scrollIntoView; `TemplatePicker` wrapper & `mm-tpl-chevron`; `SectionCard` `collapseTo` + `collapseAndRun` + delete button transition. | `copy` |
| `premium/src/ModesSettings.tsx:1684,1718,1721,2245,2284-2285` | `App-C2irX2ey.js:33848-33851,34290-34299,34338-34355` | Local-only `onModeChanged` subscription, unused `listRef`, and sidebar `InlineEdit` `autoEdit`/`onEditEnd`. | `remove` |
| `premium/src/ModesSettings.tsx:1640-2675` | `App-C2irX2ey.js:32501-32583,33656-35083` | Main `ModesSettings` parity: `collapseAndRun`, `useSlotSwap`, `SavedCheck`, `LiquidGlassButton` New Mode button, `firstTabId`, `modesGetSourceContract` error log, `answerPolicyGet` cancelled guard, dedicated `modesGetDefaultNoteSections` effect on `[selectedId, mode?.templateType]`, Escape `!e.defaultPrevented`, `expandedKnowledgeCardId` reset, `applyNoteTemplate` `addingSection`/`notesActionTriggered`, unsaved shake/sticky/savingPending/focus-restore/savePulseKey/lateral `data-switch`, built-in intelligence `<p>`, `ThinkingOrb` `listening`/`0.65`, `Sparkles` Knowledge Pack icon + hover colors, `Add file` `MorphLabel`, file & mode delete collapse, notes template header `gap: 16`, empty condition `noteSections.length === 0 && !addingSection`, `Remove template` collapse, `Add section` `onMouseLeave` `--mm-text-tertiary`. | `copy` |
| `premium/src/ModesSettings.tsx:1551-1611,2181-2191` | `App-C2irX2ey.js:31128-31525,32191-32500,35084-35092` | `ProGate` (`modes-pro-gate`, `UnlockProPlans`, license/upgrade UI). | `leave-billing` |
| `premium/src/ModesSettings.tsx:2254` | `App-C2irX2ey.js:34303` | `data-instant` string `'true'` vs boolean `true` (identical CSS match). | `leave-format` |

---

## Scope 9: Remaining Renderer Components, `premium/src`, & `src/lib`

Verified with zero differences: `SettingsPopup.tsx`, `Cropper.tsx`, `WelcomeFlow.tsx`, `WelcomeScreen.tsx`, `welcomeShared.tsx`, `welcomeButtonTokens.ts`, `DemoOverlay.tsx`, `ShortcutTour.tsx`, `OrchestratedToasterHost.tsx`, `BrowserExtensionToaster.tsx`, `DemoVideoToaster.tsx`, `PermissionsToaster.tsx`, `PlansToaster.tsx`, `LauncherGuide.tsx`, `SupportToaster.tsx`, `MeetingOfferToast.tsx`, `FeatureSpotlight.tsx`, `ErrorBoundary.tsx`, `EditableTextBlock.tsx`, `MeetingChatOverlay.tsx`, all 11 `src/components/meeting/*` files, `src/premium/index.tsx`, `AutoAnswerAccessDialog.tsx`, `AutoAnswerModelCard.tsx`, `AutoAnswerStopSharingDialog.tsx`, `autoAnswerDialogKit.tsx`, `ProfileVisualizer.tsx`, `ProfileFeatureToaster.tsx`, `JDAwarenessToaster.tsx`, `RemoteCampaignToaster.tsx`, `NegotiationCoachingCard.tsx`, `NativelyApiPromoToaster.tsx`, `MaxUltraUpgradeToaster.tsx`, `AccordionSection.tsx`, `BrandMark.tsx`, `ConfirmDialog.tsx`, `ConnectCalendarButton.tsx`, `GenieModal.tsx`, `GlassEffectLayer.tsx`, `SwapText.tsx`, `aiProviderMarks.ts`, `bannerStack.mjs`, `toast.tsx`, `useTextsReveal.ts`, `GlassSurface.tsx`, `LiquidGlassBadge.tsx`, `LiquidGlassButton.tsx`, `LenticularGlass.tsx`, `lenticular.ts`, `useCornerSlot.ts`, `useResolvedTheme.ts`, `messageId.ts`, `modelUtils.ts`, `platformUtils.ts`, `prismLanguage.ts`, `registerPrismLanguages.ts`, `resumeSummary.mjs`, and all active non-billing `src/lib/*` helpers other than the 4 items below.

| local file:line | recovered asset:line | difference | action |
| --- | --- | --- | --- |
| `src/components/MeetingDetails.tsx:3165` | `App-C2irX2ey.js:15312-15315` | Tab switcher container `<div>` is missing `data-guide="meeting-tabs"`, preventing `LauncherGuide` steps `notes`/`notes2` from anchoring to the tabs. | `copy` |
| `src/lib/onboarding/firstRunGuide.mjs:23-44,172-180` (+ `.d.mts`) | `useResolvedTheme-EStphwh1.js:845-867` | Export `GUIDE_STEP_NUMBER`, `GUIDE_STEP_TOTAL = 14`, `GUIDE_DONE_HOLD_MS = 1000`, `GUIDE_STOP_LOCK_MS = 30_000` (and keep trial/plans helpers `Tt`/`Mt`/`jt` out per `leave-billing`). | `copy` |
| `src/lib/onboarding/shortcutKeys.mjs:68-71` (+ `.d.mts`) | `useResolvedTheme-EStphwh1.js:934-942` | Add `GUIDE_SHORTCUT_FALLBACKS` and export `shortcutKeysFor(keybinds, id, platform)`. | `copy` |
| `src/lib/demoVideoUrl.ts:3` | `App-C2irX2ey.js:25223-25225` | Export `GUIDE_SILENT_DEMO_DELAY_MS = 8_000` and `GUIDE_AUTO_ANSWER_DELAY_MS = 15_000` alongside `DEMO_VIDEO_URL`. | `copy` |
| `src/components/onboarding/useRecoveredGuide.ts` | `useResolvedTheme-EStphwh1.js:845-1123` | Re-export shared constants from `firstRunGuide.mjs`, and export `useGuideStopLock()`, `isGuideStep()`, and `useGuideShortcuts()` matching 3.2.0 `Xe`, `Je`, `Rt`. | `copy` |
| `src/lib/guideShortcutLabel.ts:1-3` (+ `src/lib/__tests__/GuideShortcutLabel320.test.mjs`) | Absent from all 3.2.0 bundles (added in local-only commit `acbd1f2c`) | Local-only unreferenced helper and its dedicated test (`"Ctrl/Alt/Shift/Win"` absent from 3.2.0). | `remove` |
| `src/lib/onboarding/firstRunGuide.mjs:162`, `premium/src/RoleInsightPanel.tsx` (`recovered/App-h7VwvpAg.js:4249,4271`), `BillingCycleSwitch.tsx`, `InteractiveCard.tsx`, `src/lib/trial/*`, `apiPlans.mjs`, `lifetimeSale.mjs`, `plansMotion.ts`, `proRefusal.mjs`, `trialCampaign.mjs`, `trialPolicy.mjs`, `funnel/*` | Various | Billing/packs/plans/trial/Pro refusal UI & helpers. | `leave-billing` |
| `OrchestratedToasterHost.tsx`, `PermissionsToaster.tsx`, `BrowserExtensionToaster.tsx`, `outputsView.ts`, `MeetingDetails.tsx` (dead branches), `RoleInsightPanel.tsx` (`.displayName`), `appVersion.ts` (`3.1.0` vs `3.2.0`) | Various | Dev-only guards, tree-shaken exports, `.displayName`, version metadata. | `leave-format` |
| `PermissionsOnboardingFull.tsx`, `BrowserExtensionIcon.tsx`, `FollowUpEmailModal.tsx`, `ChannelCard.tsx`, `dialog.tsx`, `card.tsx`, `ProviderMark.tsx`, `LiquidGlassCta.tsx`, `pdfGenerator.ts`, `pdfCjkText.mjs`, `featureFlags.ts`, `glassDisplacementMap.ts`, `overlaySttPersistence.mjs` | Absent from dist (tree-shaken; pre-date local-only parity commits) | Unimported legacy files in repo that pre-date local-only commits; cannot prove from compiled dist whether 3.2.0 source retained or removed them. Left untouched. | `unsure` |
