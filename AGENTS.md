# Natively Engineering Standards

Natively is a production Electron application supporting macOS and Windows. The host OS is an execution environment, not the product scope. These standards apply to implementation, bug fixes, refactors, dependencies, configuration, builds and architecture decisions.

## Sources of truth and investigation

- Read applicable instructions and understand the existing implementation before editing. Use [system overview](docs/engineering/system-overview.md) and [architecture map](docs/engineering/architecture-map.md) for navigation; verify their claims against current executable source. Never invent missing details or treat comments, filenames or old reports as proof.
- Consult [CONTRIBUTING.md](CONTRIBUTING.md) for contribution conventions and current package manifests/configuration for supported tooling and commands. If guidance conflicts, identify it explicitly; use this file for repository engineering workflow where it conflicts with duplicate legacy guidance in `CLAUDE.md`. Do not silently weaken platform, safety or validation requirements.
- Trace each affected execution flow from entry point through callers, IPC, services, native/worker/provider boundaries, state updates, persistence and cleanup, as applicable. Identify dependencies, side effects, consumers, shared contracts and failure paths.
- Before editing, list the affected source, callers, tests, fixtures, types, exports and configuration. Distinguish confirmed implementation, inferred behavior and unknown/unverified behavior. Resolve material unknowns before relying on them.

## Graph-first code discovery

Use `code-review-graph` before direct code searches or broad filesystem exploration:

1. Locate implementations with `semantic_search_nodes` or `query_graph`; use `get_architecture_overview` / `list_communities` for architecture.
2. Inspect callers, callees, imports and tests with `query_graph` (`callers_of`, `callees_of`, `imports_of`, `tests_for`).
3. Run `get_impact_radius` and `get_affected_flows`; locate both platform implementations and affected contracts.
4. Read the relevant source regions to verify graph findings.
5. After editing, run `detect_changes` and inspect `get_review_context`; repeat impact/flow analysis if implementation changed materially.

If tools are unavailable, the graph lacks coverage or exact source details are needed, state the limitation and use targeted source searches/reads and manual caller tracing. Never claim graph analysis ran when it did not. Stale graph output cannot override current source.

## Bug fixing and TDD

- Reproduce the bug before fixing it. Record the trigger, environment, expected/actual behavior and evidence; trace the actual root cause and related failure scenarios. Avoid symptom-only fixes.
- Follow RED → GREEN for bug fixes: add a focused regression test, run it and observe failure for the intended defect, then apply the smallest root-cause fix and rerun the same test successfully. Broken setup, missing dependencies and unrelated failures do not count as RED.
- Prefer tests exercising real production behavior over copied implementations or source-text assertions alone. Use controlled clocks, promises, fake providers and injectable platform inputs where needed to reproduce races deterministically.
- Cover relevant boundaries, empty/invalid input, duplicates, concurrency, cancellation, failures, retries and cleanup. Run relevant existing unit/integration tests and verify the affected application flow.
- If reproduction requires unavailable hardware/services, document the blocker and build a faithful failing reproducer where possible. Do not make a speculative fix or claim a bug resolved without reproduction/regression evidence; report unresolved verification explicitly.

## Live interview reliability

Read the relevant [audio](docs/engineering/audio-pipeline.md), [transcription](docs/engineering/transcription-pipeline.md), [answers](docs/engineering/answer-generation.md), [session](docs/engineering/session-lifecycle.md) and [IPC](docs/engineering/ipc-architecture.md) flows before changing them.

- Give special attention to audio capture/devices, transcription accuracy, question detection, context management, AI orchestration, answer generation, streaming/latency, IPC, session lifecycle, cancellation/recovery and UI synchronization.
- Preserve capture sample-rate/channel/role contracts, partial/final ordering and deduplication, bounded buffers/backpressure, selected versus effective provider identity and local-only/privacy policies. Investigate hotplug, silence, permission loss, provider outage and reconfiguration during start/stop.
- Keep request/session ownership explicit across asynchronous work. Preserve generation IDs, cancellation signals, mode/context snapshots and source/evidence provenance; stale callbacks must not update a replacement session or stream.
- Distinguish accepted start, capture readiness, stopped UI, completed native/STT drain and durable save. Await required teardown before replacement, bound waits/retries and surface degraded or incomplete outcomes.
- Preserve stream correlation, completion/error semantics and evidence/history policy across affected surfaces. Do not concatenate a replacement provider's answer after content has committed or store cancelled/truncated output as a valid completed answer.
- Keep renderer and main state synchronized through defined contracts, including initial hydration and terminal states. Assess latency and main-thread work; substantiate performance claims with measurements.

