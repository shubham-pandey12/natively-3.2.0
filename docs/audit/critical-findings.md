# Ranked reliability findings

Ranked by likely interview impact, breadth, detectability and evidence. Severity is conditional on the stated trigger. No finding met the Critical threshold on the evidence available. The detailed entries hold the implementation trace, reproduction, test limitations and proposed fix.

| Rank | Finding | Severity | Confidence | Failure |
|---|---|---|---|---|
| 1 | [AUD-UI-001](electron-findings.md#aud-ui-001--fresh-session-reset-leaves-direct-assist-history-populated) | High | Confirmed | Fresh session reset leaves Direct Assist history populated |
| 2 | [AUD-STT-001](transcription-findings.md#aud-stt-001--retired-deepgram-connection-can-emit-finals-and-endpoints) | High | Confirmed | Retired Deepgram connection can emit finals and endpoints |
| 3 | [AUD-STT-002](transcription-findings.md#aud-stt-002--local-final-inference-can-outlive-the-meeting-snapshot) | High | Potential risk | Local final inference can outlive the meeting snapshot |
| 4 | [AUD-UI-002](electron-findings.md#aud-ui-002--direct-assist-request-ownership-can-survive-the-session-reset-event) | High | Potential risk | Direct Assist request ownership can survive the session reset event |
| 5 | [AUD-PER-001](performance-findings.md#aud-per-001--native-vector-search-can-return-empty-while-matching-meeting-evidence-exists) | High | Confirmed | Native vector search can return empty while matching meeting evidence exists |
| 6 | [AUD-SES-001](session-management-findings.md#aud-ses-001--restart-waits-on-the-previous-sessions-full-teardown-chain) | High | Potential risk | Restart waits on the previous session’s full teardown chain |
| 7 | [AUD-QST-001](question-detection-findings.md#aud-qst-001--a-short-elliptical-question-can-be-filtered-before-the-judge) | Medium | Confirmed | A short elliptical question can be filtered before the judge |
| 8 | [AUD-TST-002](testing-gaps.md#aud-tst-002--broad-windows-electron-failures-can-leave-the-ci-job-green) | High | Confirmed | Broad Windows Electron failures can leave the CI job green |
| 9 | [AUD-AUD-001](audio-pipeline-findings.md#aud-aud-001--native-capture-can-drop-pcm-without-a-gap-signal) | Medium | Potential risk | Native capture can drop PCM without a gap signal |
| 10 | [AUD-SES-002](session-management-findings.md#aud-ses-002--stop-success-does-not-report-placeholder-save-failure) | Medium | Confirmed | Stop success does not report placeholder save failure |

Prioritize stale state and lost transcript before tuning latency. For the two session boundary hypotheses, first prove the failure with a controlled delayed completion and an immediate restart. For the Windows CI gap, establish an enforcing focused lane before expanding the gate.

See [scope and checks](executive-summary.md) and the [implementation order](remediation-roadmap.md).
