# Full App Follow-Up: Reference Selection, Modes Parity, and Live Feature Verification (for Antigravity or Codex)

## Mission

The previous full audit is incomplete. It compared only the premium knowledge and licensing files, found no Modes Manager reference, and did not exercise any feature in the running app. This follow-up closes those gaps.

Deliver three things with evidence:

1. **Correct reference mapping.** For every feature, state which recovered version holds its reference and why.
2. **Parity for every feature, including Modes Manager,** against that reference, covering code, UI, and behavior.
3. **Live verification.** Run the app and exercise every feature flow, with observed results recorded.

Fix what you find. Do not stop at a report. Stop and ask only when a fix needs a product decision.

---

## Reference sources (do not confuse them)

| Version | Path | What it contains |
|---|---|---|
| **natively-3.1.0** | `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/source/natively-3.1.0/` | The latest recovered tree. Only 45 premium knowledge and licensing files are present. Other features are absent. |
| **natively-2.9.2** | `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/source/natively-2.9.2/` | Older but broader. Contains Modes Manager (`electron/services/ModesManager.ts`), `ModesSettings.tsx`, the Modes tests, and likely other feature code. |

Rules:
- Search **both** trees for every feature before concluding a reference is missing. Missing from 3.1.0 is not the same as missing.
- When 3.1.0 and 2.9.2 both have a feature, prefer 3.1.0 for logic that was intentionally changed later, and check `git log` in the current repo for the reason. Otherwise use 2.9.2.
- Do not copy whole files from either tree over current code. Port the specific logic.

---

## Context

- **Current repo:** `/Users/shubhampandey/testing/natively-cluely-ai-assistant`
- **Branch:** `fix/restore-premium-types`
- **Run:** `npm run electron:dev:ultra` (sets `NODE_ENV=development NATIVELY_DEV_PREMIUM=1 NATIVELY_DEV_PLAN=ultra`). `npm run dev` is Vite only.
- **Graph tool:** `code-review-graph` is disconnected. Use `grep`, `find`, `Read`, and `git log -S`.
- **Working-tree changes:** the user has in-progress edits in `electron/ipcHandlers.ts`, `premium/src/ModesSettings.tsx`, `src/types/electron.d.ts`, and untracked test files, including `RoleInsightJdStaging.test.mjs` and `ModesManagerRecoveredAudit2026_11_06.test.mjs`. Preserve them. Do not revert, reformat, or stage files you did not change. Do not commit.
- **Cross-platform rule:** Natively ships on macOS and Windows. Each change needs an impact note for both. No hardcoded `/tmp`, `~/Library`, or Unix-only shell commands. Platform branches must be explicit, and tests must inject the platform rather than mutate `process.platform`.
- **Temp files:** use the session scratchpad directory, never `/tmp`.

---

## Use ECC agents

Split the work so no single agent holds the whole audit:

1. **Reference mapper (1 agent):** for every feature in the inventory below, find the reference in 3.1.0 and 2.9.2, and record file paths and the reason for the choice.
2. **Parity agents (one per feature group):** compare reference vs current logic and UI for their group. Groups:
   - A: Modes Manager and reference files
   - B: Profile Intelligence (resume, JD, AOT, knowledge DB)
   - C: Company Intel and career guidance
   - D: Role Insight
   - E: Live transcription, STT, and audio
   - F: Assist overlay, screenshots, shortcuts, click-through, window levels
   - G: Meeting notes, summaries, templates, export
   - H: Licensing, premium gating, dev override
   - I: Credentials and secure storage
   - J: Settings, keybinds, preferences
   - K: Calendar, integrations, phone mirror, tray, updates, packaging (only what exists in a reference)
3. **Live-run agents (one per group, sequential on the single app instance):** exercise every flow in the running app and record observed results. Only one agent drives the app at a time, to avoid conflicting state.
4. **Independent reviewer:** re-checks every "matched" and "works" verdict. It must not be the agent that made the verdict and must try to find a counterexample.
5. **Fix agents:** one per group, with disjoint file ownership.
6. **Final verifier:** re-runs tests and the live checks from scratch.

Consolidate outputs yourself. Reject any claim without file:line evidence or observed output.

---

## Phase 1: Feature inventory and reference mapping

Build a table: feature | 3.1.0 path(s) | 2.9.2 path(s) | chosen reference | current path(s) | reason for choice.

Find the references with:

```bash
R31=/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/source/natively-3.1.0
R29=/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/source/natively-2.9.2
grep -rli "<keyword>" "$R31" "$R29" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" 2>/dev/null | grep -v node_modules
```

Keywords to search per feature include: `ModesManager`, `ModesSettings`, `modes:`, `referenceFile`, `transcri`, `overlay`, `screenshot`, `shortcut`, `meeting`, `summary`, `license`, `keytar`, `credential`, `safeStorage`, `keybind`, `calendar`, `phone`, `tray`, `autoUpdate`, `RoleInsight`, `CompanyResearch`, `ProfileIntelligence`.

Record features that exist in neither reference as "not in any recovered source" and list them. Do not treat them as passing.

---

## Phase 2: Code and UI parity

For each group:

