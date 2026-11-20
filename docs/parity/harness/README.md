# Natively parity harness

Run `npm run parity` from the repository root with dependencies installed and Node 22.13 or newer. The harness uses the installed Natively application and the current checkout's Electron bundle and Vite renderer. Windows was exercised with Node 26. macOS launch paths are covered by unit tests and physical execution is pending.

## How a run works

Each run creates `.parity/runs/<UTC timestamp>-<unique suffix>/` and two isolated homes. Electron resolves the packaged profile from its application data directory, so a small Electron probe checks that this directory points into the run before either app starts. The Windows launcher redirects `USERPROFILE` and the app-data environment variables and creates the expected known folders. The macOS launcher provides an isolated `HOME` and `CFFIXED_USER_HOME`. Each app receives its own `--user-data-dir`, and the harness confirms the app's context-log directory before collecting results.

Both profiles start with copies of `license.enc` and `Local State` from the platform's Natively profile. The harness copies those files without opening or logging their contents. The dev launch uses the same build command, Electron arguments and renderer-port environment as `dev:agent`. The run creates its own Vite and debugging ports and leaves existing agent configuration and sessions alone.

The CDP client connects to loopback and verifies that the browser PID is the launched process before attaching to renderer targets. It enables Runtime, Log, Network and Page domains as targets appear. The runner waits for all seven expected windows and records any missing window after the readiness timeout. A missing launcher or failed profile check stops the run. Settings getters run before any screenshot navigation.

Teardown covers errors, SIGINT and SIGTERM. Windows uses the repository's PID-scoped `taskkill /T /F` helper because Node's process signal stops only the Windows root. macOS uses the private process group. The runner checks tracked browser and helper PIDs and that its ports have closed before removing the temporary homes. A cleanup verification failure returns a nonzero exit status and retains the profiles for diagnosis. A forced stop of the Node process or host can prevent teardown.

## Output

- `installed.raw.json` and `local.raw.json` contain scenario results before comparison.
- `installed.normalized.json` and `local.normalized.json` contain the values used for the diff.
- `report.md` lists differences by JSON Pointer, renderer errors, skipped operations and PNG pairs.
- `screenshots/<view>/installed.png` and `local.png` capture the launcher, Modes Manager and every tab in the checkout's `SETTINGS_NAV_ORDER`. The harness advances the welcome flow when it covers the launcher. It verifies the active settings tab before capturing.
- `diagnostics.json` contains window readiness, CDP capture issues, renderer network metadata and process/port cleanup evidence. Network capture omits query strings, URL credentials, headers and bodies.
- `build.log` contains the local Electron build output.

A measured difference is a successful run. A launch, scenario execution or cleanup failure produces a nonzero exit status. The screenshots row compares capture availability. Review the PNGs side by side for visual parity.

## Scenario and normalization rules

Create a module in `scripts/parity/scenarios/` and export a unique `id` and `run(app)` returning JSON-serializable data. Register it in `run.mjs`. Use `app.windows.get('launcher')` or another named window. `page.evaluate(fn, ...args)` serializes the function and its arguments. Evaluation functions execute in the renderer and need to be self-contained. CDP expressions stay in source files.

- API names are compared as sets per window.
- Settings getters use a reviewed allowlist because the preload bridge does not reliably expose parameter counts. The report lists methods omitted due to required arguments, credentials, side effects or unreviewed behavior. Some approved reads depend on host devices, files and remote catalogues. Those results can vary.
- The Modes Manager renders modes in the order returned by `ModesManager.getModes()`. General comes first, followed by creation time with an ID tie-breaker. Seeded modes can share a timestamp, so fresh runs can display different orders. The harness compares mode content by template and name and reports displayed order separately. Note-section order and `sortOrder` are preserved.
- Normalization removes volatile metadata such as timestamps and generated mode and note IDs. It normalizes renderer origins and run-specific paths. Console comparison keeps event type, message and occurrence count. Raw logs retain stacks and timestamps.
- Startup console capture attaches as soon as CDP answers and enables replay through Runtime and Log. An early event that Electron does not retain can escape capture. Main process logs, renderer requests made before Network is enabled, and native behavior are outside the capture scope.

Run the focused tests with `node --test "scripts/parity/tests/*.test.mjs"`.
