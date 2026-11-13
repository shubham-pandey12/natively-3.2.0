# Step 7C — Test Environment Stabilization Report

## Scope and result

This was a read-only investigation. No production code, tests, configuration, dependencies, virtual devices, or environment settings were changed. The only workspace change for Step 7C is this report.

The failures reproduced independently. The four library failures and fourteen component failures were already recorded in the Step 7B report and are unrelated to the Step 7B edits. In particular, the only Step 7B edit in `NativelyInterface.tsx` is the fresh-session Direct history reset; it does not touch the failing answer-error branches or funnel wiring. Note that `npm test` runs Electron tests only. The fourteen component failures came from `npm run test:components`.

`CONFIRMED` means source evidence establishes the condition. `REPRODUCED` means the reported test failure or hang was observed. `POTENTIAL` means the scenario is plausible but was not demonstrated. `UNVERIFIED` means the current evidence cannot establish runtime behavior.

## The 18 reproduced failures

### Library tests — four failures

| # | Test and source | Classification | Cause and implementation assessment | Smallest safe correction |
|---|---|---|---|---|
| 1 | `NoNativePopups2026_09_27.test.mjs` — `no native <select> elements`; hit at `premium/src/ModesSettings.tsx:2298` | **REPRODUCED; implementation violation CONFIRMED** | The template type control is a real native `<select>`, contrary to the test's stated no-native-popup rule. It is not a Step 7B change. The scanner also misses the two real `<select>` tags in `src/components/meeting/ShareMenu.tsx`: applying the test's `blankCommentsAndStrings()` to that TSX source blanks the tags before matching. So fixing only the reported hit would leave the scan incomplete. | Replace the premium control with the appropriate in-window select while preserving its update/error behavior. Make the scanner JSX-aware or add explicit tests for JSX tags so the Share menu controls cannot evade it. Do not exempt the controls without a screen-share safety justification. |
| 2 | `SystemAudioAnswerIssue540.test.mjs:141` — `generateWhatToSay receives undefined, not a rolling-bar blob` | **REPRODUCED; assertion stale; runtime behavior UNVERIFIED** | The source test cannot find its old exact `handleWhatToSay` signature. Current `NativelyInterface.tsx:8411` accepts retry/capture arguments and constructs `questionForWta` before calling `generateWhatToSay` at about line 8671. For a bare request, that value can still be `undefined`; a fresh request associated with a screenshot/capture may intentionally supply a question. Step 7B does not change this flow. This is a source-text test, not a behavioral test. | Assert the relevant bare-audio and fresh-capture cases separately at the payload boundary, including that older rolling transcript is not used as the request. |
| 3 | `chatFailureWiring2026_10_05.test.mjs:83` — `an answer that broke off keeps its text clean...` | **REPRODUCED; assertion target stale; runtime behavior UNVERIFIED** | The test starts at the first `const failed = failedLine(error)` in the stream error handler, which is the phone-mirror branch. It then expects the desktop branch's `lastMsg` expression inside a fixed 900-character window. The current desktop branch later preserves non-empty partial text and attaches failure metadata (`NativelyInterface.tsx` around lines 9310–9320). The source test reads text, not rendered behavior. Step 7B's reset change does not touch these branches. | Anchor the desktop branch by its source/stream marker, or test observable partial-answer and no-answer UI outcomes in the existing Electron/browser harness. |
| 4 | `funnel/__tests__/answerFailure.test.mjs:111` — `the analytics helper reports the cause and nothing else` | **REPRODUCED; assertion stale; runtime behavior UNVERIFIED** | The failing matcher expects an inline callback shaped like `failure: DirectAssistAnswerFailure, ) => { reportAnswerFailed(failure);`. Current Direct Assist handling centralizes this in `settleDirectAssistFailure()` (`NativelyInterface.tsx:7134–7137`); `reportAnswerFailed()` still reports only `{ cause }` (`src/lib/analytics/analytics.service.ts`). The helper's cause behavior tests pass; the failing UI wiring assertion is source-text-only. | Assert that the centralized failure path calls the helper and use a `funnelTrack` spy to verify the emitted payload contains only the cause. |

### Component tests — fourteen failures

All fourteen reproduce with `npm run test:components`. These are test failures, not demonstrated UI failures, unless otherwise marked. The premium toaster sources are thin re-export files pointing to `premium/src/recovered/App-h7VwvpAg.js`; string assertions against the wrappers cannot verify the compiled component behavior.

