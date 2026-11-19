# Phase 4b: full renderer audit against Natively 3.2.0 (Antigravity)

Keep working until the "Done when" list is fully met. Don't stop to ask permission between steps, and don't report back after doing only part of the work.

## Context
- Branch `fix/restore-premium-types`, HEAD `8de6813f` ("Restore 3.2.0 renderer behavior (parity phase 4)"). Read `AGENTS.md` and `CLAUDE.md` first.
- Phase 4 ported the first-run guide, ModesSettings, the Help restart action and the phone-mirror stream handling. All eight gate commands pass on HEAD.
- `docs/parity/phase4-renderer-audit.md` marks several areas "sampled" or "full branch audit remains open". This round closes every one of them.

## The rule
Copy recovered 3.2.0 exactly. Invent nothing and improve nothing. Keep nothing local-only, including accessibility extras.
- If 3.2.0 lacks something, remove it.
- If you can't confirm the 3.2.0 expression, record it as "unsure" and leave the code alone.

"Full branch audit" means that, for each component, you compare against 3.2.0:
- every rendered branch (conditionals, ternaries, early returns)
- every visible string, label, title, placeholder, tooltip and aria attribute
- every control and its order
- every effect and its dependencies, timers and polls
- every `window.electronAPI.*` call, with its arguments and error handling
- every optimistic update and rollback

## Source of truth
- `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/reconstructed/readable/dist/assets` (read this first)
- `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/compiled/app/dist/assets` (use this to confirm)
- `node scripts/parity/compare-renderer-strings.mjs` gives leads only. It currently lists 295 strings only in 3.2.0 and 284 only locally, mostly minified fragments.

## Never touch
- Billing, packs and plans: `proAccess.ts`, `packProRule`, `packClockWiring`, `PackMeetingClock`, ProEntitlement*, the licence and pack code in `electron/ipcHandlers.ts`, the answer-length Pro registration in `electron/main.ts`, the plans tab, and the `UnlockProPlans` and pack UI and text.
- The `forceTrialEnded` dev query.
- `electron/services/devPremiumOverride.ts` and its call sites.
- The `pinUserData` isPackaged guard.
- The calendar OAuth secrets, which stay empty.
- Main-process files, unless a renderer IPC contract forces a change. Report every such change.

## Scope: close every open row
1. **Settings `general`**: every branch, beyond the sampled Auto Answer and Ambient Chat.
2. **Settings `ai-providers`**: one provider at a time. Cover key entry, test, save, rollback, model lists, custom endpoints, Ollama and Codex CLI, and the Natively API rows.
3. **Settings `overlay`**: every control, not just answer length.
4. **Settings `help`**: every row other than restart.
5. **Re-check the tabs marked "no confirmed difference"** (retrieval, audio, calendar, keybinds, phone-mirror, connections, intelligence, about) at full-branch depth, since some were reviewed only by order and IPC names.
6. **NativelyInterface**: every handler and effect other than What to Say and phone mirror. That includes:
   - clarify, recap, follow-up, brainstorm and the other quick actions
   - manual chat input, stop and cancel
   - screenshot and crop flows
   - page-context capture
   - Direct Assist states
   - stream token, done and error arbitration
   - transcript and rolling bar
   - banners other than the guide
   - keyboard shortcuts inside the overlay
   - resize and expand behaviour
   - copy and regenerate actions
   - message rendering: code blocks, diagrams, notices, quiet notes
7. **NotesWindow, App.tsx, Launcher.tsx**: every control and condition beyond the guide.
8. **`premium/src/ModesSettings.tsx`**: visual details beyond the rows already ported.
9. **Every other renderer component**, including:
   - `SettingsPopup` (`?window=settings`, the quick-toggles panel)
   - the onboarding and welcome flows, toasters and the shortcut tour
   - the meeting list and detail views
   - the cropper
   - `src/premium` and `premium/src` components not already checked
   - `src/lib` helpers that the renderer calls

## How to work (Antigravity)
- Plan first: create an implementation-plan artifact that lists every scope item, then work through it in order and tick items off.
- If Agent Manager is available, split the audit across parallel agents. Use one per Settings tab, 3–4 for NativelyInterface handler groups, and one each for NotesWindow/App/Launcher, ModesSettings and the remaining components. Give each agent the rule, the "full branch audit" definition, the never-touch list and one narrow target.
- Each audit produces a table with these columns: local file:line, recovered asset:line, difference, action (copy / remove / leave-billing / leave-format / unsure). Only report "no difference" after checking every branch.
- Merge the tables into `docs/parity/phase4b-findings.md`, removing duplicates, then fix every copy and remove item.
- Before the gate, review your own diff for regressions, type errors and swallowed errors that 3.2.0 doesn't also swallow. Matching 3.2.0 beats style, so don't make improvements.
- Don't use the built-in browser to "test" the Electron app. It can't reach the main process or IPC. If you want a UI check, use `npm run dev:agent` plus agent-browser as described in CLAUDE.md.
- If the `code-review-graph` MCP is unavailable, read the recovered bundles and use `rg` directly.

## Tests
- Delete tests that were created only by local-only commits. Check with `git log --diff-filter=A -- <file>`.
- Update the remaining tests so they expect the 3.2.0 code.
- Add parity tests for restored behaviour, in the style of `AutoAnswerUiParity2026_11_17.test.mjs` and `FirstRunGuideParity2026_11_18.test.mjs`.

## Gate
After your final edit, run all eight commands in order. Fix any failure and rerun until every one passes.
```
npm run build:electron
npm run build
npm run typecheck:electron
npm test
npm run test:intelligence
npm run test:lib
npm run test:components
npm run test:scripts
```
Optional: `npm run dev:agent` plus agent-browser, as described in the CLAUDE.md section "Agent UI testing via CDP". The Settings panel lives in the launcher window, not in `?window=settings`.

## Cross-platform (CLAUDE.md)
- Keep both the darwin and win32 branches wherever the renderer has them, for example the audio tab's macOS-only rows.
- No Unix-only commands and no hard-coded paths.
- Don't claim physical testing you didn't do.

## Don't commit
Leave everything staged.

## Done when
- [ ] Every row in `phase4-renderer-audit.md` reads Copied, Removed, Leave-billing, Leave-format or Unsure, and none says "sampled" or "remains open"
- [ ] Every scope item above has been audited at full-branch depth, and every copy and remove item is fixed
- [ ] The "Pending checks" section of the audit is empty, or lists only Unsure items with reasons
- [ ] All eight gate commands pass after the last edit (report the counts)
- [ ] `code-reviewer` found no violation of the rule or the never-touch list

## Report
Include:
- the files changed
- every finding and what you did with it
- the Unsure items
- how the work was split, and what each part found
- the gate counts for each command
- the CLAUDE.md validation categories: `Build validated on macOS`, `Reviewed but not executed on Windows`, `Requires physical macOS verification`, `Requires physical Windows verification`, and so on
