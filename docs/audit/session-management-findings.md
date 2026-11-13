# Session management

Start/stop/restart ordering, overlap, background persistence and crash recovery were traced. The queue serializes transitions and journal recovery exists. Unexpected process termination and retained native/worker resources over repeated sessions remain unverified. [Lifecycle queue](../../electron/audio/meetingLifecycleQueue.ts#L38), [journal](../../electron/services/meeting/LiveMeetingJournal.ts#L108), [recovery](../../electron/MeetingPersistence.ts#L2144).

See the [audit scope and validation](executive-summary.md). Shared TypeScript findings apply to the inspected path on either OS. Native behavior is identified per backend where relevant. Physical execution is unverified.

## AUD-SES-001 — Restart waits on the previous session’s full teardown chain

- **Severity / confidence** — High / Potential risk.
- **Source and functions** — [AppState.startMeetingTransition](../../electron/main.ts#L7529), [endMeetingTransition background teardown](../../electron/main.ts#L8287), [processCompletedMeetingForRAG](../../electron/main.ts#L8378).
- **Implementation evidence** — Start awaits `_pendingTeardown`. That promise includes native destroy, STT drain, persistence and RAG stop/process. The local REST poll has a deadline. This outer await has no independent restart deadline.
- **Root cause** — Coupling is confirmed. Which real dependencies can hang beyond their own limits remains unverified.
- **Interview example** — The first interview ends, then the user starts a second while a prior resource or index task is slow.
- **User impact** — Next session is delayed after the previous UI already returned to launcher.
- **Reproduction** — Proposed. Hold capture teardown and separately hold post-save indexing. Request a restart after stop and record transition and recovery timings.
- **Existing test coverage** — [MeetingLifecycleSerialization](../../electron/audio/__tests__/MeetingLifecycleSerialization2026_08_07.test.mjs) verifies promise serialization. It does not exercise hung native or RAG work through AppState.
- **Recommended fix** — Keep native release ordering. Separate optional indexing from restart admission and add bounded failure/recovery for ownership-critical waits.

## AUD-SES-002 — Stop success does not report placeholder save failure

- **Severity / confidence** — Medium / Confirmed.
- **Source and functions** — [AppState.endMeetingTransition](../../electron/main.ts#L8287), [MeetingPersistence.stopMeeting](../../electron/MeetingPersistence.ts#L1110), [DatabaseManager.saveMeeting](../../electron/db/DatabaseManager.ts#L3650).
- **Implementation evidence** — IPC completion precedes background save. A placeholder failure is caught, logged and backed up best effort. The persistence method still returns a meeting ID for downstream work.
- **Root cause** — The completion contract conflates accepted stop with durable save unless the user observes later state. Backup and recovery paths mitigate loss.
- **Interview example** — Disk pressure or a database failure occurs as the user finishes an interview.
- **User impact** — The user may leave with no immediately visible record of whether their interview was saved.
- **Reproduction** — Proposed. Use a disposable profile and inject a throwing save plus independently failing backup. Observe stop response, history and recovery status after restart.
- **Existing test coverage** — [MeetingPersistenceRace](../../electron/services/__tests__/MeetingPersistenceRace.test.mjs) passed its source ordering assertion. It does not force both writes to fail.
- **Recommended fix** — Expose separate stopped, saving, saved and recovery-needed states. Keep the journal until durable success and test force quit.