| # | Test | Classification | Cause and implementation assessment | Smallest safe correction |
|---|---|---|---|---|
| 5 | `TrialUnlocksProSurfaces2026_09_25.test.mjs` — `ModesSettings honours the prop it is given` | **REPRODUCED; assertion stale; gating source CONFIRMED** | Test expects local identifier `hasProAccess`; current `premium/src/ModesSettings.tsx:1578` computes `isAllowed = isPremium || isTrialActive` and uses that entitlement result. The prop exists and the expression implements the intended licence-or-trial condition. The assertion tests a variable name, not user behavior. | Assert the trial prop controls the locked/unlocked branch, or assert the current shared gate is used.
| 6 | `GenieModal.test.mjs` — `ProfileFeatureToaster (premium) opens and closes with the genie` | **REPRODUCED; source target invalid; runtime behavior UNVERIFIED** | The test reads `premium/src/ProfileFeatureToaster.tsx`, which only re-exports the implementation from the recovered JS bundle. No JSX implementation is present in the file it scans. | Exercise the exported component or the visible close animation through the existing UI harness.
| 7 | `GenieModal.test.mjs` — `JDAwarenessToaster (premium) opens and closes with the genie` | **REPRODUCED; source target invalid; runtime behavior UNVERIFIED** | Same wrapper/recovered-bundle mismatch. | Test the exported component's visible open/close behavior.
| 8 | `GenieModal.test.mjs` — `MaxUltraUpgradeToaster (premium) opens and closes with the genie` | **REPRODUCED; source target invalid; runtime behavior UNVERIFIED** | Same wrapper/recovered-bundle mismatch. | Test the exported component's visible open/close behavior.
| 9 | `GenieModal.test.mjs` — `NativelyApiPromoToaster (premium) opens and closes with the genie` | **REPRODUCED; source target invalid; runtime behavior UNVERIFIED** | Same wrapper/recovered-bundle mismatch. | Test the exported component's visible open/close behavior.
| 10 | `GenieModal.test.mjs` — `pictures: the Modes manager says when it is loading...` | **REPRODUCED; assertion stale; runtime behavior UNVERIFIED** | The test looks for `modesLoaded`; current ModesSettings source uses `loaded` in `aria-busy={!loaded || uploading}`. The expected accessibility state exists under a renamed local variable. | Assert the rendered busy state or current source contract rather than a historical variable name.
| 11 | `GenieModal.test.mjs` — `pictures (premium): the Natively API card has one picture per variant` | **REPRODUCED; source target invalid; runtime behavior UNVERIFIED** | The test reads the Natively API re-export stub, not the compiled implementation containing the card. | Test the exported component for variant-specific rendered state, or add a supported source entry point if the component source becomes available.
| 12 | `PremiumAdsCloseFirst2026_09_26.test.mjs` — `ProfileFeatureToaster: a plain close plays the genie, then reports` | **REPRODUCED; source target invalid; runtime behavior UNVERIFIED** | It searches the re-export stub for `handleDismiss`/`closeThen`. | Test close timing and host notification on the exported component.
| 13 | Same file — `JDAwarenessToaster: a plain close plays the genie, then reports` | **REPRODUCED; source target invalid; runtime behavior UNVERIFIED** | Same wrapper/recovered-bundle mismatch. | Test the visible close transition and callback order.
| 14 | Same file — `MaxUltraUpgradeToaster: a plain close plays the genie, then reports` | **REPRODUCED; source target invalid; runtime behavior UNVERIFIED** | Same wrapper/recovered-bundle mismatch. | Test the visible close transition and callback order.
| 15 | Same file — `NativelyApiPromoToaster: a plain close plays the genie, then reports` | **REPRODUCED; source target invalid; runtime behavior UNVERIFIED** | Same wrapper/recovered-bundle mismatch. | Test the visible close transition and callback order.
| 16 | Same file — `MaxUltraUpgradeToaster: "I'm happy with Pro" and a plan close first` | **REPRODUCED; source target invalid; runtime behavior UNVERIFIED** | The test expects inline source handlers in the re-export stub. | Test the observable plan and dismiss callbacks from the exported component.
| 17 | Same file — `NativelyApiPromoToaster: the decline closes first` | **REPRODUCED; source target invalid; runtime behavior UNVERIFIED** | Same wrapper/recovered-bundle mismatch. | Test the decline flow's animation and callback order.
| 18 | Same file — `hand-overs stay instant` | **REPRODUCED; source target invalid; runtime behavior UNVERIFIED** | The test expects specific inline statement text in re-export stubs. | Test that hand-over actions reach their destination immediately without waiting for the close animation.

