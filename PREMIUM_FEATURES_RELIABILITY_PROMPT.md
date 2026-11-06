# Premium Features Reliability Test: End to End, Interview-Ready (for Antigravity or Codex)

## Mission

Natively is used live in job interviews. A wrong answer, a missing résumé fact, a stale company dossier, or a reference file that silently fails to ground an answer is a visible failure in front of an interviewer. Your job is to make every premium feature work reliably, end to end, and to prove it with observed behavior.

Cover the premium features and the files integrated for them: LLM analysis, RAG retrieval, reference-file indexing and grounding, Profile Intelligence, Company Intel, Role Insight, Modes Manager, licensing and gating, and the IPC and preload wiring between them.

Requirements:
1. **Parity.** Each feature must match its recovered source (behavior, data flow, and UI) except for intentional, documented improvements.
2. **Working.** Each feature must run in the app and produce correct output on the flows listed in Phase 3.
3. **Reliable.** Failure paths must surface a clear message. No silent failures, no stale state, no data that is written but never read back.

Fix what you find. Do not stop at a report. Stop and ask only when a fix needs a product decision.

**Zero tolerance for unverified claims.** A feature is "working" only when you observed it working in the running app, or when a test exercises that exact path and you show its output. Anything else is "not verified" and must be reported as such.

---

## Reference sources

| Version | Path | Use for |
|---|---|---|
| **natively-3.1.0** | `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/source/natively-3.1.0/` | Knowledge modules (`premium/electron/knowledge/`), Role Insight (`premium/electron/knowledge/roleInsight/`), licensing (`premium/electron/services/`). Only 45 files. |
| **natively-2.9.2** | `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/source/natively-2.9.2/` | Modes Manager, `ModesSettings.tsx`, reference ingestion, RAG/mode retrieval, and the integration and UI code for Profile, Company Intel, and Role Insight. |

Rules:
- For each feature, search both trees before concluding a reference is missing.
- Prefer 3.1.0 backend logic where it exists. Use 2.9.2 for integration and UI, and for anything absent from 3.1.0.
- Check `git log -S "<symbol>"` before treating a difference as intentional.
- Do not copy whole files from either tree. Port the specific logic.

---

## Context

- **Current repo:** `/Users/shubhampandey/testing/natively-cluely-ai-assistant`
- **Branch:** `fix/restore-premium-types`
- **Run:** `npm run electron:dev:ultra` (sets `NODE_ENV=development NATIVELY_DEV_PREMIUM=1 NATIVELY_DEV_PLAN=ultra`). `npm run dev` is Vite only and does not start Electron.
- **Browser harness:** follow `CLAUDE.md`. Use `agent-browser tab <target>`, confirm each document with `agent-browser eval "location.search"`, and read `agent-browser console` and `agent-browser errors`. Open Settings through the launcher window. Never use `--auto-connect`. Stop the app through the launcher.
- **Graph tool:** `code-review-graph` is disconnected. Use `grep`, `find`, `Read`, and `git log -S`.
- **Held decision:** the Technical Interview fallback in `electron/services/ModesManager.ts` (around lines 504–534) is unconfirmed by the user. Do not expand it or remove it. Report any test it breaks under Open Questions. Do not edit `BuiltinModeAdoption2026_08_09.test.mjs` to make it pass.
- **In-progress user work:** `premium/src/ModesSettings.tsx`, `electron/ipcHandlers.ts`, `src/types/electron.d.ts`, and untracked files including `RoleInsightJdStaging.test.mjs`, `ModesManagerRecoveredAudit2026_11_06.test.mjs`, and the prompt files. Preserve them. Build on top of them. Do not revert, reformat, or stage files you did not change. **Do not commit.**
- **Cross-platform rule:** Natively ships on macOS and Windows. Each change needs an impact note for both. Use `path`, `os.tmpdir()`, and Electron `app.getPath()`. No hardcoded `/tmp`, `~/Library`, `/Applications`, or Unix-only shell commands. Platform branches must be explicit, and tests must inject the platform rather than mutate `process.platform`.
- **Temp files:** use the session scratchpad directory, never `/tmp`.

