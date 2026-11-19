# Phase 9 — Capture and speech parity

Reference: extracted signed 3.2.0 at `/Users/shubhampandey/.codex/visualizations/2026/11/18/01a1ee13-ada0-71a0-8c34-3af68ba0e2ae/ref-3.2.0`.
All comparisons were static; reference binaries were not loaded or executed. The `code-review-graph` MCP tools required by the repository instructions were unavailable in this session, so discovery used the provided area map, source search, comparator, and targeted file reads.

## Verdicts

| ID | Feature | Verdict | Evidence and result |
| --- | --- | --- | --- |
| F039 | Quiet notes | Partial | Local `src/components/NativelyInterface.tsx:608,8606`; reference `asar/dist/assets/NativelyInterface-ikIwHUKF.js:1`. A quiet-note live-stream trigger did not occur during the meeting, so its trigger path remains unverified at runtime. Existing `noneYet` handling is gated on a null answer. |
| F040 | Microphone | Implemented | Local `electron/audio/MicrophoneCapture.ts:22,158,287,385`; reference `asar/dist-electron/electron/audio/MicrophoneCapture.js:1` is identical. Meeting start physically opened the selected mic, resampled 48 kHz input to 16 kHz and delivered it to Deepgram. |
| F041 | System audio macOS | Partial | Local `electron/audio/SystemAudioCapture.ts:41,135,326,380`; reference `asar/dist-electron/electron/audio/SystemAudioCapture.js:1` is identical. CoreAudio Tap initialized and stop cleaned up; no system-audio data frames were confirmed during the runtime attempt. Native diagnostic export drift is tracked as F105 below. |
| F042 | System audio Windows | Partial | Local Rust platform path: `native-module/src/speaker/windows.rs:24,157,230,334,417,443`; shared loader/wrapper: `electron/audio/SystemAudioCapture.ts:41,135`. Reference JS capture wrapper is identical at `asar/dist-electron/electron/audio/SystemAudioCapture.js:1`. No Windows `.node` exists in either inventory. Reviewed only; physical Windows verification remains required. |
| F043 | Device selection | Implemented | Local `electron/audio/AudioDevices.ts:9,14`, `electron/main.ts:6030,6195,6248,7064`; reference `asar/dist-electron/electron/audio/AudioDevices.js:1` is identical. Runtime enumerated devices, switched the meeting mic to MacBook Pro Microphone, then restored Default Microphone. |
| F044 | Silence suppression | Partial | Local `native-module/src/lib.rs:465` and `electron/main.ts:5145,5331`; reference JS capture wrappers are identical. Runtime logs showed the silence suppressor on the mic path. Native binary implementation is opaque in the extracted reference and cannot be proven equivalent from export names alone. |
| F045 | Resampling | Partial | Local `native-module/src/lib.rs:429-459`, `electron/main.ts:5186,5358`; reference JS capture wrappers are identical. Runtime logs confirmed 48 kHz to 16 kHz mic resampling. Native implementation parity cannot be proven from the permitted binary inventory. |
| F046 | Screenshots | Implemented | Local `electron/ScreenshotHelper.ts:32,480`, `electron/main.ts:9601`; reference bundle module begins at `asar/dist-electron/electron/main.js:295734` and differs only in generated Electron import numbering. Full screenshot was captured and deleted through the UI. |
| F047 | Crop | Implemented | Local `electron/CropperWindowHelper.ts:69,135,276`, `src/components/Cropper.tsx:63`; reference bundle module begins at `asar/dist-electron/electron/main.js:525399`. A 240×180 crop passed bounds validation at runtime; the crop output was deleted. |
| F048 | Page context | Partial | Local page capture wiring: `electron/main.ts:2240-2337,9610-9660`; reference `asar/dist-electron/electron/main.js:550666` (main entry) and `asar/dist-electron/electron/ipcHandlers.js:543647` (IPC entry). Automated page-capture fallback/IPC tests passed, but extension-backed page context was not exercised in the runtime session. |
| F049 | Direct Assist | Partial | Local `electron/direct-assist/DirectAssistService.ts:26,75`; reference bundle module begins at `asar/dist-electron/electron/main.js:243060`. Automated Direct Assist core and bridge tests passed; the live UI path was not exercised. |
| F050 | STT providers | Partial | Local provider modules in `electron/audio/`; reference modules under `asar/dist-electron/electron/audio/`. Every provider module listed below is byte-equivalent after the comparator's source-map/build normalization. Deepgram transcribed live microphone speech. Apple Speech could not be run because the local `resources/apple-speech/Natively-asr` helper is absent; Windows providers/capture were not run. |
| F051 | Rolling transcript bar | Partial | Local `src/components/NativelyInterface.tsx` transcript surface; reference `asar/dist/assets/NativelyInterface-ikIwHUKF.js:1`. Relevant string literals matched (102/102); live transcript text appeared in the overlay during the meeting. Renderer component code is not byte-identical, so parity is not fully established. |
| F052 | Context terms | Implemented | Local `electron/audio/sttContextTerms.ts:51,76,98-128`; reference `asar/dist-electron/electron/audio/sttContextTerms.js:1` is identical. Provider modules that consume terms are identical as well. |