The component run total was **879 tests: 864 passed, 14 failed, 1 skipped**. The six Genie/picture failures and seven close/hand-over failures are all source-text assertions. Their target files do not contain the component implementation. The recovered bundle is present, but these failures do not establish that the runtime animations are correct.

## `npm test` stall: MeetingStartsTrial

### Reproduction

The offline test was independently reproduced with the Electron test runner and a name filter. It fails with `trialStartCalls.length === 0`, expected `2`. Running the whole `MeetingStartsTrial2026_10_09.test.mjs` also reproduced the later pending test; the run was interrupted after about 92 seconds.

```sh
node scripts/run-with-env.mjs --default-tmpdir NATIVELY_TEST_USERDATA=natively-test-userdata --default-tmpdir CODEX_HOME=natively-test-codex-home --set ELECTRON_RUN_AS_NODE=1 -- electron --test --test-name-pattern='offline: one retry' electron/services/__tests__/MeetingStartsTrial2026_10_09.test.mjs
```

Observed failure: `0 !== 2` at `MeetingStartsTrial2026_10_09.test.mjs:39`.

### Root cause

**CONFIRMED; unrelated to Step 7B.** `electron/services/devPremiumOverride.ts` makes `isDevPremiumOverrideEnabled()` return `true`. `electron/ipcHandlers.ts` uses it in `isLicensed()`; the auto-start hook (`autoStartTrialForMeeting`, around line 13004) passes the resulting licensed state to `shouldAutoStartTrial()` and returns before calling `startTrialFlow()`. The test's reply stub is therefore never called. The helper loads compiled `dist-electron/electron/ipcHandlers.js`; its module-loader stub cannot replace the bundled developer override.

The next test, `no AI: the meeting starts the trial`, assigns its `release` callback only inside `state.reply`. Its unbounded `while (!release) await setTimeout(..., 5)` loop at test lines 57–58 never ends when eligibility skips the request. That repeating timer is why the test process remains alive. There is no evidence that a worker, listener, or external network request is the primary hang.

Parallel execution is **not** the cause: the filtered offline test fails when run alone, and the full test file reproduces the pending loop. The harness also replaces global `fetch`/`Module._load` and creates a temp user-data directory without restoring/removing them. Those are test-harness cleanup risks, but the current test-file process exits only after its tests finish. Separately, changing the fake Groq key triggers a real model-catalog refresh; the run logged an HTTP 401. That is a confirmed unwanted network side effect, not the root cause of the trial assertion or hang.

### Smallest safe correction

Use a test build or test seam that supplies a non-premium entitlement to this integration path without changing production entitlement behavior. Keep the offline retry assertions. Add a bounded wait for `release` that fails with a clear eligibility/setup message rather than spinning indefinitely. Stub the model-catalog refresh path in this harness so setting a fake API key cannot make external requests. After correcting the test setup, rerun the isolated trial file, then `npm test` with a finite test-runner timeout.

## macOS live-audio setup

### Current state

- BlackHole 16ch and BlackHole 2ch are installed and were visible to `say -a '?'` in the investigated macOS environment. The observed device IDs were 91 and 108; device IDs can change, so the harness resolves by device name.
- `ffmpeg` is not installed. The harness's preflight previously recorded every reliability case as `BLOCKED`; no audio or STT scenario ran.
- The reliability harness generates speech with macOS `say`; it does not use the existing local-STT WAV fixtures. Interviewer speech is rendered to AIFF and played through FFmpeg to BlackHole 16ch. Candidate speech goes through `say` to BlackHole 2ch. Natively is started with those input/output device IDs and its configured real STT provider.
- The scenario loop checks transcript output after its per-scenario transcript-count watermark. Warm-up requires interviewer and user transcript activity. Follow-up additionally checks actual What-to-Answer output. These are the evidence points that audio crossed capture and STT; sending audio to BlackHole alone is not a pass.
- Physical audio-device disconnection remains operator-run. BlackHole is virtual and cannot reproduce unplugging or disabling a real endpoint.

### FFmpeg capability requirements

