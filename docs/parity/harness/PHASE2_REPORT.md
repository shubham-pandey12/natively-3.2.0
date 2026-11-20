# Phase 2 parity harness report

Implemented on `parity/harness` from `fix/restore-premium-types`. The harness compares installed Natively 3.2.1 with the local dev build. Product source and the installed and archived application files were left alone. The branch was kept local.

## Implementation commits

```text
097f3e5c Ignore volatile timestamps and diagnostic durations
1c434e2b Document and test parity harness behavior
805a0349 Add isolated installed versus dev parity harness
```

## Files added or changed

- `.gitignore`, `package.json`, `vite.config.mts` add `.parity` exclusions and the npm entry point.
- `scripts/parity/{run,launch,cdp,normalize,compare}.mjs` add orchestration, platform-specific isolation and teardown, renderer capture, normalization and reporting.
- `scripts/parity/scenarios/{api-surface,licence,modes,settings-defaults,console-errors,screenshots}.mjs` implement the six scenarios.
- `scripts/parity/tests/{compare,launch,normalize}.test.mjs` cover comparison, normalization and injected Windows and macOS paths.
- `docs/parity/harness/{README,PHASE2_REPORT}.md` document the workflow and validation.

The launcher reuses the existing `dev:agent` argument builder and Windows process-tree teardown plan. Directory redirection and the CDP preflight are specific to the harness. The Vite watcher exclusion is the only shared runtime configuration change.

## Validation commands and output

Node 26.13.1 and npm 11.20.0 ran on Windows. The repository's equivalent renderer and Electron typechecks passed.

```text
> npm run typecheck:ts7
> node node_modules/typescript7/lib/tsc.js -p tsconfig.json --noEmit
> npm run typecheck:electron
> node node_modules/typescript7/lib/tsc.js -p electron/tsconfig.json --noEmit
renderer=0 electron=0
```

```text
> node --test "scripts/parity/tests/*.test.mjs"
ℹ tests 11
ℹ suites 0
ℹ pass 11
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

```text
> & ./node_modules/.bin/oxlint.cmd scripts/parity/run.mjs scripts/parity/launch.mjs scripts/parity/cdp.mjs scripts/parity/normalize.mjs scripts/parity/compare.mjs scripts/parity/scenarios scripts/parity/tests vite.config.mts
node:test=0 oxlint=0

> git diff --check
```

The changed-file lint completed without diagnostics. An earlier directory-wide sweep reported an existing warning in `compare-modules.mjs`. The scoped command above covers the changed JS and TypeScript files.

### Consecutive Windows runs

```text
> npm run parity
[parity] installed PID 31520, CDP 53947
[parity] local PID 23912, CDP 53948
[parity] Cleanup verified: PIDs [29224, 31548, 6380, 27752, 31520, 26800, 33668, 10304, 26752, 20988, 13696, 1748, 29656, 1488, 23912, 9480, 30768, 26940, 28028, 25196, 16912, 16584, 23284, 5804] exited; ports [53921, 53947, 53948] closed
[parity] Report: .parity\runs\2026-11-20T14-03-36.490Z-VDh1l7\report.md

> npm run parity
[parity] installed PID 33768, CDP 56000
[parity] local PID 30572, CDP 56001
[parity] Cleanup verified: PIDs [29116, 31896, 14072, 22196, 33768, 23188, 18072, 2124, 25644, 30280, 10480, 4828, 24848, 2452, 30572, 25732, 21048, 31572, 30644, 20488, 17696, 29336, 2560, 7692] exited; ports [55954, 56000, 56001] closed
[parity] Report: .parity\runs\2026-11-20T14-04-34.888Z-tyaS5M\report.md
parity run 1=0; parity run 2=0
```

The Windows process query compared against the pre-run process IDs. There was no `Natively.exe` and zero newly running `electron.exe` processes.

```text
> Get-CimInstance Win32_Process -Filter "Name = 'Natively.exe' OR Name = 'electron.exe'"

ProcessId ParentProcessId Name         PreExisting
--------- --------------- ----         -----------
     2276           20752 electron.exe        True
     2804           20752 electron.exe        True
    16008           20752 electron.exe        True
    17080           20752 electron.exe        True
    17860           20752 electron.exe        True
    20752           24084 electron.exe        True
    21116           20752 electron.exe        True
    21876           20752 electron.exe        True
    32028           20752 electron.exe        True
    32952           20752 electron.exe        True