### “Start Natively” carry-over

**Yes.** In the reference, `asar/dist-electron/electron/main.js:557479-557519` calls `startCaptureChannels()` from the meeting lifecycle; that method starts `microphoneCapture` before system audio. Local `electron/main.ts:7898,7922` follows the same meeting-start path. The local runtime confirmed that the launcher CTA started a meeting and immediately opened mic capture (and initialized system capture).

## Pipeline map and cross-platform review

### macOS

Meeting lifecycle and permission gates are in `electron/main.ts:844-1081,7898-8320`. macOS checks microphone permission and Screen Recording/System Audio capability before capture. `MicrophoneCapture` wraps the native cpal mic; `SystemAudioCapture` selects the native system-audio backend and uses CoreAudio/ScreenCaptureKit paths in `native-module/src/speaker/{core_audio.rs,macos.rs,sck.rs}`. `AppleSpeechSTT` starts the packaged `apple-speech/Natively-asr` helper and handles locales, backpressure, and teardown (`electron/audio/AppleSpeechSTT.ts:47-57,248-402`). Current `resources/` has no such helper, so that path was not run.

Runtime permission status was granted for microphone and screen recording. Native mic and CoreAudio tap initialized, Deepgram connected, the mic produced speech transcripts, and meeting stop returned both capture wrappers and STT to idle. System audio reported initial silence and no captured frames; this does not establish that system audio was heard.

### Windows

Windows speaker capture is the explicit WASAPI loopback implementation at `native-module/src/speaker/windows.rs:24,157,230,334,417,443`; microphone and shared device resolution are in `native-module/src/microphone.rs:71,195,228` and `native-module/src/lib.rs:933,983`. The JS wrappers, device selection, cleanup, reconnect, resampling, and STT provider adapters were reviewed. Neither local nor reference contains a Windows `.node` file, so only TS/JS loader and call paths can be compared. No Windows physical execution occurred.

### Shared capture and STT

`AudioDevices` resolves stable device IDs and filters internal capture devices; `main.ts` owns meeting devices and applies changes. Mic and system-audio wrappers feed chunk streams to `main.ts` wiring (`:4967,5145,5331`), which locks actual sample rate, applies pause/mute gates, feeds STT, and awaits teardown/recovery (`:6547-6564,6761-6814,7898-8320`). The `MicrophoneCapture.js`, `SystemAudioCapture.js`, `AudioDevices.js`, and the shared audio helper modules compare identical, except the single extra local behavior described below.

| Provider | Local module | 3.2.0 endpoint/model behavior |
| --- | --- | --- |
| Apple Speech | `AppleSpeechSTT.ts` | macOS helper `Natively-asr`; locale selection, local PCM protocol, buffered writes. Module identical. |
| Deepgram | `DeepgramStreamingSTT.ts` | Streaming WebSocket, selected model and language/format parameters. Module identical; runtime mic session connected. |
| ElevenLabs | `ElevenLabsStreamingSTT.ts` | Realtime WebSocket provider adapter and configured model parameters. Module identical. |
| Google | `GoogleSTT.ts` | Streaming speech adapter with provider model/language configuration. Module identical. |
| Local Whisper | `LocalWhisperSTT.ts` | Local worker/model pipeline. Module identical. |
| Natively Pro | `NativelyProSTT.ts` | `wss://api.natively.software/v1/transcribe`; auth, language and sample-rate frames. Module identical. |
| NVIDIA NIM | `NvidiaNimStreamingSTT.ts` | Configured NIM model and endpoint payload. Module identical. |
| OpenAI | `OpenAIStreamingSTT.ts` | `wss://api.openai.com/v1/realtime?intent=transcription`, live model plus `gpt-4o-transcribe` / `gpt-4o-mini-transcribe` fallback; REST endpoint `https://api.openai.com/v1/audio/transcriptions`. Module identical. |
| Qwen | `QwenRealtimeSTT.ts` | `wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-asr-flash-realtime`. Module identical. |
| REST adapters | `RestSTT.ts` | Groq, OpenAI, ElevenLabs, and IBM endpoints/models are identical, including request encoding and parameters. |
| Soniox | `SonioxStreamingSTT.ts` | `wss://stt-rt.soniox.com/transcribe-websocket`, `stt-rt-v6`, sample rate, language hints and endpoint controls. Module identical. |