## Minimal changes and resource safety

- Prefer minimal, focused changes and existing helpers/dependencies/conventions. Avoid unrelated refactoring, duplicate features, speculative abstractions or dependency additions. Preserve error handling, validation, accessibility and calibration requirements.
- Handle every asynchronous failure intentionally. Clean up listeners, timers, streams, sockets, workers, child processes and native handles on success, error, cancellation, reconfiguration and shutdown. Prevent races, unhandled rejections and memory/resource leaks.
- Validate IPC payloads, sender authorization, paths and external destinations at runtime; TypeScript signatures and a curated preload bridge are not authorization. Preserve credential/privacy boundaries; never expose secrets in logs or overwrite unreadable/ambiguous persisted data to hide an error.
- Update affected callers, tests, fixtures, exports and documentation together. Follow nearby TypeScript/React conventions and end files with a newline.

## Cross-platform contract

- Investigate macOS and Windows before changing platform-sensitive behavior: windows/focus/overlays, click-through/topmost, Spaces/desktops, Dock/taskbar/tray, shortcuts/clipboard, capture/devices, permissions/storage, processes/paths, IPC/lifecycle, deep links, updates, installers and signing.
- Search for `process.platform`, `darwin`, `win32`, `isMac`, `isMacOS`, `isWindows`, adapters, native helpers and platform tests/build scripts. Review the corresponding implementation, callers and packaged paths on both systems before changing a shared contract.
- Keep shared business logic platform-independent and OS integration behind existing explicit interfaces/adapters. Avoid scattered platform checks or duplicating entire features. Handle unsupported capabilities explicitly; never silently route them through another OS implementation. An intentionally platform-only feature must retain a clear capability/error path elsewhere.
- Preserve the unexecuted platform's implementation. Update both supported implementations when a shared contract changes and add tests against contract drift. Inject platform inputs where practical; exercise `darwin` and `win32` explicitly without mutating `process.platform`.
- Use Node path/os APIs, Electron `app.getPath()` and `process.resourcesPath`; no hardcoded OS paths or manual path concatenation in shared code. Account for spaces, Unicode, separators, case, drive letters, long paths, Windows locks and ASAR/development differences.
- Shared scripts/runtime must not require Unix shells/tools or PowerShell/cmd syntax. Prefer Node APIs and argument-array process execution without shell interpolation. Unavoidable OS commands need explicit platform handling, safe arguments and paths-with-spaces tests. Unix signals alone are insufficient for Windows process-tree shutdown.
- Treat Electron window APIs as platform-sensitive: macOS levels/Spaces/NSPanel behavior do not establish Windows behavior. Use `CommandOrControl` for equivalent shortcuts; explicit modifiers only for intentional platform differences.
- Trace both complete audio pipelines, native helpers, device/permission handling, cleanup, reconnection and packaged resources. Keep macOS TCC/Keychain/entitlements and Windows privacy/DPAPI or Credential Manager/installer requirements distinct; show platform-appropriate remedies.

## Validation, dependencies and release

