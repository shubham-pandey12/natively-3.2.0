# Shared Response Cleanup — Plan

> **Status:** Approved 2026-11-27, ahead of Live Brain Phase 6 (on hold). Phase 1 rule fixes complete. Phase 2 maps callers and prepares replay fixtures before runtime integration.
> **Scope:** every Natively response path — **Auto Answer**, **text replies**, and **Live Brain**. One shared cleanup component; each path calls it at the right point.
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
