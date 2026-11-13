# Interview test scenarios

Use short audio clips for fast cases and the existing longer interview scripts for context/soak. Each full audio scenario starts the Natively meeting, plays sound through the real selected OS route, and observes capture → STT → question detection → answer → persistence. No full E2E case sends transcript text directly into the detector.

| # | Scenario | Audio setup | Expected assertions |
|---:|---|---|---|
| 1 | Normal interviewer question | Clear English interviewer clip through system-audio route | Correct channel reports signal; final transcript contains expected keywords; one question is judged; answer streams and settles. |
| 2 | Long technical question | 30–60 second technical clip with named constraints, languages and numbers | Transcript retains key entities and the complete question; detector waits for end boundary; answer includes the distinct required constraints. |
| 3 | Pause before finishing | One question split by a recorded 1–2 second mid-utterance pause | No premature answer during the pause; resumed clause joins the same question; one answer follows final completion. |
| 4 | Fast speech | Clear clip at faster speaking rate, with known answer terms | Capture remains continuous; STT retains the expected key terms; any transcript loss is counted, not hidden by answer-level fallback. |
| 5 | Background noise | Same clip with a checked-in noise-mixed variant or reproducible fixture transform | Expected speech remains detectable; noise does not create a false question or duplicate answer. Store source and mixing level with the scenario. |
| 6 | Multiple consecutive questions | Two or three questions with short natural gaps | Each final has a distinct boundary and request ID; exactly one answer per question; no previous answer is reused. |
| 7 | Follow-up requiring context | First question plus answer context, followed by a recorded elliptical ask such as “Any tradeoffs?” without punctuation | The follow-up reaches contextual judgment; the answer refers to the prior topic, and old-session context is absent. |
| 8 | Interviewer interruption | Interviewer starts a question, pauses, then interrupts/corrects the wording | Partial/interim text is superseded or corrected according to the current pipeline; stale answer is cancelled; only final wording produces output. |
| 9 | Audio device disconnection | Start a clip, remove/switch selected endpoint, then restore it | Capture failure/status is visible; no silent healthy state is reported; stream/resources close; recovery resumes only on the intended device. Physical device test is required. |
| 10 | Network interruption | Keep real audio playback/capture running while a local controlled STT/provider transport drops and reconnects | Audio continues to be observed; provider recovery or explicit error is bounded; transcript ordering is preserved and stale stream events are ignored. Use a controlled local endpoint, not public internet instability. |
| 11 | AI provider timeout | Real captured question and final transcript, then local provider delays first token or stalls after a partial answer | UI enters loading once, exposes timeout/fallback/incomplete result, aborts transport, and accepts the next question. Do not make the captured question synthetic text. |
| 12 | Long-duration interview | Extend existing `interview-hour.mjs` run and periodic probes | Both audio channels remain alive; transcript and answer latency/queue/memory stay within agreed limits; context facts remain findable; stop saves a recoverable record and releases resources. |

## Existing scenario reuse

- `tests/meeting-memory/live-audio/mock-tech-interview.mjs` already supplies a compact technical dialogue and can host the short functional case list.
- `tests/meeting-memory/live-audio/interview-hour.mjs` already builds a ~60-minute interview with planted details and delayed follow-up probes.
- `tests/meeting-memory/live-audio/live-audio-harness.mjs` already handles audio playback, selected devices, a live meeting, transcript readiness, What-to-answer/typed/index probes, and JSON result output.
- `tests/meeting-memory/scenarios.mjs` already has answer scoring helpers. Keep its scoring as a quality signal and retain a small manual review because lexical matches can miss semantic errors.
- `scripts/e2e/interview-simulator.mjs` injects transcript segments. Continue to use that for question/answer/profile logic evaluations only. It cannot satisfy the audio-capture or full interview E2E assertions above.

## Expected result report

Each run reports scenario ID, run ID, OS, route and device IDs, capture health, per-channel partial/final transcript with timestamps, detector outcome, request/answer IDs, first-token and completion latency, answer checks, session save/recovery status, and cleanup result. Playwright should attach a screenshot and trace for app/UI failures. Raw audio and full prompts should stay in ignored local artifacts unless specifically approved for a redacted fixture.