---

## Credentials and fixtures

No LLM, embedding, or search key is configured by default. Use this order:

1. **If the user has provided a test key for this session,** use it through the app's settings UI only. Never write it to a file, log, or report. Use a key marked for testing or a free tier.
2. **If no key is available,** run the flows that work without one, and mark the rest **not run** with the exact reason.
3. **Fixtures you create** go in the scratchpad: a short TXT résumé, a short markdown JD, a text reference document with known facts (for example, a made-up product name and three numeric facts), a PDF with a text layer, a DOCX, an empty file, an oversized file (just over the 50 MB limit), a `.exe` renamed to `.pdf`, and a UTF-16 text file.

Never enter a real personal credential. Never use real personal résumé data. Use only the fixtures.

---

## Use ECC agents

Split the work so no single agent holds the whole audit:

1. **Reference mapper (1):** for each feature in Phase 1, records the reference path in each tree and the chosen source.
2. **Parity agents (one per group):**
   - A. LLM analysis and answer path (`LLMHelper`, prompts, answer planner, mode profiles)
   - B. RAG and retrieval (`ModeContextRetriever`, `ModeHybridRetriever`, `mode-retrieval-port`, `EmbeddingPipeline`, `HybridSearchEngine`)
   - C. Reference files and indexing (`ModeReferenceFileIngestion`, `SafeDocumentTextExtractor`, `DocumentReader`, `DocumentChunker`)
   - D. Profile Intelligence (`KnowledgeOrchestrator`, `StructuredExtractor`, `HeuristicExtractor`, normalizers, `AOTPipeline`, `KnowledgeDatabaseManager`)
   - E. Company Intel and career guidance (`CompanyResearchEngine`, `resolveCompanySearchProvider`, negotiation, cover letter, STAR, mock interview)
   - F. Role Insight (`roleInsight/`, its IPC, its staging)
   - G. Modes Manager and UI (`ModesManager`, `ModesSettings`)
   - H. Licensing, gating, and dev override (`LicenseManager`, `licenseVerifyPolicy`, `devPremiumOverride`, `proEntitlementWiring`)
   - I. IPC and preload contract (every premium channel in `ipcHandlers.ts`, `preload.ts`, `src/types/electron.d.ts`)
3. **Live-run agent (1):** the only agent driving the app. Runs Phase 3 flows in order.
4. **Independent reviewer (1):** re-checks every "parity matches" and every "working" verdict. It must try to find a counterexample. It must not be the agent that made the verdict.
5. **Fix agents (one per group, disjoint files).**
6. **Final verifier (1):** reruns everything from scratch.

Consolidate the outputs yourself. Reject any claim without file:line evidence or observed output.

---

## Phase 1: Feature inventory and parity

For each feature below, produce: reference path(s) in 3.1.0 and 2.9.2, chosen reference, current path(s), and a parity classification (**match**, **regression**, **improvement**, **intentional** with commit, or **bug in both**).

| Feature | What "reliable" means for an interview |
|---|---|
| LLM analysis / answer path | Answers use the active mode, the profile, reference content, and the JD when relevant. Streaming completes. Errors are shown, not swallowed. |
| RAG retrieval | Relevant chunks from reference files and profile are retrieved for a question. Irrelevant chunks are not injected. Retrieval fails clearly when the index is missing. |
| Reference files | Upload, parse, index, retrieve, and delete all work. A deleted file no longer grounds answers. |
| Indexing | Chunk and index status is accurate. Re-indexing happens after edits. Status shown in UI matches the store. |
| Profile Intelligence | Résumé and JD facts are extracted correctly. Status flags are accurate. AOT runs after JD upload. Profile facts reach answers. |
| Company Intel | Research runs with and without a search key. Cache hit on repeat. Expired dossier is refreshed. Dossier fields render in the UI. |
| Role Insight | Paste JD and URL import both work. Analysis completes. Two quick requests do not collide. |
| Modes Manager | Create, rename, delete, activate, custom context, source contract, answer policy, note sections, and reference files all persist and affect answers. |
| Licensing and gating | Premium features are available with the dev override and blocked without it. The plan label is correct. |
| IPC and preload | Every premium channel has a handler, a preload binding, and a type declaration with the same shape. |

