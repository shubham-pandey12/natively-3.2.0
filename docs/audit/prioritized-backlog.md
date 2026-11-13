# Prioritized reliability backlog

Priority reflects expected live interview harm and the evidence level. No issue is classified P0 because none demonstrates total core failure or confirmed unrecoverable data loss. `Confidence` uses the requested validation class.

| ID | Issue | Severity | Confidence | User Impact | Dependencies | Priority |
|---|---|---:|---|---|---|---:|
| AUD-AUD-002 | Windows fallback ignores selected non-default output | P1 | CONFIRMED BUG | Interviewer audio can be missing from transcription | Windows endpoint/hotplug harness | 1 |
| AUD-STT-001 | Retired Deepgram socket emits final/endpoint events | P1 | REPRODUCED BUG | Stale interviewer speech can alter transcript and question boundary | Delayed old-socket replay | 2 |
| AUD-STT-002 | Local final may arrive after transcript snapshot | P1 | POTENTIAL RISK | Tail words may be missing from saved context | Delayed local-worker + persistence fixture | 3 |
| AUD-QST-001 | Punctuation-free short follow-up bypasses judge | P2 | REPRODUCED BUG | A short interviewer ask can receive no automatic answer | Short elliptical question regression case | 4 |
| AUD-UI-001 | Fresh reset retains Direct Assist history | P1 | REPRODUCED BUG | Old interview turns can affect a new answer | Renderer fresh/resume regression case | 5 |
| AUD-PER-001 | Native scoped vector recall can be crowded out | P1 | REPRODUCED BUG | Relevant meeting evidence can be absent from answer context | Real sqlite-vec scoped fixture | 6 |
| AUD-UI-002 | Direct request can survive reset | P1 | POTENTIAL RISK | Old output may keep loading or affect the new session | Same reset integration harness as UI-001 | 7 |
| AUD-SES-002 | Stop omits placeholder save failure state | P2 | CONFIRMED BUG | User cannot tell whether stopped interview was saved or needs recovery | DB and backup fault injection | 8 |
| AUD-STT-003 | Missing selected provider credential falls back to Google | P2 | POTENTIAL RISK | Unexpected provider/data route or unavailable transcript | Specify fallback contract; test settings/status | 9 |
| AUD-AI-001 | Failed evidence reads are passed as empty context | P2 | CONFIRMED BUG | Answer may lack expected references without a user-visible reason | IPC getter fault injection and UI notice assertion | 10 |
| AUD-AUD-001 | Native ring overflow drops PCM without a gap marker | P2 | POTENTIAL RISK | Lost words may look like continuous audio | Native sequence-numbered saturation fixture | 11 |
| AUD-SES-001 | Restart awaits full teardown and RAG chain | P2 | POTENTIAL RISK | Restart may be delayed by a slow prior session | Delayed teardown dependency harness | 12 |
| AUD-ELC-001 | Direct IPC lacks explicit sender-surface authorization | P2 | POTENTIAL RISK | Unexpected renderer could invoke provider/context work | Define authorized surface matrix | 13 |
| AUD-TST-001 | Default smoke does not exercise real Electron IPC | P2 | CONFIRMED BUG | IPC regressions may pass or be skipped in this smoke lane | Align Vite/Playwright port; invoke IPC round trip | 14 |
| AUD-TST-002 | Broad Windows Electron test suite is advisory | P2 | CONFIRMED BUG | Windows-only suite failure can leave CI green | Focused enforcing Windows tests | 15 |
| AUD-TST-003 | End-to-end dual-channel native fault/soak coverage not established | P2 | UNVERIFIED | Cross-layer long-session faults may evade component tests | Inventory external harness first | 16 |
| AUD-QST-002 | Old question fragments can age out before judgment | P2 | POTENTIAL RISK | Long setup constraints or follow-up asks may be omitted | Timestamped fake-clock replay | 17 |
| AUD-AI-002 | Frequent provider chunks can extend committed stream | P2 | POTENTIAL RISK | Answer remains loading and delays subsequent response | Drip-feed stream cancellation test | 18 |
| AUD-PER-002 | JS vector fallback performs synchronous full scoring | P2 | POTENTIAL RISK | Large history may delay IPC/audio/answer work | Scaled event-loop benchmark | 19 |
| AUD-PER-003 | Growing journal snapshot serializes synchronously | P2 | POTENTIAL RISK | Large snapshots may delay visible answer tokens | Long-session journal/event-loop benchmark | 20 |

See [validated-findings.md](validated-findings.md) for source, conditions, test evidence, reproduction status, and root-cause details. The dependency groups and sequencing constraints are in [dependency-map.md](dependency-map.md).
