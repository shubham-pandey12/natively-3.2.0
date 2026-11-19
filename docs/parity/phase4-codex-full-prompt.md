# Phase 4 — finish renderer parity with Natively 3.2.0 (Codex, with ECC agents)

Work autonomously until the "Done when" list is fully met. Don't stop to ask permission between steps,
and don't report back after a partial step. If something is truly blocked, finish everything else, then report the blocker.

## Context
- Repo: this one, branch `fix/restore-premium-types`, HEAD `c2d3ddac` (parity R3 part 2). Read `AGENTS.md` / `CLAUDE.md` first.
- Phases 1–3 put the main process at 3.2.0 parity. Phase 4 = the renderer (`src/`, `premium/src/`).
- Already staged (keep it, don't redo it): `premium/src/ModesSettings.tsx` (knowledge panel, OKF, note templates,
  template types, file status, no extra ARIA labels), `src/types/electron.d.ts` (+1 API),
  `ModesSettingsParity2026_11_18.test.mjs`, `ModesReferenceFileStatusUi2026_11_07.test.mjs`, `docs/parity/phase4-renderer-audit.md`.
- Also already done: Auto Answer dialogs/intro/model card (`premium/src/`), `guideGet`/`guideDispatch`,
  `src/lib/onboarding/firstRunGuide.mjs`, `buildDirectWhatToSayPayload`, the What to Say / screenshot / manual chat /
  phone mirror handlers in NativelyInterface.

## The rule
Copy recovered 3.2.0 exactly. Invent nothing, improve nothing, keep nothing local-only (accessibility extras included).
If 3.2.0 lacks it, remove it. If you can't confirm a 3.2.0 expression, record it as "unsure" in the audit and leave it alone.

## Source of truth
- `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/reconstructed/readable/dist/assets` (read first)
- `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/compiled/app/dist/assets` (confirm)
- `node scripts/parity/compare-renderer-strings.mjs` — leads only; ignore minified code fragments.

## Never touch
Billing/packs/plans (`proAccess.ts`, `packProRule`, `packClockWiring`, `PackMeetingClock`, ProEntitlement*,
licence/pack code in `electron/ipcHandlers.ts`, answer-length Pro registration in `electron/main.ts`, pack/plans UI and copy),
`electron/services/devPremiumOverride.ts` and its call sites, the `pinUserData` isPackaged guard, empty calendar OAuth secrets.
Main-process files only if a renderer IPC contract forces it — report every such change.

## Use ECC agents (plugin `ecc@ecc`)
Run independent work in parallel. Give each agent a narrow brief and the rule above. Tell every reviewer that
"matches 3.2.0" beats style, so it must not propose improvements.

| Step | Agent | Job |
| --- | --- | --- |
| Map | `code-explorer` ×3 in parallel | One per surface: launcher guide tips, NativelyInterface overlay banners, NotesWindow prompts. Each extracts from the recovered bundle: component, exact text, show conditions, dismiss/advance actions, guideGet/guideDispatch calls, i18n keys, CSS classes. Also maps the matching local code. |
| Map | `spec-miner` | Turn the three maps into one parity spec in `docs/parity/phase4-first-run-guide-spec.md`. |
| Plan | `planner` | File-by-file change list from the spec, including deletions and test updates. |
| Build | (you) | Implement the plan. |
| Audit | `code-explorer` ×N in parallel | One per Settings tab in `SETTINGS_NAV_ORDER` (general, ai-providers, retrieval, audio, overlay, calendar, keybinds, phone-mirror, connections, intelligence, help, about; skip plans), plus App.tsx, the launcher, NotesWindow and remaining NativelyInterface handlers. Each reports text, controls, conditions and IPC calls that differ from 3.2.0. |
| Review | `react-reviewer`, `typescript-reviewer` | Check the diff for regressions and type errors only, not style. |
| Tests | `pr-test-analyzer` | Find tests that pin removed local behaviour, and gaps in parity coverage. |
| Fix gate | `react-build-resolver` / `build-error-resolver` | Fix build/typecheck failures without changing 3.2.0 behaviour. |
| Final | `code-reviewer` | Review the whole staged diff against the audit and the never-touch list. |
| Loop | `loop-operator` | Keep the fix → gate → fix cycle running until everything is green. |

The `code-review-graph` MCP may need reauth. If it's unavailable, use the recovered bundles and `rg` directly.

## Work
1. **First-run guide port.**
   - Port the launcher tips, overlay banners and notepad prompts ("Write while you talk.", "Ask about the meeting.",
     "Try a recipe.", "Stop the meeting when you're ready.") with 3.2.0 structure, wording, conditions and order.
   - Remove the generic `FirstRunGuideCard` copy ("Keep a note", "Ask a question", "Finish this meeting"),
     the setup checklist and the generic overlay prompts. Delete `FirstRunGuideCard.tsx` if 3.2.0 has no equivalent.
   - Update OrchestratedToasterHost, App, NotesWindow and HelpSettings to match.
   - Keep `firstRunGuide.mjs` and the guide APIs; follow 3.2.0 if its renderer reads guide state differently.
2. **Settings, launcher, notes and overlay audit.** Record every finding in `phase4-renderer-audit.md` with the action
   copy / remove / leave-billing / leave-format / unsure. Fix every copy/remove item.
3. **i18n.** Add the 3.2.0 keys for restored text and remove keys nothing uses anymore.
4. **Tests.** Delete tests created by local-only commits (`git log --diff-filter=A -- <file>`; local-only = in
   `origin/main..acbd1f2c^` or later uncommitted work). Update the rest to the 3.2.0 shape. Add
   `src/components/__tests__/FirstRunGuideParity2026_11_18.test.mjs` plus parity tests for other restored UI,
   in the style of `AutoAnswerUiParity2026_11_17.test.mjs`.
5. **Gate.** Run all eight, in order, after your final edit, until each passes:
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
6. **Optional UI check.** `npm run dev:agent` plus agent-browser per CLAUDE.md "Agent UI testing via CDP"
   (the Settings panel lives in the launcher window, not `?window=settings`). Stop the app through the launcher.

## Cross-platform (CLAUDE.md)
Shared renderer code only. No Unix-only commands, no hard-coded paths, keep `CommandOrControl` and both
darwin/win32 branches. Don't claim physical testing you didn't do.

## Don't commit
Leave everything staged.

## Done when
- [ ] All three guide surfaces match 3.2.0, and the local-only guide pieces are gone
- [ ] Every Settings tab (except plans), App, launcher, NotesWindow and NativelyInterface is audited; every copy/remove item is fixed
- [ ] The audit doc lists every remaining difference with its reason
- [ ] All eight gate commands pass after the last edit (give the counts)
- [ ] `code-reviewer` found nothing that breaks the rule or the never-touch list

## Report
Files changed; each finding and what you did; remaining differences and why; which ECC agents ran and what each found;
gate counts per command; CLAUDE.md validation categories (`Build validated on macOS`,
`Reviewed but not executed on Windows`, `Requires physical macOS verification`, `Requires physical Windows verification`, …).