---

## Phase 2: Code parity per feature

For each feature:

1. **Presence:** every recovered module, IPC channel, and renderer component has a current counterpart, or a documented reason it is absent.
2. **Logic:** compare key functions side by side. Note dropped branches, changed defaults, dropped error handling, and changed payload shapes.
3. **Contract:** compare each channel in the handler, preload, and `electron.d.ts`. Flag one-sided channels and shape mismatches.
4. **Wiring:** confirm the feature is registered at startup and is called from the renderer. Flag dead handlers and handlers the renderer never calls.
5. **Gating:** confirm the premium check runs on every premium entry point, and that the dev override does not bypass the check in a packaged build.

Classify each gap. Regression and bug-in-both are fixed. Improvements are kept. Intentional differences need git evidence.

---

## Phase 3: Live flows

Run each flow in `npm run electron:dev:ultra`. Record: expected result, observed result, screenshot path (scratchpad), and status: **passed**, **failed**, or **not run** (with the reason).

### 3A. Without any provider key

| # | Flow | Pass condition |
|---|---|---|
| 1 | Upload TXT résumé | Profile status flags update; no error |
| 2 | Upload PDF résumé | Text extracted; flags update |
| 3 | Upload DOCX résumé | Text extracted; flags update |
| 4 | Upload empty file | Clear error; no half-written profile |
| 5 | Upload file over 50 MB | Clear size error |
| 6 | Upload `.exe` renamed `.pdf` | Rejected; no indexing |
| 7 | Upload UTF-16 text file | Decoded correctly |
| 8 | Upload JD (markdown) | JD stored; AOT starts (or the reason it does not start, shown in UI) |
| 9 | Delete JD | JD removed; status flags reset; no stale dossier shown |
| 10 | Upload reference TXT with known facts | File row appears with correct name and size; index status shown |
| 11 | Upload same file twice | Dedupe result recorded |
| 12 | Delete reference file | Row removed; count updated; persists after relaunch |
| 13 | Create mode, attach reference, activate | Active indicator correct; file count correct |
| 14 | Switch modes | Each mode shows only its own reference files |
| 15 | Restart app | Every change in 1–14 persists |
| 16 | Licensing: launch with `NATIVELY_DEV_PREMIUM=1` | Premium features enabled; plan shows `ultra` |
| 17 | Licensing: launch without the dev flag | Premium features gated; gate message shown |
| 18 | Role Insight: paste JD | Staged and analysed (or the failure reason is shown) |
| 19 | Role Insight: two paste requests back to back | Neither overwrites the other's temp file |
| 20 | Company Intel: run with no search key | LLM-only path runs, or a clear message if no LLM is set |
| 21 | Company Intel: second run | Cache used if fresh; refreshed if expired |
| 22 | Credentials: confirm no key appears in logs or files | Checked by grep on the log and the scratchpad |

### 3B. With a provider key (only if the user supplied a test key)

| # | Flow | Pass condition |
|---|---|---|
| 23 | Ask a question with the reference file loaded | Answer uses facts from the reference file; cites or reflects them |
| 24 | Ask a question the reference file does not cover | Answer does not invent reference facts; behaves per the mode's source policy |
| 25 | Ask a résumé question | Answer uses résumé facts correctly; no invented employers or dates |
| 26 | Ask a question in a mode with `reference_files_only` | Profile and transcript content do not leak into the answer |
| 27 | Switch mode mid-answer | Old answer does not write into the new mode's memory |
| 28 | Company Intel with search key | Dossier populated with sourced fields |
| 29 | Generate mode from brief | Mode created with sensible fields |
| 30 | Role Insight analysis | Analysis fields populated |

