# Phase 3c parity and public source audit

Branch `update/parity-3c` starts at `287c0649` on `update/premium-3.2.1`. The comparison targets were the installed Windows 3.2.1 distribution and the public source at `refs/upstream/v3.2.1`. All commits are local.

| Commit | Change |
| --- | --- |
| `b3cdbc19` | Add Modes screenshot coverage, Settings scroll normalization, and RGB comparisons |
| `2852a6f7` | Add the reusable style comparison and its tests |
| `f8fc2060` | Improve premium picker layout and keyboard navigation |
| `0e1cf64f` | Remove superseded public fork edits and align the premium model card's type |
| `d5c74a3a` | Remove duplicate privacy and retrieval checks already present upstream |
| `6a44e05a` | Dismiss first-run Permissions cards before parity screenshots |

## Screenshots

The harness selects the built-in Sales mode by name. Its template type is locked, so both isolated copies also get a temporary editable Parity Sales mode for the two open-menu captures. The harness checks that the menus opened and deletes the temporary mode. Each Settings screenshot resets the visible Settings scroll container to the top before capture, including the background behind Auto Answer consent. A screenshot review caught a first-run Permissions card open only on the installed side. The harness now dismisses that specific card in the isolated profile and waits for it to close before capturing. An exploratory Plans screenshot with the card was 14.412% different and is excluded from the final run columns.

For every pair, `sharp` converts the image to sRGB and measures the proportion of pixel positions whose Euclidean RGB distance exceeds 48. The comparison preserves the dimensions and counts positions present in just one image as changed. Each per-run report links a PNG with the installed image, the local image, and the changed pixels highlighted in magenta. The percentages are informational and leave the scenario result unchanged.

[Baseline](../../.parity/runs/2026-11-20T20-00-07.978Z-6la1do/report.md) · [Final run 1](../../.parity/runs/2026-11-20T20-12-39.998Z-cv1eOI/report.md) · [Final run 2](../../.parity/runs/2026-11-20T20-13-35.554Z-cXnjM4/report.md). Each run generated 19 comparison PNGs.

| Screenshot | Baseline | Final run 1 | Final run 2 |
| --- | ---: | ---: | ---: |
| launcher | 0.000% | 0.000% | 0.166% |
| modes-manager | 1.053% | 0.899% | 1.023% |
| modes-sales | 1.724% | 0.992% | 0.945% |
| modes-template-type | 0.810% | 1.661% | 1.610% |
| modes-note-template | 0.679% | 1.317% | 1.266% |
| settings-general | 0.000% | 0.000% | 0.000% |
| settings-plans | 0.001% | 0.180% | 0.002% |
| settings-ai-providers | 0.000% | 0.000% | 0.000% |
| settings-retrieval | 0.000% | 0.023% | 0.023% |
| settings-audio | 0.000% | 0.000% | 0.000% |
| settings-overlay | 0.000% | 0.000% | 0.000% |
| settings-calendar | 0.000% | 0.000% | 0.000% |
| settings-keybinds | 2.096% | 2.127% | 2.127% |
| settings-phone-mirror | 0.000% | 0.000% | 0.000% |
| settings-connections | 0.000% | 0.000% | 0.000% |
| settings-intelligence | 0.000% | 0.000% | 0.000% |
| settings-help | 0.000% | 0.246% | 0.246% |
| settings-about | 0.063% | 0.061% | 0.061% |
| auto-answer-consent | 0.845% | 0.288% | 0.117% |

The baseline ran after the harness changes and before any product changes. Launcher pixels can vary with asynchronous startup, and the built-in mode list can have a different order. Keybinds includes shortcuts that can be contested by the two concurrently running apps. These percentages describe these captures.

## Modes Manager

The two menus use readable TSX with distinct visual styling. Both have explicit labels and trigger-to-menu relationships, keyboard navigation, visible focus, and bounded scrolling. The real-time prompt keeps the existing 200px panel minimum and 120px textarea minimum, which also appear in the installed build. The local Save row now has 12px vertical padding on both edges. This phase leaves visual differences in the menus and does not assert a pixel-exact interface.

`node scripts/parity/style-diff.mjs --reference <bundle-path>` finds a data style object by its marker key, resolves statically defined shared constants, and reports unknown expressions and property-level differences. It does not execute the bundle or print raw style values. `--marker` and `--ours` let it inspect a different table.

```text
Before
only-in-reference noteTemplateGroup
only-in-reference noteTemplateMenu
only-in-reference noteTemplateName
only-in-reference noteTemplateRow
only-in-reference templateMenu
only-in-reference templateOption
only-in-reference templateTrigger
Summary: changed=0 only-in-reference=7 only-in-ours=0 unresolved=0

After
Summary: changed=22 only-in-reference=8 only-in-ours=8 unresolved=0
```

