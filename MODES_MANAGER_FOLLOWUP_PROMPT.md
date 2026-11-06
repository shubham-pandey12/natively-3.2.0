# Modes Manager: Follow-Up Parity Fix (UI and Features) for Antigravity

## Mission

The previous Modes Manager audit was not accepted. Two problems remain:

1. **The UI does not look or behave the same as the recovered source.** Layout, copy, controls, ordering, empty states, and dialogs differ.
2. **Not all features match the recovered source.** Some behavior is missing, altered, or wired differently.

Your job is to make Modes Manager match the recovered source in both UI and features, verified in the running app, with evidence for every item. Fix what you find. Do not stop at a report.

---

## Critical correction to the previous audit

The previous report compared against `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/source/natively-2.9.2/`. **That is the wrong reference.** The correct recovered reference is:

```
/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/source/natively-3.1.0/
```

Redo the parity comparison against `natively-3.1.0` from scratch. Discard any "Match" verdict from the 2.9.2 comparison.

---

## Context

- **Current repo:** `/Users/shubhampandey/testing/natively-cluely-ai-assistant`
- **Branch:** `fix/restore-premium-types`
- **Run:** `npm run electron:dev:ultra` (sets `NODE_ENV=development NATIVELY_DEV_PREMIUM=1 NATIVELY_DEV_PLAN=ultra`). `npm run dev` is Vite only and does not start Electron.
- **Graph tool:** `code-review-graph` failed to connect. Use `grep`, `find`, and `Read`, and say so.
- **Other work in the tree:** the user has in-progress changes in `electron/ipcHandlers.ts`, `premium/src/ModesSettings.tsx`, `src/types/electron.d.ts`, and untracked test files (including `RoleInsightJdStaging.test.mjs`). Do not revert, reformat, or stage any file you did not change for this task. Do not commit.
- **Cross-platform rule:** Natively ships on macOS and Windows. Every change needs an impact note for both. No hardcoded `/tmp`, `~/Library`, or Unix-only commands. Platform-specific branches must be explicit.
- **Temp files:** write to the session scratchpad directory, never `/tmp`.

---

## Use ECC agents

Split the work so no single agent holds the whole audit:

- **UI parity agents (2):** one for the layout and visual structure of `ModesSettings`, one for copy, labels, empty states, and dialogs. Each compares recovered vs current and lists every difference with file:line on both sides.
- **Feature parity agent:** compares behavior of each mode operation (create from template, create empty, rename, delete, activate, custom context, reference files, note sections, source contract, answer policy, generate from brief) between recovered and current.
- **Independent reviewer:** a separate agent takes each "matched" verdict and tries to find a difference. It must not be the agent that made the verdict.
- **Fix agents:** one per area (UI or feature), with disjoint file ownership.
- **Final verifier:** re-runs the app check and tests from scratch.

Consolidate the results yourself. Reject any claim without file:line evidence or observed output.

---

## Step 1: Locate the recovered Modes UI and logic (3.1.0)

```bash
RECOVERED=/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/source/natively-3.1.0
grep -rln "ModesSettings\|modesGetAll\|modes:get-all" "$RECOVERED" --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null | grep -v node_modules
```

Identify the recovered `ModesSettings` component and its helpers. Note its exact file path, because the current one lives under `premium/src/ModesSettings.tsx`.

---

## Step 2: Capture both UIs and compare visually

Run the current app:

```bash
npm run electron:dev:ultra
```

Open the Modes settings panel and capture screenshots of every state:

- Empty list / first launch
- Built-in modes listed, with one active
- A custom mode selected
- Create dialog or template picker open
- Rename in progress
- Delete confirmation
- Reference files section with zero files and with several files
- Note sections list
- Source contract (`KnowledgeSource`) section
- Answer policy section
- Pro-gate state for a non-premium user (set `NATIVELY_DEV_PREMIUM` unset to test)
- Error state (for example, a failed create)

For the recovered UI, check whether it can be run. If it can, run it the same way and capture the same states. If it cannot be run, derive its expected layout from the recovered source (JSX, class names, inline styles, copy strings) and say explicitly that the comparison is from code, not from a rendered screenshot.

Save screenshots to the scratchpad directory and list each pair in the report.

Use the agent-browser harness described in `CLAUDE.md` for renderer DOM inspection. Open the settings window through the launcher, not `?window=settings`:

```bash
agent-browser tab <launcher target>
agent-browser eval "window.electronAPI.openSettingsTab('ai-providers')"
```

Modes lives in the Settings panel of the launcher window. Confirm the document with `agent-browser eval "location.search"` before trusting a snapshot. Never use `--auto-connect`.

---

## Step 3: UI differences to check explicitly

For each item, record recovered vs current and whether it matches:

