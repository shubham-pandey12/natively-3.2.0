# Phase 3b premium v3.2.1 port

Compared the fork's premium code with the archived Windows 3.2.1 release from `update/upstream-3.2.1` at `28482b4c`. The implementation is on `update/premium-3.2.1`. The archive was used read-only. The dev-premium override and its callers are unchanged. The branch stayed local.

## Changes by area

| Area | 3.2.1 behavior and implementation | Files |
| --- | --- | --- |
| Licence checks | Reused the public masked probe diagnostics for Gumroad verification, API-key activation and API licence verification. Added a sanitized native Dodo network reason to activation fallback, validation and deactivation logs. The existing user-facing errors, fail-open decisions, secret storage and native bindings remain the basis of the flow. | `premium/electron/services/LicenseManager.ts` |
| Auto Answer consent | Consent version 2 covers typed chat and Natively's replies alongside speech in the full meeting transcript. Version 1 no longer enables training uploads. Pro users keep Auto Answer access without sharing. Updated the disclosure and added a unit test for free and Pro users with old consent. | `premium/electron/autoAnswer/autoAnswerAccess.ts`, `premium/electron/autoAnswer/__tests__/RecoveredRuntimeParity.test.mjs`, `premium/src/AutoAnswerAccessDialog.tsx` |
| Auto Answer dialogs | Long terms scroll independently while the actions remain available. The keyboard can focus the terms when they overflow. Kept the fork's responsive sizing and scrollbar presentation. The stop-sharing actions, consent copy apart from the disclosures above, and model-card IPC and state conditions matched the inspected reference. | `premium/src/autoAnswerDialogKit.tsx`, `premium/src/AutoAnswerAccessDialog.tsx`, `premium/src/AutoAnswerStopSharingDialog.tsx` |
| Modes Manager | The free gate offers separate licence and upgrade actions. Unlock Pro opens the existing plans component inline, tracks the upgrade click and supports Back. The licence action goes to the parent Settings plans route. Kept the fork's existing gate layout. The active Pro mode list, policy controls and reference-file area were compared with the installed app. | `premium/src/ModesSettings.tsx` |
| Toasters and other premium panels | Checked stable text, selectors and renderer API call names for Profile Feature, JD Awareness, Natively API Promo, Max/Ultra Upgrade, Remote Campaign, Role Insight, Profile Visualizer and Negotiation Coaching. Also reviewed the toaster gating and action markers. The audit found no new text or IPC calls in those component bodies. The existing recovered dependencies are unchanged. | `premium/src/*Toaster.tsx`, `premium/src/{RoleInsightPanel,ProfileVisualizer,NegotiationCoachingCard}.tsx` |
| Parity | Added a scenario that reads Auto Answer access through `window.electronAPI`, opens the Pro consent preview, checks disclosure scrolling and the stationary share action, takes a screenshot, dismisses and verifies sharing remains off. Windows gives each of the two startup shortcuts to one process. The report keeps asymmetric failures for those two exact defaults as expected host contention. Configured shortcuts, altered bindings and other failure shapes still compare. | `scripts/parity/{run,compare}.mjs`, `scripts/parity/scenarios/premium-auto-answer.mjs`, `scripts/parity/tests/compare.test.mjs` |

## Bundle inventory before and after

[Premium diff tool](../../scripts/parity/premium-diff.mjs) takes the two bundle directories and prints a status and unified diff for each changed file. With `--own-module`, it compares the premium source sections of each bundle first, which distinguishes emitted premium code from the public and vendor code esbuild brings in. `--file` narrows the run to a relative bundle path. `--summary-only` prints statuses and counts. The tool normalizes the eval banner, esbuild helper preamble, source-map comments, CRLF and numeric suffixes on generated import identifiers.

```powershell
$reference = 'C:/Users/dell/natively-releases/3.2.1/extracted/dist-electron/premium/electron'
node scripts/build-electron.js
node scripts/parity/premium-diff.mjs --reference $reference
node scripts/parity/premium-diff.mjs --reference $reference --own-module
npm run build:electron
node scripts/parity/premium-diff.mjs --reference $reference
node scripts/parity/premium-diff.mjs --reference $reference --own-module
```

| Comparison | Identical | Changed | Only in reference | Only in ours |
| --- | ---: | ---: | ---: | ---: |
| Full bundle before | 63 | 9 | 0 | 0 |
| Own premium section before | 66 | 6 | 0 | 0 |
| Full bundle after | 65 | 7 | 0 | 0 |
| Own premium section after | 67 | 5 | 0 | 0 |