1. Compare IPC channels across `ipcMain.handle`/`safeHandle`, `preload.ts`, and `src/types/electron.d.ts`. Flag any channel present in one place only, and any payload shape mismatch.
2. Compare the core logic of each operation side by side. Note dropped branches, changed defaults, changed error handling, and changed event broadcasts.
3. Compare the UI. For Modes Manager, use the checklist in `MODES_MANAGER_FOLLOWUP_PROMPT.md`: section order, labels, copy, placeholder text, template picker, delete confirmation, reference-file rows and empty state, note sections, source contract, answer policy, Pro gate, and error text.
4. Confirm each feature is registered at startup, and is not dead code.

Classify each gap: **regression** (reference behavior lost), **improvement** (keep), **intentional** (git evidence; keep and document), or **bug in both** (fix).

---

## Phase 3: Live verification in the running app

Run:

```bash
npm run electron:dev:ultra
```

Drive the renderer through the agent-browser harness in `CLAUDE.md`, and use the launcher window for settings:

```bash
agent-browser tab <launcher target>
agent-browser eval "window.electronAPI.openSettingsTab('ai-providers')"
agent-browser eval "location.search"   # confirm the document before trusting a snapshot
agent-browser console
agent-browser errors
```

Never use `--auto-connect`. Stop the app through the launcher, not `agent-browser close`.

For each feature below, perform the flow, record the result, and save screenshots to the scratchpad directory:

| Feature | Flows to exercise |
|---|---|
| Modes Manager | Create from template, create empty, rename, delete (custom and built-in General), activate, deactivate, custom context save, source contract switches, answer policy get/set, note sections add/rename/delete, generate from brief (with and without a configured LLM) |
| Reference files | Upload PDF, DOCX, TXT, MD; oversized file; unsupported type; duplicate file (dedupe); delete; confirm index status updates; confirm the reference content reaches a live turn |
| Profile Intelligence | Upload resume; upload JD; delete JD; check profile status flags; confirm AOT auto-runs after JD upload |
| Company Intel | Run research with no search key (LLM-only); run with a Tavily or Natively key if available; confirm cache hit on second run; confirm expiry behavior |
| Role Insight | Paste JD; import JD by URL; run analysis; confirm no temp-file collision on two quick requests |
| Live transcription / STT | Start and stop listening; confirm transcript appears; check device selection; check reconnect after device change |
| Assist overlay | Trigger an answer; check streaming; check shortcut; check click-through toggle; check window stays on top |
| Screenshots | Trigger capture; confirm permission prompt handling; confirm image attaches to a turn |
| Meeting notes | Finish a meeting; confirm it persists; regenerate summary with a different template; export if present |
| Licensing and gating | Run with `NATIVELY_DEV_PREMIUM=1` and without it; confirm the Pro gate and the plan shown (`ultra` in dev) |
| Credentials | Save an API key; confirm it is stored (never in plain text in logs or files); confirm it persists across restart |
| Settings and keybinds | Change a setting; change a keybind; restart; confirm both persist |
| Restart persistence | Restart the app after changes in each feature; confirm state survives |

Use test values only. Never enter a real credential, and never read secret values into logs or reports.

Where a flow needs a provider key or OS permission that is unavailable, mark it **not run** and state the reason. Do not mark it passing.

---

## Phase 4: Fix

Fix in this order:
1. Anything that blocks a feature from starting or completing
2. Regressions against the reference
3. Data loss or wrong data persisted
4. Silent failures (errors swallowed, UI shows success on failure)
5. UI structure and copy differences
6. Visual differences

For each fix, add or update a test. For platform-sensitive fixes, cover both `darwin` and `win32` branches with an injected platform value.

---

## Validation

```bash
npx tsc --noEmit
npx tsc --project electron/tsconfig.premium-check.json --noEmit
npm run build:electron
npm run test:modes:no-build
npm run test:company-research-spend
npm test
```

`npm run test:modes:no-build` exited 1 in an earlier run and was not explained. Find the cause, fix it or document it, and report the exit code.

---

## Report Format

### 1. Reference mapping
Feature | 3.1.0 path | 2.9.2 path | chosen reference | reason.

### 2. Parity table
Feature | area (code/IPC/UI) | reference file:line | current file:line | classification | fixed?

### 3. Live verification table
Feature | flow | expected | observed | screenshot path | status (passed / failed / not run) | reason if not run.

### 4. Bugs fixed
```
BUG: [description]
Feature:
File: path:line
Reference: file:line
Root cause:
Fix:
Test:
Platform impact: macOS [ ] Windows [ ] Both [ ] Neither [ ]
```

### 5. Features absent from every recovered source
List them, and state that they were not verified.

### 6. Intentional differences kept
With the commit that introduced each.

### 7. Validation run
Every command actually run, with exit code.

### 8. Not verified
- Windows: rendering, native file dialogs, secure storage, audio and capture, packaging
- macOS: permission prompts that cannot be automated
- Live external services: Tavily, Natively API, LLM and embedding providers

---

## Success Criteria

- Every feature in Phase 1 has a reference mapping, and no feature is marked "missing" without a search of both trees
- Modes Manager has parity evidence against 2.9.2 for code and UI
- Every flow in Phase 3 has an observed result, or a stated reason it was not run
- No flow is marked passing without observed output
- `npx tsc --noEmit` exits 0
- `npx tsc --project electron/tsconfig.premium-check.json --noEmit` exits 0
- `npm run build:electron` exits 0
- `npm test` exits 0
- `npm run test:modes:no-build` exits 0, or its failure is explained with a fix
