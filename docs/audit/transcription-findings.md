# Transcription

Partials, finals, provider/model/language selection, reconnect, replay and ordering were reviewed at the application boundary. Gap replay retains bounded PCM and deduplicates against live text. Exact word loss, language accuracy and provider-specific interruption rates remain unverified. [Provider factory](../../electron/main.ts#L4037), [gap buffer](../../electron/audio/sttGapRecovery.ts#L125), [dedup](../../electron/audio/sttGapRecovery.ts#L277), [interim flush](../../electron/SessionTracker.ts#L1191).

See the [audit scope and validation](executive-summary.md). Shared TypeScript findings apply to the inspected path on either OS. Native behavior is identified per backend where relevant. Physical execution is unverified.

## AUD-STT-001 — Retired Deepgram connection can emit finals and endpoints

- **Severity / confidence** — High / Confirmed.
- **Source and functions** — [DeepgramStreamingSTT.connect](../../electron/audio/DeepgramStreamingSTT.ts#L275), [UtteranceEnd handler](../../electron/audio/DeepgramStreamingSTT.ts#L364), [AppState provider onSegment](../../electron/main.ts#L4243).
- **Implementation evidence** — Open, Error and Close guard captured connection identity. Transcript and UtteranceEnd callbacks can emit from a retired connection. Main accepts segments during active/draining state and forwards to intelligence.
- **Root cause** — Connection identity is missing from the transcript and endpoint callbacks.
- **Interview example** — A rate change reconnects mid-question. An old final lands after the replacement opens and the detector hears the wrong boundary.
- **User impact** — Stale or duplicate speech can affect question selection and persisted transcript.
- **Reproduction** — Executed by audio investigator with the actual TypeScript transpiled in memory and fake Deepgram SDK emitters. Open old connection, call setSampleRate(48000), open replacement, emit old final and UtteranceEnd. Observed one stale transcript and two endpoint emissions. Real SDK event timing is unverified.
- **Existing test coverage** — [DeepgramStabilityTimerTracked](../../electron/audio/__tests__/DeepgramStabilityTimerTracked.test.mjs) passed its four source checks and covers the timer only.
- **Recommended fix** — Guard every callback by current connection identity and add a late-event behavioral regression across replacement and stop.

## AUD-STT-002 — Local final inference can outlive the meeting snapshot

- **Severity / confidence** — High / Potential risk.
- **Source and functions** — [AppState.endMeetingTransition](../../electron/main.ts#L8287), [LocalWhisperSTT.stop](../../electron/audio/LocalWhisperSTT.ts#L575), [LocalWhisperSTT.hasPendingWork and finalize](../../electron/audio/LocalWhisperSTT.ts#L698), [worker result handler](../../electron/audio/LocalWhisperSTT.ts#L1535).
- **Implementation evidence** — Stop waits a fixed grace and polls RestSTT only. LocalWhisperSTT.stop returns synchronously and can keep its worker for final replies. MeetingPersistence snapshots after stop and clears session state.
- **Root cause** — The async contract mismatch is present. Exact acceptance and retention of late results through the full lifecycle require a behavioral reproduction.
- **Interview example** — A slower local model finishes the last sentence after the user stops the meeting.
- **User impact** — The tail may be missing from saved transcript, notes and retrieval.
- **Reproduction** — Proposed. Hold a fake local worker final beyond the grace, stop, then release it. Compare persisted transcript and immediately start another session.
- **Existing test coverage** — [WhisperDrainBounded](../../electron/audio/__tests__/WhisperDrainBounded2026_08_18.test.mjs) targets worker cleanup. [MeetingPersistenceRace](../../electron/services/__tests__/MeetingPersistenceRace.test.mjs) checks placeholder order, not late finals.
- **Recommended fix** — Await a bounded local final-drain contract before snapshot and close the old generation on deadline. Report truncation explicitly.

## AUD-STT-003 — Missing selected credentials change the effective provider

- **Severity / confidence** — Medium / Confirmed.
- **Source and functions** — [AppState.createSTTProvider](../../electron/main.ts#L4037), [effective provider and emitted rate](../../electron/main.ts#L4819).
- **Implementation evidence** — Several missing-key branches instantiate GoogleSTT. Main tracks effective adapter identity separately, but a missing selected credential does not universally fail the selected provider closed.
- **Root cause** — Factory treats missing credentials as a provider fallback in specific cloud branches.
- **Interview example** — An interview starts after a provider key is removed. Google receives the channel if configured, or transcript startup fails if unavailable.
- **User impact** — Unexpected provider selection or missing transcript. Actual external transmission was not tested.
- **Reproduction** — Proposed. Stub CredentialsManager and constructors. Select Deepgram without its key, with and without valid Google configuration. Inspect effective identity, status and writes.
- **Existing test coverage** — [SttProviderNamesCoverage](../../electron/audio/__tests__/SttProviderNamesCoverage2026_10_25.test.mjs) covers naming. Exact missing-key factory and visibility contract not established.
- **Recommended fix** — Require explicit fallback policy and show effective provider at readiness. Keep intentionally local-only branches local.
