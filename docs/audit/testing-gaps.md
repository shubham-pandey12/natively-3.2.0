# Testing gaps

Representative inspected tests include source assertions, fake-clock/provider behavior and real SQLite with stub embeddings. Fixed sleeps in browser specs are a flake risk. No repeat-run flake rate was measured. Local inference WAVs and long-session scripts exist. Verify what each suite actually runs before assigning coverage. [Browser smoke](../../tests/e2e/basic-smoke.spec.ts#L40), [SQLite fixture](../../electron/rag/__tests__/FolderScopedSearch2026_10_15.test.mjs#L37), [long-session script](../../package.json#L56).

See the [audit scope and validation](executive-summary.md). Shared TypeScript findings apply to the inspected path on either OS. Native behavior is identified per backend where relevant. Physical execution is unverified.

## AUD-TST-001 — Default browser smoke configuration does not establish Electron IPC

- **Severity / confidence** — Medium / Confirmed.
- **Source and functions** — [Playwright webServer and project](../../playwright.config.ts#L13), [Vite server](../../vite.config.mts#L50), [basic-smoke IPC check](../../tests/e2e/basic-smoke.spec.ts#L58), [parity spec](../../tests/e2e/parity-gaps-evidence.spec.ts#L28).
- **Implementation evidence** — Default Playwright readiness expects port 5173 while Vite config specifies 5180. The browser fixture visits HTTP and the smoke IPC check tests property presence without making the ping invocation. The basic suite skips in CI or without an explicit port.
- **Root cause** — Launcher, port and preload verification are separate contracts that this configuration does not reconcile.
- **Interview example** — A regression breaks the preload’s request/response path before an interview.
- **User impact** — A skipped or browser-only smoke cannot catch the broken IPC path. Wrong-port timeout is possible on a clean host.
- **Reproduction** — Source-derived. Run against a clean port namespace with installed Playwright. Record readiness target, test skip counts and whether the renderer has a real preload. Actual launch unverified.
- **Existing test coverage** — The named ping test checks presence only. Other specialized Electron suites exist, so this finding applies to this smoke configuration.
- **Recommended fix** — Use one port contract and isolated Electron harness. Assert an actual correlated invoke and event round trip. Check that required tests execute in CI.

## AUD-TST-002 — Broad Windows Electron failures can leave the CI job green

- **Severity / confidence** — High / Confirmed.
- **Source and functions** — [Build Smoke Electron unit step](../../.github/workflows/build-smoke.yml#L298), [npm test scope](../../package.json#L37).
- **Implementation evidence** — The Windows leg sets continue-on-error for the broad suite. Separate checks enforce other selected suites and build steps.
- **Root cause** — CI policy makes this particular suite advisory on Windows.
- **Interview example** — A WASAPI recovery regression ships after the relevant Electron suite fails on Windows.
- **User impact** — Reviewers can miss a platform regression if they use job status alone.
- **Reproduction** — Source-derived. Inspect the matrix expression and simulate a failing suite step on Windows in an authorized CI branch later. No CI job run was inspected or triggered.
- **Existing test coverage** — Source workflow proves advisory policy. [Build smoke fork safety](../../scripts/__tests__/build-smoke-fork-safety.test.mjs) focuses on scope and credentials, not this policy.
- **Recommended fix** — Add a focused enforcing Windows live-interview regression lane first. Track remaining broad-suite failures explicitly before making that suite enforcing.

## AUD-TST-003 — Integrated dual-channel fault replay and native soak coverage was not established

- **Severity / confidence** — High / Unknown.
- **Source and functions** — [Audio wiring](../../electron/main.ts#L4819), [session stop](../../electron/main.ts#L8287), [CI suite entries](../../package.json#L37).
- **Implementation evidence** — Repository has real WAV fixtures for local models, fake provider and replay tests, and long-session mode benchmarks. The inspected runner paths do not establish one test combining OS capture, two channels, provider failure, session restart and visible answer timing.
- **Root cause** — Unknown whether an equivalent external harness exists. Evidence is fragmented across layers.
- **Interview example** — One hour into a call, a disconnect and restart overlap a delayed final while a new answer renders.
- **User impact** — Layer tests can pass while actual user flow loses the question or leaks a resource.
- **Reproduction** — Proposed. Replay consent-safe labeled audio with hotplug, noise, silence, late partial/final and delayed transport events. Compare transcript spans, answer IDs and cleanup after repeated sessions.
- **Existing test coverage** — [SttGapRecovery](../../electron/audio/__tests__/SttGapRecovery2026_10_15.test.mjs) uses fake audio/providers. [ModeLongSession](../../electron/services/__tests__/ModeLongSession.test.mjs) covers mode behavior. Existing WAV files do not prove OS playback/capture soak.
- **Recommended fix** — Compose existing fixtures and fault injection into a bounded end-to-end harness, plus a physical macOS/Windows soak checklist.
