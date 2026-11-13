# Audio capture and devices

Reviewed CPAL microphone initialization and device normalization, macOS CoreAudio/SCK and Windows WASAPI/Chromium branches, permission policies, generation and identity checks, shared resampling and silence suppression. Duplicate/drop rates under background noise, device disconnect and hotplug remain unverified. Trace entry and recovery through [startCaptureChannels](../../electron/main.ts#L7455), [device reconfigure](../../electron/main.ts#L5755), [system permissions](../../electron/audio/systemAudioPermission.ts#L28), and [native DSP](../../native-module/src/lib.rs#L362).

See the [audit scope and validation](executive-summary.md). Shared TypeScript findings apply to the inspected path on either OS. Native behavior is identified per backend where relevant. Physical execution is unverified.

## AUD-AUD-001 — Native capture can drop PCM without a gap signal

- **Severity / confidence** — Medium / Potential risk.
- **Source and functions** — [Microphone build_input_stream](../../native-module/src/microphone.rs#L415), [CoreAudio push_audio](../../native-module/src/speaker/core_audio.rs#L361), [WASAPI capture loop](../../native-module/src/speaker/windows.rs#L396).
- **Implementation evidence** — Producers ignore the accepted length or failure from finite ring pushes. A subsequent successful push can make downstream PCM look continuous.
- **Root cause** — The unreported overflow path is present. Hardware saturation rate and resulting STT loss are unverified.
- **Interview example** — A CPU spike during an interview clips the middle of a phrase while later speech still arrives.
- **User impact** — Missing phonemes or words with no reliable gap attribution.
- **Reproduction** — Proposed. Feed sequence-marked PCM while deliberately delaying DSP consumption past ring capacity. Compare input and delivered frames on both native backends.
- **Existing test coverage** — [Renderer fallback tests](../../electron/audio/__tests__/RendererCaptureFallback2026_10_21.test.mjs) exercise synthetic fallback PCM and platform policy. No native saturation assertion established.
- **Recommended fix** — Count rejected frames at the producer, surface bounded diagnostics off the callback thread and preserve a discontinuity signal.

## AUD-AUD-002 — Windows fallback follows the default output instead of a pinned endpoint

- **Severity / confidence** — Medium / Potential risk.
- **Source and functions** — [Fallback policy](../../electron/audio/fallback/fallbackPolicy.ts#L22), [renderer capture monitor](../../electron/audio/fallback/rendererCaptureMonitor.ts#L200), [AppState.reconfigureAudio](../../electron/main.ts#L5755).
- **Implementation evidence** — Windows can use Chromium capture when the native class is unavailable. That path captures default output and cannot honor arbitrary output selection. macOS packaged policy differs.
- **Root cause** — The capability limit is confirmed. Whether device diagnostics always explain the effective route is unverified.
- **Interview example** — The call plays through a pinned headset while Windows fallback listens to speakers.
- **User impact** — Interviewer speech can be absent even with a working mic.
- **Reproduction** — Proposed. Use a disposable Windows install with native capture unavailable. Route a synthetic call to nondefault output, then hotplug and switch default.
- **Existing test coverage** — [RendererCaptureFallback](../../electron/audio/__tests__/RendererCaptureFallback2026_10_21.test.mjs) covers platform policy and PCM. Physical endpoint routing was not established.
- **Recommended fix** — Expose effective capture route and unsupported selection in fallback mode. Verify routing and cleanup with Windows hardware.
