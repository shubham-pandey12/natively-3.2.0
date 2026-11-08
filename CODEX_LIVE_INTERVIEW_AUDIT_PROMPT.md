# Codex Prompt: Live Interview Reliability Audit and Review (use ECC agents)

Paste everything below the line into Codex. Work in the repo at `/Users/shubhampandey/testing/natively-cluely-ai-assistant`.

---

## Goal

Natively is an AI assistant used live during job interviews. It listens to the interviewer, transcribes, answers using the user's resume, job description, company research, modes, and reference files, and streams the answer into an overlay. A failure during a live interview cannot be retried.

Run a full audit and review of the whole app. Find every issue that can hurt or break a live interview, verify each one with evidence, and report them ranked by impact. This phase is **audit and review only**. Do not change source code. Do not commit, stage, stash, reset, or checkout. The user will review the report and decide what to fix next.

Scope the audit to what affects a live interview: transcription, answer generation and streaming, the overlay, shortcuts, screenshots, context features (Profile Intelligence, Company Intel, Role Insight, Modes, reference files), licensing gates, app lifecycle, and packaging. Lower-priority polish can be listed briefly at the end.

---

## Ground rules

- **Both platforms:** Natively ships on macOS and Windows. Review both. For each finding, state the impact on macOS, on Windows, or on both, with evidence. Never say something works on both unless it was run or covered by tests on both.
- **Evidence first:** every finding needs file:line evidence, and observed output if you ran it. No finding without evidence.
- **Confidence labels:** mark each finding as `reproduced` (you ran it and saw the failure), `code-confirmed` (you read the path and the failure follows), or `suspected` (plausible, not confirmed).
- **Do not guess test results.** If you could not run something, list it as not run and say why.
- **Graph tool:** `code-review-graph` is disconnected in this environment. Use `grep`, `find`, `Read`, `git grep`, and `git log -S`. Say this in the report.
- **Temp files:** use the session scratchpad directory only. Never use `/tmp` or any hardcoded OS path.
- **Credentials:** none are configured. Use only test values. Never write a key, token, or transcript content into a log or report.
- **Working tree:** it has the user's uncommitted edits, for example in `premium/src/ModesSettings.tsx`, `electron/ipcHandlers.ts`, `electron/services/ModesManager.ts`, and `src/types/electron.d.ts`, plus untracked test and prompt files. Read them, do not modify them.
- **Repo instructions:** follow `CLAUDE.md`. Use `npm run dev:agent` with `agent-browser` for renderer UI checks. Open Settings through the launcher window (`window.electronAPI.openSettingsTab('ai-providers')`). Confirm the document with `agent-browser eval "location.search"` before trusting a snapshot. Never use `--auto-connect`. Stop the app through the launcher.

---

## Use ECC agents

Split the work across agents so no single agent holds the whole audit.

1. **Flow mapper (1 agent):** list every interview-critical flow with its entry point, main-process path, renderer path, persistence, and external dependency. Flows to cover: launch, start and stop listening, transcript, question detection, answer streaming, manual question, screenshot attach, shortcuts, mode switch mid-session, resume and JD upload, Profile Intelligence, Company Intel, Role Insight, reference files, device change, network loss and recovery, missing or invalid key, license expiry, quit and relaunch mid-session, sleep and wake, overlay on fullscreen or shared screen, and update check during a session.
2. **Domain auditors (one per domain, parallel where files do not overlap):**
   - **A. Audio and STT:** mic and system audio on macOS and Windows, device selection and hot-swap, reconnects, stream restart, silence handling, latency, duplicate or dropped transcript lines.
   - **B. LLM and answers:** provider selection and fallback, streaming, cancellation, timeouts, retries, rate-limit handling, context size limits, stale answers overwriting newer ones, answers stuck in a "thinking" state after an error.
   - **C. Overlay and windows:** always-on-top, focus stealing, click-through, screen-share protection, multi-monitor, fullscreen apps, Spaces and virtual desktops, DPI, show and hide timing.
   - **D. Shortcuts and screenshots:** global shortcut registration, conflicts, failed registration with no feedback, screenshot permission flow on macOS (Screen Recording) and Windows, the correct display captured, image attached to the right turn.
   - **E. Context features:** Profile Intelligence, Company Intel, Role Insight. Parsing, caching, expiry, temp files and collisions, concurrency, errors shown to the user.
   - **F. Modes and reference files (RAG):** mode switch during a live turn, reference upload and indexing, retrieval into a live answer, per-mode isolation, delete cleanup, unsupported or oversized files.
   - **G. Licensing and gating:** offline behavior, expiry during a session, plan checks in main versus renderer, the dev premium override (`NATIVELY_DEV_PREMIUM`, guarded by `isDevPremiumOverrideEnabled()`), and confirm the override cannot be active in a packaged build.
   - **H. Lifecycle and persistence:** startup path and first-run state, crash recovery, orphan child processes after quit, memory and listener growth over a 60-minute session, log growth, secure storage of API keys, settings persistence.
   - **I. Packaging and platform parity:** electron-builder config, ASAR unpack for native modules and helper binaries, per-OS and per-architecture binaries, signing and notarization config, Windows NSIS config, auto-update path, `process.platform` branches with no counterpart on the other OS, Unix-only commands in scripts.
3. **Live-run agent (1, the only agent that drives the app):** run `npm run electron:dev:ultra` and exercise the flows that can run without external keys. Record observed results, console errors, and screenshot paths in the scratchpad. Only this agent drives the app.
4. **Independent reviewer (1):** takes every `reproduced` and `code-confirmed` finding and tries to disprove it. Each finding ends as confirmed, disputed (with counter-evidence), or unverified.
5. **Validation runner (1):** runs the validation commands below from scratch, each on its own.

