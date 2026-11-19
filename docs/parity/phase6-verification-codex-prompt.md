# Phase 6: independent verification of every Natively 3.2.0 feature (Codex, with ECC agents)

Keep working until the "Done when" list is fully met. Don't stop to ask permission between steps. Don't report back after doing only part of the work.

## Goal
Decide, with evidence, whether **every 3.2.0 feature and change** is fully implemented on this branch.

This is a **verification** pass:
- Audit and classify.
- Copy over only the gaps you can prove exist.
- Do not trust earlier phase reports, commit messages or existing tests. Check everything against the recovered 3.2.0 code.

## Context
- You are on branch `fix/restore-premium-types`, HEAD `93972a14`.
- Staged and uncommitted: the version bump to 3.2.0, the `build-smoke.yml` Windows step, and `docs/parity/phase5-final-inventory.md`. Keep them.
- Read `AGENTS.md` and `CLAUDE.md` first.
- Earlier phases restored 3.2.0 behaviour in this order:
  - R3: the main process
  - 2b: Auto Answer
  - 4: the first-run guide and ModesSettings
  - 4b: the full renderer audit
  - 5: packaging validation
- All test suites pass. But many tests were rewritten to expect the copied code, so **a passing test is not evidence of parity**.
- Current status when you start:
  - `scripts/parity/compare-modules.mjs` reports **91 non-identical modules**.
  - `scripts/parity/compare-renderer-strings.mjs` reports **260 strings only in 3.2.0 and 244 only locally**.
  - `phase5-final-inventory.md` mentions "unsure" 82 times.

## Source of truth
Use the recovered 3.2.0 locations below:
- `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/reconstructed/readable/dist/assets`, the readable renderer. Read it first.
- `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/compiled/app`, the compiled app:
  - `dist/assets` (renderer)
  - `dist-electron/` (main process, preload, premium)
  - `package.json` and `native-module/`
- `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/reconstructed`: any other reconstructed sources.

## The rule
Copy recovered 3.2.0 exactly. Invent nothing and improve nothing.

## Never touch (verify and classify only; never edit)
- **Billing, packs and plans:**
  - `proAccess.ts`, `packProRule`, `packClockWiring`, `PackMeetingClock` and ProEntitlement*
  - the licence and pack code in `electron/ipcHandlers.ts`
  - the answer-length Pro registration in `electron/main.ts`
  - the plans tab, UnlockProPlans and the pack UI
  → Classify differences here as **Leave-billing**.
- **The `forceTrialEnded` dev query.** → **Leave-dev**
- **`electron/services/devPremiumOverride.ts` and its call sites.** This is a standing rule: keep it. → **Leave-dev**
- **The `pinUserData` isPackaged guard.** → **Leave-dev**
- **Calendar OAuth client ID and secret.** These stay empty. Never copy a secret out of the recovered bundle. → **Leave-secret**

## Step 1: build the 3.2.0 feature catalogue
Enumerate **every user-facing and system feature** in 3.2.0 from the recovered code. Do not take the list from local code. Cover at least:

- **Windows:**
  - the launcher
  - the overlay (NativelyInterface)
  - the TopPill
  - the notes window
  - the settings popup (`?window=settings`)
  - the cropper
  - the meeting list and details
  - the onboarding and welcome flows
  - the first-run guide
- **Every Settings tab**, in `SETTINGS_NAV_ORDER`: general, plans, ai-providers, retrieval, audio, overlay, calendar, keybinds, phone-mirror, connections, intelligence, help, about. Check every row in each tab.
- **Answering:**
  - What to Say
  - Auto Answer
  - Fast Response
  - answer length and word caps
  - modes and custom modes
  - clarify, recap, follow-up and brainstorm
  - manual chat, stop and cancel
  - regenerate and copy
  - code blocks, diagrams, notices and quiet notes
- **Capture:**
  - microphone
  - system audio (macOS and Windows pipelines)
  - device selection
  - silence suppression and resampling
  - screenshots and crop
  - page context
  - Direct Assist
- **STT and transcript:** providers, the rolling bar and context terms.
- **LLM providers:** each provider, custom endpoints, Ollama, Codex CLI, the Natively API, model lists, key test/save/rollback and fallback order.
- **Knowledge, RAG and retrieval:**
  - the knowledge spaces
  - reembed
  - the live indexer
  - the search providers (Natively, Tavily)
  - the structured extractor
  - KnowledgeOrchestrator
  - company research
  - the profile intelligence and JD/resume flows
- **Phone mirror:** pairing, stream, screenshot tray and chat.
- **Calendar:** Google and Outlook rows and meeting start.
- **Connections and integrations.**
- **Keybinds and global shortcuts:** the darwin and win32 tables.
- **Lifecycle:**
  - startup, single-instance, quit
  - auto-update
  - tray/menu bar, dock/taskbar
  - always-on-top, click-through, content protection
  - Spaces and virtual desktops
- **Native module:** every exported function in `native-module/src/*.rs` against 3.2.0's `.node` exports. Compare the export lists with `nm -gU` or by loading the module under Electron.
- **IPC:** every `ipcMain.handle`/`on` channel and every `window.electronAPI.*` in the preload, against 3.2.0.
- **Packaging:** the build config, extraResources, asarUnpack and the native helpers.
- **Billing/trial/licence:** catalogue it, but only to classify it as Leave-billing.

Write the catalogue to `docs/parity/phase6-feature-catalogue.md`. Give each feature an ID (F001, F002, …) and list its 3.2.0 source locations.

