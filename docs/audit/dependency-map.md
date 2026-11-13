# Finding dependency map

## Shared causes and validation groups

| Group | Findings | Relationship | Shared validation need |
|---|---|---|---|
| Session reset ownership | AUD-UI-001, AUD-UI-002 | Reset clears visible messages but does not replace Direct history on a fresh start, and it does not retire the active Direct request. Distinct state defects share the reset boundary. | Renderer state test for fresh vs resumed history, plus a delayed-token stream test across stop/start. |
| Late asynchronous speech results | AUD-STT-001, AUD-STT-002 | Retired socket events and local worker finals can arrive after ownership changes. Their providers and persistence consequences differ. | Fake connection/worker with delayed final, session generation assertions, transcript snapshot checks. |
| Evidence availability and retrieval | AUD-AI-001, AUD-PER-001 | One loses the reason when context loading fails. The other filters a truncated native vector result after candidate selection. Both can reduce grounding, with different root causes. | Inject context read failure at IPC; separate real sqlite-vec crowding fixture. |
| Capture effective route and loss | AUD-AUD-001, AUD-AUD-002 | Ring saturation can silently lose frames; Windows fallback may capture the default route rather than the selected output. No common code root cause. | Native saturation probe on both backends; Windows routed-output hardware test and effective-route diagnostic assertion. |
| Stop and restart lifecycle | AUD-STT-002, AUD-SES-001, AUD-SES-002 | Local final drain, full teardown wait, and durable-save acknowledgement occur at different lifecycle boundaries. These must preserve native resource release ordering. | Injectable delayed capture, local STT, RAG, DB and backup dependencies. Validate snapshot, restart admission and recovery state independently. |
| Main-thread latency evidence | AUD-PER-002, AUD-PER-003, AUD-AI-002 | Vector scoring and snapshot writes are synchronous work. Stream duration is a separate completion risk. | Event-loop delay benchmark for the first pair; drip-feed provider test for the stream. |
| Test enforcement and integration | AUD-TST-001, AUD-TST-002, AUD-TST-003 | Smoke port/IPC mismatch, advisory Windows suite, and unverified cross-layer coverage are independent gaps in validation confidence. | Real Electron launcher with correlated IPC; enforcing Windows regression lane; inventory external native/soak facilities. |

## Fix ordering constraints

1. Define test boundaries before changing platform-sensitive audio, security, or lifecycle code. AUD-TST-001 and the Windows routing fixture unblock meaningful validation but are not runtime prerequisites for source-level renderer and provider fixes.
2. Add the fake delayed-stream/session-reset tests before changing Direct request cancellation and history reset. AUD-UI-001 and AUD-UI-002 should land in one session-boundary work item with independent assertions.
3. Add delayed local worker delivery and persistence snapshot assertions before changing stop drain semantics for AUD-STT-002.
4. Add real vec0 scoped-crowding coverage before changing AUD-PER-001. The existing JS folder-scoped branch does not exercise the native code path.
5. Define the authorized window matrix and test positive/negative senders before enforcing AUD-ELC-001.
6. Measure AUD-PER-002 and AUD-PER-003 before selecting performance changes. They do not block correctness fixes.
7. Establish a written effective-provider policy before changing the deliberate fallback paths implicated by AUD-STT-003.

## Root-cause distinctions

- AUD-UI-001 and AUD-UI-002 are not duplicates. One leaks history into request input, the other preserves active stream ownership.
- AUD-STT-001 and AUD-STT-002 share stale-result timing, but one is a missing provider-identity check and the other is an unawaited local final drain.
- AUD-SES-001 and AUD-SES-002 are not duplicates. One delays new session admission through teardown coupling, the other omits durable-save outcome from stop completion.
- AUD-AI-001 and AUD-PER-001 can produce ungrounded answers through independent input and retrieval failures.
- AUD-TST-001 through AUD-TST-003 describe distinct test-lane and infrastructure evidence limits, not runtime application defects.