- Define expected behavior and a validation strategy for each affected OS. For code changes run relevant typechecks, configured lint/static analysis, unit/integration tests and actual app checks where practical. Report unavailable checks; documentation-only changes need focused content/link/diff checks rather than an artificial TDD cycle.
- Resolve commands from current `package.json` and [testing infrastructure](docs/engineering/testing-infrastructure.md). Existing entry points include `typecheck:ts7`, `typecheck:electron`, `test`, `test:intelligence`, `test:lib`, `test:components` and `test:scripts`. Respect build prerequisites and Electron ABI requirements. Do not invent a `lint` script or treat advisory analysis as an enforcing gate.
- Before adding/replacing/upgrading dependencies or native helpers, check both OSes, CPU architectures, Electron ABI/rebuild requirements, optional platform packages, install scripts, runtime compatibility, startup/shutdown/crash handling and update compatibility. Prefer an existing dependency that solves the task.
- For build/packaging changes inspect macOS and Windows targets, included files/resources, ASAR unpacking, helper binaries, icons, entitlements, signing/notarization, NSIS, architecture targets, environment, publish/update artifacts and CI. Validate actual packaged layouts/builds where practical; development success is not packaging proof.
- Prefer CI coverage on `macos-latest` and `windows-latest` for shared behavior. Platform-specific signing/hardware jobs may differ when documented. Inspect actual step outcomes: a green job with advisory failures is not proof its tests passed. Never mute a failing check to claim success.
- When physical verification is unavailable, preserve behavior, review both branches, add executable branch tests where possible and state the outstanding physical verification. Distinguish simulated branches, source review, build checks and real execution. Do not claim native or cross-platform success beyond that evidence.

## Agent renderer testing via CDP

Use agent-browser over CDP, not computer use, for renderer testing. Before first use in a session:

```text
agent-browser skills get core
agent-browser skills get electron
npm run dev:agent
```

- Use one isolated instance per worktree. The Node launcher must work on both OSes; only when `!app.isPackaged`, use separate renderer/CDP ports (never 9222/9229 for CDP), worktree-local userData, bypass the single-instance lock and write gitignored `agent-browser.json` with `cdp` and worktree `session`. Obtain the session with `agent-browser session id --scope worktree --prefix natively` (launcher fallback must remain isolated).
- From the worktree root, use `agent-browser tab`, switch by ID/label (for example `agent-browser tab t2`, not integer position), then `snapshot -i`, `console`, `errors` and `network requests`. Re-snapshot after every UI change; old refs are stale.
- Confirm `location.search` with `agent-browser eval "location.search"`. Windows share an entry with `?window=`. `?window=settings` is the quick-toggle SettingsPopup; full settings live in the launcher. Select the launcher target, then use `agent-browser eval "window.electronAPI.openSettingsTab('ai-providers')"`; read current `SETTINGS_NAV_ORDER` in `src/components/SettingsOverlay.tsx` for other tabs.
- Never use `--auto-connect`, `agent-browser close` or enable debugging ports in packaged builds. Stop the app through its launcher. After exit, a stale `agent-browser.json`/failed CDP discovery can mean the app is gone.
- CDP proves renderer DOM/console/network behavior only. Main-process IPC execution, native capture, shortcuts, window levels, click-through and permissions still require appropriate integration and physical OS verification.

## Multi-agent development and ECC

- Use parallel specialized agents for independent investigations when useful. Assign bounded questions and require source/test evidence, uncertainty and affected-flow reports. Apply relevant ECC skills using this repository's actual conventions and task scope.
- Give each changed file one owner; do not let agents edit the same files concurrently. Consolidate findings, reconcile conflicts and agree on root cause/implementation scope before production edits. The lead reviews integration and final validation; agent assertions alone are not proof.

## Completion report and stop conditions

Every task must report, concisely and with evidence:

- Investigation performed and affected flows/dependencies/side effects.
- Root cause or implementation rationale, including unresolved uncertainty.
- Files changed, behavior changed and shared/platform-specific modules affected.
- Tests added/updated (or none, with rationale), exact important commands executed and actual results, including failures/skips. For bug fixes include RED/GREEN evidence.
- Expected macOS/Windows behavior, implementations reviewed, validation scope, remaining risks and untested scenarios.

Use these exact validation labels when applicable:

- `Tested physically on macOS` / `Tested physically on Windows`
- `Covered by automated macOS branch tests` / `Covered by automated Windows branch tests`
- `Build validated on macOS` / `Build validated on Windows`
- `Reviewed but not executed on macOS` / `Reviewed but not executed on Windows`
- `Requires physical macOS verification` / `Requires physical Windows verification`

Never claim success without evidence. Do not declare a bug fixed without its reproducer/regression result, supported platform behavior complete when one branch is broken/unreviewed, or a shared contract complete with unchecked consumers. Report blocked or partial work explicitly; unavailable hardware does not justify speculative rewrites or invented verification. Preserve existing controls and report any remaining release validation.
