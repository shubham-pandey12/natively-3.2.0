# Performance and reliability

Latency plan follows capture → PCM → interim/final → endpoint → judge → prompt/retrieval → provider first token → first visible token → durable save. Measure p50/p95/p99 per segment, transcript freshness, queue depth, event-loop delay, CPU, process RSS and resource counts. Run cold/warm, local/cloud, interrupted network and long-duration conditions separately. Thresholds and physical baselines remain unverified.

See the [audit scope and validation](executive-summary.md). Shared TypeScript findings apply to the inspected path on either OS. Native behavior is identified per backend where relevant. Physical execution is unverified.

## AUD-PER-001 — Native vector search can return empty while matching meeting evidence exists

- **Severity / confidence** — High / Confirmed.
- **Source and functions** — [VectorStore.searchSimilar](../../electron/rag/VectorStore.ts#L300), [searchSimilarNative](../../electron/rag/VectorStore.ts#L356), [RAGRetriever.retrieve](../../electron/rag/RAGRetriever.ts#L74).
- **Implementation evidence** — Native vec0 selects global top 4×limit before filtering hydrated rows by meeting and embedding space. With finite distances it returns the filtered slice without retry. Folder array scopes already take the JS branch.
- **Root cause** — The candidate limit precedes scope filtering, so out-of-scope rows consume the whole candidate pool.
- **Interview example** — The live or saved meeting contains a specific claim, but a large history ranks ahead of that meeting’s vectors.
- **User impact** — Semantic recall can return no evidence for a relevant question. Alternative lexical or whole-meeting paths may mitigate the answer impact.
- **Reproduction** — Executed actual VectorStore method via esbuild transform and fake SQL handle. Supplied four globally closer foreign rows, eligible rank five, limit one. Observed requested 4, eligible rank 5, returned 0. Real sqlite-vec and overall answer unverified.
- **Existing test coverage** — [SearchSpaceFilter](../../electron/rag/__tests__/SearchSpaceFilter.test.mjs#L129) checks exclusion using hydrated IDs. [FolderScopedSearch](../../electron/rag/__tests__/FolderScopedSearch2026_10_15.test.mjs#L60) covers folder scope. Neither case asserts native scoped recall under crowding.
- **Recommended fix** — Filter before top-K using a compatible partition or bounded exact scoped fallback. Add an actual vec0 fixture with more foreign candidates than the overfetch limit.

## AUD-PER-002 — Synchronous vector fallback can delay main-process work

- **Severity / confidence** — Medium / Potential risk.
- **Source and functions** — [VectorStore.searchSimilarJS](../../electron/rag/VectorStore.ts#L416), [RAGManager construction](../../electron/main.ts#L2949).
- **Implementation evidence** — Fallback loads all matching rows, decodes vectors, scores each and sorts matches in the calling process. Folder search uses it even when vec0 is available. Async method declaration does not yield while this work runs.
- **Root cause** — Cost scales with eligible row count and vector dimension. User-visible delay is unmeasured.
- **Interview example** — A large saved-history search coincides with live transcription or answer tokens.
- **User impact** — IPC dispatch and deadlines can run late while main is busy.
- **Reproduction** — Proposed. Populate synthetic histories of increasing sizes in an isolated profile, compare native and exact fallback. Measure event-loop delay, p95 IPC latency and RSS on both OSes.
- **Existing test coverage** — [FolderScopedSearch](../../electron/rag/__tests__/FolderScopedSearch2026_10_15.test.mjs) asserts small fixture correctness. No representative timing gate established.
- **Recommended fix** — Measure first, then limit materialization/sort work and evaluate a scoped index or off-thread execution with cancellation.

## AUD-PER-003 — Growing recovery snapshots serialize on the main thread

- **Severity / confidence** — Medium / Potential risk.
- **Source and functions** — [LiveMeetingJournal.flush](../../electron/services/meeting/LiveMeetingJournal.ts#L151), [DatabaseManager.writeLiveMeeting](../../electron/db/DatabaseManager.ts#L4150), [SessionTracker.keepForPersistence](../../electron/SessionTracker.ts#L894).
- **Implementation evidence** — A journal update serializes whole transcript, usage and metadata and writes synchronously. Transcript has a count ceiling, but each periodic snapshot still grows toward it.
- **Root cause** — Full-state serialization and write amplification are visible. Allocation spikes, storage cost and freeze thresholds are unmeasured.
- **Interview example** — A long interview hits a journal write while the model streams and CPU is busy with local STT.
- **User impact** — Potential main-thread stalls, increased memory and delayed visible answer chunks.
- **Reproduction** — Proposed. Run isolated 15, 60 and 120 minute equivalent replay, record journal durations, RSS, queue depth, loop delay and p50/p95/p99 answer latency with journaling present.
- **Existing test coverage** — Existing stop ordering test does not measure journal timing. No physical soak evidence established.
- **Recommended fix** — Instrument before changing persistence. Consider incremental durable journal records if measurements justify it and preserve crash recovery semantics.
