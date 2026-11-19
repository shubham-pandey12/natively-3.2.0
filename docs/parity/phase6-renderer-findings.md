# Phase 6 renderer findings (independent pass)

The 3.2.0 source inspected here is the recovered readable renderer at `recovered/reconstructed/readable/dist/assets/`. A compiled chunk is evidence for a rendered branch, but does not prove that every source-only branch or effect dependency is recoverable. The code-review-graph MCP tools were unavailable in this agent session, so discovery used `rg` and direct source inspection.

| Area | Verdict | Local evidence | Recovered 3.2.0 evidence | Finding |
| --- | --- | --- | --- | --- |
| Settings navigation, all thirteen entries | Implemented for navigation order and labels only | `src/components/SettingsOverlay.tsx:460-475,2482-2580` | `App-C2irX2ey.js:65092-65230` | General, Plans & Billing, AI Providers, Retrieval, Audio, Overlay, Calendar, Keybinds, Companion, Connectors, Intelligence, Setup & Help, About appear in the same order. This does not verify every row within the panels. |
| Launcher and meeting list/details | Unsure | `src/components/Launcher.tsx:1`; `src/components/MeetingDetails.tsx:1` | `App-C2irX2ey.js:37966-37983,42118` | Matching entry points and meeting-details call found. Full state/effect and branch comparison not completed. |
| Main overlay and TopPill | Unsure | `src/components/NativelyInterface.tsx:1461`; `src/components/ui/TopPill.tsx:1` | `NativelyInterface-ikIwHUKF.js:1`; `App-C2irX2ey.js:1` | Recovered overlay is a separate lazy chunk; full branch comparison pending. |
| Notes, cropper, settings popup | Unsure | `src/components/NotesWindow.tsx:1`; `src/components/Cropper.tsx:1`; `src/components/SettingsPopup.tsx:72` | `NotesWindow-C6aKiJKb.js:1`; `Cropper-IZeWKP0W.js:1`; `SettingsPopup-CLSGPgiv.js:1` | All three recovered entry chunks exist; row/control/effect parity not proved. |
| First-run guide and welcome | Unsure | `src/components/onboarding/LauncherGuide.tsx:56`; `src/components/onboarding/WelcomeFlow.tsx:1` | `App-C2irX2ey.js:1` | Previous parity tests are leads only; this pass did not independently inspect every guide branch. |
| Modes answer policy label fallback | Implemented for this expression | `premium/src/ModesSettings.tsx:1322-1332` | `App-C2irX2ey.js:33241-33245` | Both map the two policy values to `state.labels[value] ?? value.replace(/_/g, ' ')`. The local-only string `label:s.labels.only_answer_from_references??` is caused by source form/minification, not missing behavior. |
| Plans and pack text | Leave-billing | `src/components/settings/NativelyApiSettings.tsx:934`; `src/components/upgrade/UnlockProPlans.tsx:254` | `App-C2irX2ey.js:22299` | The one-week/two-week blurb difference is within the explicit billing hold. |

## Important limits

This pass establishes only the narrow Implemented verdicts stated above. It does **not** support an overall yes verdict, feature-complete renderer catalogue, or proof that every Settings row matches. The 3.2.0 App chunk has 79,299 lines; its settings panel, onboarding, launcher, meeting UI, and provider settings need branch-level comparison with their local components. The current string comparator emits many minified variable fragments and hashed asset filenames; its 504 leads cannot be treated as 504 feature differences.

No implementation files were edited. No tests or builds were run for this renderer investigation.

## Recovered settings panel inventory

The panel switch in `App-C2irX2ey.js:65213-67520` identifies these 3.2.0 tab entry points. Each row has an **Unsure** full-depth parity verdict even where the navigation label matches: every nested control, effect, persistence key, and error path still needs a source-to-bundle comparison. `SettingsOverlay.tsx:2644-4700` is the matching local switch.

