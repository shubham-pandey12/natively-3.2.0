# False positive and scope review

## Outcome

No original finding was fully disproved as a false positive after current source review. Several descriptions need narrower wording or lower confidence because source proves a behavior while the failure impact or expected contract is not yet established.

| Finding | Validation adjustment | Why |
|---|---|---|
| AUD-STT-003 | Downgraded from confirmed bug to potential risk | Missing keys do construct Google STT and emit a warning. The source also records the effective constructed provider. The intended fallback contract and user-visible status are not fully established, so provider substitution alone does not prove an unintended failure. |
| AUD-AUD-002 | Confirmed only when Windows fallback is active and a non-default output is selected | The fallback implementation discards the selected device. Physical routing and exact environmental trigger were not tested. |
| AUD-AI-001 | Confirmed as missing user-visible failure provenance, not as proof of a wrong answer | The IPC catch logs the read failure and passes empty evidence. No prompt or UI evidence proves every resulting answer is wrong. |
| AUD-SES-001 | Coupling confirmed, restart failure potential | Start awaits full teardown, but no actual hang or excessive wait was reproduced. |
| AUD-TST-001 | Limited to the default browser smoke lane | Specialized Electron IPC tests exist. They do not make this smoke's property-presence check an invocation test. |
| AUD-TST-002 | Limited to the broad Windows `npm test` step | Selected test suites and build steps are still enforcing. The issue is advisory handling for the broad suite, not a green CI guarantee under every failure. |
| AUD-TST-003 | Unverified rather than confirmed missing infrastructure | Repository evidence is fragmented, but an external hardware harness was not ruled out. |
| AUD-PER-002 / AUD-PER-003 | Kept as risks pending measurements | Synchronous work is visible in source. The user-visible latency and memory impact at real workloads is unknown. |

## Explicitly not established

- No finding establishes a provider outage rate, transcription accuracy percentage, physical audio route failure rate, or interview answer latency distribution.
- No IPC exploit or compromised renderer was demonstrated for AUD-ELC-001.
- No production data loss was demonstrated for AUD-SES-002. Emergency backup and live journal recovery paths mitigate loss, while the stop response still omits durability state.
- The previous source-derived probes for AUD-STT-001, AUD-QST-001, and AUD-PER-001 are recorded as reproduced at the implementation boundary. They do not replace real provider, Electron UI, or sqlite-vec integration runs.