`electron/audio/sttContextTerms.ts` formats provider-specific term hints/glossaries; `src/components/NativelyInterface.tsx` owns the transcript surface. Screenshot/crop uses `ScreenshotHelper` and `CropperWindowHelper`; page context is captured through the extension path with screenshot fallback; Direct Assist request validation and dispatch use `DirectAssistService`.

## Module comparison and differences

Comparison used `tools/compare.mjs` plus binary-safe size checks and `diff -a`; dist-electron bytes were never treated as ordinary text. Bundle sizes before the final rebuild were local/reference: `main.js` 30,791,863 / 30,775,183 bytes; `ipcHandlers.js` 30,792,220 / 30,775,574; `preload.js` 132,276 / 131,808. The large bundles contain NUL bytes. A raw diff is therefore diagnostic only after binary-safe handling and module splitting.

| Compared surface | Identical | Rename/format/build-only | Real source differences |
| --- | ---: | ---: | ---: |
| Standalone `dist-electron/electron/audio/` modules | 81 | 0 | 1 (`MissingKeySTT.js`) |
| Main bundle audio-module filter | 54 | 21 comparator differences, mainly generated import identifiers | 1 substantive module difference, the same `MissingKeySTT` extra behavior |
| IPC bundle audio-module filter | 47 | 28 comparator differences, mainly generated import identifiers/dependency aliases | No capture behavior gap identified |
| Screenshot/Cropper bundle modules | 0 whole-file matches | 22 / 46 generated Electron import alias lines | None identified in helper behavior |
| Preload | — | comments and answer-length helper reordering | None identified in this scope |

The only standalone real difference is a **local extra** in `MissingKeySTT.js`: the local module guards duplicate starts and schedules a deferred missing-key status; the reference lacks this helper behavior. It is not a missing parity feature and was left unchanged. Other bundle differences were read as generated import renames, expected build variation, or known intentional holds (billing/licence/trial/packs, calendar OAuth secrets, and `devPremiumOverride`). No capture/speech code fix was warranted.

The renderer chunks were matched by stem without hash and parsed for string literals. `SettingsPopup`: 17/17 relevant literals match; `Cropper`: no relevant text literals; `NativelyInterface`: 102/102 match; `App`: 335/338 match, with changed hashed Cropper filename and component identifier plus known expected pack/trial copy. This is text comparison, not raw minified-code equivalence.

Successful comparator invocations included the standalone audio directory against the recovered `asar/dist-electron/electron/audio/`, main-entry filters for `electron/main.js`, `electron/ipcHandlers.js`, `ScreenshotHelper`, and `CropperWindowHelper`, plus `native-module` against `app.asar.unpacked/native-module/` with `--native`. `diff -a -u` was used for the preload comparison; empty output was checked against byte sizes. Filters were also applied to the main and IPC entries to isolate capture/audio modules. The comparator treats the reference as source data and does not evaluate it.

## Native binary inventory — Phase 9 hand-off F105

The local `native-module/` inventory contains `index.darwin-arm64.node`; the reference `app.asar.unpacked/native-module/` contains `index.darwin-arm64.node` and `index.darwin-x64.node`. Neither inventory has a Windows `.node` binary. Static wrapper-name strings from arm64 match except that the reference binary contains `takeNativeCaptureLog`, absent from the local binary; neither binary adds other names. `nm -gU` reports one global C/ABI symbol for each arm64 file and does not expose N-API method parity.

Local wrapper declaration/type are `native-module/index.js:602` and `native-module/index.d.ts:229`; local native source implementation is `native-module/src/capture_log.rs:31-78`. Local caller is `electron/audio/SystemAudioCapture.ts:23` and its flush/use sites at `:171,194,215,252,302,305,360`. Reference caller is in `asar/dist-electron/electron/audio/SystemAudioCapture.js:1176-1183,1299,1312,1327,1349,1373,1376,1413`, wrapper declaration in `asar/native-module/index.js:601`. Without the binary method, native capture-log drains are no-ops; capture itself continues. No binary change was made. **F105 is handed off to Phase 9 native work.**

