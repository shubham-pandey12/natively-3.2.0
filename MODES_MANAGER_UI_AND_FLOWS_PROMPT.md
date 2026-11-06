# Modes Manager: UI Parity and Remaining Flow Verification (for Antigravity or Codex)

## Mission

Two problems remain in Modes Manager:

1. **The UI does not match the recovered 2.9.2 source.** Copy, section labels, button labels, layout, and dialogs differ. This was reported by the user and has not been fixed.
2. **Many Modes flows were never exercised in the running app.** Only create, list, activate, and deactivate were run. The rest are unverified.

Fix the UI to match 2.9.2, then run every Modes flow that can run without external credentials, and record the observed result for each. Fix what you find.

---

## Decision held: Technical Interview fallback

The current code restores the 2.9.2 Technical Interview fallback in `electron/services/ModesManager.ts` (around lines 504–534). The user has **not yet confirmed** this behavior. Do not expand it, and do not remove it. Leave it as is, and do not write new tests that depend on it. Report any test that breaks because of it, and list it under Open Questions. Do not change `BuiltinModeAdoption2026_08_09.test.mjs` to make it pass.

---

## Reference

- **Recovered UI and logic (use this):** `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/source/natively-2.9.2/`
  - `src/components/settings/ModesSettings.tsx`
  - `electron/services/ModesManager.ts`
  - `electron/services/__tests__/` (Mode tests)
- **Current:** `/Users/shubhampandey/testing/natively-cluely-ai-assistant/`
  - `premium/src/ModesSettings.tsx` (the Modes UI lives here)
  - `electron/services/ModesManager.ts`
- **Do not use natively-3.1.0 for Modes.** It has no Modes files.

---

## Context

- **Branch:** `fix/restore-premium-types`
- **Run:** `npm run electron:dev:ultra` (sets `NODE_ENV=development NATIVELY_DEV_PREMIUM=1 NATIVELY_DEV_PLAN=ultra`). `npm run dev` is Vite only.
- **Browser harness:** follow `CLAUDE.md`. Open the Modes panel from the launcher window (`agent-browser tab <launcher target>`, then `window.electronAPI.openSettingsTab('ai-providers')` or the Modes tab). Confirm the document with `agent-browser eval "location.search"` before trusting a snapshot. Never use `--auto-connect`. Stop the app through the launcher.
- **In-progress user work:** `premium/src/ModesSettings.tsx`, `electron/ipcHandlers.ts`, `src/types/electron.d.ts`, and untracked files such as `ModesManagerRecoveredAudit2026_11_06.test.mjs`, `RoleInsightJdStaging.test.mjs`, and the prompt files. Keep the user's edits. Make changes on top of them. Do not revert, reformat, or stage files you did not change for this task. Do not commit.
- **Graph tool:** `code-review-graph` is disconnected. Use `grep`, `Read`, and `git log -S`.
- **Cross-platform rule:** Natively ships on macOS and Windows. Note the impact of each change on both. Do not hardcode `/tmp`, `~/Library`, or Unix-only commands. Use the scratchpad directory for temp files.
- **No provider keys.** No LLM, embedding, or search key is configured. Flows that require one are reported as "not run."

---

## Use ECC agents

- **UI parity agent (1):** compares the 2.9.2 `ModesSettings.tsx` with the current component, element by element, and produces the diff list.
- **UI fix agent (1):** applies the diff list to `premium/src/ModesSettings.tsx`, restoring the 2.9.2 copy and layout. Owns that file only.
- **Flow agent (1):** runs the live flows in Phase 3 in the running app. It is the only agent driving the app.
- **Independent reviewer (1):** checks every "matches" verdict from the UI agent, and every "passed" verdict from the flow agent. It must try to find a counterexample.
- **Final verifier (1):** reruns the tests and the screenshot comparison from scratch.

Consolidate the results yourself. Reject any claim without file:line evidence or observed output.

---

## Phase 1: UI parity (2.9.2 → current)

Compare these elements. For each, record 2.9.2 file:line, current file:line, the exact text or style in each, and whether they match.

1. Panel heading and any intro copy
2. Mode list heading ("Available Modes" in 2.9.2) and the "New" button label
3. Mode template picker: template names, descriptions, and order
4. Mode name field and placeholder text
5. Custom context field: label, placeholder, helper text
6. "Reference Documents" section heading, empty state, file row layout (name, size, status), upload and delete controls
7. "Save Changes" button label and position
8. Delete action: label, confirmation wording, and which modes can be deleted
9. Built-in General mode: which controls are disabled, and how the disabled state looks
10. Active mode indicator style
11. Error message text and location
12. Note sections, source contract, answer policy: keep these as current if 2.9.2 has no equivalent, and note that in the report

Restore the 2.9.2 copy and layout. Keep current controls that have no 2.9.2 equivalent (source contract and answer policy), and mark them "current-only." Do not redesign the component.

