# First-run guide: recovered Natively 3.2.0

Source of truth: `recovered/reconstructed/readable/dist/assets/{App-C2irX2ey,NativelyInterface-ikIwHUKF,NotesWindow-C6aKiJKb,useResolvedTheme-EStphwh1}.js`, checked against matching `recovered/compiled/app/dist/assets` bundles. This is a transcription spec, not a redesign.

## Shared state

`guideGet` supplies initial state; `onGuideChanged` supplies subsequent states; `guideDispatch` sends events. The recovered `useResolvedTheme` hook delays exit by 1,000 ms and skip by 160 ms, exposes `state`, `justDone`, and `dispatch`, and toggles `data-guide-leaving`. A guide step is active only when `state.status === "active"`. Step counts are start=1, overlay=2, answer=3, screenshot=4, stop=5, notes=6, surface=7, start2=8, notepad=9, ask=10, recipe=11, stop2=12, notes2=13, plans=14, keys=14; total=14. `firstRunGuide.mjs` and IPC APIs already match and stay unchanged.

## Launcher tips

Recovered App lines 63380–63725 and 69825–69980 define `GuideGlass`, anchored `GuideTip`, the surface/plans/keys guide, and the start/notes/start2/notes2 guide. The main guide is mounted only when the launcher conditions at App line 79269 hold (`!u && y === false && (s || m)`); the secondary guide mounts in SettingsOverlay at line 65002. The local `FirstRunGuideCard` mounts unconditionally in the launcher and does not match.

`GuideTip` measures the visible anchor, highlights it with `data-guide-lit`, and portals a `role="dialog"` to `document.body`. It uses `guide-enter guide-tip`, `guide-tip-arrow`, `guide-tip-shell`, `guide-glass`, and `guide-tip-inner`, shows the step count, and shows Skip unless `justDone`. Its footer shows an action, waiting status, or Done status. Missing anchors yield the `Continue the guide` / `Skip guide` pill after 1,200 ms, or after 20 seconds for notes without an ended meeting id. The continuation action opens the relevant Settings tab, ended meeting, Home, or start flow according to the step.

| Step | Anchor | Title and body | Action / condition |
| --- | --- | --- | --- |
| start | `[data-guide="start"]` | `Start your first meeting.`; body is `Your plan covers it. Start now: the Natively demo plays in your browser so you can watch it work.` for plan, otherwise `Your free trial covers it. Start now: the Natively demo plays in your browser so you can watch it work.` | Waiting for you. Trial and credentials determine variant. |
| notes | `[data-guide="meeting-tabs"]` | `Your meeting, written up.` / `The summary and the full transcript are saved here. Find them any time on Home.` | Next dispatches `notes_next`; opens the ended meeting when available. |
| surface | `[data-guide="surface-switch"]` | `Now try the notepad.` / `Pick Notepad. Your next meeting opens there: write while you talk, and Ask with recipes.` | Waiting for you. |
| start2 | `[data-guide="start"]` | `Start Natively again.` / `This time your meeting opens in the notepad.` | Waiting for you; shows Home. |
| notes2 | `[data-guide="meeting-tabs"]` | `Your notepad meeting, written up.` / `Your notes, the summary and Ask’s answers are saved together. Find them any time on Home.` | Next dispatches `notes_next`. |
| plans | `[data-guide="nav-plans"]` | Trial-status title from recovered helper, plus `Pick a plan on the right to keep Natively Pro. Or use your own AI keys, free.` and optional `About {n} min left.` prefix. A recently bought plan shows `Thanks. You’re all set.` / `Your plan covers the AI and speech-to-text. Start a meeting any time.` | `Use my own keys` dispatches `own_keys`; `plan_changed` runs on license/credentials updates. Pack/plans UI remains on hold. |
| keys | `[data-guide="nav-ai-providers"]` | `Set up Natively your way.` / `An AI provider is all you need. Speech-to-text and retrieval make it better.` | **Recovered has a structured three-row setup list** (AI provider, Speech-to-text, Retrieval) with Paste a key / Pick one / Optional hints. Done dispatches `keys_done`, disabled without an AI key. The local generic checklist is removed, but this recovered list must remain. |

The launcher dispatches `meeting_started`/`meeting_stopped` from meeting-state changes, `trial_unavailable` from failed auto-start, and calls guide status APIs. All listed user-facing strings already exist in `src/i18n.guide.ts`.

## Overlay banners

Recovered NativelyInterface lines 1792–1931 define the guide hook, called with the current What to Say handler. It returns `{ wants, node }`; the root adds `guide` to banner slots and renders it in `fold-guide` before the trial banner. The local App-level generic overlay card has no equivalent and must be removed. It uses the existing `OverlayBanner`, with `tone="guide"`, step count, Skip dismissal, and the recovered icon/CTA arrangement.

| Step | Title / message | Action |
| --- | --- | --- |
| overlay | `This is your meeting overlay.` / `Answers, screenshots and chat show up here, over your call.`; after the recovered no-sound condition, `No sound yet? Press play on the Natively demo in your browser.` | Next dispatches `overlay_next`; Open the demo opens the recovered external demo URL. |
| answer | `They just asked you something.` / `Not on a call? Play any interview video, or ask a question out loud.`; once speech is heard, `Press the keys. Natively writes your reply from the conversation.`; no-sound message otherwise. | Displays the What to Answer keybind; `onIntelligenceSuggestedAnswer` or `onIntelligenceManualResult` dispatches `answer_shown`; recovered auto-advance may call What to Say. |
| screenshot | `Show Natively your screen.` | Displays both keybinds, labelled `Whole screen` and `Drag an area`. |
| stop | `Stop the meeting when you’re ready.` / `Press the stop button ■ in the bar at the top. Natively writes up your notes.` | Skip dismissal while active. |

Overlay guide uses `onNativeAudioTranscript`, the live keybind list and both platform-specific shortcut formats. The recovered banner slot is inside NativelyInterface; App's generic card must not remain.

## NotesWindow pill

Recovered NotesWindow lines 24445–24536 define a guide hook and pill. It is displayed only while the meeting is live, there is no auto-stop warning, and the guide hook has a node (line 28203); preview disables it. The pill has `role="status"`, `data-guide-strip` with the step name, and classes `guide-enter guide-notes-pill np-elevated rounded-[20px] pl-4 pr-1.5 py-1.5 flex items-center gap-3`. Skip dispatches `skip`, hidden during `justDone`. Active-step highlights target `[data-guide="notes-ask"]`, `[data-guide="notes-recipes"]`, or `[data-guide="notes-stop"]`; notepad has no target. Text and order:

| Step | Title | Body | Advance event |
| --- | --- | --- | --- |
| notepad | `Write while you talk.` | `Click “Write notes” at the top of the page and type a line.` | Nonblank edit dispatches `note_typed`. |
| ask | `Ask about the meeting.` | `Click Ask anything. It knows everything said so far.` | Ask opening dispatches `ask_opened`. |
| recipe | `Try a recipe.` | `Recipes are ready-made asks. Pick one, or type / to see them all.` | Recipe selection dispatches `recipe_run`. |
| stop2 | `Stop the meeting when you’re ready.` | `Press the stop button ■ in the bar at the bottom. Natively writes up your notes.` | Meeting stop advances through the shared guide reducer. |

Each advance handler is guarded by a ref to its current live guide step. The existing local NotesWindow dispatches these events without that guard. The i18n keys for all four title/body pairs already exist in `src/i18n.guide.ts`.