## Runtime and cleanup

- `agent-browser skills get core`, `agent-browser skills get electron`, and `npm run dev:agent` were used with the real licence in the isolated profile; no dev-premium override was enabled. The licence validation returned valid.
- Confirmed `location.search` for launcher, settings, cropper, and overlay before snapshots. Audio settings showed device enumeration; the selected input was changed and restored. “Start Natively” started meeting/mic capture. Deepgram produced live transcript text in the overlay. Quiet notes did not trigger; page context/Direct Assist were not exercised.
- Full screenshot and selective crop completed and their files were removed through the app. Meeting stop logged mic/system capture and Deepgram shutdown; no separate capture helper process remained. The app was quit through the launcher. An unrelated older Natively process remained and was not stopped.
- Console/errors were collected. Main logs included `[Main]`, `[MicrophoneCapture]`, `[SystemAudioCapture]`, and `[DeepgramStreaming]` path/status lines. Network capture output included stale targets from earlier agent-browser sessions and was not a clean per-session trace.
- The isolated profile was restored as far as observable: mic selection restored, generated screenshots deleted, and the test meeting record deleted. A zero-duration placeholder row seen before the test was absent after refresh/removal; because its origin was ambiguous, profile history restoration cannot be guaranteed. This is a remaining profile-data risk.

## Validation

| Exact category | Result |
| --- | --- |
| `Tested physically on macOS` | Yes: mic, device switch, meeting start/stop, screenshot and crop UI. System-audio backend initialized, but no system frames were confirmed. |
| `Tested physically on Windows` | No. |
| `Covered by automated macOS branch tests` | Relevant suite ran on macOS, including Apple Speech locale/helper guards and CoreAudio capture wrapper tests; tests simulate platform branches where their fixtures inject platform values. |
| `Covered by automated Windows branch tests` | Relevant suite ran on macOS and includes injected Windows/WASAPI and cropper placement cases; no physical Windows execution. |
| `Build validated on macOS` | Yes: required build sequence completed. |
| `Build validated on Windows` | No. |
| `Reviewed but not executed on macOS` | Apple Speech packaged helper; page context extension; Direct Assist UI; system-audio sample frames. |
| `Reviewed but not executed on Windows` | All Windows capture runtime and WASAPI native behavior. |
| `Requires physical macOS verification` | System-audio frame delivery and packaged Apple Speech helper. |
| `Requires physical Windows verification` | F042 and all Windows capture/device/permission behavior. |

Commands executed for validation:

```text
npm run typecheck:electron                         # passed
npm run typecheck:premium                          # failed only with the known HeuristicExtractor.ts TS2339 errors
node --test electron/audio/__tests__/*.test.mjs electron/services/__tests__/ScreenshotScreenChoice2026_10_29.test.mjs electron/services/__tests__/PageCaptureFallbackNotice2026_08_18.test.mjs electron/services/__tests__/CustomProviderScreenshotSize2026_07_19.test.mjs electron/services/__tests__/CaptureOwnershipGuards2026_08_14.test.mjs electron/context-intelligence/__tests__/ScreenshotNeverDropped2026_10_28.test.mjs electron/context-intelligence/__tests__/ScreenshotMemory2026_09_08.test.mjs  # 1149 pass, 0 fail, 1 skipped
node --test electron/services/__tests__/CropperWindowHelper.bounds.test.mjs electron/services/__tests__/DirectAssistIpcBridge2026_08_29.test.mjs electron/llm/__tests__/DirectAssistCore2026_08_29.test.mjs src/components/ui/__tests__/DirectAssistNotice2026_10_01.test.mjs  # 126 pass
agent-browser skills get core
agent-browser skills get electron
npm run dev:agent
npm run build:electron
npm run build
npm run build:electron
```

## Changes and remaining risks

No product code changed; no gap was proven that met the requested “match 3.2.0 exactly” bar. Added this report, updated the Phase 6 catalogue, and added a narrow `.gitignore` exception so the requested report is visible as an unstaged deliverable. No commits or staging.

Handoffs: F105 stale macOS native diagnostic export and missing local x64 binary; physical Windows capture verification; macOS system-audio frame verification; packaged Apple Speech helper; quiet-note live trigger; page context and Direct Assist runtime paths. The premium typecheck remains blocked by the known unrelated `HeuristicExtractor.ts` typing errors. The ambiguous zero-duration history row is the profile-data risk noted above.