The repository does **not** pin a minimum FFmpeg version. Do not treat 9.0.2 as a minimum: that is the current Homebrew stable version reported during this investigation. The required capabilities are:

- FFmpeg CLI and `lavfi` input, with `anullsrc` and `anoisesrc`.
- `pan`, `volume`, and `amix` filters.
- AIFF decoding.
- The macOS `audiotoolbox` output device and its device-listing support.

FFmpeg documents AudioToolbox output as native CoreAudio output and documents `-audio_device_index` / device enumeration. Homebrew's current formula lists `brew install ffmpeg` and stable 9.0.2. Installing it would modify the host Homebrew environment, not Natively's package manifests; it still requires separate approval. See [Homebrew FFmpeg](https://formulae.brew.sh/formula/ffmpeg) and [FFmpeg device documentation](https://www.ffmpeg.org/ffmpeg-devices.html).

After approval, install and verify capabilities with:

```sh
brew install ffmpeg
ffmpeg -version
ffmpeg -hide_banner -devices
ffmpeg -hide_banner -filters
say -a '?'
```

Confirm the output includes `audiotoolbox`, the listed filters include `anullsrc`, `anoisesrc`, `pan`, `volume`, and `amix`, and `say` lists both BlackHole devices. The harness itself resolves and checks BlackHole 16ch before playback.

### Reliability scenario command

After FFmpeg setup and the microphone/system-audio permissions are granted:

1. Start an isolated Natively instance with `NATIVELY_E2E=1 npm run dev:agent` and ensure `ambientChatEnabled=false` in that isolated profile.
2. In another terminal run:

```sh
node tests/meeting-memory/live-audio/live-audio-harness.mjs --script reliability --label step7c-macos
```

The JSON result is written under `tests/meeting-memory/results/`. Require PASS transcript terms for each executed scenario, PASS answer terms for the follow-up, correct selected device IDs, and successful interviewer/user warm-up. A blocked preflight or an audio-only playback is not a pass. Preserve the existing one-hour case with:

```sh
node tests/meeting-memory/live-audio/live-audio-harness.mjs --label step7c-hour
```

The background-noise mix uses `anoisesrc` amplitude `0.015` and then `volume=0.08` (product about `0.0012` before mixing). **POTENTIAL**: the noise may be too quiet to meaningfully represent background noise; no FFmpeg run or SNR calibration was possible. Calibrate and record the resulting signal/noise level before interpreting this scenario as robustness evidence.

## Playwright browser setup

### Current state and exact command

The installed `@playwright/test` is 1.60.0. The local CLI dry run reports Chromium 148.0.7778.96, Playwright revision v1223, and the matching Chromium headless shell. The previous browser suite failed to launch 13 tests and skipped 4 because `chromium_headless_shell-1223` was absent. The current `playwright.config.ts` uses a single `electron-chrome` project with `channel: undefined`, so the bundled Playwright Chromium/headless shell is expected.

After approval, install just Chromium with the already installed CLI:

```sh
./node_modules/.bin/playwright install chromium
```

It downloads browser binaries to Playwright's user cache (on macOS, `~/Library/Caches/ms-playwright`) and does not update `package.json` or a lockfile. Do not run `npm install` for this. Playwright installs version-matched browser binaries; rerun the install command after a Playwright version update. See [Playwright browser installation](https://playwright.dev/docs/browsers).

The current macOS host reports macOS 26.5.2. Playwright's current documented macOS support starts at macOS 14. Its `install-deps` flow is for installing OS packages on Linux; do not run that Linux dependency installer on macOS. The browser install is still a network download into the user cache and needs approval.

Rerun the browser suite with:

```sh
npm run test:e2e
```

The dedicated real-Electron startup/IPC smoke is separate and previously passed 1/1:

```sh
npm run test:e2e:electron
```

That smoke covers launcher startup, preload bridge availability, gated reset IPC, and inactive meeting status. It does not cover real session start/stop, answer rendering/streaming, or provider error UI.

## Windows audio requirements

**NOT TESTED** physically: this investigation ran on macOS. `native-module/src/speaker/windows.rs` contains the WASAPI loopback implementation. `electron/audio/__tests__/OutputRouteMismatch2026_10_21.test.mjs` exercises detector/policy decisions with simulated levels; it does not emit playback or prove captured samples came from a non-default endpoint. There is no Windows playback helper in the current live-audio harness.

Before treating Windows routing as verified, use a Windows 10/11 host with a default render endpoint and a second active endpoint, then exercise:

- Playback routed explicitly to default and non-default endpoints while Natively captures; assert actual transcript/audio activity.
- Change the default or selected endpoint during capture and confirm routing changes.
- Disable or disconnect the active endpoint and verify native invalidation, cleanup, fallback, and transcript recovery.
- Force native capture unavailable and separately verify Chromium's fallback route on the real default output.

The existing Node route-policy tests are deterministic but simulated. An optional test-only WASAPI tone/WAV playback helper could drive real routes, but should be proposed separately and validated on Windows before adding it. Do not claim Windows routing is verified from macOS or from mocked levels.

## Exact rerun commands

The four library failures were also run as individual files:

```sh
node --experimental-strip-types --test src/lib/__tests__/NoNativePopups2026_09_27.test.mjs
node --experimental-strip-types --test src/lib/__tests__/SystemAudioAnswerIssue540.test.mjs
node --experimental-strip-types --test src/lib/__tests__/chatFailureWiring2026_10_05.test.mjs
node --experimental-strip-types --test src/lib/funnel/__tests__/answerFailure.test.mjs
```

The component failures were independently reproduced in these files:

```sh
node --experimental-strip-types --test src/components/__tests__/TrialUnlocksProSurfaces2026_09_25.test.mjs
node --experimental-strip-types --test src/components/onboarding/__tests__/GenieModal.test.mjs
node --experimental-strip-types --test src/components/onboarding/__tests__/PremiumAdsCloseFirst2026_09_26.test.mjs
```

Suite commands:

```sh
npm run test:lib
npm run test:components
npm test
npm run test:e2e:electron
npm run test:e2e
```

`npm test` is the Electron test command defined in `package.json`; it is not an aggregate of the library and component commands. Do not rerun the full Electron suite until the unbounded trial wait is made deterministic or run it under an explicit external timeout.

## Prioritized stabilization plan

1. **Unblock deterministic Electron tests.** Provide a test-only non-premium entitlement path for the trial integration test; keep retry expectations; bound the deferred promise wait; prevent fake credentials from triggering real catalog/network refresh. Verify the isolated trial test before the full `npm test` suite.
2. **Fix the confirmed select violation and scanner blind spot.** Replace the native premium template selector with a safe in-window select and make the scan catch TSX controls in ShareMenu. Re-run `npm run test:lib`.
3. **Repair stale test contracts without relaxing intent.** Replace source-shape checks for #540, error rendering, funnel wiring, trial naming, and Genie/premium wrappers with current branch contracts or observable behavior. First make the private/recovered component test target explicit; do not infer correctness from re-export text.
4. **Approve and install the Playwright browser.** Run `npm run test:e2e`; keep the passing Electron smoke as a distinct, narrower check.
5. **Approve and install host FFmpeg.** Run the live reliability script through BlackHole and Natively's real capture/STT. Calibrate noise; do not count device-disconnection as covered until an operator exercises physical hardware.
6. **Schedule Windows hardware verification.** Test WASAPI default/non-default routing, endpoint switching/disconnection, and fallback on a Windows machine with multiple render endpoints.

## Commands and checks performed

- `npm run test:lib` — 3,016 tests, 2,997 passed, 4 failed, 15 skipped; each failing file rerun independently and failed as expected.
- `npm run test:components` — 879 tests, 864 passed, 14 failed, 1 skipped; each of the three failing component files rerun independently.
- Isolated Electron test command above — offline retry failed independently with 0 trial calls instead of 2.
- Full `MeetingStartsTrial2026_10_09.test.mjs` in Electron — reproduced offline failure and pending next test; interrupted after about 92 seconds.
- `./node_modules/.bin/playwright --version` — 1.60.0.
- `./node_modules/.bin/playwright install --dry-run chromium` — identified Chromium/headless-shell v1223 and cache locations; did not download.
- `brew info --json=v2 ffmpeg` / `brew list --versions ffmpeg` — Homebrew stable 9.0.2, not installed.
- `say -a '?'` — BlackHole 16ch and 2ch listed.
- Existing Step 7B reliability preflight — all live-audio scenarios BLOCKED by missing FFmpeg; no live audio/STT scenario executed.

The code-review-graph MCP tools were unavailable in this session; findings use targeted source inspection and independent ECC agent reviews.
