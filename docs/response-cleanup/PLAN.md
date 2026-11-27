# Shared Response Cleanup — Plan

> **Status:** Approved 2026-11-27, ahead of Live Brain Phase 6 (on hold). Phase 4 shared cleanup is wired and off by default. The tested FLAN-T5 setup missed the quality and latency targets. Live validation and rollout are pending.
> **Scope:** every Natively response path — **Auto Answer**, **text replies**, and **Live Brain**. One shared cleanup component; each path calls it at the right point.
> **Current rollout decision:** use rule-based cleanup only. Model-based cleanup is on hold. The FLAN-T5 evaluator remains a manual benchmark, and the shared rules retain their existing rollout gate.
> **Rule:** evaluation first. No change to what users see until the comparison results are reported and the user picks what to enable.
> Live Brain tracks its integration as Later phase 7 in [../live-brain/IMPLEMENTATION_PLAN.md](../live-brain/IMPLEMENTATION_PLAN.md).

## Goal

Spoken answers that are easy to read aloud, and text replies in plain language, with facts intact and first words just as fast.

## Design

- One shared component (e.g. `electron/llm/responseCleanup/`), pure and platform-independent, with no Electron imports. It is called by the Auto Answer, text-reply and Live Brain paths.
- Two modes chosen by the caller:
  - **spoken**: easy to read aloud.
  - **text**: plain language, keeping useful headings and lists.
- Always preserved unchanged: code blocks, inline code, formulas, facts, names, numbers, qualifications, and control messages (`Ask:`, `No action.`, bracket sentinels).
- Works on streamed text (completed sentences) and on replies delivered all at once.
- Answer style follows existing Natively prompts and contracts (Live Brain D3). Cleanup edits wording, never content.

## Steps

### 1. Fix the shared rules (baseline)

Consolidate the rule-based cleanup that exists today into the shared component. Start from `electron/llm/speakability.ts`, `humanLikeness.ts`, `answerPolish.ts` and `electron/intelligence/OutputShapeNormalizer.ts`, and first map which paths call which code. Fix rules that drop meaning, break grammar (including subject–verb agreement), delete phrases mid-sentence, or change who's speaking (for example, turning first person into second). Add one regression test per reproduced bug, plus preservation tests for code, formulas, numbers and control messages. These fixed rules become the baseline on all three paths.

### 2. Match cleanup to the response

Implement the spoken and text modes. Each path declares its mode where it calls the component. Tests cover both modes on the same inputs.

### 3. Compare rules, the tagging model, and FLAN-T5

- **Replay set:** real replies from all three paths (technical explanations, experience questions, follow-ups, text replies with headings and lists), with original stream timings where streamed, and a hand-written target version of each. Include replies that already sound good to measure unnecessary edits. Stored as test fixtures, not shipped.
- **Candidates:** the fixed rules; Grammarly's text-simplification (tagging) model; FLAN-T5 Small. Before prototyping the Grammarly model, confirm the exact checkpoint's licence allows redistribution. If it doesn't, drop the model and record why.
- **Scoring (blind):** naturalness for spoken answers, clarity for text replies, factual accuracy for both. Any change to a name, number, technical claim, or qualification is a failure.
- Any model runtime must meet CLAUDE.md's native-dependency rules (macOS and Windows, packaged loading, ASAR) and add no new services or servers.

### 4. Measure latency per path

Run inference through Natively's Electron main process on Windows and macOS, measuring both cold start and a warmed-up model.

- **Streamed replies** (Auto Answer, text, Live Brain): time to first visible text and time to first cleaned sentence, including the wait for a sentence boundary.
- **Replies delivered all at once:** the extra time before the full reply appears.
- Starting targets, which are untested: no added delay to first words, and under 200 ms of added processing for most complete sentences.

### 5. Enable model cleanup only where it proves useful

Report results first, then decide with the user:

- If the tagging model improves streamed replies within the latency budget, use it on completed sentences there, falling back to rule-cleaned text when it misses its deadline.
- If full rewrites improve quality but take longer, offer **Simplify** on finished answers across all three paths.
- If neither model beats the fixed rules, ship the rules alone.

## Acceptance

- Step 1 fixes are covered by regression tests, and all three paths use the shared component with no regressions in their existing suites.
- Replay fixtures from all three paths are committed.
- A comparison table is recorded: quality failures, unnecessary edits, and cold and warm latency per path and per platform.
- No user-visible model cleanup ships without a separate user decision.
- Validation is reported in CLAUDE.md's categories, and physical macOS verification is marked when it isn't done.

