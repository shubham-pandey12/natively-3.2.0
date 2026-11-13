# Question detection

Short, long, paused, compound, repeated and incomplete asks share candidate assembly but differ in prefilter, judge and timer behavior. Judgments are invalidated by sequence/generation checks, and provider endpoint plus quiet timers have separate roles. No false positive/negative rate is estimated. [Candidate policy](../../electron/intelligence/autoAnswer/SimpleAutoAnswer.ts#L576), [judge staleness](../../electron/intelligence/autoAnswer/SimpleAutoAnswer.ts#L795), [answer dispatch](../../electron/intelligence/autoAnswer/SimpleAutoAnswer.ts#L934).

See the [audit scope and validation](executive-summary.md). Shared TypeScript findings apply to the inspected path on either OS. Native behavior is identified per backend where relevant. Physical execution is unverified.

## AUD-QST-001 — A short elliptical question can be filtered before the judge

- **Severity / confidence** — Medium / Confirmed.
- **Source and functions** — [SimpleAutoAnswerEngine.onStoppage](../../electron/intelligence/autoAnswer/SimpleAutoAnswer.ts#L576), [isQuestionShaped](../../electron/intelligence/autoAnswer/SimpleAutoAnswer.ts#L141), [FALLBACK_INTERROGATIVE](../../electron/intelligence/autoAnswer/SimpleAutoAnswer.ts#L88).
- **Implementation evidence** — The four-word prefilter returns for a short string with no question mark or recognized lead. A lone final such as `Any tradeoffs` meets all three conditions.
- **Root cause** — Heuristic gating runs before contextual judgment and excludes elliptical leads.
- **Interview example** — The interviewer says “Any tradeoffs?” and STT returns it without punctuation.
- **User impact** — Executed in Node with esbuild write:false, actual engine and fake clock/host. Ingest one interviewer final, invoke early stoppage and count judge calls. `Any tradeoffs` yielded 0 and `Any tradeoffs?` yielded 1. The initial control attempt failed because the fake host lacked recentTurns. The corrected run exited 0.
- **Reproduction** — Source-derived. In a clean candidate window inject only final `Any tradeoffs`, trigger stoppage and observe `incomplete` without judge invocation. Repeat with `?` and compare. Not executed.
- **Existing test coverage** — [AutoAnswerSimple](../../electron/intelligence/autoAnswer/__tests__/AutoAnswerSimple.test.mjs) exercises the engine. Exact punctuation-free elliptical case not established.
- **Recommended fix** — Route plausible short follow-ups to contextual judgment while retaining backchannel suppression.

## AUD-QST-002 — Pending fragments age out during prolonged question setup

- **Severity / confidence** — Medium / Potential risk.
- **Source and functions** — [SimpleAutoAnswerEngine.ingest](../../electron/intelligence/autoAnswer/SimpleAutoAnswer.ts#L500), [PENDING_MAX_AGE_MS](../../electron/intelligence/autoAnswer/SimpleAutoAnswer.ts#L220), [onStoppage](../../electron/intelligence/autoAnswer/SimpleAutoAnswer.ts#L576).
- **Implementation evidence** — Finals are joined in arrival order and pruned by age before judgment. Speech updates supersede pending verdicts. A single judged ask can determine dispatch from a multi-part candidate.
- **Root cause** — Age pruning is explicit. Loss of task constraints after eventual assembly and fallback remains scenario dependent.
- **Interview example** — An interviewer spends over 90 seconds describing a coding problem, then asks two related questions after a pause.
- **User impact** — An answer may miss early constraints, answer only one ask, or start before a pause finishes.
- **Reproduction** — Proposed. Use fake time and dated finals including a unique early constraint, a pause and two asks. Compare judge input, extracted ask and final answer context.
- **Existing test coverage** — [AutoAnswerSimple](../../electron/intelligence/autoAnswer/__tests__/AutoAnswerSimple.test.mjs) exercises endpoint and judge policies. Exact long multi-question trace not established.
- **Recommended fix** — Keep bounded task continuity across aged fragments and verify multi-ask, pause and dedup behavior with timestamped replay.