```

## Second-run results

| Scenario | Result | Differences |
| --- | --- | ---: |
| api-surface | DIFF | 63 |
| licence | MATCH | 0 |
| modes | DIFF | 7 |
| settings-defaults | DIFF | 47 |
| screenshots | MATCH | 0 |
| console-errors | MATCH | 0 |

Both apps confirmed isolated profiles and exposed all seven expected renderer windows. Both reported a premium Dodo lifetime licence and no trial token. All seven modes differences were in displayed order. Mode content, active mode and note sections matched. The run captured 15 PNG pairs and zero renderer console errors or uncaught exceptions. Settings-defaults skipped 14 installed getters and 11 local getters. The [second-run report](../../../.parity/runs/2026-11-20T14-04-34.888Z-tyaS5M/report.md) lists the reasons and the installed and local values for each differing path.

## Isolation incident during development

Preliminary Windows runs exposed a packaged-app override of `--user-data-dir`. Those installed launches used the real profile. I stopped the repeat attempt once I identified the override. I did not determine which writes the app's normal startup performed in that profile. I removed the invalid generated reports, screenshots and raw artifacts, and removed the copied licence files from the interrupted run. Those attempts were excluded from validation. The final harness checks Electron's isolated `appData` before launch and the running app's context-log directory before running scenarios. Both checks passed in the consecutive validation runs above.

## Platform coverage and limits

- **Tested physically on Windows** for profile isolation, both app launches, the six renderer scenarios and normal teardown.
- **Build validated on Windows** for the local Electron bundle used in these runs. The build emitted warnings about missing Google and Microsoft calendar credentials. Live calendar connections were outside the scenarios.
- **Covered by automated Windows branch tests** for the Windows installation path and isolated profile layout.
- **Covered by automated macOS branch tests** for the application bundle path and isolated Application Support layout.
- **Reviewed but not executed on macOS**. **Requires physical macOS verification** for Electron's home redirection, licence loading, process-group teardown and renderer capture.
- The harness handles SIGINT and SIGTERM. Physical Ctrl+C delivery was outside the validation runs. The renderer capture can miss events emitted before CDP enables a domain. Main-process and native behavior were outside scope.
- The screenshots result measures whether each capture succeeded. The PNGs are for visual comparison. Host device and remote catalogue results may vary. Seeded mode order can change between runs because the product breaks timestamp ties with generated IDs.
- The repository's code-review graph tools were unavailable in this session. I reviewed the relevant source paths directly.

## Review and fixes (Claude, after Codex's runs)

Verified: launcher isolation (APPDATA redirect, pre-launch probe, in-app profile check), PID-tracked teardown, 11/11 original tests, two consecutive `npm run parity` runs exiting 0 with no harness process left. The real profile's recent writes (20:11 onward) all postdate the last harness run (19:35) and match normal use; `license.enc` and `settings.json` are intact.

Fixed:
- **Mode order** was compared exactly, but it is random on every launch in both apps (11 runs: a different order each time, General always first). Now the first mode is compared exactly and the rest as a set.
- **`.env` leaked into the local app.** `main.ts` loads `.env` when unpackaged, so the local app saw provider keys the installed app never does (an embedding provider showed as available). The harness now blanks every `.env` key for the local launch; dotenv never overrides a set variable. Key names only are read.
- **Installed-vs-dev noise** (`canAutoUpdate`, "Found …" vs "Dev mode: … skipped" wording) is listed separately as *expected*, each with its reason (`EXPECTED_DIFFERENCES` in `compare.mjs`). The rules are narrow: the same checks' `ok`/`health` flags, and any "Missing …" message, still count as differences.
- **Local setup, outside the repo:** the offline embedding (`multilingual-e5-small`), reranker (`ms-marco-MiniLM-L-6-v2`) and end-of-turn (`smart-turn-v3`) models had never been downloaded; `node scripts/download-models.js` fetched them with SHA-256 checks.

Result after fixes: licence, modes, screenshots and console errors MATCH. The remaining 64 differences are all 3.2.1 additions present in upstream's public v3.2.1 source (9 preload functions × 7 windows, plus `getLastConnectionNotice`), so Phase 3's merge is what closes them. 15/15 harness tests pass; oxlint is clean on the harness.
