# Step 8A — Electron Trial Test Reliability

## Summary

The automatic-trial integration test failed because its compiled IPC bundle used the development premium override. The meeting-start hook therefore considered the user licensed and never entered the trial flow. The following test waited forever for a callback that is only assigned when the trial request begins. Separately, saving a fake Groq key triggered a live model-catalog refresh.

The fix adds an opt-in test build that emits a separate `dist-electron-test` IPC bundle. Only that bundle replaces the premium override with a non-premium value and replaces the live model catalog with a no-op. The normal `dist-electron` bundle and production entitlement implementation are unchanged. The release wait is bounded, unexpected fetch requests fail closed, and the harness restores its patched process state and removes its temporary user-data directory.

## Root cause

**Confirmed:** `electron/services/devPremiumOverride.ts` returns `true` for `isDevPremiumOverrideEnabled()`. `electron/ipcHandlers.ts` uses that result in the license predicate that feeds `autoStartTrialForMeeting()`. The esbuild bundle inlines the predicate, so the existing `Module._load` test stub could not replace it. The automatic trial was skipped and the offline retry count remained zero.

**Confirmed:** The “no AI” test assigned `release` only inside its mocked `state.reply`. Because the trial flow was skipped, `state.reply` did not run and the test’s unbounded wait never ended.

**Confirmed:** The “own AI keys” test used the real `set-groq-api-key` handler. That handler triggers `LiveModelCatalogService.refreshProvider()`, which uses the provider model fetcher. The harness’s previous `fetch` fallback did not reliably block non-fetch clients; a prior run logged an HTTP 401 from Groq’s model catalog.

## Exact implementation

- `scripts/build-electron.js` now recognizes `NATIVELY_ELECTRON_TEST_BUILD=1`. After the usual build completes, it builds only `ipcHandlers.ts` into `dist-electron-test/electron/ipcHandlers.js`. A build plugin scoped to that entry replaces `devPremiumOverride` with `false`/`null` and `LiveModelCatalogService` with a no-op implementation. The flag is opt-in; standard builds do not use the plugin.
- `package.json` adds `build:electron:test` and routes `npm test` and `npm run test:electron` through that build. The test runner passes the separate bundle path using the existing `NATIVELY_TEST_IPC_BUNDLE` seam.
- `.gitignore` ignores the generated `dist-electron-test/` directory.
- `autoTrialHarness.mjs` resolves the bundle path, fails and records any unexpected `globalThis.fetch` request, and returns an idempotent disposer. The disposer restores `Module._load`, the original `fetch` property descriptor and the previous `NATIVELY_TEST_USERDATA`, then removes the per-test temporary user-data directory. Setup failures also invoke cleanup.
- Both automatic-trial test files register `after()` cleanup. The “no AI” test now fails within five seconds with a message that identifies an unassigned `state.reply` callback and the likely skipped trial flow. The existing two-attempt retry assertion is unchanged. The own-key case now asserts that no unexpected fetch occurred.

No production entitlement or runtime application behavior was changed.

## Verification results

| Check | Result | Actual result |
|---|---|---|
| Pre-change isolated offline retry reproduction | **FAIL** | Exit 1; `trialStartCalls.length` was `0`, expected `2` (`0 !== 2`). |
| Pre-change full test-file reproduction with 8-second child deadline | **FAIL / reproduced hang** | Exit 124; retry assertion failed and “no AI” remained pending until the external deadline. The runner reported a pending promise after termination. The same run logged a Groq model-catalog 401. |
| `npm run build:electron:test` | **PASS** | Normal build and separate trial-test bundle completed. |
| Isolated automatic-trial integration file | **PASS** | 5 tests passed, 0 failed. Includes offline retry, duplicate in-flight start protection, own-key eligibility and the no-AI flow. |
| `npm run typecheck:electron` | **PASS** | TypeScript emitted no errors. |
| Complete `npm test`, external timeout | **FAIL (suite has other failures)** | Finished in 176,752 ms, before the 12-minute deadline: 17,640 tests, 17,527 passed, 17 failed, 0 cancelled. Both automatic-trial files passed all eight tests (five in the main file, three in the already-used file). |
| `git diff --check` on Step 8A files | **PASS** | No whitespace errors. |

### Commands executed

Pre-change isolated retry reproduction:

```sh
node scripts/run-with-env.mjs --default-tmpdir NATIVELY_TEST_USERDATA=natively-test-userdata --default-tmpdir CODEX_HOME=natively-test-codex-home --set ELECTRON_RUN_AS_NODE=1 -- electron --test --test-name-pattern='offline: one retry' electron/services/__tests__/MeetingStartsTrial2026_10_09.test.mjs
```

Pre-change test-file hang reproduction used an 8-second external Electron process deadline:

```sh
node -e 'const {spawn}=require("node:child_process");const {resolve}=require("node:path");const exe=resolve("node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");const child=spawn(exe,["--test","electron/services/__tests__/MeetingStartsTrial2026_10_09.test.mjs"],{env:{...process.env,ELECTRON_RUN_AS_NODE:"1",NATIVELY_TEST_USERDATA:resolve("/tmp/natively-test-userdata"),CODEX_HOME:resolve("/tmp/natively-test-codex-home")},stdio:"inherit"});let timed=false;const timer=setTimeout(()=>{timed=true;console.error("EXTERNAL_TIMEOUT: trial test file did not finish within 8 seconds");child.kill("SIGTERM");},8000);child.on("exit",(code,signal)=>{clearTimeout(timer);process.exit(timed?124:(code??(signal?1:0)));});'
```

