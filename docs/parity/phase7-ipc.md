# Phase 1: 3.2.0 IPC wiring verification

Reference: the extracted, signed installed 3.2.0 app at `/Users/shubhampandey/.codex/visualizations/2026/11/18/01a1ee13-ada0-71a0-8c34-3af68ba0e2ae/ref-3.2.0/asar/dist-electron`. Its JavaScript was parsed as data, never executed. The code-review-graph MCP was unavailable, so comparison used the static parser in `tools/compare.mjs`, direct compiled-file inspection, and local source review.

## Tool and count sanity

`compare.mjs --ipc` now scans every JavaScript file under `dist-electron` for relevant IPC calls, discovers forwarding `ipcMain.handle/on/once` wrappers, follows direct and class-scoped `webContents.send` helpers (including `sendToMeetingSurfaces`), maps `electronAPI` keys to `ipcRenderer` channels, and reports non-literal expressions separately. Run it from the repository root so it can use the repository's trusted TypeScript parser. It writes a machine-readable inventory with `--ipc-json <path>`. It does not load either build.

| Check | Local | Installed 3.2.0 | Result |
| --- | ---: | ---: | --- |
| Relevant JS files parsed | 94 | 92 | Static scan; many bundles repeat embedded modules |
| Distinct handler channels, all `dist-electron` | 688 | 688 | Same channel set |
| Distinct handler channels, `ipcHandlers.js` | 686 | 686 | 677 literal names plus 9 statically resolved object constants |
| Registration calls, `ipcHandlers.js` | 699 | 699 | 652 `safeHandle`, 19 `registerStealthHandler`, 13 `safeOn`, 9 direct `handle`, 6 direct `on` |
| Main-to-renderer channels | 139 | 139 | Same channel set |
| Preload `electronAPI` keys | 746 | 746 | All key-to-channel maps match; `platform` is the only key without an `ipcRenderer` call |
| Preload invoke/send without handler | 0 | 0 | All mapped bridge calls have handlers |
| Handler without preload key | 44 | 44 | Same set on both sides |
| Preload listener without recognized send | 39 | 39 | Static resolution limit; same set on both sides |

The full 1,573-row channel/method table is [phase7-ipc-appendix.tsv](phase7-ipc-appendix.tsv): 1,569 match and four compiled-wrapper leads. It records direction, local mapping, installed mapping, and status for every row. The scanner prints `wrapper differs` for four pack/Pro sends because esbuild emits `broadcast` and `broadcast2` aliases in different bundles. Those rows are compiled alias leads in the explicit billing hold, not proven event-contract differences.

## Difference classification

| Channel or method | Direction | Finding | Class |
| --- | --- | --- | --- |
| `pack-ended`, `pack-renewed`, `pack-state` | Main to renderer | Both sides send the same channels; local compiled bundles include both `broadcast` and `broadcast2` aliases, reference bundles show `broadcast2`. Local source `electron/services/packs/packClockWiring.ts:77,96,151`; installed compiled `electron/services/packs/packClockWiring.js:6058-6117`. | Expected: Leave-billing / bundler alias |
| `pro-activation-status` | Main to renderer | Same channel; compiled alias set differs. Local `electron/services/proEntitlementWiring.ts:87`; installed `electron/services/proEntitlementWiring.js:5754`. | Expected: Leave-billing / bundler alias |

No installed handler channel or preload method was found missing locally. No local-only channel or key was found. No isolated wiring fix was justified, and no app code was edited.

## Same-side consistency and dynamic channels

Both builds have the same handler-without-preload and listener-without-recognized-send sets, listed in [phase7-ipc-diagnostics.md](phase7-ipc-diagnostics.md). The former include 25 `__e2e__` test channels and 19 internal/legacy/direct-preload channels. `natively:preload-ready` and `forward-log-to-file` are sent directly from preload code outside the `electronAPI` object (`electron/preload.ts:3979,4009-4013`), so they are not bridge gaps. Some listener events use indirect send helpers or computed names; a missing static send is not proof of an unused listener.

Non-literal registration and send expressions are reported separately by the tool. Both sides have the same 46 unique expression kinds: 29 statically resolved and 17 unresolved, listed in the diagnostics. Raw occurrences differ (local 1,050, installed 951) because repeated embedded bundles differ. The tool resolves simple string and object constants (for example Gmail and local API channel tables); dynamic template and property expressions remain for feature-level review. All preload keys' channels resolve in this scan.

## Handler-body review

An independent reviewer compared handler argument token streams in the primary `ipcHandlers.js` bundle. Raw compiled differences shrink to 11 leads after normalizing generated identifier suffixes. `answer-length:set` differs only in braces and an unused parameter name. Three licence handlers (`license:check-premium`, `license:get-details`, `license:check-premium-async`) are Leave-billing/Leave-dev. `set-natively-api-key`, `get-natively-usage`, `get-stored-credentials`, `set-stt-provider`, `set-model`, `set-fast-model`, and `set-default-model` differ in held pack/Pro/dev logic. Detailed local and installed line evidence is in the reviewer findings incorporated below. No non-held Answering, Capture, Provider, or Settings handler-body gap was proved. Matching registration bodies do not establish downstream service parity.