| Tab | Recovered location | Local location | Recovered controls visible at entry |
| --- | --- | --- | --- |
| General | `App-C2irX2ey.js:65213-66112` | `src/components/SettingsOverlay.tsx:2644-3414` | Undetectable mode, login start, shortcut protection, Auto Answer, Ambient AI Chat, theme, language, version, meeting persistence, mouse passthrough, animation, overlay size, coding verification, transcript, usage statistics, debug logs, process disguise. |
| Plans | `App-C2irX2ey.js:66122-66125` | `src/components/SettingsOverlay.tsx:3432`; `src/components/settings/PlansSettings.tsx:1` | Billing hold: classify nested differences Leave-billing. |
| AI Providers | `App-C2irX2ey.js:66112-66122` | `src/components/SettingsOverlay.tsx:3418`; `src/components/settings/AIProvidersSettings.tsx:1` | Provider component mounted by tab switch. |
| Retrieval | `App-C2irX2ey.js:67487-67511` | `src/components/SettingsOverlay.tsx:4670`; `src/components/settings/RetrievalSettings.tsx:1` | Retrieval component mounted for retrieval and legacy embedding/reranker deep links. |
| Audio | `App-C2irX2ey.js:66523-67480` | `src/components/SettingsOverlay.tsx:3418-4640` | Speech provider and provider credentials, Apple speech language/accent/download, system audio capture, local model notices, input/output devices and levels, follow meeting mute, dictation. |
| Overlay | `App-C2irX2ey.js:67480-67487` | `src/components/SettingsOverlay.tsx:4640`; `src/components/settings/OverlaySettings.tsx:1` | Overlay settings component mounted. |
| Calendar | `App-C2irX2ey.js:67487` | `src/components/SettingsOverlay.tsx:4651`; `src/components/settings/CalendarSettings.tsx:1` | Calendar settings component mounted; OAuth secrets are Leave-secret. |
| Keybinds | `App-C2irX2ey.js:66125-66523` | `src/components/SettingsOverlay.tsx:3434-3678` | Shortcut table; platform branch comparison pending. |
| Phone mirror | `App-C2irX2ey.js:67487` | `src/components/SettingsOverlay.tsx:4656`; `src/components/settings/PhoneMirrorSettings.tsx:1` | Companion pairing/settings component mounted. |
| Connections | `App-C2irX2ey.js:67487` | `src/components/SettingsOverlay.tsx:4653`; `src/components/settings/ConnectionsSettings.tsx:1` | Connector settings component mounted. |
| Intelligence | `App-C2irX2ey.js:67487-67520` | `src/components/SettingsOverlay.tsx:4677`; `src/components/settings/IntelligenceSettings.tsx:1` | Intelligence settings and transcript-sharing control. |
| Help | `App-C2irX2ey.js:67511-67520` | `src/components/SettingsOverlay.tsx:4697`; `src/components/settings/HelpSettings.tsx:1` | Help component mounted with navigation, Modes, profile, and guide callbacks. |
| About | `App-C2irX2ey.js:67520` | `src/components/SettingsOverlay.tsx:4697-4728` | About panel mounted. |

### Resolved string leads from Phase 5