If an element differs and the current version was introduced by a commit that deliberately changed it, check `git log -S "<text>"` and list it under Intentional Differences. Do not revert it without asking.

**Screenshot comparison:** capture the current Modes panel in each state (empty list, built-ins listed, a custom mode selected, template picker open, reference files with zero and with two files, delete confirmation). Save to the scratchpad directory. If 2.9.2 cannot be rendered, state that the comparison is from code only.

---

## Phase 2: Tests for UI changes

Where a UI string or structure is changed, update or add a test that asserts the 2.9.2 text is present in `premium/src/ModesSettings.tsx`. Do not write a test that asserts on layout pixels.

---

## Phase 3: Live flows that can run without credentials

Run each in `npm run electron:dev:ultra`. Record the expected result, observed result, screenshot path, and status: **passed**, **failed**, or **not run** (with reason).

| # | Flow | Expected |
|---|---|---|
| 1 | Rename a custom mode | Name updates in list and in the header; persists after relaunch |
| 2 | Rename with empty name | Rejected with a visible error; name unchanged |
| 3 | Rename to a duplicate name | Behavior matches 2.9.2 (record which) |
| 4 | Delete a custom mode | Confirmation shown; mode and its reference files removed after confirm |
| 5 | Cancel a delete | Mode remains |
| 6 | Try to delete built-in General | Blocked; UI shows the disabled state |
| 7 | Save custom context | Text persists after relaunch |
| 8 | Save custom context over the length limit | Behavior matches 2.9.2 (record which) |
| 9 | Add a note section | Section appears; persists after relaunch |
| 10 | Rename a note section | Title updates; persists |
| 11 | Delete a note section | Section removed; persists |
| 12 | Upload a small TXT reference file (test fixture you create in the scratchpad) | File row appears with correct name and size; count updates |
| 13 | Upload the same file again | Dedupe behavior matches the code (record result) |
| 14 | Delete the reference file | Row removed; count updates; persists after relaunch |
| 15 | Upload an unsupported file type | Clear error; no row created |
| 16 | Switch between modes with different reference files | Each mode shows only its own files |
| 17 | Source contract switch change | Persists after relaunch |
| 18 | Answer policy get and set | Value persists |

Not run (requires credentials or native dialogs):
- Generate mode from brief (no LLM key)
- PDF and DOCX upload extraction if a text fixture cannot exercise it
- Live grounded turn using reference content (no LLM key)
- Reference indexing with embeddings (no embedding key)

For flows that the native file dialog blocks, use the IPC channel directly from the harness (`modes:upload-reference-file` path input, if the handler accepts one) or mark them "not run." Do not mark them passed.

Never enter a real credential. Use only test values.

---

## Phase 4: Fix

Fix any failing flow in this order: (1) data loss or wrong data persisted, (2) flows that do not persist after relaunch, (3) silent failures, (4) copy and layout. Add a test for each fix where a test can cover it. Note platform impact for macOS and Windows.

---

## Validation

```bash
npx tsc --noEmit
npx tsc --project electron/tsconfig.premium-check.json --noEmit
npm run build:electron
npm run test:modes:no-build
npm test
```

Also run the Modes suites with Electron:

```bash
node scripts/run-with-env.mjs --default-tmpdir NATIVELY_TEST_USERDATA=natively-test-userdata --default-tmpdir CODEX_HOME=natively-test-codex-home --set ELECTRON_RUN_AS_NODE=1 -- electron --test electron/services/__tests__/ModesManager*.test.mjs electron/services/__tests__/ModeBleeding*.test.mjs electron/services/__tests__/CustomModes.test.mjs electron/services/__tests__/ModeSourceContract.test.mjs electron/services/__tests__/ModeGenerator.test.mjs electron/services/__tests__/ModeUploadHardening.test.mjs
```

---

## Report Format

### 1. UI parity table
Element | 2.9.2 (file:line, text) | current (file:line, text) | match | fixed | intentional? (commit)

### 2. Flow results
# | flow | expected | observed | screenshot | status | reason if not run

### 3. Bugs fixed
```
BUG:
File: path:line
2.9.2 reference: file:line
Root cause:
Fix:
Test:
Platform impact: macOS [ ] Windows [ ] Both [ ] Neither [ ]
```

### 4. Open questions
Include the Technical Interview fallback: any test it breaks, and whether it should stay.

### 5. Validation run
Every command with exit code.

### 6. Not verified
Windows rendering and native dialogs; macOS permission prompts; live provider calls; PDF/DOCX extraction if not run.

---

## Success Criteria

- Every row in the UI parity table has evidence on both sides, and no row is left as "unknown"
- Flows 1–18 each have a status with observed output or a stated reason
- No flow is marked passed without observed output
- `npx tsc --noEmit` exits 0
- `npx tsc --project electron/tsconfig.premium-check.json --noEmit` exits 0
- `npm run build:electron` exits 0
- `npm run test:modes:no-build` exits 0
- `npm test` exits 0
- The Technical Interview fallback is left unchanged and listed under Open Questions
