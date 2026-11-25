# Live Brain scenario corpus

[`scenarios.json`](scenarios.json) contains the 12 scenarios in the Live Brain implementation plan. Each entry has an ID, ordered steps, and assertions to score.

- `atMs` measures from scenario start. `durationMs` is the time allotted to speak the line. An uncovered interval is silence, and overlapping interviewer and candidate intervals are simultaneous speech on separate channels.
- `after: "first_visible_text"` anchors a step to the first answer's visible text. `offsetMs` measures from that same event for every anchored step. If an answer that should still be streaming finishes before the anchored step, repeat the scenario with an answer long enough to exercise the case.
- S11 runs once per variant. At `selected_failure`, apply that variant to the primary transport. A network drop lasts exactly the supplied duration. Use controlled faults for socket and quota cases rather than exhausting a real quota.
- `observeAfterMs` is the observation window after the last scheduled speech ends. Other scenarios should be observed through the completion of the expected response.

## Recording the current pipeline baseline

Use an isolated development meeting with Auto Answer enabled and Live Brain off. Speak the scripts into the appropriate channels, or play recordings you supply. S10 uses elapsed meeting time and S11 needs a controllable transport. Keep recordings outside the repository.

Start the dev app with `NATIVELY_PROMPT_DEBUG=1` in its environment. The Prompt Debugger exposes `answerTimings`. Its JSONL output also includes `kind: "answer_timing"` records. Use `speechStopToFirstVisibleTextMs` for the median and nearest-rank p90, along with the sample count. This interval measures from the main process's native interviewer VAD stop notification to its first display-bound answer text. It includes the capture detector's existing event timing, judge and answer path, and excludes IPC batching and renderer paint. Discard runs that have no corresponding VAD stop, and report the missing sample count.

Score each scenario against its `expected` assertions and report pass, fail, or blocked with a reason. Include the STT and answer providers and models, the platform, and the number of runs. Live Brain-specific rollover and fallback assertions should be recorded as inapplicable for the current pipeline. Keep the other assertions in the baseline.