| Style entry | Remaining differences and reason |
| --- | --- |
| `templateTrigger` | Local border, font size, gap, and padding. Background and focus are handled by the shared button styling and the browser focus outline. |
| `templateMenu` | Local minimum width, radius, shadow, and padding. Logical insets replace physical top/left. Local max height, vertical overflow, and overscroll containment keep long menus usable in a short window. |
| `templateOption` | Local row padding, gap, and font size, with the browser focus outline retained. |
| `noteTemplateMenu` | Local width, max height, padding, radius, and shadow. Logical insets replace physical bottom/right, and scrolling stays inside the list. |
| `noteTemplateRow` | Local shared row padding, gap, and font size, with the browser focus outline retained. |
| `noteTemplateGroup` | Local heading font size, weight, and padding. |
| `noteTemplateName` | Matching truncation styles. |

The audit compares entries in the style object. The prompt and Save-row layout were also reviewed in the surrounding component because JSX can supply additional styles and structure.

## Public source decisions

The requested comparison contained 36 paths, plus `.gitignore` which the task explicitly named. Of the 37, 20 were restored exactly, 15 were kept, one received a partial cleanup, and one was retained pending further evidence. A means a required fork change, B means superseded, and C means uncertainty remains.

| Path | Class | Decision |
| --- | --- | --- |
| `.gitignore` | A | Keep native binary and parity exceptions. |
| `electron/LLMHelper.ts` | B | Restore upstream exactly. The structured-provider privacy guard already runs in the official path. The remaining fork hunks were comments, declaration placement, and type annotations. |
| `electron/audio/AppleSpeechSTT.ts` | B | Restore upstream exactly. The shutdown sequence is the same. |
| `electron/audio/sttLanguageSupport.ts` | B | Restore upstream exactly. The provider exclusion is already handled upstream. |
| `electron/ipcHandlers.ts` | A/B | Keep all five dev entitlement and credentials override call sites. Restore the surrounding IPC code, inferred types, and formatting to upstream. |
| `electron/preload.ts` | B | Restore upstream exactly. The runtime wiring and exposed channels were already present. |
| `electron/services/ModeGenerator.ts` | B | Restore upstream exactly. The local type widening did not change normalization. |
| `electron/services/ModesManager.ts` | B | Restore upstream exactly. The fork difference was a comment. |
| `electron/services/devPremiumOverride.ts` | A | Keep the fork's dev-only premium override. |
| `electron/services/meeting/ChunkSummaryGenerator.ts` | B | Restore upstream exactly. No caller needs the recovered `sectionGuidanceFor` alias. |
| `electron/services/modes/ModeHybridRetriever.ts` | B | Restore upstream exactly. Official code assigns both vector statistics before the same filter. |
| `electron/services/packs/PackMeetingClock.ts` | B | Restore upstream exactly. The `counts` declaration was duplicated. |
| `electron/services/proAccess.ts` | A | Keep the dev override access check. |
| `electron/services/proEntitlementWiring.ts` | A | Keep the dev override entitlement wiring. |
| `electron/services/telemetry/PiLatencyTracer.ts` | B | Restore upstream exactly. The extra trace-key union member was type-only and the engine still emits the event. |
| `electron/tsconfig.premium-check.json` | A | Keep strict checking for the local premium source. |
| `electron/utils/pinUserData.ts` | C | Keep the guard for absent Electron `app` in plain Node or mocks. It protects profile-path handling in those contexts. |
| `native-module/index.d.ts` | B | Restore upstream exactly. The fork duplicated the probe declaration and reordered a click export. |
| `native-module/index.js` | B | Restore upstream exactly. The same native names are exported. |
| `native-module/index.win32-x64-msvc.node` | A | Keep the tracked Windows binary. |
| `package.json` | A | Keep parity, dev-agent, recovery, Electron-as-Node and local source test commands. Dependency versions and lockfile did not change. |
| `scripts/build-electron.js` | A | Keep the extra build inputs for local premium providers. |
| `scripts/dev-agent.mjs` | A | Keep the isolated agent startup and process handling. |
| `scripts/recovery/README.md` | A | Keep the fork's source recovery instructions. |
| `scripts/recovery/recover-premium-renderer.cjs` | A | Keep the fork's renderer recovery tool. |
| `scripts/recovery/recover-premium.cjs` | A | Keep the fork's main-process recovery tool. |
| `scripts/recovery/recovery.test.cjs` | A | Keep the tests for the recovery workflow. |
| `scripts/smoke-onnx-packaging.mjs` | A | Keep the decider runtime packaging assertions. |
| `src/components/ProfileIntelligenceSettings.tsx` | B | Restore upstream exactly. Additional recovered state fields had no readers. |
| `src/components/onboarding/RecoveredGuide.css` | B | Remove the unused recovery marker file. |
| `src/i18n.guide.ts` | B | Remove the 399-line recovered table. Official guide copy and translation wiring supersede it, and no active code imports it. |
| `src/lib/chatStreamGuard.d.mts` | B | Restore upstream exactly. The fork declaration included a name the runtime does not export. |
| `src/lib/diagram/diagramRequest.d.mts` | B | Restore upstream exactly. The fork difference was a comment. |
| `src/lib/onboarding/shortcutKeys.d.mts` | B | Remove the redundant declaration. The corresponding test now uses the official guide helpers. |
| `src/lib/onboarding/shortcutKeys.mjs` | B | Remove the redundant helper. The official implementation is in `guideKeys.mjs`. |
| `src/types/electron.d.ts` | B | Restore upstream exactly. Make the premium model card's `judgeViaNatively` optional to agree with upstream's public contract. Existing `=== true` handling covers the unset case. |
| `vite.config.mts` | A | Keep the `.agent` and `.parity` watch ignores for runtime files and Windows locks. |

