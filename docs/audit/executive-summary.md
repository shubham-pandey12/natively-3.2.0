# Natively live-interview reliability audit

Source snapshot `3fbdd33fc3bc78ea65522e819c53ba89d125ff43`. The audit records **20 findings** across capture, STT, question detection, AI orchestration, session lifecycle, Electron/UI, tests and performance. **8 confirmed**, **11 potential risks** and **1 unknown**. Confirmed means executable behavior was reproduced or the cited source directly determines the narrow result. The label does not imply physical reproduction, prevalence or confirmed user incidents.

The first repair candidates are fresh-session Direct Assist context isolation, stale Deepgram callbacks and scoped native recall. In parallel, reproduce the local-STT stop-tail risk with a controlled worker final. See the [ranked top ten](critical-findings.md).

## Scope and evidence

The audit used ECC change impact, agent architecture audit, silent failure review, security review lenses, test evidence analysis, latency path analysis and parallel investigation. The configured code-review-graph MCP was unavailable in this session. Findings use targeted source reads and caller tracing. Three delegated investigations were started. They hit usage limits before completing their documents, so the lead completed the remaining investigation and synthesis. The audio investigator's fake SDK result is credited as such.

- [Audio capture and devices](audio-pipeline-findings.md)
- [Transcription](transcription-findings.md)
- [Question detection](question-detection-findings.md)
- [AI orchestration](ai-orchestration-findings.md)
- [Session management](session-management-findings.md)
- [Electron, IPC and presentation](electron-findings.md)
- [Testing gaps](testing-gaps.md)
- [Performance](performance-findings.md)
- [Remediation roadmap](remediation-roadmap.md)

## Five architectural weaknesses

1. Ownership is spread across capture, provider, main and renderer lifetimes. A stale callback or request can escape a reset if any layer omits an ownership check. [AUD-STT-001](transcription-findings.md#aud-stt-001--retired-deepgram-connection-can-emit-finals-and-endpoints), [AUD-UI-002](electron-findings.md#aud-ui-002--direct-assist-request-ownership-can-survive-the-session-reset-event).
2. Capture readiness, stopped UI, final transcript, durable save and optional indexing resolve at different times. Restart still waits on the combined background chain. [AUD-STT-002](transcription-findings.md#aud-stt-002--local-final-inference-can-outlive-the-meeting-snapshot), [AUD-SES-001](session-management-findings.md#aud-ses-001--restart-waits-on-the-previous-sessions-full-teardown-chain), [AUD-SES-002](session-management-findings.md#aud-ses-002--stop-success-does-not-report-placeholder-save-failure).
3. Evidence correctness depends on where filtering and truncation occur. Retrieval can select before applying scope, and failed reference reads lose their reason before prompting. [AUD-PER-001](performance-findings.md#aud-per-001--native-vector-search-can-return-empty-while-matching-meeting-evidence-exists), [AUD-AI-001](ai-orchestration-findings.md#aud-ai-001--direct-context-read-failure-bypasses-the-trim-notice).
4. IPC channel identity and request identity do not consistently express authorized surface and session ownership. [AUD-ELC-001](electron-findings.md#aud-elc-001--direct-ipc-checks-sender-identity-without-establishing-surface-ownership), [AUD-UI-001](electron-findings.md#aud-ui-001--fresh-session-reset-leaves-direct-assist-history-populated).
5. Synchronous persistence and vector fallback compete with latency-sensitive work on main. Magnitude needs measurement under realistic data and hardware. [AUD-PER-002](performance-findings.md#aud-per-002--synchronous-vector-fallback-can-delay-main-process-work), [AUD-PER-003](performance-findings.md#aud-per-003--growing-recovery-snapshots-serialize-on-the-main-thread).

## Five biggest testing gaps

1. Timestamped, dual-channel replay through capture, STT, question detection, provider stream and visible answer, including noise, pauses, disconnection and late events. [AUD-TST-003](testing-gaps.md#aud-tst-003--integrated-dual-channel-fault-replay-and-native-soak-coverage-was-not-established).
2. Behavioral stop/restart cases with delayed provider/worker finals, failed durable save and force-quit recovery. [AUD-STT-002](transcription-findings.md#aud-stt-002--local-final-inference-can-outlive-the-meeting-snapshot), [AUD-SES-002](session-management-findings.md#aud-ses-002--stop-success-does-not-report-placeholder-save-failure).
3. Real Electron IPC and persistent overlay ownership checks across fresh starts and explicit resumes, with true preload invocation. [AUD-TST-001](testing-gaps.md#aud-tst-001--default-browser-smoke-configuration-does-not-establish-electron-ipc), [AUD-UI-001](electron-findings.md#aud-ui-001--fresh-session-reset-leaves-direct-assist-history-populated).
4. Enforcing Windows tests for interview-critical regressions, including packaged native route and permission checks. [AUD-TST-002](testing-gaps.md#aud-tst-002--broad-windows-electron-failures-can-leave-the-ci-job-green), [AUD-AUD-002](audio-pipeline-findings.md#aud-aud-002--windows-fallback-follows-the-default-output-instead-of-a-pinned-endpoint).
5. Measured long-session latency and resource budgets, plus scoped recall under large, mixed-space histories. [AUD-PER-001](performance-findings.md#aud-per-001--native-vector-search-can-return-empty-while-matching-meeting-evidence-exists), [AUD-PER-002](performance-findings.md#aud-per-002--synchronous-vector-fallback-can-delay-main-process-work), [AUD-PER-003](performance-findings.md#aud-per-003--growing-recovery-snapshots-serialize-on-the-main-thread).

## Commands and observed results

- `node --test electron/audio/__tests__/DeepgramStabilityTimerTracked.test.mjs electron/audio/__tests__/IpcOnIdempotency.test.mjs electron/services/__tests__/ExternalUrlIpc.test.mjs electron/services/__tests__/MeetingPersistenceRace.test.mjs` returned **8 passed**.
- `node --experimental-strip-types --test src/lib/__tests__/resumedChat2026_11_03.test.mjs src/lib/__tests__/directAssistRenderer2026_08_29.test.mjs src/lib/__tests__/overlaySessionResetCollapse.test.mjs` returned **28 passed**.
- `node` stdin probes loaded actual source via esbuild with no source writes. The Deepgram fake SDK probe emitted a stale final and two endpoints. The fake SQLite-handle probe requested four candidates and returned zero with the eligible row ranked fifth. The fake judge probe showed zero calls for `Any tradeoffs` and one for `Any tradeoffs?`. An initial judge probe exited 1 because its fake host lacked `recentTurns`. The corrected comparison exited 0.
- Targeted `rg`, `sed` and `nl` reads inspected source and test contracts. Git status/diff and a Python document check verified the report paths and scope.

**Reviewed but not executed on macOS. Reviewed but not executed on Windows.** Applies to the physical Electron app, hardware and packaged release paths. The local probes exercised shared source with injected dependencies. **Requires physical macOS verification. Requires physical Windows verification.** No live provider, hardware, packaging, current CI run or long-duration measurement was executed. A real interviewer’s missed-word rate, onset-to-visible latency and native resource leakage remain unknown.

Only the eleven requested audit documents were created. No production behavior, tests or platform code changed. Existing `.gitignore` and `AGENTS.md` workspace changes predate the audit. The existing `docs/*` rule ignores the reports. Implementation requires approval of the findings.
