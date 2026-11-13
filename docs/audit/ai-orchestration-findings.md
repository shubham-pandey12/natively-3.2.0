# AI orchestration

Reviewed prompt budgeting, reference context, provider choice, retry commitment, cancellation and stream ownership. Direct uses selection snapshots and a scope check near dispatch. Typed, heard and phone requests use different orchestration. See the session reset findings for stale and duplicate output exposure. [Direct context packing](../../electron/direct-assist/requestBuilder.ts#L785), [scope enforcement](../../electron/LLMHelper.ts#L15216), [fallback driver](../../electron/llm/streamFallbackEngine.ts), [phone stream](../../electron/ipcHandlers.ts#L21498).

See the [audit scope and validation](executive-summary.md). Shared TypeScript findings apply to the inspected path on either OS. Native behavior is identified per backend where relevant. Physical execution is unverified.

## AUD-AI-001 — Direct context read failure bypasses the trim notice

- **Severity / confidence** — Medium / Potential risk.
- **Source and functions** — [direct-assist-stream handler](../../electron/ipcHandlers.ts#L8450), [prepareDirectAssistPrompt](../../electron/direct-assist/requestBuilder.ts#L785).
- **Implementation evidence** — Main loads reference files and transcript in separate try/catch blocks. A failure becomes empty evidence and logs a warning. The builder receives an empty field, so trimming and unavailable context are indistinguishable there.
- **Root cause** — Read errors are collapsed into absent input at the builder boundary. UI-visible effects and frequency unverified.
- **Interview example** — A candidate asks about their attached resume while the mode store read throws.
- **User impact** — The model may answer without expected grounding or refuse, while the user sees no explicit missing-source reason from this path.
- **Reproduction** — Proposed. Force getReferenceFiles to throw for a populated mode. Compare outbound prompt and renderer state to a successful load and a truly empty mode.
- **Existing test coverage** — [DirectAssistRenderer](../../src/lib/__tests__/directAssistRenderer2026_08_29.test.mjs#L465) checks trim notice wiring. Does not assert reporting of a thrown evidence read.
- **Recommended fix** — Carry a structured unavailable reason through request preparation and UI. Fail closed when the requested evidence is essential.

## AUD-AI-002 — A provider can keep a committed stream open with frequent content

- **Severity / confidence** — Medium / Potential risk.
- **Source and functions** — [DirectAssistService.stream](../../electron/direct-assist/DirectAssistService.ts#L124), [pre-commit budget](../../electron/direct-assist/DirectAssistService.ts#L285), [live stream deadline driver](../../electron/llm/liveDeadlines.ts#L719).
- **Implementation evidence** — The Direct ladder budget is elapsed checked for attempts and post-commit protection includes idle guards. A source emitting within the idle window is a different case from silence. Per-transport limits and final output handling need joint verification.
- **Root cause** — No universal wall-clock limit was established across the inspected paths. A leak or indefinite production stream is unverified.
- **Interview example** — A gateway drips tiny chunks for much longer than the candidate can wait, then a second question arrives.
- **User impact** — Extended loading or resource retention until cancellation or another limit takes effect.
- **Reproduction** — Proposed. Fake a provider that emits below the idle threshold without completion, then supersede and measure terminal events and cleanup. Repeat on typed, heard and phone surfaces.
- **Existing test coverage** — [TextStreamFallback](../../electron/llm/__tests__/TextStreamFallback.test.mjs) covers fake pre/post-commit failure and stalls. This does not prove a global duration cap.
- **Recommended fix** — Define per-surface completion budgets and confirm cancellation closes the underlying transport. Preserve single-provider commitment and explicit incomplete outcomes.