After-change isolated test:

```sh
npm run build:electron:test
node scripts/run-with-env.mjs --default-tmpdir NATIVELY_TEST_USERDATA=natively-test-userdata --default-tmpdir CODEX_HOME=natively-test-codex-home --set NATIVELY_TEST_IPC_BUNDLE=dist-electron-test/electron/ipcHandlers.js --set ELECTRON_RUN_AS_NODE=1 -- electron --test electron/services/__tests__/MeetingStartsTrial2026_10_09.test.mjs
```

Typecheck:

```sh
npm run typecheck:electron
```

The full-suite command was `npm test` started as a detached child process with a 12-minute timer; output was captured at `/tmp/natively-step8a-npm-test.log`. Exact watchdog command:

```sh
node -e 'const fs=require("node:fs");const {spawn}=require("node:child_process");const out=fs.openSync("/tmp/natively-step8a-npm-test.log","w");const child=spawn("npm",["test"],{detached:true,stdio:["ignore",out,out]});let timed=false;const timer=setTimeout(()=>{timed=true;console.error("EXTERNAL_TIMEOUT: npm test exceeded 12 minutes");try{process.kill(-child.pid,"SIGTERM");}catch{child.kill("SIGTERM");}},720000);child.on("exit",(code,signal)=>{clearTimeout(timer);fs.closeSync(out);console.log(`npm test exit=${code} signal=${signal||"none"} timedOut=${timed} log=/tmp/natively-step8a-npm-test.log`);process.exit(timed?124:(code??(signal?1:0)));});'
```

It exited with status 1 before the deadline. The summary was 17,640 tests / 17,527 passed / 17 failed / 0 cancelled.

## Remaining full-suite failures

These 17 failures are outside the two automatic-trial integration files fixed here and were not modified:

- Renderer/source wiring assertions: `AnswersGoToOverlay2026_11_06`, `ForceFreshWhatToAnswer`, `TruncatedAnswerNotStored2026_08_12`, `PhoneMirrorPhoneActions2026_09_27`, and `SensitiveLogRedaction`.
- Auto-answer cancellation wiring: `FastResponseBackgroundModel2026_09_26`.
- Trial and funnel assertions: one case in `FunnelIpc2026_10_01`, three in `TrialCampaignIpc2026_09_29`, one in `TrialEndByokHonest2026_09_26`, three in `TrialEndsWhenAiAllowanceUsed2026_11_03`, and two in `TrialSupersededByPurchase2026_09_26`.
- Meeting persistence entitlement assertion: one case in `AboutYouProOnly2026_11_01`.

The previous full-suite baseline stalled before completion, so this run cannot establish that all 17 failures predated Step 8A. They were not investigated or corrected as part of this task.

## Regression test and network isolation

The existing retry regression remains intact and now passes against the test-only non-premium bundle. This proves the real compiled IPC integration reaches the trial-start path and performs its one retry for the simulated offline error. The existing no-AI concurrency assertion also completes and proves the second start does not create a duplicate request.

For the own-key test, the test bundle replaces the catalog service before it can call the real `fetchProviderModels`/Axios path. The harness permits only the explicitly simulated `/v1/trial/start` fetch; every other fetch records the URL and throws. The own-key test asserts the unexpected-fetch list is empty. This verifies the identified provider-catalog path is isolated; it is not a general interception of every possible Node networking API.

## Files changed for Step 8A

- `.gitignore` — ignore the generated test bundle directory.
- `package.json` — add the opt-in test build and use it for the Electron test commands.
- `scripts/build-electron.js` — build the separate IPC test bundle with test-only dependency aliases.
- `electron/services/__tests__/autoTrialHarness.mjs` — test bundle resolution, fail-closed fetch guard and cleanup.
- `electron/services/__tests__/MeetingStartsTrial2026_10_09.test.mjs` — bounded callback wait, network assertion and teardown.
- `electron/services/__tests__/MeetingStartsTrialUnavailable2026_10_09.test.mjs` — teardown for the shared harness.
- `docs/testing/step-8a-electron-test-reliability-report.md` — this report.

No dependencies were added. No tests were deleted or weakened.

## Review and platform status

An independent read-only review found no blocking issue in the opt-in bundle, alias scope, cleanup or bounded wait. The reviewer noted that the global fetch guard does not intercept arbitrary Node HTTP APIs; the known Axios model-catalog route is disabled by the test-only catalog alias.

The build and tests ran on macOS. **Windows execution was not available.** The build flag and Node/Electron test commands are platform-neutral, but this test setup has not been executed on Windows. No physical audio or device testing is part of Step 8A.

## Remaining risks and untested scenarios

- The complete Electron suite still has the 17 failures listed above.
- Full-suite failure attribution against a completed pre-change baseline is unknown.
- The explicit no-network assertion observes `fetch`; safety for the identified Axios route relies on the isolated catalog service in the separate test bundle.
- Windows test execution and Windows-specific Electron runtime behavior were not tested.
- The five-second callback deadline is a diagnostic guard, not proof that the full suite is free of unrelated hangs.
