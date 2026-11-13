# Natively testing architecture

## Goal

Use existing Node/Electron tests for deterministic logic, existing Playwright for renderer/Electron automation, and the existing live-audio harness for actual audio-device behavior. Keep the native-device suite outside ordinary CI because it needs OS audio devices, permissions, and test-machine setup.

## Current tools and entry points

| Area | Existing infrastructure | What it covers |
|---|---|---|
| Main and service unit/integration tests | Node built-in `node:test`, run through Electron by `npm test` and focused scripts in [`package.json`](../../package.json) | Main-process code, audio providers, session persistence, RAG and IPC service paths with controlled dependencies. |
| Renderer/helper tests | `node --experimental-strip-types --test`, including `npm run test:lib` and `npm run test:components` | Renderer state helpers and components. These are not full Electron UI sessions. |
| Playwright browser tests | `@playwright/test`, [`playwright.config.ts`](../../playwright.config.ts), and `tests/e2e/` | Browser-rendered UI smoke and parity checks. The default project uses desktop Chrome and its IPC smoke only checks bridge presence. The configured server/readiness port currently differs from Vite's port. |
| Playwright Electron launches | `@playwright/test` `_electron.launch()` in [`scripts/e2e/interview-simulator.mjs`](../../scripts/e2e/interview-simulator.mjs) and other scripts | Real Electron process and renderer automation. The interview simulator injects transcript text, so it is not evidence for microphone/system-audio capture. |
| Renderer CDP automation | `dev:agent` in [`package.json`](../../package.json), `scripts/dev-agent.mjs`, and `agent-browser` documented in [`AGENTS.md`](../../AGENTS.md) | Isolated app instances and renderer inspection. This is useful for debugging and UI flows, but agent-browser is a harness/tool separate from Playwright. |
| Real audio test | [`tests/meeting-memory/live-audio/live-audio-harness.mjs`](../../tests/meeting-memory/live-audio/live-audio-harness.mjs) with [`interview-hour.mjs`](../../tests/meeting-memory/live-audio/interview-hour.mjs) and [`mock-tech-interview.mjs`](../../tests/meeting-memory/live-audio/mock-tech-interview.mjs) | macOS audio played through BlackHole devices into the app's system-audio and microphone capture channels, real STT, live session, answer probes and scoring. It runs locally against an isolated app, not in CI. |
| Speech model fixtures | `electron/audio/whisper/__tests__/fixtures/` | Small English/French WAVs used by local Whisper tests and model verification. They are not yet a labeled interview scenario set for device capture. |
| CI | [`.github/workflows/build-smoke.yml`](../../.github/workflows/build-smoke.yml) | macOS and Windows build/test matrix with Node/Electron suites. The broad `npm test` step is advisory on Windows. Live device audio is not in the workflow. |

The installed tree has `@playwright/test` 1.60.0, `playwright` 1.60.0, `playwright-core` 1.60.0 nested beneath it, and another `playwright-core` 1.63.0 from `react-doctor`. The live-audio harness currently imports `playwright-core` directly. Before extending it, make its Playwright import resolve through the declared test dependency so a transitive version does not control the harness. No Vitest or Jest package is installed or needed for this proposal.

Useful existing commands include `npm test`, `npm run test:auto-answer`, `npm run test:intelligence`, `npm run test:lib`, `npm run test:components`, `npm run test:e2e`, `npm run test:core-smoke`, and `npm run test:modes:long`. Do not add a second runner.

## Proposed layers

1. **Unit tests** use existing `node:test` and assert deterministic logic with fakes. Add coverage for short question filtering, stale provider events, local-final snapshot ordering, and fresh-session Direct Assist reset here where the owning module has a narrow seam.
2. **Integration tests** use existing Electron test scripts with real module boundaries and temporary user data. Exercise stop/save/restart and provider stream failures. They may fake the AI network, but they must not pretend transcript injection proves audio capture.
3. **Playwright Electron UI tests** launch or attach to the real Natively Electron renderer and verify session controls, loading/stream rendering, answer presence, reset/resume state, screenshots, and traces. Use deterministic test credentials/provider endpoints. Existing Playwright browser smoke is not an Electron launch.
4. **Real-device audio tests** extend the existing `tests/meeting-memory/live-audio` harness. Play a WAV through the OS audio route and assert capture signal, transcript, question, answer and stop/recovery states. Keep these opt-in on prepared macOS and Windows machines.
5. **Full interview end-to-end tests** combine Playwright Electron control with real audio playback and real app capture/STT. Use a local controllable AI provider for repeatable success/fault tests. Reserve one small real-provider smoke for release qualification where credentials and cost are accepted.

The [Playwright Electron API](https://playwright.dev/docs/api/class-electron) supports launching Electron, reading windows, screenshots, and artifacts. The documentation calls Electron support experimental and says native Electron dialogs are not intercepted automatically, so tests that trigger them need a narrow main-process test stub or a non-dialog UI route.

## Small proposed directory layout

```text
electron/
  audio/__tests__/                 # existing unit/integration suites
  intelligence/autoAnswer/__tests__/ # existing question and answer tests
  services/__tests__/              # existing session and IPC tests
tests/
  e2e/                             # existing browser Playwright specs
  meeting-memory/live-audio/
    fixtures/                      # add only short, labeled interviewer WAV clips
    scenarios/                     # add compact deterministic scenario data
    results/                       # existing ignored run reports
    live-audio-harness.mjs         # extend existing capture-through-answer harness
```

Do not add a custom test runner, fixture framework, or a production audio-injection API. Keep scenario records as plain data consumed by the current harness. Store raw audio and run artifacts under the existing ignored results location, and check in only small consent-cleared fixtures and expected transcript/scenario metadata.

## Automation boundary

- Run unit, component, current integration, and browser/Electron UI tests in normal CI after the CI scope is approved.
- Do not make device-dependent audio a default CI requirement until a dedicated OS runner has a stable device, permissions, and cleanup contract.
- Keep macOS BlackHole and Windows endpoint tests as named manual/release checks first. Their result report should list OS, device route, selected endpoint, STT provider/model, first captured signal, transcript, answer, timings, and cleanup.
- Use LiveKit's official [agent simulation guidance](https://docs.livekit.io/testing/simulations/) only as a reference for scenario/outcome structure and realistic noise/packet-loss cases. LiveKit's simulation runtime is built for LiveKit agents and would not exercise Natively's Electron capture stack. Do not add LiveKit to this project.