- Section order and headings
- Button labels and their order (create, template picker, delete, rename)
- Placeholder text and helper copy (for example `contextPlaceholder`)
- Template labels and descriptions in the picker
- Icon choice and icon-only button labels
- Spacing, card borders, and active-mode indicator style
- Which controls are disabled for the built-in General mode
- Confirmation wording for delete
- Reference-file row layout (name, size, index status) and its empty state
- Note section add/edit/delete affordances
- Loading and saving indicators
- Error message text and where it appears

Do not restyle the component to a new design. Restore the recovered look and copy. Where the current design was intentionally changed and documented in git history, list it under "Intentional Differences" with the commit that introduced it, and do not revert it without asking.

---

## Step 4: Feature differences to check explicitly

For each operation, compare the recovered and current behavior end to end (UI action, IPC call, main-process logic, persistence, event broadcast, UI update):

1. **Create from template**: template list, default name, default custom context, default sources, and the source contract built for it
2. **Create empty**: default template, naming, and selection after create
3. **Rename**: validation (empty name, duplicate name, max length), and whether built-in modes can be renamed
4. **Delete**: confirmation, which modes can be deleted, active-mode fallback, reference files and note sections removed with it
5. **Activate**: session reset behavior, stream abort, active indicator in UI and elsewhere
6. **Custom context**: save, sensitive-data handling, and length limits
7. **Reference files**: upload dialog, supported types, size limits, dedupe, index status updates, delete, and whether the count updates in the list
8. **Note sections**: add, rename, reorder if supported, delete, and template replacement
9. **Source contract**: each switch, and whether it persists across restart
10. **Answer policy**: get, set, and reset to default
11. **Generate from brief**: LLM required, output shape, error when no provider is configured
12. **Pro gating**: which actions are blocked for non-premium users, and what the UI shows
13. **Restart persistence**: every change above survives an app restart

For each, record: recovered behavior (file:line), current behavior (file:line), observed behavior in the running app, and match status.

---

## Step 5: Fix

Fix in this order:
1. Feature gaps that change what the user can do
2. Behavior differences that produce wrong data or wrong state
3. UI structure and copy differences
4. Visual styling differences

For each fix, add or update a test. Where a test cannot cover the UI, say so and rely on the screenshot comparison.

---

## Validation

```bash
npx tsc --noEmit
npx tsc --project electron/tsconfig.premium-check.json --noEmit
npm run build:electron
npm run test:modes:no-build
```

`test:modes:no-build` exited 1 in the previous run and was not explained. Find out why, fix it or document it, and report the exit code. Do not drop it from the report.

Run the Modes-specific suites too:

```bash
node scripts/run-with-env.mjs --default-tmpdir NATIVELY_TEST_USERDATA=natively-test-userdata --default-tmpdir CODEX_HOME=natively-test-codex-home --set ELECTRON_RUN_AS_NODE=1 -- electron --test electron/services/__tests__/ModesManager*.test.mjs electron/services/__tests__/ModeBleeding*.test.mjs electron/services/__tests__/CustomModes.test.mjs electron/services/__tests__/ModeSourceContract.test.mjs electron/services/__tests__/ModeGenerator.test.mjs electron/services/__tests__/ModeUploadHardening.test.mjs
```

---

## Report Format

### 1. Reference check
Confirm `natively-3.1.0` was used. List anything from the 2.9.2 audit that was discarded.

### 2. UI parity table
| Element | Recovered (file:line + screenshot) | Current (file:line + screenshot) | Match? | Fixed? |

### 3. Feature parity table
| Operation | Recovered (file:line) | Current (file:line) | Observed in app | Match? | Fixed? |

### 4. Bugs fixed
```
BUG: [description]
Area: UI / Feature
File: path:line
Recovered reference: file:line
Root cause:
Fix:
Test:
Platform impact: macOS [ ] Windows [ ] Both [ ] Neither [ ]
```

### 5. Intentional differences kept
With the commit that introduced each.

### 6. Open questions
Only items that need a product decision.

### 7. Validation run
Every command actually run, with exit code. Include the `test:modes:no-build` result and its cause.

### 8. Not verified
- Recovered UI screenshots if the recovered app could not be run
- Windows rendering and native file dialog
- Live embedding or LLM calls

---

## Success Criteria

- Every UI row and every feature row in the tables has evidence on both sides
- Screenshots for every state in Step 2 are captured for both recovered and current, or the gap is stated
- No unresolved difference remains, except items listed under Intentional Differences or Open Questions
- `npx tsc --noEmit` exits 0
- `npx tsc --project electron/tsconfig.premium-check.json --noEmit` exits 0
- `npm run build:electron` exits 0
- Modes-specific suites exit 0
- `npm run test:modes:no-build` exits 0, or its failure is explained with a fix
- The app was exercised in `npm run electron:dev:ultra` for every Modes operation in Step 4
