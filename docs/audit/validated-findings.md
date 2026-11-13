# Validated reliability findings

Validation date: 2026-11-10. Review scope: the 20 findings in the prior audit documents, their cited implementation paths, and the cited test/CI evidence. This is an investigation result, not a runtime certification.

## Method and limits

The repository requires `code-review-graph` discovery before source searches. No graph tools were exposed in this session, so reviewers used the audit's source references as entry points and inspected the implementation and tests directly. Three agents independently reviewed audio/transcription/question detection, AI/retrieval/performance, and session/Electron/testing. Findings below were consolidated against current source. No production code or tests were modified. No new tests were run during this validation. Prior audit reproductions are explicitly identified as such. macOS and Windows hardware execution, live provider timing, and any external test harness were not available for this review.

Classification terms follow the requested rubric. `REPRODUCED BUG` means a prior behavioral probe demonstrated the failing condition. `CONFIRMED BUG` means current source proves the deficient behavior, though an end-to-end reproduction was not run here. `POTENTIAL RISK` means there is a credible condition but outcome or intended contract is unresolved. `UNVERIFIED` means the available evidence cannot establish the claimed repository-wide condition. No finding was determined to be a `FALSE POSITIVE` in full. Scope corrections are listed in [false-positives.md](false-positives.md).

## Finding-by-finding validation

### Capture and transcription

#### AUD-AUD-001 — Native capture can drop PCM without a gap signal