| Handler | Local `ipcHandlers.js` | Installed `ipcHandlers.js` | Classification |
| --- | ---: | ---: | --- |
| `license:check-premium` | 544640 | 544370 | Leave-billing / Leave-dev |
| `license:get-details` | 544653 | 544371 | Leave-billing / Leave-dev |
| `license:check-premium-async` | 544701 | 544410 | Leave-billing |
| `answer-length:set` | 549611 | 549305 | Identical handler semantics; billing policy held |
| `set-natively-api-key` | 552190 | 551896 | Leave-billing |
| `get-natively-usage` | 552362 | 552070 | Leave-dev |
| `get-stored-credentials` | 553152 | 552836 | Leave-dev / Leave-billing |
| `set-stt-provider` | 553367 | 553044 | Leave-billing |
| `set-model` | 554573 | 554249 | Leave-billing |
| `set-fast-model` | 554594 | 554271 | Leave-billing |
| `set-default-model` | 554636 | 554311 | Leave-billing |

## Platform-gated IPC

The eight stealth/clipboard channels registered under `process.platform === 'darwin' || process.platform === 'win32'` have matching names, gate expressions, and macOS, Windows, and fallback branch shapes. Local `electron/main.ts:2115-2203`; installed `asar/dist-electron/electron/main.js:553160-553218`. This is code review of the macOS-installed JavaScript bundle; neither branch was physically executed here. The installed app has no Natively Windows native binary or helper for runtime verification.

## Gap list for later phases

No clear isolated IPC wiring gap remains. These are unresolved downstream or dynamic-channel checks, not proved missing features:

| Phase | Follow-up from IPC boundary |
| --- | --- |
| 2 Answering | Verify `intelligence-*` token/event delivery and downstream answer services. |
| 3 Capture and speech | Verify audio/status events and their native send paths on both systems. |
| 4 AI providers | Verify provider configuration side effects; held pack/Pro branches stay untouched. |
| 5 UI | Verify listener consumption and settings control behavior beyond bridge presence. |
| 6 Knowledge | Verify embedding/reranker progress and knowledge service results. |
| 7 Phone and calendar | Verify phone-stream events and calendar broadcasts beyond channel names. |
| 8 Shortcuts and lifecycle | Verify shortcut/window events and physical platform behavior. |
| 9 Native and packaging | Verify Natively Windows native helper exports and packaged IPC behavior when a Windows artifact is available. |

## Completion report

Three independent agents reviewed handler bodies, platform gates/orphans, and scanner coverage. The handler reviewer found only held billing/dev differences among the remaining substantive handler leads. The platform reviewer matched the eight stealth branches and found no same-side orphan delta. The tooling reviewer independently confirmed the `ipcHandlers.js` registration counts and identified the phone-stream `broadcast` false positive; the final class-scoped scanner removed it. The final 39 listener-without-recognized-send count is lower than the reviewer's earlier 48 because the scanner now follows `sendToMeetingSurfaces`.

**Files changed:** `tools/compare.mjs` outside the repository; this report, table appendix, and diagnostics under `docs/parity`; F097/F098 rows in `phase6-feature-catalogue.md`. No application source or test was changed. Shared IPC boundaries and both platform branches were reviewed; no platform-specific module was edited. The impact radius is the IPC audit tooling and catalogue verdicts, with no runtime behavior change.

**Validation:** `Build validated on macOS`; `Reviewed but not executed on macOS`; `Reviewed but not executed on Windows`; `Requires physical macOS verification`; `Requires physical Windows verification`. The local development builds passed on macOS; no packaged build or physical IPC behavior was tested. Static branch review is not physical verification.

Commands actually run:

| Command | Result |
| --- | --- |
| `npm run typecheck:electron` | Pass |
| `npm run typecheck:premium` | Fails on pre-existing `HeuristicExtractor.ts` `never`-type errors; no app source changed in this phase |
| `node_modules/.bin/eslint electron/ipcHandlers.ts electron/preload.ts electron/main.ts` | Could not run: repository has no `eslint.config.*` for installed ESLint 10 |
| `node scripts/run-with-env.mjs --default-tmpdir NATIVELY_TEST_USERDATA=natively-test-userdata --default-tmpdir CODEX_HOME=natively-test-codex-home --set ELECTRON_RUN_AS_NODE=1 -- electron --test` with the nine IPC/preload test files listed below | 82 passed, 0 failed |
| `npm run build:electron`, `npm run build`, `npm run build:electron` | All pass in order; second Electron build restores output cleared by renderer build |
| `node /Users/shubhampandey/.codex/visualizations/2026/11/18/01a1ee13-ada0-71a0-8c34-3af68ba0e2ae/tools/compare.mjs dist-electron /Users/shubhampandey/.codex/visualizations/2026/11/18/01a1ee13-ada0-71a0-8c34-3af68ba0e2ae/ref-3.2.0/asar/dist-electron --ipc --ipc-json /tmp/phase7-ipc.json` | Pass; counts above, four held compiled alias leads |
| `node --check /Users/shubhampandey/.codex/visualizations/2026/11/18/01a1ee13-ada0-71a0-8c34-3af68ba0e2ae/tools/compare.mjs` | Pass |

Focused test files: `IpcBridgeWiring.test.mjs`, `PreloadBridgeGuard2026_10_16.test.mjs`, `PreloadStealthTapBridgeComplete2026_08_14.test.mjs`, `StealthIpcHandlerRegistration.test.mjs`, `IpcOnIdempotency.test.mjs`, `DirectAssistIpcBridge2026_08_29.test.mjs`, `SkillsIpcWiring.test.mjs`, `WindowsPlatformParity.test.mjs`, and `FirstRunGuidePolicy2026_11_16.test.mjs`.

**Remaining risks:** computed channel expressions, indirect listener sends, downstream service behavior, and packaged/native platform execution remain outside this static wiring verdict. The comparator's broad scans duplicate registrations embedded by esbuild; use distinct channel sets, not raw occurrence totals, to judge parity.