Consolidate the results yourself. Drop any claim that the reviewer could not confirm.

---

## Phase 1: Flow inventory

Build a table: flow | entry point (file:line) | main path | renderer path | persistence | external dependency | platform-specific code (file:line) | existing test or "none".

---

## Phase 2: Static review by domain

Look for these defect classes in each domain, and list each hit with file:line:

- **Races:** concurrent requests, a stream cancelled while a new one starts, state set after unmount, double start of listening, IPC listeners registered repeatedly and never removed.
- **Leaks:** listeners, timers, intervals, child processes, native handles, and streams created per turn or per session and never released. Unbounded arrays, maps, or logs.
- **Silent failures:** empty `catch` blocks, unawaited promises, UI showing success after a failed save, defaults that hide a missing setting.
- **Timeouts and cancellation:** LLM, STT, search, and network calls with no timeout, or no cancel on stop. A stalled call must not block the next answer.
- **Ordering:** transcript out of order, a late STT result after stop, an old answer finishing after a new one.
- **Stuck states:** a provider error that leaves the UI in a loading state, a half-saved mode, a stale cache entry that never expires.
- **Platform gaps:** a macOS-only branch with no Windows path, or the reverse. Hardcoded `/tmp`, `~/Library`, `.app` paths, Unix-only commands in shared code or scripts, Windows path or drive-letter assumptions, native helpers that exist for one OS only.
- **Packaging:** a module or helper that works in dev but is missing from `files`, `extraResources`, or `asarUnpack`. Paths that depend on the project root and break when packaged. Dev-only code reachable in a packaged build.
- **Security and privacy:** keys or tokens in logs, in plain-text files, in IPC responses the renderer does not need, or in URLs. Transcript or resume content written to logs.
- **Gating:** gates the renderer can bypass, checks that run once at startup and never again, grace periods that never end.
- **Timing constants:** hardcoded delays, debounce values, and silence thresholds tuned for one machine or language. Record each value with file:line.

For each domain, list the existing automated tests and the defect classes they would catch. Note the gaps.

---

## Phase 3: Live run

Run `npm run electron:dev:ultra`. For each flow, record expected, observed, console and error output, screenshot path, and status: **passed**, **failed**, or **not run** (with reason).

Run these where no external credential is needed:

- First launch with no keys and no license: app opens, shows a setup path, no crash or endless spinner
- Every Settings tab in `SETTINGS_NAV_ORDER` (`src/components/SettingsOverlay.tsx`) renders with no console errors
- Each overlay shortcut does what its label says, with no duplicate registration
- Quit through the launcher while idle, then relaunch: clean exit, settings restored
- Quit during a simulated active state: no orphan process left (check the OS process list for the app and its helpers)
- Save each setting, relaunch, confirm it persists
- Invalid API key entered: clear error, key not echoed in UI or logs
- Mode create, rename, activate, delete: persists
- Reference file upload and delete with a text fixture created in the scratchpad: row appears, count updates, delete removes it, persists
- Resume or JD upload with a text fixture: succeeds or shows a clear error
- Start and stop listening with the default device: clear state, no stuck "listening" indicator after stop
- Renderer and main logs after each flow: no uncaught exceptions, no unhandled rejections, no secrets

Not runnable here (state the reason): live STT and LLM answers (no key), real system-audio and screen capture (OS permission prompts), sleep and wake, multi-monitor, fullscreen and Spaces (need hardware), Windows rendering and native dialogs, the packaged app (say whether you ran it).

---

## Phase 4: Validation

Run each command on its own. Record the exact command and exit code. If a command is killed (exit 137) or times out, rerun it alone. Do not report a pass without its summary line.

```bash
npx tsc --noEmit
npx tsc --project electron/tsconfig.premium-check.json --noEmit
npm run build:electron
npm run test:modes:no-build
npm run test:company-research-spend
npm test
```

Also run each package script that covers the flows above, and list them.

---

## Report format

### 1. Summary
- Findings by severity: **P0** (breaks or corrupts a live interview, or loses or leaks data), **P1** (degrades a live interview or a common flow), **P2** (edge case or polish)
- Findings by status: reproduced, code-confirmed, suspected
- Findings by platform: macOS only, Windows only, both, unknown

### 2. Flow table and live-run results
Phase 1 table plus Phase 3 results.

### 3. Findings (P0 first)
```
ID: CX-001
Severity: P0 | P1 | P2
Status: reproduced | code-confirmed | suspected
Domain: A-I
Platform: macOS | Windows | both | unknown (with evidence per platform)
File: path:line
Scenario: step-by-step user action
Expected:
Observed: (output, log line, or screenshot path; or "not run" and why)
Root cause: the code path
Fix direction: one or two sentences, no code
Existing test that would catch it: file or "none"
```

### 4. Candidates ruled out
Each candidate you checked and dismissed, with the reason.

### 5. Platform gaps
Behavior present on one OS and missing on the other, with file:line on each side or "missing."

### 6. Validation run
Each command with exit code, in order run.

### 7. Not verified
Every "not run" item, and any behavior you could not execute on a given OS.

---

## Rules

- Do not modify source files. Write scratch files only in the scratchpad.
- Do not run `git commit`, `git add`, `git stash`, `git checkout`, or `git reset`.
- Do not treat a development run as proof the packaged app works, or a macOS result as proof for Windows.
- An honest "not run" beats a guessed pass.
- Keep the user's in-progress work intact.