## Step 2: verify every feature
For each feature ID, compare **local vs 3.2.0** at full-branch depth:
- entry points and wiring: IPC channel, preload method, main handler, service
- every rendered branch, string, label, tooltip and aria attribute
- every control and its order
- every effect, timer and poll, with their dependencies
- arguments, defaults, error handling, fallbacks and rollbacks
- settings keys, their defaults and how they persist
- platform branches (darwin/win32): both must match 3.2.0

Give each feature exactly one verdict:
- **Implemented**: matches 3.2.0 at every point checked. Cite the local file:line and the 3.2.0 location.
- **Partial**: list each missing or different piece.
- **Missing**: the feature is absent locally.
- **Extra-local**: exists locally but not in 3.2.0.
- **Leave-billing / Leave-dev / Leave-secret**: an intentional hold.
- **Unsure**: give the reason, such as "3.2.0 expression not recoverable from minified code".

"Implemented" needs cited evidence from both sides. Never infer it from passing tests or from earlier reports.

## Step 3: close out the 91 modules and the string leads
- Run `node scripts/parity/compare-modules.mjs`. Classify **every** non-identical module as one of:
  - Identical-semantics (format/compile only)
  - Real-diff → feature ID
  - Leave-*
  - Unsure
  - `.js` local vs `.ts` recovered pairs (e.g. `NativelySearchProvider`, `TavilySearchProvider`): check whether the content matches, not just the extension.
- Run `node scripts/parity/compare-renderer-strings.mjs`. Classify **every** string in both lists as one of:
  - Minifier-fragment
  - Real-missing → feature ID
  - Extra-local → feature ID
  - Leave-*
  - Example to check: `labels.only_answer_from_references`.
- Re-examine each of the 82 "unsure" items in `phase5-final-inventory.md`, and resolve as many as you can with evidence.

## Step 4: fix the proven gaps only
- **Partial, Missing and Extra-local items outside the never-touch list:** copy the 3.2.0 code or remove the local-only code.
- Keep each fix minimal and traceable to a feature ID.
- **Main-process, native and packaging fixes:** keep the darwin and win32 branches. Add no Unix-only commands and no hard-coded paths.
- **Rust native-module diffs:** report only. Do not edit unless the 3.2.0 source is recoverable verbatim.
- **Tests:**
  - Update tests that pin removed local behaviour.
  - Add a parity test for each restored feature, in the style of `Phase4bRendererParity2026_11_18.test.mjs`.

## Use ECC agents (plugin `ecc@ecc`)
Run independent work in parallel. Give every agent:
- the rule
- the never-touch list
- the verdict definitions
- one narrow scope

Reviewers rank "matches 3.2.0" above style and never suggest improvements.

| Step | Agent | Job |
| --- | --- | --- |
| Catalogue | `spec-miner` ×3 (renderer, main/IPC/preload, native/packaging) | Enumerate 3.2.0 features from the recovered code |
| Verify | `code-explorer`, one per feature group, ~15 in parallel | Give each feature a verdict with file:line evidence from both sides |
| Modules/strings | `code-explorer` ×2 | Classify all 91 modules and all string leads |
| Hunt | `silent-failure-hunter` | Swallowed errors or missing fallbacks that differ from 3.2.0 |
| Plan | `planner` | Write a file-by-file fix list for proven gaps |
| Build | you | Implement the fixes |
| Review | `react-reviewer`, `typescript-reviewer` | Regressions and type errors |
| Tests | `pr-test-analyzer` | Tests pinning local-only behaviour; parity coverage gaps |
| Gate fixes | `build-error-resolver` / `react-build-resolver` | Fix the gate without changing 3.2.0 behaviour |
| Final | `code-reviewer` | Check the diff against the rule and the never-touch list |
| Loop | `loop-operator` | Keep cycling until green |

If `code-review-graph` MCP is unavailable, use `rg` and the recovered bundles directly.

## Gate
After the last edit, run these commands in order. Only one `npm test` may run at a time; concurrent runs overwrite `dist-electron`.
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
Leave out `app:build`. It is blocked on Xcode first-launch setup on this Mac and isn't part of this phase.

## Don't commit
Leave everything staged. `docs/parity` is gitignored, so add files there with `git add -f`.

## Done when
- [ ] `phase6-feature-catalogue.md` lists every 3.2.0 feature with an ID and its 3.2.0 locations
- [ ] Every feature has exactly one verdict with evidence from both sides; none is unclassified
- [ ] All 91 modules and every string lead are classified; nothing is unclassified
- [ ] The 82 Phase 5 "unsure" items are re-examined, and every remaining Unsure has a specific reason
- [ ] Every Partial, Missing and Extra-local item outside the never-touch list is fixed, or explicitly marked Unsure with a reason
- [ ] All eight gate commands pass after the last edit (report the counts)
- [ ] `code-reviewer` found no violation of the rule or the never-touch list

## Report
Write `docs/parity/phase6-verification-report.md` and summarise it in chat. Include:
1. **Verdict counts:** the totals for Implemented, Partial, Missing, Extra-local, Leave-billing, Leave-dev, Leave-secret and Unsure.
2. **A clear yes/no:** "Are all 3.2.0 features fully implemented, apart from the intentional holds?" Give the list of exceptions.
3. **Feature table:** ID, feature, verdict, local evidence, 3.2.0 evidence and action taken.
4. **Classification totals** for the modules and strings.
5. **Fixes:** the files changed, and the feature ID behind each change.
6. **The Unsure items,** with reasons.
7. **Agents:** which ECC agents ran and what each found.
8. **Gate counts** for each command.
9. **CLAUDE.md validation categories**, written exactly as follows:
   - `Covered by automated macOS branch tests`
   - `Covered by automated Windows branch tests`
   - `Reviewed but not executed on Windows`
   - `Requires physical macOS verification`
   - `Requires physical Windows verification`

   Never claim physical testing, and never write "cross-platform verified".