The consent version change closed the diff in both the standalone Auto Answer access module and its bundled entry point. Each inventory contained 72 files. The focused and whole-bundle unified diffs are in [the audit directory](../../.parity/phase3b/). The comparator redacts the baked calendar client secret from displayed lines. An early local diff inspection exposed that literal in tool output. The saved copies were redacted and no secret was included in a commit.

| Remaining changed bundle | Explanation |
| --- | --- |
| `autoAnswer/decider/deciderWorker.js` | esbuild emits the same `ortModuleFor` function in a different section order. Runtime alias and Windows/macOS selection match. |
| `knowledge/HeuristicExtractor.js` | The archive emitted a literal NUL in one regular expression. The fork's readable `\0` matches the same character. |
| `knowledge/KnowledgeOrchestrator.js` | The owned code uses an equivalent global Pro gate and formats the same seeder arguments differently. The full bundle also inlines the fork's public provider privacy guard, vector diagnostic counts and dev override. It has local identifier numbering, import placement, licence comments and a different build-time calendar secret configuration. These public and configuration differences were retained. |
| `knowledge/NativelySearchProvider.js` | Source marker only. The existing recovery output and declaration are part of the fork's provider tooling. |
| `knowledge/StructuredExtractor.js` | The inlined debug configuration moved within the bundle. The owned extraction code matches. |
| `knowledge/TavilySearchProvider.js` | Source markers only. The existing recovery output and declaration are part of the fork's provider tooling. |
| `services/LicenseManager.js` | Remaining diff is licence method documentation and catch-variable spelling. The six diagnostics now match the reference behavior. |

## Require and export audit

A TypeScript AST and module-symbol scan checked 1,918 static named accesses to relative `require()` results across 928 files under `electron/` and `premium/electron/`. It checks direct properties, destructuring and simple aliases. It cannot prove dynamically built specifiers or names. The five findings were outside the premium changes. A path-scoped diff against the Phase 3a base confirmed the callers and targets are unchanged.

| Finding | Assessment |
| --- | --- |
| `IntelligenceEngine.ts` requests `resolveTurnSourceDecision` from `explicitSourceSwitch` | Pre-existing unused destructure. The call itself comes from the correct `turnSourceDecision` module. |
| `HindsightManager.ts` requests `llmHelper` from `LLMHelper` | Pre-existing optional probe. |
| `rerankerConfig.ts` requests `getLLMHelper` and `llmHelper` from `LLMHelper` | Two pre-existing optional probes. The existing fallback remains. |
| `nativeArchGate.packaged.test.mjs` requests `darwin` from `disguise-name.cjs` | Scanner false positive. The CommonJS object exports `darwin`. |

## Validation output

```text
> npm run build:electron
[build-electron] Done in 7809ms

> npm run typecheck:electron
> node node_modules/typescript7/lib/tsc.js -p electron/tsconfig.json --noEmit
> npm run typecheck:ts7
> node node_modules/typescript7/lib/tsc.js -p tsconfig.json --noEmit
electron=0 renderer=0

> ./node_modules/.bin/oxlint.cmd <13 changed JavaScript and TypeScript files>
oxlint files=13 exit=0
```

The Windows build emitted the existing missing calendar-client configuration warnings. Oxlint emitted five `no-unused-expressions` warnings in Modes Settings. Linting the Phase 3a version of that file reproduced all five.

```text
> node --test --test-concurrency=4 --test-timeout=45000 --test-force-exit "premium/electron/**/__tests__/**/*.test.mjs" "electron/services/__tests__/License*.test.mjs"
Before: tests 55, pass 54, fail 1
After:  tests 56, pass 56, fail 0
✔ activateWithApiKey logs the certificate failure behind "fetch failed"
✔ Auto Answer sharing requires renewed consent for the expanded transcript

> node --test "scripts/parity/tests/*.test.mjs"
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

The baseline failure on `update/upstream-3.2.1` was `LicenseNetworkCauseLogged2026_11_18.test.mjs`. It is fixed. There were no remaining failures in the requested premium and licence suites.

```text
> npm run parity
[parity] installed PID 16772, CDP 54813
[parity] local PID 22804, CDP 54814
[parity] Cleanup verified: PIDs [23176, 19780, 21288, 33128, 16772, 25684, 19028, 28104, 24072, 25236, 26024, 32252, 12080, 31236, 22804, 19240, 10840, 19676, 10768, 3008, 18384, 6876, 24764, 27624] exited; ports [54794, 54813, 54814] closed
[parity] Report: .parity\runs\2026-11-20T19-46-34.865Z-wyLa6j\report.md
parity exit=0
new Electron/Natively processes still running: 0
```

| Scenario | Result | Differences | Expected |
| --- | --- | ---: | ---: |
| api-surface | MATCH | 0 | 0 |
| licence | MATCH | 0 | 0 |
| modes | MATCH | 0 | 0 |
| settings-defaults | MATCH | 0 | 24 |
| settings-roundtrip | MATCH | 0 | 0 |
| screenshots | MATCH | 0 | 0 |
| premium-auto-answer | MATCH | 0 | 0 |
| console-errors | MATCH | 0 | 0 |

The first Windows parity run showed two asymmetric shortcut registration failures. The final report keeps them alongside the 22 expected packaged-versus-dev differences in settings. There were 16 PNG pairs. Reviewed Modes Manager (Pro), Intelligence settings and the consent dialog. Mode ordering varied after General on fresh profiles. The consent dialogs used the same disclosure and fixed actions, with different panel heights and overflow styling. Both reached the scrollable terms, and both kept consent unset after dismissal. [Windows parity report and PNG pairs](../../.parity/runs/2026-11-20T19-46-34.865Z-wyLa6j/report.md)

## Commits and platform coverage

```text
> git log --oneline update/upstream-3.2.1..HEAD
4e3f3572 Exercise the Auto Answer consent preview in parity
beac7649 Use the shared Pro plans flow in Modes
f52b9bec Port Auto Answer sharing consent and terms interaction
f563a7d2 Port 3.2.1 licence network diagnostics
ed857030 Audit premium esbuild bundles against a release