If no key was supplied, mark 23–30 **not run**. Do not mark them passed.

---

## Phase 4: Interview-critical checks

These are the failures that matter most in a live interview. Check each one explicitly and record the result.

1. **Wrong fact:** an answer states a résumé fact that is not in the résumé. (Compare against the fixture.)
2. **Stale context:** a deleted reference file or JD still affects an answer.
3. **Wrong mode:** an answer uses the previous mode's instructions or files after a switch.
4. **Silent failure:** an error occurs and the UI shows nothing, or shows success.
5. **Slow failure:** a flow hangs with no timeout or spinner end state.
6. **Crash on empty state:** no résumé, no JD, no modes, no files, or no key.
7. **Race:** two uploads, two research requests, or two mode switches at once.
8. **Restart:** state lost after relaunch.

Each check needs an observed result or a test. "Looks fine in code" is not enough.

---

## Phase 5: Fix

Fix in this order:
1. Anything that produces a wrong fact or leaks context across modes or files
2. Silent failures and stale state
3. Crashes on empty state and races
4. Persistence failures
5. Parity regressions against the reference
6. Copy and UI differences

For each fix, add a test that fails before and passes after. For platform-sensitive code, add tests that inject `darwin` and `win32`.

---

## Validation

Run all of these:

```bash
npx tsc --noEmit
npx tsc --project electron/tsconfig.premium-check.json --noEmit
npm run build:electron
npm run test:modes:no-build
npm run test:company-research-spend
npm test
```

Also run the Electron-hosted suites for Modes, reference ingestion, and premium knowledge:

```bash
node scripts/run-with-env.mjs --default-tmpdir NATIVELY_TEST_USERDATA=natively-test-userdata --default-tmpdir CODEX_HOME=natively-test-codex-home --set ELECTRON_RUN_AS_NODE=1 -- electron --test electron/services/__tests__/ModesManager*.test.mjs electron/services/__tests__/ModeBleeding*.test.mjs electron/services/__tests__/ModeUploadHardening.test.mjs electron/services/__tests__/RoleInsightJdStaging.test.mjs electron/services/__tests__/DocumentChunkerDuration.test.mjs
```

Report the exit code of every command.

---

## Report Format

### 1. Reference mapping
Feature | 3.1.0 path | 2.9.2 path | chosen | reason.

### 2. Parity table
Feature | area | reference file:line | current file:line | classification | fixed?

### 3. Live flow results
# | flow | expected | observed | screenshot | status | reason if not run

### 4. Interview-critical check results
Check 1–8 with the observed result for each.

### 5. Bugs fixed
```
BUG:
Feature:
File: path:line
Reference: file:line
Root cause:
Fix:
Test (fails before, passes after):
Platform impact: macOS [ ] Windows [ ] Both [ ] Neither [ ]
```

### 6. Open questions
Include the Technical Interview fallback and any test it breaks.

### 7. Validation run
Every command with exit code.

### 8. Not verified
- Windows: rendering, native file dialogs, secure storage, audio and capture, packaging, file locking during ingestion, long paths
- macOS: permission prompts that cannot be automated
- Live providers: any flow in 3B not run

---

## Success Criteria

- Every feature in Phase 1 has a reference mapping and a parity classification
- Every flow in 3A has an observed result, and every flow in 3B is either observed or marked not run with a reason
- Every interview-critical check in Phase 4 has an observed result or a test
- No feature is reported "working" without observed output or a test that runs its path
- `npx tsc --noEmit` exits 0
- `npx tsc --project electron/tsconfig.premium-check.json --noEmit` exits 0
- `npm run build:electron` exits 0
- `npm run test:modes:no-build` exits 0
- `npm run test:company-research-spend` exits 0
- `npm test` exits 0
- No credential value appears in logs, files, or the report
- Your in-progress edits and the user's untracked files are intact, and nothing is committed
