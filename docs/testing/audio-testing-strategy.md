# Audio testing strategy

## Existing audio paths and tests

Natively's Electron main process selects the microphone and system-audio pipelines in [`electron/main.ts`](../../electron/main.ts). Shared microphone/native capture code is under [`native-module/src/microphone.rs`](../../native-module/src/microphone.rs). macOS system audio uses the CoreAudio process-tap implementation in [`native-module/src/speaker/core_audio.rs`](../../native-module/src/speaker/core_audio.rs). Windows system audio uses WASAPI render-device loopback in [`native-module/src/speaker/windows.rs`](../../native-module/src/speaker/windows.rs). The Windows capture supports a selected render device ID and also contains default-device and communications-device detection. Its source comments identify that VoIP applications may use the Windows communications default independently of the multimedia/console default.

There are already targeted tests for [`RendererCaptureFallback`](../../electron/audio/__tests__/RendererCaptureFallback2026_10_21.test.mjs), [`AudioDeviceSelection`](../../electron/audio/__tests__/AudioDeviceSelection2026_08_26.test.mjs), system-audio route changes, permission failure, `SttGapRecovery`, and local Whisper drain/worker behavior. These mostly use fakes or source-level assertions. The live macOS harness is the existing proof path that sends actual sound into both Natively audio channels.

The current live harness uses macOS `say` to render interview lines to files or a selected virtual output and uses `ffmpeg` for playback. It then reads Natively's actual input/output devices, starts a meeting with those device IDs, and waits for both channel transcripts. This is audio capture, not transcript injection. It already has an hour scenario and a shorter mock technical-interview scenario. Its setup currently requires locally installed BlackHole 2ch/16ch and ffmpeg, plus app microphone/system-recording permissions.

## macOS

BlackHole is suitable as the macOS loopback device for system/interviewer audio. Its upstream project describes it as a macOS virtual loopback driver and provides 2-channel and 16-channel builds. Natively's existing audio harness already uses both. Do not install it or configure a machine-wide multi-output device as part of this step. The harness should select device IDs directly and restore the user's normal output after a run.

BlackHole is GPL-3.0 according to its upstream repository. Keep it as an optional developer/lab test dependency, not a bundled Natively dependency. Verify licensing before any redistribution.

For microphone-channel validation, the existing harness routes generated candidate speech to BlackHole 2ch as the selected Natively input. For a small committed clip corpus, store short WAV clips with expected words, language, speaker/channel, sample rate, and consent/license metadata. Have the harness play clips into the same selected input/output route and verify actual signal and transcript events.

Upstream references: [BlackHole README](https://github.com/ExistentialAudio/BlackHole/blob/master/README.md), [using BlackHole as a virtual microphone](https://github.com/ExistentialAudio/BlackHole/wiki/Use-BlackHole-as-a-Virtual-Microphone).

## Windows

Do not use or install BlackHole on Windows. The simplest compatible route for Natively's interviewer/system-audio path is the WASAPI loopback capture already implemented in `native-module/src/speaker/windows.rs`. Play a WAV fixture through the exact render endpoint Natively selected and capture its loopback. This avoids adding a virtual-device driver for this path.

The test must choose a non-default render endpoint for the fallback-routing finding. It must assert the endpoint actually used by the capture path, not only that some audio bytes arrived. Include a case where the communications-default endpoint differs from the multimedia default because the native source documents this distinction. A dedicated Windows runner can use the real selected output endpoint and a small Windows-compatible WAV playback helper already available on that runner. No playback package or virtual cable is currently declared in the repository. Select and validate that helper before implementation; do not add one implicitly.

This loopback route tests system/interviewer capture. It does not substitute for the microphone capture path. Mic validation needs either a real microphone on the dedicated machine or a separately approved virtual microphone device. Keep that dependency outside the initial system-audio test.

Native source references: [`windows.rs` device selection and loopback initialization](../../native-module/src/speaker/windows.rs#L108), [`windows.rs` loopback stream setup](../../native-module/src/speaker/windows.rs#L305), [`core_audio.rs`](../../native-module/src/speaker/core_audio.rs).

## Audio-to-answer assertions

Every live run should collect timestamps/events for these stages:

1. Playback started on the expected OS endpoint.
2. Natively capture initialized and selected device IDs recorded.
3. First non-silent signal observed on the expected channel.
4. Partial and final STT text match expected terms, with reasonable tolerance for punctuation.
5. Question detector sees the expected question and does not answer a backchannel.
6. Answer request starts once, streams visible text, and terminates once.
7. The visible answer is grounded in the current scenario context.
8. Stop completes, the meeting record is saved/recoverable, and audio processes/listeners are closed.

For failures, save the fixture/scenario ID, OS/device identifiers, provider/model, transcript timeline, answer stream events, timestamps, app logs, screenshot, and Playwright trace. Avoid keeping full sensitive interview audio or prompts in ordinary test artifacts. Only commit short, approved fixtures.

## Device failure and recovery

- A deterministic unit/integration test should simulate device invalidation and verify the app's recovery state and resource cleanup.
- A real-device qualification run should switch or disconnect the selected endpoint during playback and verify that the UI reports the route/status and resumes after user/device recovery.
- BlackHole can prove selected-route and stream-stop behavior on macOS, but physically removing a USB audio device is still required to validate real hardware disconnection behavior.
- Windows endpoint switching/disconnect requires an actual Windows machine. No repository evidence establishes a reliable CI virtual device for this purpose.

## Limits

Audio hardware, privacy permissions, driver routing, and OS device removal are outside Playwright's DOM emulation. Playwright can control the app and capture artifacts while audio is played externally, but only the OS runner can prove those boundaries.