## Phase 2 Baseline & Findings (2026-11-27)

- **Response-path map:** [RESPONSE_PATH_MAP.md](RESPONSE_PATH_MAP.md) documents generation, streaming, finalization, existing cleanup, control-message parsing, and display delivery across Auto Answer, Text Replies (V3 & Legacy), and Live Brain (Realtime brains, Deepgram Flux + `AnswerWriter`, and `PipelineBrain`).
- **Replay set:** `tests/response-cleanup/replay-fixtures.json` contains **30 sanitized synthetic examples** (10 per path) with `mustPreserve`, `mustNotIntroduce`, plain-English references, and synthetic chunk timings (`timingsSynthetic: true`).
- **Baseline results (`scripts/eval-response-cleanup-baseline.mjs`, `electron/llm/__tests__/ResponseCleanupBaseline.test.mjs`):**
  - `32/32` replay/structure assertions passed; `0` `mustPreserve` failures; `0` `mustNotIntroduce` failures; `12` rewritten, `18` unchanged (including all `already_good` and `control_message` cases).
  - `27/30` matched the reference string exactly; 3 diffs (`AA-01` kept `"my"` in `"I used my careful engineering"`, `AA-05` revealed a coordinated-verb agreement bug `"I have 6 years of Go experience and brings..."`, and `AA-09` kept `"drove goals"`).
  - **Timing (Windows, standalone evaluator):** about `0.35 ms` average (`4.91 ms` max) measured cleanup time vs `119 ms` average simulated wait from the first chunk to the first punctuation boundary or end of input. The boundary heuristic and synthetic timings do not measure overlay latency. Tests verify that chunks reconstruct the original and leave timing measurements to the evaluator.
## Phase 3 Prototype & FLAN-T5 Small Comparison (2026-11-27, `win32/x64`)

- **AA-05 grammar fix:** The cleanup retains the original speaker when a conjunction could introduce a second verb sharing the same subject. Regression tests cover both `and brings` and `and also mentors`.
- **Runtime & license:** Ran `Xenova/flan-t5-small` (`dtype: 'q8'`) via `@huggingface/transformers` (`3.8.1`) + `onnxruntime-node` (`1.22.0`), cached in `os.tmpdir()` (no weights in Git). Verified files: `encoder_model_quantized.onnx` (35.8 MB), `decoder_model_merged_quantized.onnx` (59.3 MB), `tokenizer.json` (2.4 MB), `config.json`, `generation_config.json`, `tokenizer_config.json`. Both `google/flan-t5-small` and `Xenova/flan-t5-small` are Apache 2.0 licensed.
- **Latency (`win32/x64`, Node `v26.13.1`):**
  - Initial pipeline initialization: `46,313.3 ms`. Review rerun with model files already cached: `1,296.9 ms`.
  - Warm FLAN-T5 Small (`q8`): median `274–327 ms`, p95 `941–1,487 ms` over the two runs, against the `200 ms` target.
  - Fixed rules in the review rerun: median `0.198 ms`, p95 `3.287 ms`.
  - Simulated stream buffering: `119 ms` average from first chunk, using the same heuristic as the baseline evaluator. Neither evaluator measures display latency.
- **Quality & preservation (30 fixtures):**
  - **Fixed rules:** `30/30` preservation pass (`0` fact/code/math/control-message regressions; `28/30` diagnostic reference match; `12` rewritten, `18` unchanged).
  - **FLAN-T5 Small (`q8`):** `3/30` preservation pass (`AA-06`, `LB-02`, `LB-07` verbatim copies); `0` replies improved over the rules; `3/4` `already_good` replies corrupted (`AA-08`, `TR-06`, `TR-10`); dropped facts/numbers (`AA-01`, `TR-01`, `LB-09`), broke Markdown/LaTeX/code (`TR-01`, `TR-03`, `TR-08`), broke `Ask:` / `[[ASK]]` / `No action.` (`LB-01`, `LB-03`, `LB-04`), and produced repetition loops or empty outputs on `11` fixtures.
- **Unverified:** Physical macOS execution of `eval-flan-t5-cleanup.mjs` (tested on `win32/x64` only) and real live-session stream timings.

## Phase 4 Shared Rule Wiring (2026-11-27, `win32/x64`)