> git status --short --branch
## update/premium-3.2.1
```

- **Tested physically on Windows** for the licensed, isolated parity run, disclosure scrolling and cleanup.
- **Build validated on Windows** for the Electron dev bundle.
- **Covered by automated Windows branch tests** and **Covered by automated macOS branch tests** for the existing Auto Answer runtime and execution provider choices.
- **Reviewed but not executed on macOS**. The port is shared code. Reviewed the native licence-loader and model-runtime platform branches used by these flows.
- The test profile carries Pro, so free-mode checkout and the stop-sharing confirmation were outside the physical run. Live licence activation, model download, consent submission, uploading and remote toaster campaigns were outside scope. The comparison checks the renderer evidence recorded above. It cannot prove all premium execution paths or pixel parity.
- The code-review graph was unavailable. Review used the archived bundles, TypeScript source, local Git history, executable tests and screenshots.

## Review and fixes (Claude)

Verified independently: no secret in any commit (only the redaction code mentions `client_secret`) and none in `.parity/` output; premium-diff reproduces 65/72 full and 67/72 own-module identical; the two key residuals are equivalent (LicenseManager: comments and a catch-variable name; KnowledgeOrchestrator: the same deny-unless-`true` Pro gate, reformatted). 56/56 premium+licence tests, 18/18 harness tests, both typechecks, all 8 parity scenarios MATCH. Require/export audit: only the two known upstream-tolerated names.

**Screens, measured.** A pixel comparison of the 16 screenshot pairs: 12 are identical. The rest:

| Screen | Before | After | What remains |
| --- | ---: | ---: | --- |
| Auto Answer consent | 6.69% | 3.71% | The settings page behind the dialog is scrolled to a different section (harness scroll position, not the dialog). |
| Modes Manager | 1.34% | 1.47% | Random mode order (expected) plus "Answer policy" and below sit ~3px higher locally. Open. |
| Keybinds | 2.38% | 2.38% | "In use" on Ctrl+B / Ctrl+Shift+B: the installed app, running at the same time, holds them. Expected. |
| About | 0.06% | 0.06% | Version text. |

**Consent dialog fixed to 3.2.1's exact styles** (`premium/src/autoAnswerDialogKit.tsx`, read from the 3.2.1 renderer bundle): the card is a fixed `474px` (max `calc(100vh - 48px)`) with `overflow: hidden` instead of 420–500px and self-scrolling, so the dialog is now the same size and "Used for" sits behind the fade as in 3.2.1. The terms list now fades whichever edge has more to read, re-measures on scroll, uses the `-14px` margin with matching padding so the highlight bar is not clipped, `tabIndex -1` when not scrollable, and takes its label from a `label` prop defaulting to "Terms". Both consent dialogs share these, as in 3.2.1.

**Open, for the next phase:**
- Modes Manager: the ~3px offset above "Answer policy". `sectionLabel` was checked and is identical to 3.2.1.
- Modes Manager style object: 3.2.1 has 7 entries ours lacks (`templateTrigger`, `templateMenu`, `templateOption`, `noteTemplateMenu`, `noteTemplateRow`, `noteTemplateGroup`, `noteTemplateName`). Both versions have the template-type and note-template dropdowns, but ours styles them differently, and the harness only screenshots General (where those dropdowns are hidden), so they have not been compared.