## Validation

- **Tested physically on Windows** — Both apps launched with isolated profiles. The harness used its existing licence-file copy path and verified process and port cleanup. See the parity output below.
- **Build validated on Windows** — Electron compilation and both TypeScript checks ran on Windows.
- **Reviewed but not executed on macOS** — Reviewed platform-sensitive code in the public diff, including the upstream-restored Apple speech shutdown. No macOS binary or live UI was exercised.

The following excerpts are from the Windows command output.

```text
> npm run typecheck:electron
> node node_modules/typescript7/lib/tsc.js -p electron/tsconfig.json --noEmit
typecheck:electron exit=0

> npm run typecheck:ts7
> node node_modules/typescript7/lib/tsc.js -p tsconfig.json --noEmit
typecheck:ts7 exit=0

> oxlint --format json <changed JavaScript and TypeScript files>
oxlint exit=0 files=30
{"diagnostics":{"warning":125},"number_of_files":30,"number_of_rules":96}

> npm run build:electron
[build-electron] GOOGLE_CALENDAR_CLIENT_SECRET is not set (env or .env): calendar sync will not connect in this build.
[build-electron] MICROSOFT_CALENDAR_CLIENT_ID is not set (env or .env): the Outlook calendar row will be disabled in this build.
[build-electron] Done in 10245ms
build:electron exit=0

> node --test --test-concurrency=4 --test-timeout=45000 --test-force-exit "premium/electron/**/__tests__/**/*.test.mjs" "electron/services/__tests__/License*.test.mjs"
ℹ tests 56
ℹ suites 15
ℹ pass 56
ℹ fail 0
ℹ skipped 0

> node --test "scripts/parity/tests/*.test.mjs"
ℹ tests 22
ℹ pass 22
ℹ fail 0
ℹ skipped 0

> node --test "src/components/__tests__/Phase4bRendererParity2026_11_18.test.mjs"
ℹ tests 7
ℹ pass 7
ℹ fail 0
ℹ skipped 0
```

The Windows build lacked credentials for live Google Calendar and Outlook integration. Live calendar authentication and native compilation were outside this validation. The parity suite used the repo's existing Windows native binary.

### Require and export audit

```text
> node .parity/phase3b/check-require-exports.mjs
Files: 928 | Resolved modules: 343 | Static named access checks: 1918 | Dynamic property accesses: 0
{"location":"electron/IntelligenceEngine.ts:3152","spec":"./intelligence/context-os/explicitSourceSwitch","target":"electron\\intelligence\\context-os\\explicitSourceSwitch.ts","name":"resolveTurnSourceDecision","reason":"not a named runtime export"}
{"location":"electron/nativeArchGate.packaged.test.mjs:60","spec":"../scripts/disguise-name.cjs","target":"scripts\\disguise-name.cjs","name":"darwin","reason":"not a named runtime export"}
{"location":"electron/services/HindsightManager.ts:679","spec":"../LLMHelper","target":"electron\\LLMHelper.ts","name":"llmHelper","reason":"not a named runtime export"}
{"location":"electron/services/reranking/rerankerConfig.ts:351","spec":"../../LLMHelper","target":"electron\\LLMHelper.ts","name":"getLLMHelper","reason":"not a named runtime export"}
{"location":"electron/services/reranking/rerankerConfig.ts:351","spec":"../../LLMHelper","target":"electron\\LLMHelper.ts","name":"llmHelper","reason":"not a named runtime export"}
Findings: 5
require audit exit=0
```

The same five findings were present before the cleanup. The `explicitSourceSwitch` finding names an unused destructured binding. The active call uses the exported `turnSourceDecision`. The three `LLMHelper` accesses are guarded optional lookups in Hindsight and reranker configuration. The static auditor did not recognize the CommonJS `darwin` test fixture export. No new finding appeared.