| Lead | Classification | Evidence |
| --- | --- | --- |
| Local `label:s.labels.only_answer_from_references??` | Minifier-fragment | Equivalent local/recovered fallback at `premium/src/ModesSettings.tsx:1328-1331` and `App-C2irX2ey.js:33241-33245`. |
| Recovered `10px 8px 4px` / local `4px 8px 4px` | Minifier-fragment | Recovered base style plus `paddingTop: 4` override at `App-C2irX2ey.js:35509,32962-32975`; local equivalent inline padding at `premium/src/ModesSettings.tsx:1735`. |
| Recovered `grayscale` | Minifier-fragment | Local `src/index.css:2412` and `src/components/settings/AIProvidersSettings.tsx:5521` contain the same behavior; recovered `App-C2irX2ey.js:32226,45144`. |
| Recovered `large-sq` | Minifier-fragment | Recovered billing UI card variant at `App-C2irX2ey.js:32303-32432`; local source uses billing UI; hold is Leave-billing for any actual difference. |
| Recovered `modes_settings` | Minifier-fragment | Same billing attribution surface at `src/components/upgrade/UnlockProPlans.tsx:216` and `App-C2irX2ey.js:32204-32209`. |
| Recovered `ap-close-btn` | Leave-billing | Selector in recovered billing UI `App-C2irX2ey.js:31499-31523,32239`. |
| Recovered `text-[11px] text-text-tertiary px-1 leading-snug` and `text-[12px] text-text-secondary px-1 leading-snug` | Leave-billing | Recovered pack/provider rules at `App-C2irX2ey.js:22405,53034`; local pack UI is intentionally held. |

## General and Audio comparison

I independently extracted translated literals and `window.electronAPI` method names from the recovered panel branches and matching local JSX. This comparison checks control text and immediate IPC wiring, not the full effect graph.

| Panel | Recovered range | Local range | Result |
| --- | --- | --- | --- |
| General | `App-C2irX2ey.js:65213-66112` | `src/components/SettingsOverlay.tsx:2644-3414` | All 44 recovered `p("…")` string values are represented locally; the only two string differences were escaped Unicode forms of the debug-log text. All 15 distinct recovered `window.electronAPI` methods match the 15 local methods. The local-only labels are from additional callbacks/conditions or formatting; each branch's behavior remains Unsure. |
| Audio | `App-C2irX2ey.js:66523-67480` | `src/components/SettingsOverlay.tsx:3679-4640` | All 97 recovered `p("…")` string values occur locally. All 6 distinct recovered `window.electronAPI` methods match the 6 local methods. Local-only `/` and `default` are formatting values. Full effect dependencies and nested model panels remain Unsure. |

The per-method IPC call counts also match exactly for General and Audio. That rules out missing or duplicated direct calls in these rendered panel ranges, while leaving their callback definitions and effects to review.

The label/IPС comparison did not prove a concrete non-billing gap. The recovered AI Providers component begins at `App-C2irX2ey.js:43784` and local `AIProvidersSettings.tsx:3362`; the recovered Retrieval wrapper begins at `App-C2irX2ey.js:58702` and local `RetrievalSettings.tsx:272`. Retrieval embeds the separate local `EmbeddingSettings.tsx` and `RerankerSettings.tsx`, so comparing only the wrapper would miss most rows. Both provider and retrieval deep branch verdicts remain **Unsure**.

For AI Providers, the recovered component and helper region `App-C2irX2ey.js:42001-46629` contains the same distinct renderer IPC methods as local `AIProvidersSettings.tsx` after accounting for a cast on `getTechnicalInterviewVisionFirst` at local line 4567 and a commented-out `invoke` at local line 4610. All 172 extracted translated strings from the recovered provider region occur in the local provider component. This narrows the remaining uncertainty to control order, arguments, effects, fallback behavior, and untranslated literals; it is not an Implemented verdict.

For Retrieval, the recovered embedding/reranker region `App-C2irX2ey.js:55191-58702` contains the same 46 distinct renderer IPC methods as the combined local `EmbeddingSettings.tsx`, `RerankerSettings.tsx`, and `RetrievalSettings.tsx`. All 153 extracted translated strings occur locally. The apparent two recovered-only strings were regex escape differences: they are present at local `EmbeddingSettings.tsx:1213` and `EmbeddingSettings.tsx:524`/`RerankerSettings.tsx:1060`. No specific retrieval gap was proven. Argument order, effects, and per-control behavior remain Unsure.

The apparent two additional local `setRerankerConfig` occurrences are TypeScript type references at `RerankerSettings.tsx:764,772`; the eight runtime call sites correspond to recovered `App-C2irX2ey.js:56990,57052-57074`.
