# Implementation roadmap after approval

This roadmap recommends ordering only. No fixes or tests were implemented during validation.

## Stage 1 — Protect interviewer audio, transcript and answer correctness

1. **Address AUD-AUD-002.** Add Windows testing with a selected non-default output, forced fallback, route switch, and device disconnect. Verify capture route status alongside transcript arrival before changing fallback selection behavior.
2. **Address AUD-STT-001.** Add late-event replay for old Deepgram transcript and endpoint after reconnect and stop. Verify active and draining session behavior before changing event acceptance.
3. **Validate AUD-STT-002.** Add delayed local-worker final through meeting stop and persistence. Only change drain/snapshot sequencing after the failing case demonstrates whether and where the final is lost.
4. **Address AUD-QST-001.** Add a paired punctuation-free elliptical question and backchannel case. Preserve the negative case so broadening short-question admission does not create indiscriminate answers.
5. **Group AUD-UI-001 and AUD-UI-002.** Add renderer regression coverage for fresh reset, explicit resume, and a delayed Direct token/done after reset. Then change reset ownership so the test cases pass. Keep history clearing and active request retirement as separate assertions.

## Stage 2 — Preserve grounding and selected audio

6. **Address AUD-PER-001.** First add a real sqlite-vec fixture with more close foreign rows than the current overfetch limit and a lower-ranked matching row. Validate both meeting and embedding-space scoping.
7. **Resolve AUD-AI-001 and AUD-STT-003 contracts.** Add injected getter/key absence cases. Decide what the user sees when requested evidence or provider credentials are unavailable. Preserve any intentional provider fallback only with a verified effective-provider status.
8. **Validate AUD-AUD-001.** Add native ring saturation instrumentation/fixture on CoreAudio and WASAPI before altering callback behavior. Measure dropped frames and discontinuity propagation.

## Stage 3 — Lifecycle durability and IPC boundary

9. **Address AUD-SES-002.** Add independent DB-save and emergency-backup failure injection. Verify journal retention, stop result, history UI, and next-launch recovery.
10. **Validate AUD-SES-001.** Delay capture release, local STT, DB save, and RAG separately. Preserve native release ordering while proving which background work may safely outlive restart.
11. **Resolve AUD-ELC-001.** Define which Electron windows may use Direct Assist, then test allowed and denied senders before adding an authorization check.

## Stage 4 — Enforce and measure reliability evidence

12. **Address AUD-TST-001.** Align the Playwright readiness port with Vite and use an Electron launch that executes a correlated IPC request and response. Make required IPC coverage non-skippable in CI.
13. **Address AUD-TST-002.** Add focused enforcing Windows coverage for interview-critical paths, then reduce advisory test scope only when failures are resolved.
14. **Inventory AUD-TST-003.** Check local scripts, CI, and any external hardware lab before declaring integrated soak infrastructure absent. Add dual-channel fault replay and bounded long-session soak where no equivalent exists.
15. **Measure AUD-PER-002 and AUD-PER-003.** Establish same-profile workload and event-loop measurements before considering off-thread scoring, incremental persistence, or other performance changes.
16. **Validate AUD-AI-002 and AUD-QST-002.** Add a below-idle drip stream test and a fake-clock long multi-part question trace. Confirm terminal behavior and context selection before changing timeouts or age limits.

## Required validation gates

- Run focused unit tests for each behavioral regression and relevant existing suite.
- Use Electron integration tests for IPC and renderer session ownership.
- Run the audio routing and native ring cases on physical macOS and Windows where OS APIs or hardware determine behavior.
- Use a real sqlite-vec fixture for native vector search.
- Record current vs changed p50/p95/p99 audio-to-answer latency, event-loop delay, memory, and teardown/restart time for performance or lifecycle changes.
- Distinguish physical platform execution from automated branch coverage. Record the exact commands and skipped scenarios.

## Blocked by infrastructure

- **Windows endpoint capture** needs a runner or lab machine with selectable output endpoints and native capture disabled/forced unavailable.
- **Native audio overflow** needs controlled producer/consumer rate or loopback capture plus observable frame counts for CoreAudio and WASAPI.
- **Local late-final persistence** needs a controllable local STT worker and deterministic persistence snapshot fixture.
- **Native vector crowding** needs sqlite-vec enabled in a disposable database with scoped and foreign rows.
- **Full interview soak** is unverified until the team confirms whether an external hardware harness exists and supplies a consent-safe dual-channel fixture.