### Parity runs

Both final `npm run parity` invocations printed this table. The only expected differences were the 24 settings defaults already present in the baseline, including 22 packaging differences and two shared-host shortcut observations. There were no unexpected DIFF paths.

| Scenario | Result | Differences | Expected (installed vs dev) |
| --- | --- | ---: | ---: |
| api-surface | MATCH | 0 | 0 |
| licence | MATCH | 0 | 0 |
| modes | MATCH | 0 | 0 |
| settings-defaults | MATCH | 0 | 24 |
| settings-roundtrip | MATCH | 0 | 0 |
| screenshots | MATCH | 0 | 0 |
| premium-auto-answer | MATCH | 0 | 0 |
| console-errors | MATCH | 0 | 0 |

```text
[parity] Cleanup verified: PIDs [11228, 10848, 30916, 13360, 1984, 26696, 16592, 22984, 22888, 2692, 6068, 23228, 27620, 21676, 24604, 4860, 21252, 25484, 32592, 32180, 23668, 11696, 9684, 32040] exited; ports [51460, 57243, 57244] closed
parity run 1 exit=0
[parity] Cleanup verified: PIDs [26388, 16748, 22360, 27364, 13452, 22556, 10120, 30576, 6168, 22284, 30528, 29420, 32896, 29936, 18132, 10972, 25352, 21664, 33516, 18112, 19120, 18940, 33816, 8648] exited; ports [51269, 51283, 51284] closed
parity run 2 exit=0
New Electron/Natively processes remaining=0
```

Before this report was added, Git showed a clean tree on the branch.

```text
> git status --short --branch
## update/parity-3c

> git log --oneline update/premium-3.2.1..HEAD
6a44e05a Dismiss first-run Permissions cards before parity screenshots
d5c74a3a Remove duplicate upstream privacy and retrieval checks
0e1cf64f Remove superseded public fork edits
f8fc2060 Improve Modes picker structure and keyboard navigation
2852a6f7 Audit Modes style tables without executing bundle code
b3cdbc19 Measure Modes and Settings screenshot differences
```

## Review and fixes (Claude)

Verified: public product code is now 3,749 of 3,755 files identical to official v3.2.1 and every `src/` file is identical; what remains differs only by the dev premium override (needs `!app.isPackaged` + `NODE_ENV=development` + `NATIVELY_DEV_PREMIUM=1`), a test-safety guard in `pinUserData.ts`, and dev/build tooling.

**Modes Manager: Codex's own picker design replaced with 3.2.1's.** The brief asked for 3.2.1's styles; the pickers had been given new ones, and the template-type and note-template screenshots moved further from 3.2.1 (0.81% → 1.61%, 0.68% → 1.27%). Now, all read from the 3.2.1 renderer bundle:
- The seven picker style entries (`templateTrigger`, `templateMenu`, `templateOption`, `noteTemplateMenu`, `noteTemplateGroup`, `noteTemplateRow`, `noteTemplateName`) are 3.2.1's values. `style-diff.mjs`: changed=0, only-in-reference=0, only-in-ours=0, unresolved=0.
- The template trigger clears its inline background (`background: undefined`) so the `.mm-tp-trigger` rules supply it and its hover state, as 3.2.1 does.
- The 13 `.mm-tp-*` / `.mm-nt-*` stylesheet rules were compared rule by rule with 3.2.1's: identical.
- Markup: 3.2.1 has no `aria-controls`/`id` link on either picker and no `aria-label` on the template-type listbox (the note-template menu keeps its "Note templates" label, as in 3.2.1). The added ones were removed. The existing test `ModesSettingsParity2026_11_18` failed on the added label and passes again.

**The ~3px offset, found and fixed.** Two values differed from 3.2.1: the prompt box's Save row padding (`12px` → `10px 12px`) and the Answer policy option text (`fontSize 12, lineHeight 1.3, colour` → `fontSize 13`, as 3.2.1).

| Screen | Codex 3c | Now | What remains |
| --- | ---: | ---: | --- |
| modes-manager | 1.02% | 0.32% | Random built-in mode order only |
| modes-template-type | 1.61% | 0.32% | Random built-in mode order only |
| modes-note-template | 1.27% | 1.08% | Same menu, size and position; scrolled ~3px differently to the selected row |
| modes-sales | 0.95% | 1.88% | Random mode order puts the selected row elsewhere (varies run to run) |
| auto-answer-consent | 0.12% | 1.27% | The page behind the dialog (varies run to run); the dialog matches |

Final: typecheck:ts7 0; oxlint clean on ModesSettings.tsx; premium + licence + Modes tests 60/60; harness tests 22/22; `npm run parity` all scenarios MATCH.