- **Shared entry point:** `cleanupResponse` in `electron/llm/responseCleanup.ts` (re-exported via `electron/llm/index.ts`) supports `mode: 'spoken' | 'text'`, protects control messages (`Ask:`, `No action.`, `[[NO_ACTION]]`, `[[ASK]]`), gates on `shouldHumanizeOutput`, and preserves code, formulas, numeric ranges, and facts. In `text` mode, `humanLikeness.ts` preserves semicolons and nested Markdown list indentation.
- **Default-OFF rollout gate:** `sharedResponseCleanup` (`NATIVELY_SHARED_RESPONSE_CLEANUP`, `sharedResponseCleanupEnabled`, `default: false`) in `electron/intelligence/intelligenceFlags.ts`.
- **Single-pass wiring across all three paths:**
  - **Auto Answer (plus Live Brain Flux + `AnswerWriter` and `PipelineBrain`):** `electron/IntelligenceEngine.ts` (`runWhatShouldISayInner`) runs `cleanupResponse({ mode: 'spoken' })` when `sharedResponseCleanup` is enabled and `answerDiversityGuard` did not already apply `humanized_spoken_answer`.
  - **Text replies:** `electron/ipcHandlers.ts` (`_geminiChatStreamHandler`) runs `cleanupResponse({ mode: 'text' })` before `gemini-stream-done` on V3 when `sharedResponseCleanup` is enabled, and switches the Legacy branch from `humanizeForAnswerType` to `cleanupResponse({ mode: 'text' })` when enabled (keeping `humanizeForAnswerType` unchanged when OFF).
  - **Live Brain direct providers:** `premium/electron/liveBrain/ResponseOrchestrator.ts` (`closeTextResponse(true)`) + `premium/electron/liveBrain/meeting.ts` run `cleanupText` only on completed `answer` turns after `createResponseParser` and `isFillerOnly` have handled sentinels/filler, updating the same `generationId`/`responseId` in place while keeping first streamed words immediate.
- **Measured (`win32/x64`):**
  - `ResponseOrchestrator` integration (`SharedResponseCleanupWiring.test.mjs`): zero cleanup calls during streaming. Completion keeps the same response and generation IDs. Cancelled turns, control messages, and late completions bypass cleanup. This test does not measure renderer or live-provider latency.
  - Replay benchmark (`eval-response-cleanup-baseline.mjs`): `30/30` preservation pass (`28/30` diagnostic reference match), `0.2922 ms` avg (`5.2037 ms` max) cleanup time vs `119 ms` avg synthetic sentence-boundary wait.
  - Automated suites: `build:electron`, `typecheck:electron`, `typecheck:premium`, `SharedResponseCleanupWiring` + `ResponseCleanupBaseline` + `HumanizeSpokenAnswer` (`187/187`), and `test:live-brain` (`139/139`) passed.
- **Review fixes:** Eligible prefetched Auto Answers now use the same flag and skip cleanup if the diversity guard already applied it. Written cleanup preserves Markdown hard breaks, links, and additional code block styles. V3 chat avoids inferring the speaker from its mode alone. The reviewed Windows suites passed 188 cleanup/baseline/wiring tests and 139 Live Brain tests.
- **Open:** Rollout decision, actual end-to-end Auto Answer and text chat validation (their wiring checks inspect source), real live-session timing, and physical macOS verification. Cover letters retain their existing cleanup and remain a separate caller.
- **Review result:** The Windows rerun reproduced the rubric scores. The preservation checks use fixture-specific strings and cannot establish semantic equivalence. The model also altered six replies marked as already good or control messages. Keep the fixed rules as the baseline. Do not integrate the tested model configuration into production.

### Rules plus FLAN-T5 follow-up

Run `node scripts/eval-flan-t5-cleanup.mjs --rules-first` after the Electron build. This offline variant sends rule-cleaned text to FLAN-T5 and bypasses four labeled control-message fixtures. On Windows, the combined pass met 12/30 fixture preservation checks versus 30/30 for rules alone. It matched 9/30 references versus 28/30, gained no reference matches, and changed three already-good replies. FLAN-T5 took 315 ms median and 2,008 ms p95 over 26 calls. It dropped the scalability claim in AA-01 and returned empty text for AA-09. These synthetic fixtures and string checks are diagnostic. The tested combined setup is unsuitable for rollout.
