# Natively testing matrix

| Layer | Main tooling | Real components | Faked/controlled components | Run location | Scenarios |
|---|---|---|---|---|---|
| Unit | Node `node:test` through Electron or Node strip-types | Target module under test | Clock, provider socket, worker, DB boundary where deterministic | PR CI on macOS and Windows where suite is supported | Stale Deepgram callbacks, delayed local final, short question gate, Direct history reset, stream timeout policy |
| Integration | Existing Electron service test scripts and temporary user data | Electron main modules, IPC handler/preload when booted, SQLite persistence, selected renderer bridge | Provider HTTP stream and controllable delayed worker/audio source when isolating fault | PR CI for hermetic suites | Start/stop/restart, save failure/recovery, IPC lifecycle, transcript snapshot ordering |
| Playwright UI | Existing `@playwright/test`; `_electron.launch` or configured app instance | Electron app, renderer, preload and app IPC | Provider backend may be a local deterministic server; audio still supplied through device in full E2E | PR CI only after approved runner/port fixes; otherwise local | Start/stop session, loading and streaming answer, fresh reset/resume, screenshot/trace on failure |
| Real-device audio | Existing `tests/meeting-memory/live-audio/live-audio-harness.mjs` | OS audio device, Natively capture backend, audio processing, configured STT, session UI | Fixture playback source only; do not inject transcript | Prepared macOS/Windows workstation or dedicated runner | Questions, pauses, speed/noise, endpoint selection, disconnect/recovery |
| Full interview E2E | Playwright Electron control plus real-device audio harness | Electron app, selected OS route, capture, STT and question/answer path | For deterministic fault cases, local fake provider at network/provider boundary. One release smoke can use configured real provider. | Manual/release hardware qualification first | All 12 scenarios below, split into short focused runs and one long soak |

## First five validated findings

| Finding | Best first test | Level | Must use real audio capture? |
|---|---|---|---|
| Windows fallback audio routing | Play interviewer WAV to a non-default endpoint while forcing Chromium fallback; assert route identity and transcript signal | Real-device integration | Yes |
| Stale Deepgram events | Fake old/new socket instances and emit final/endpoint events after reconnect and stop | Unit/integration | No, this isolates provider event ownership |
| Local STT final after snapshot | Hold a local worker result across stop and compare final transcript with saved meeting | Integration | No for ordering, then one live local-model confirmation |
| Short question filtering | Feed exact recorded short elliptical ask through the audio route; unit test the gate and E2E assert judge/answer | Unit plus full E2E | Yes for end-to-end proof |
| Direct Assist history after fresh reset | Unit/state regression for fresh vs resumed history, then Playwright Electron session reset and next request | Unit plus UI integration | No, audio is unrelated to this UI-state defect |

The tests should assert behavior at the relevant boundary. A pure unit test for question detection is valuable but does not prove that capture or STT delivered the utterance. Conversely, recording a screenshot does not prove the displayed answer used the current session context.

## CI policy recommendation

- Keep deterministic Node/Electron unit and integration suites in existing CI.
- Use the macOS/Windows matrix already present for shared behavior. Add interview-specific tests to existing suites only after the team approves CI changes.
- Treat the Windows broad-suite advisory state as an existing known limitation. The new focused regression tests should be enforcing in the appropriate platform suite once approved.
- Keep device audio and long soak separate from ordinary PR jobs until device availability is proven. Publish a JSON summary and Playwright screenshot/trace with each opt-in run.
- Do not use live model or cloud credentials in normal PR jobs. Use a controlled local provider for timeouts and network faults, with one separately authorized real-provider smoke if desired.