- **Classification / severity**: POTENTIAL RISK / P2.
- **Evidence and flow**: Native microphone producer callbacks in [`microphone.rs`](../../native-module/src/microphone.rs#L415) and speaker producers in [`core_audio.rs`](../../native-module/src/speaker/core_audio.rs#L361) and [`windows.rs`](../../native-module/src/speaker/windows.rs#L396) push into bounded rings. The push result is not used to report rejected frames. Downstream consumers therefore receive no explicit discontinuity metadata for a full-ring loss.
- **Failure condition and cause**: The producer outpaces ring consumption until capacity is exhausted. Source proves the ignored-result path, but does not prove saturation under interview load or quantify transcript loss.
- **Reproduction**: Not reproduced. Proposed sequence-numbered PCM with consumer stalls beyond ring capacity on both native implementations.
- **Tests**: `RendererCaptureFallback2026_10_21.test.mjs` uses synthetic fallback PCM. No native saturation test was identified.
- **Dependency**: A native saturation fixture or hardware loopback is needed to measure the impact and validate cross-platform reporting.

#### AUD-AUD-002 — Windows fallback follows the default output instead of a pinned endpoint

- **Classification / severity**: CONFIRMED BUG under the stated fallback condition / P1.
- **Evidence and flow**: Windows fallback can select Chromium capture when the native capture class is unavailable. [`rendererCaptureMonitor.ts`](../../electron/audio/fallback/rendererCaptureMonitor.ts#L200) creates the fallback capture without carrying the selected output device through, and [`fallbackPolicy.ts`](../../electron/audio/fallback/fallbackPolicy.ts#L22) selects that path. The route is therefore the system default output.
- **Failure condition and cause**: Native capture unavailable and the interview audio routed to an explicitly selected non-default output. The capture implementation does not honor that selection.
- **Reproduction**: Not physically reproduced. The mismatch follows from source; Windows endpoint routing and the exact runtime fallback trigger need a Windows device test.
- **Tests**: Renderer fallback tests cover the policy and synthetic audio, not physical output routing.
- **Dependency**: Requires a Windows endpoint-routing harness before accepting a route-selection change.

#### AUD-STT-001 — Retired Deepgram connection can emit finals and endpoints

- **Classification / severity**: REPRODUCED BUG / P1.
- **Evidence and flow**: [`DeepgramStreamingSTT.connect`](../../electron/audio/DeepgramStreamingSTT.ts#L275) installs transcript and `UtteranceEnd` handlers that do not reject events from a replaced connection. Main's `onSegment` callback in [`main.ts`](../../electron/main.ts#L4243) forwards accepted segments into active/draining meeting intelligence. Open/Error/Close callbacks use connection identity, while these two do not.
- **Failure condition and cause**: An old socket emits after a reconnect, such as during sample-rate replacement. The missing owner-identity guard allows the retired socket's final or endpoint to affect the current session.
- **Reproduction**: Prior audit ran the actual transpiled class with fake SDK emitters. After reconnecting, an old final and endpoint were accepted. Real SDK timing remains unverified.
- **Tests**: `DeepgramStabilityTimerTracked.test.mjs` covers stability timer behavior, not stale callbacks.
- **Dependency**: Group with session/request-generation ownership tests, while keeping this provider-specific guard separate from renderer reset handling.

#### AUD-STT-002 — Local final inference can outlive the meeting snapshot

- **Classification / severity**: POTENTIAL RISK / P1.
- **Evidence and flow**: [`LocalWhisperSTT.stop`](../../electron/audio/LocalWhisperSTT.ts#L575) can flush final segments and retain the worker for replies. Main's teardown waits 250 ms and polls REST STT, then calls `intelligenceManager.stopMeeting()` to snapshot at [`main.ts`](../../electron/main.ts#L8317). Local worker pending work is not included in that wait. Worker results may still be handled while `isDrainingFinals` is true at [`LocalWhisperSTT.ts`](../../electron/audio/LocalWhisperSTT.ts#L1535).
- **Failure condition and cause**: Local final inference exceeds the fixed grace, and its reply arrives after the persistence snapshot. Current evidence proves an asynchronous contract mismatch, but not that the late result is rejected or lost in all lifecycle paths.
- **Reproduction**: Not reproduced end to end. Hold a fake local final past the grace, stop, release it, and compare in-memory and persisted transcript.
- **Tests**: `WhisperDrainBounded2026_08_18.test.mjs` covers worker cleanup. `MeetingPersistenceRace.test.mjs` checks save ordering, not late local finals.
- **Dependency**: Needs controllable local worker result delivery and a session persistence integration test.

#### AUD-STT-003 — Missing selected credentials change the effective provider

- **Classification / severity**: POTENTIAL RISK / P2.
- **Evidence and flow**: [`createSTTProvider`](../../electron/main.ts#L4037) explicitly constructs `GoogleSTT` when credentials are missing for several selected cloud providers, with a warning. It then derives `effectiveSttId` from the constructed provider at [`main.ts`](../../electron/main.ts#L4196) and uses that identity in transcription routing. The provider change is real. Whether this violates the intended fallback contract is not fully established because fallback appears deliberate and effective identity is tracked.
- **Failure condition and cause**: A selected provider loses credentials while Google is usable or unavailable. The output can change provider or transcription availability without a settings-time fail-closed validation.
- **Reproduction**: Not reproduced with injected credentials and constructors.
- **Tests**: `SttProviderNamesCoverage2026_10_25.test.mjs` checks provider naming. The specific missing-credential fallback and its user-visible status are not covered by the cited tests.
- **Dependency**: Define the expected missing-key policy and test the effective provider/status before treating the fallback itself as a confirmed defect.

### Question detection and answer orchestration

#### AUD-QST-001 — A short elliptical question can be filtered before the judge

- **Classification / severity**: REPRODUCED BUG / P2.
- **Evidence and flow**: [`onStoppage`](../../electron/intelligence/autoAnswer/SimpleAutoAnswer.ts#L576) rejects short candidates before contextual judgment unless the text contains `?` or matches the question-shaped heuristic in the same module at `isQuestionShaped`. The punctuation-free final `Any tradeoffs` passes neither gate.
- **Failure condition and cause**: STT omits punctuation and the ask is a short elliptical follow-up. The prefilter excludes context-aware judgment.
- **Reproduction**: Prior audit called the actual engine with a fake clock/host. `Any tradeoffs` yielded zero judge calls; `Any tradeoffs?` yielded one.
- **Tests**: `AutoAnswerSimple.test.mjs` exercises engine policies but no matching punctuation-free elliptical ask was found.
- **Dependency**: Add a focused question fixture while preserving backchannel rejection; this is independent of provider and session lifecycle changes.

#### AUD-QST-002 — Pending fragments age out during prolonged question setup

- **Classification / severity**: POTENTIAL RISK / P2.
- **Evidence and flow**: [`SimpleAutoAnswer.ts`](../../electron/intelligence/autoAnswer/SimpleAutoAnswer.ts#L500) joins transcript candidates and `onStoppage` prunes parts older than `PENDING_MAX_AGE_MS` before judgment. Arrival order and later speech can affect the assembled candidate.
- **Failure condition and cause**: A long setup places a constraint more than the configured age before the eventual ask. Whether it is needed in the generated answer depends on the utterance sequence and downstream context.
- **Reproduction**: Not reproduced. Use fake time with an early unique constraint, long pause, and multiple follow-up asks.
- **Tests**: `AutoAnswerSimple.test.mjs` covers endpoint and judge policy, not long multi-part aging.
- **Dependency**: Needs deterministic timestamped transcript replay before changing the age bound.

#### AUD-AI-001 — Direct context read failure bypasses the trim notice

- **Classification / severity**: CONFIRMED BUG / P2.
- **Evidence and flow**: The Direct IPC handler catches reference-file and transcript read failures in [`ipcHandlers.ts`](../../electron/ipcHandlers.ts#L8458), substitutes empty values, and logs warnings. `prepareDirectAssistPrompt` receives empty context and emits trim metadata only for budget reductions in [`requestBuilder.ts`](../../electron/direct-assist/requestBuilder.ts#L802). The renderer notice is wired to those metadata fields, so a thrown read is not represented as a context-unavailable notice.
- **Failure condition and cause**: A populated reference/transcript getter throws. The error provenance is collapsed into the same empty value used for intentionally absent context.
- **Reproduction**: Not runtime reproduced. Force the getter to throw and compare the request-start event and rendered notice against a successful read.
- **Tests**: `DirectAssistCore2026_08_29.test.mjs` and `directAssistRenderer2026_08_29.test.mjs` cover prompt/trim behavior, not injected context-read failure.
- **Dependency**: Requires an IPC failure-injection test and a defined renderer contract for unavailable evidence.

#### AUD-AI-002 — A provider can keep a committed stream open with frequent content

- **Classification / severity**: POTENTIAL RISK / P2.
- **Evidence and flow**: [`DirectAssistService.stream`](../../electron/direct-assist/DirectAssistService.ts#L124) has an idle timeout and a whole-ladder budget. The budget is elapsed-checked before opening more work, while post-commit frequent output is allowed. Generic deadlines in [`liveDeadlines.ts`](../../electron/llm/liveDeadlines.ts#L730) do not establish that this Direct Assist path has a total post-commit wall-clock cap.
- **Failure condition and cause**: A provider emits below the idle threshold indefinitely and never completes. Source permits the condition; practical duration and all terminal paths remain unverified.
- **Reproduction**: Not reproduced. Use a drip-feed provider and assert terminal event, cancellation, and transport cleanup.
- **Tests**: `TextStreamFallback.test.mjs` covers pre/post-commit failure and stalls, not indefinite below-idle output.
- **Dependency**: Requires fake-stream completion tests per surface and clarity on whether a committed response is allowed unbounded duration.

### Session and Electron

#### AUD-SES-001 — Restart waits on the previous session's full teardown chain

- **Classification / severity**: POTENTIAL RISK / P2.
- **Evidence and flow**: [`startMeetingTransition`](../../electron/main.ts#L7529) awaits `_pendingTeardown`. That promise begins at [`main.ts`](../../electron/main.ts#L8287) and includes capture release, STT grace/drain, persistence, live-index shutdown, and completed-meeting RAG processing through `processCompletedMeetingForRAG`.
- **Failure condition and cause**: Any awaited dependency remains unresolved. Coupling is source-confirmed, but no dependency hang was demonstrated and some waits have internal bounds.
- **Reproduction**: Not reproduced. Delay capture teardown and post-save RAG independently and measure restart admission.
- **Tests**: `MeetingLifecycleSerialization2026_08_07.test.mjs` covers queue serialization, not a stalled full `AppState` teardown.
- **Dependency**: Determine which teardown operations own shared native resources before separating restart readiness from background indexing.

#### AUD-SES-002 — Stop success does not report placeholder save failure

- **Classification / severity**: CONFIRMED BUG / P2.
- **Evidence and flow**: [`MeetingPersistence.stopMeeting`](../../electron/MeetingPersistence.ts#L1107) catches placeholder DB save failure, attempts an emergency backup, then continues to return `{ meetingId, memoryEligibleCount }` at line 1140. Main's background teardown consumes the result at [`main.ts`](../../electron/main.ts#L8333); stop completion does not express whether the placeholder was durably written.
- **Failure condition and cause**: Database save fails and backup may also fail. The stop contract represents session termination while save state is separate and not returned.
- **Reproduction**: Not reproduced with injected DB and backup failures.
- **Tests**: `MeetingPersistenceRace.test.mjs` checks placeholder order, not simultaneous save/backup failure and user-visible recovery state.
- **Dependency**: Requires fault injection for DB and emergency backup and a persistence-state contract.

#### AUD-UI-001 — Fresh session reset leaves Direct Assist history populated

- **Classification / severity**: REPRODUCED BUG / P1.
- **Evidence and flow**: The persistent renderer's reset listener clears visible `messages` at [`NativelyInterface.tsx`](../../src/components/NativelyInterface.tsx#L5598). It sets `directAssistHistoryRef` only when resumed messages exist at line 5698. Fresh Direct requests then pass `directAssistHistoryRef.current.slice(-24)` at line 7440. The separate `resetChatState` helper clears the ref, but this session-reset handler does not call it.
- **Failure condition and cause**: A completed Direct Assist turn is followed by a fresh session reset, then another Direct Assist request. The old internal history remains available even though the visible transcript cleared.
- **Reproduction**: Source trace demonstrates the state flow. The earlier audit did not execute a full Electron renderer session.
- **Tests**: `resumedChat2026_11_03.test.mjs` checks resumed hydration and `directAssistRenderer2026_08_29.test.mjs` checks append; neither asserts fresh reset clears Direct history.
- **Dependency**: Pair with AUD-UI-002 in reset-state regression coverage, while asserting history isolation separately from cancellation.

#### AUD-UI-002 — Direct Assist request ownership can survive the session reset event

- **Classification / severity**: POTENTIAL RISK / P1.
- **Evidence and flow**: Reset cancels the legacy stream but does not retire `activeDirectAssistRef` in [`NativelyInterface.tsx`](../../src/components/NativelyInterface.tsx#L5598). Direct events are accepted by request ID at line 7141. Main aborts an existing Direct request on replacement and on sender destruction in [`ipcHandlers.ts`](../../electron/ipcHandlers.ts#L8432), not on the session reset event itself.
- **Failure condition and cause**: Stop/reset occurs while a Direct stream is active, then a late token or done event arrives. Whether it suppresses or mutates new-session UI depends on timing and has not been demonstrated.
- **Reproduction**: Not reproduced. Hold a fake token/done until after stop/start reset and inspect the active request, loading state, and messages.
- **Tests**: `directAssistRenderer2026_08_29.test.mjs` covers request IDs/sequences and competing streams, not session-boundary cancellation.
- **Dependency**: Shares session-reset ownership boundary with AUD-UI-001 and needs a controllable stream integration test.

#### AUD-ELC-001 — Direct IPC checks sender identity without establishing surface ownership

- **Classification / severity**: POTENTIAL RISK / P2.
- **Evidence and flow**: `direct-assist-stream` validates and keys by numeric sender ID in [`ipcHandlers.ts`](../../electron/ipcHandlers.ts#L8364), especially lines 8397–8446. It does not check the sender against an allowed-window policy at this boundary. The preload exposes the call in [`preload.ts`](../../electron/preload.ts#L2348). Other handlers use sender authorization patterns.
- **Failure condition and cause**: A renderer surface outside the intended Direct Assist authorization matrix can invoke the exposed bridge. No such invocation or compromised renderer was demonstrated, and the intended matrix is not documented in the cited evidence.
- **Reproduction**: Not reproduced. Invoke from each window class in an isolated Electron test and assert positive and negative cases before loading context.
- **Tests**: `IpcBridgeWiring.test.mjs` checks reachability; it does not establish a sender matrix.
- **Dependency**: Define authorized surfaces first, then add sender-policy tests. This is separate from interview correctness findings.

### Test infrastructure and performance

#### AUD-TST-001 — Default browser smoke configuration does not establish Electron IPC

- **Classification / severity**: CONFIRMED BUG in this smoke lane / P2.
- **Evidence and flow**: [`playwright.config.ts`](../../playwright.config.ts#L13) starts `npm run dev` and waits on port 5173, while [`vite.config.mts`](../../vite.config.mts#L50) configures port 5180. `basic-smoke.spec.ts` skips without `ELECTRON_APP_PORT` at lines 24–35; its `IPC ping` case at line 58 checks whether a property exists and does not invoke it. `package.json` has other focused Electron suites, so this finding is limited to this smoke suite.
- **Failure condition and cause**: The smoke lane runs with no explicit Electron app port or with the configured Vite port. It can skip or check only bridge presence rather than a correlated IPC response.
- **Reproduction**: Source-verified; no clean-port Playwright execution was run.
- **Tests**: The named smoke case itself is the weak check. Dedicated IPC suites cover other bridge wiring.
- **Dependency**: Needs an Electron harness and a single aligned dev-server port contract.

#### AUD-TST-002 — Broad Windows Electron failures can leave the CI job green

- **Classification / severity**: CONFIRMED BUG in CI enforcement / P2.
- **Evidence and flow**: The Windows workflow step for `npm test` has `continue-on-error: ${{ runner.os == 'Windows' }}` in [`build-smoke.yml`](../../.github/workflows/build-smoke.yml#L298). Other selected test suites and build steps are enforcing, limiting the gap to failures in the broad suite.
- **Failure condition and cause**: A Windows regression exists only in a test included by `npm test`; that step can fail without failing the job.
- **Reproduction**: Workflow-source verified. No CI job was triggered.
- **Tests**: `build-smoke-fork-safety.test.mjs` checks test scope/credentials, not this failure policy.
- **Dependency**: Add or identify focused enforcing Windows interview regressions before removing advisory handling from the full suite.

#### AUD-TST-003 — Integrated dual-channel fault replay and native soak coverage was not established

- **Classification / severity**: UNVERIFIED / P2.
- **Evidence and flow**: The reviewed package scripts in [`package.json`](../../package.json#L37) enumerate many unit and specialized suites, and the audit cites WAV fixtures, replay coverage, and long-session scripts. The cited runner paths do not demonstrate one end-to-end scenario from OS capture through two-channel transcription and visible answer under fault and duration conditions.
- **Failure condition and cause**: A cross-layer failure could evade component-level suites. However, absence from inspected repository entry points cannot prove no external hardware harness exists.
- **Reproduction**: Not applicable as a defect reproduction. Complete repository and external harness inventory is still needed.
- **Tests**: Existing coverage is distributed. `SttGapRecovery2026_10_15.test.mjs` uses fakes; `ModeLongSession.test.mjs` exercises mode behavior. Neither proves native capture soak.
- **Dependency**: Blocked on inventory of any external lab harness, consent-safe dual-channel audio fixture, and cross-platform capture setup.

#### AUD-PER-001 — Native vector search can return empty while matching meeting evidence exists

- **Classification / severity**: REPRODUCED BUG / P1.
- **Evidence and flow**: [`VectorStore.searchSimilar`](../../electron/rag/VectorStore.ts#L300) routes space-scoped calls to native search. `searchSimilarNative` fetches global top `limit * 4` at lines 366–371, hydrates those IDs, and filters meeting/space at lines 375–410. Foreign rows can consume all candidates before scope filtering. `RAGRetriever.retrieve` returns no retrieved evidence when this result is empty.
- **Failure condition and cause**: At least `4 * limit` out-of-scope vectors rank ahead of matching in-scope vectors. The scope predicate is applied after a finite native candidate limit.
- **Reproduction**: Prior audit executed the actual method with a fake SQL handle: four closer foreign results plus an eligible fifth row, limit one, returned zero eligible rows. Real sqlite-vec integration remains unverified.
- **Tests**: `SearchSpaceFilter.test.mjs` checks foreign-row exclusion; `FolderScopedSearch2026_10_15.test.mjs` checks folder search via the JS scoped branch. Neither covers crowded native scoped recall.
- **Dependency**: Needs a real `vec0` fixture for the regression assertion. Share RAG evidence correctness validation with AUD-AI-001, but the causes differ.

#### AUD-PER-002 — Synchronous vector fallback can delay main-process work

- **Classification / severity**: POTENTIAL RISK / P2.
- **Evidence and flow**: [`searchSimilarJS`](../../electron/rag/VectorStore.ts#L416) materializes matching rows, computes cosine similarity, and sorts synchronously. `searchSimilar` calls it for scoped meeting arrays and native fallback paths at lines 337–350. The method is declared async but the synchronous DB and scoring work runs before it yields.
- **Failure condition and cause**: A sufficiently large eligible corpus or vector dimension blocks main-process event-loop work during retrieval. Existing comments indicate current corpora are comparatively small; latency impact is unmeasured.
- **Reproduction**: Not reproduced or benchmarked.
- **Tests**: Folder search fixtures verify small-set correctness, not event-loop latency or scale.
- **Dependency**: Needs synthetic scale and event-loop-delay benchmarks before selecting an optimization.

#### AUD-PER-003 — Growing recovery snapshots serialize on the main thread

- **Classification / severity**: POTENTIAL RISK / P2.
- **Evidence and flow**: [`LiveMeetingJournal.flush`](../../electron/services/meeting/LiveMeetingJournal.ts#L151) snapshots state and writes through [`DatabaseManager.writeLiveMeeting`](../../electron/db/DatabaseManager.ts#L4150), which JSON-serializes and synchronously writes SQLite state. [`SessionTracker.keepForPersistence`](../../electron/SessionTracker.ts#L894) bounds transcript count, but snapshots grow toward that bound.
- **Failure condition and cause**: A large journal snapshot is flushed while latency-sensitive answer or audio work is queued. Source proves synchronous work, not an interview-visible stall at expected sizes.
- **Reproduction**: Not reproduced or measured.
- **Tests**: Journal durability and race tests cover ordering, not serialization time, memory growth, or answer latency.
- **Dependency**: Share the event-loop benchmark harness with AUD-PER-002; do not infer a performance regression without measured data.
