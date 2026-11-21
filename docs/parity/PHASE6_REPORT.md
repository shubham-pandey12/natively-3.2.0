# Phase 6 upstream update automation

## Change summary

The work is on `update/automation`, created from `update/parity-3c` at `81a77975`. The branch baseline, installed Windows app and latest fetched upstream release are all v3.2.1. The live ASAR hash matches the existing release manifest. The baseline uses the installed ASAR package version and the timestamp from the local archive manifest.

| File | Purpose |
| --- | --- |
| `scripts/update/check.mjs` | Fetches upstream tags into `refs/upstream/`, reads the installed ASAR package manifest, prints JSON on stdout and a human summary on stderr, and appends one log record. Exits 0 for current, 10 for an available update and 1 for errors. Use `--prerelease` to include prerelease tags. |
| `scripts/update/prepare.mjs` | Creates the release branch, merges up to the commit boundary, restores and verifies the fork's premium tree, writes conflict and premium review documents, runs the release checks, and commits on the release branch only after all checks pass. |
| `scripts/update/archive.mjs` | Creates or validates the release archive, checks the packaged Electron version and architecture, and verifies the source and destination hashes for the three native binaries. |
| `scripts/update/common.mjs` | Shares path resolution, Git and npm invocation, ASAR access, hashing and SemVer ordering. It uses the JavaScript dependencies already installed by the repository lockfile. |
| `scripts/update/schedule.mjs` | Plans, queries, registers or removes a daily notification-only check at 10:00 local time. Use `install --dry-run` to print the executable and argument array. |
| `scripts/update/tests/update.test.mjs` | Exercises both platform branches, SemVer ordering, check exit codes, premium restoration with a real Git fixture, and the parity gate. |
| `docs/parity/BASELINE.json` | Records the v3.2.1 upstream tag, installed package version, ASAR hash and baseline timestamp. |
| `.claude/skills/update-upstream/SKILL.md` | Documents the approval, release review, premium port and parity workflow for Claude Code. The repository ignores `.claude` by default, so this file was explicitly marked for addition. |
| `scripts/parity/launch.mjs` | Accepts an installed executable override so preparation can run parity against the same app it archived. |
| `package.json` | Adds `update:check`, `update:prepare` and `update:schedule`. |

Preparation hashes the existing native files before dependency installation and applies the verified replacements afterward, since npm can replace directories under `node_modules`. The previously tracked Windows binding can be staged. The macOS bindings follow the repository's existing ignore rules. The prior release archive is verified against its local manifest so the reference archive can come from the same OS as the new one.

## Cross-platform analysis

- Windows uses the existing `Program Files` install layout, the x64 MSVC binding, Task Scheduler and best-effort `msg.exe` notification for the current user. The npm adapter resolves the JavaScript entry behind `npm.cmd` so the launcher can use an argument array without a shell.
- macOS uses the `Natively.app` bundle layout, selects the arm64 or x64 binding, registers a user LaunchAgent and uses `osascript` for notification. The LaunchAgent receives the installing session's PATH so it can find Git. Both platforms accept an override for the app location through `NATIVELY_INSTALLED_PATH` or `--installed-path` on check and prepare.
- Reviewed the existing Windows and macOS install paths and launcher isolation in `scripts/parity/launch.mjs`, the packaging and ASAR configuration, and the premium/style diff entry points. The shared impact is limited to maintainer scripts and the optional installed executable override in parity. The repository's code-review-graph tools were unavailable, so review used repository source and Git.

## Validation

| Category | Result |
| --- | --- |
| Tested physically on Windows | Live Git fetch and installed ASAR read, release check log, prepare dry run, Task Scheduler status and install command dry run. The live parity harness matched all eight scenarios and cleaned up its processes and ports. It accepted 24 configured differences under `settings-defaults`. |
| Covered by automated Windows branch tests | Installed paths with spaces, overrides, x64 binding, scheduler arguments and notification command. |
| Covered by automated macOS branch tests | Bundle and ASAR paths, x64 and arm64 bindings, plist path, XML escaping, launchctl arguments and notification command. |
| Build validated on Windows | The live parity run built Electron development output and started Vite. Renderer, Electron and premium type checks also passed. |
| Reviewed but not executed on macOS | The LaunchAgent, packaged app paths, runtime probe and archive handling were reviewed and exercised where possible through injected platform tests. |
| Requires physical macOS verification | LaunchAgent registration and firing at 10:00, delivery of the desktop notification, and a real update with the signed app bundle. Verify packaged native loading for each supported architecture. |
| Requires physical Windows verification | Task registration and actual notification delivery, and a real preparation through runtime verification, binary copy and packaged native module loading on the next release. |

## Commands executed

| Command | Result |
| --- | --- |
| `node scripts/update/check.mjs` | Exit 0. See JSON below. The run appended to `C:\Users\dell\natively-releases\update-check.log`. |
| `node scripts/update/prepare.mjs --dry-run 3.2.1` | Exit 0. See full plan below. |
| `node scripts/update/schedule.mjs status` | Exit 0. Daily Natively update check is not registered. |
| `node scripts/update/schedule.mjs install --dry-run` | Exit 0. Printed the exact Windows command arguments shown below. |
| `node --test 'scripts/parity/tests/*.test.mjs'` | 22 passed. |
| `node --test 'scripts/update/tests/*.test.mjs' 'scripts/parity/tests/*.test.mjs'` | 30 passed. An earlier run exposed a Windows Git line-ending assumption in the fixture. Setting its test repository's `core.autocrlf` made the fixture deterministic. |
| `npm.cmd run typecheck:ts7` | Exit 0. Renderer type check. |
| `npm.cmd run typecheck:electron` | Exit 0. Electron type check. |
| `npm.cmd run typecheck:premium` | Exit 0. Premium type check. |
| `npm.cmd run parity` | Exit 0. Eight MATCH rows with zero unexpected differences. Output is in `.parity/runs/2026-11-21T03-11-37.748Z-QgSzxG/report.md`. |
| `git diff --check` | Passed. |

The standalone read-only Electron guard was also exercised against the live Windows installation. Its disabled RunAsNode fuse prevented the runtime version probe, as expected. A separate ASAR member read found all three binaries in the existing Windows archive.

### Check output

```json
{"upToDate":true,"latestUpstream":"v3.2.1","ourBaseline":"v3.2.1","installedVersion":"3.2.1","actions":[]}
```

```text
The branch baseline (v3.2.1) is current. Installed app: 3.2.1.
```

### Prepare dry-run output

```text
Dry run for v3.2.1
1. Require a clean working tree and create update/upstream-3.2.1 from HEAD.
2. Archive C:\Program Files\audiodg\Natively into C:\Users\dell\natively-releases\3.2.1, or reuse the matching archive.
3. Merge refs/upstream/v3.2.1 without committing. Restore premium/ from HEAD and report conflicts.
4. Verify the packaged Electron runtime matches the Electron devDependency. Record native binary hashes.
5. Run npm install --ignore-scripts if package-lock.json changed, then copy and verify the three native binaries.
6. Compare archived premium bundles and Modes Manager styles against the previous baseline archive.
7. Run type checks, unit tests and parity. Require every parity scenario to be MATCH after expected differences.
8. Write the update report and baseline, then commit on the update branch.
Existing branch update/upstream-3.2.1 would prevent creating a new branch.
```

### Scheduler dry-run output

```json
{
  "commands": [
    [
      "schtasks.exe",
      [
        "/Create",
        "/TN",
        "Natively Update Check",
        "/TR",
        "\"C:\\Program Files\\nodejs\\node.exe\" \"C:\\Users\\dell\\Desktop\\shubham\\natively-3.2.0\\scripts\\update\\check.mjs\" --notify",
        "/SC",
        "DAILY",
        "/ST",
        "10:00",
        "/IT",
        "/F"
      ]
    ]
  ]
}
```

## Remaining verification

- The current Windows package disables RunAsNode. If the next release has the same fuse configuration, preparation will stop at the Electron guard before copying binaries. A trusted way to obtain `process.versions.electron` from a hardened package would be needed to continue those releases automatically.
- The new-release archive, native copy, dependency installation, premium audit and final release commit were exercised only where individual read-only checks or fixtures applied. The first new release will also establish whether its production renderer still exposes the Modes Manager style marker used by the existing scanner.
- v3.2.1 was used only for the dry run. The pre-existing `update/upstream-3.2.1` branch remains at `28482b4c`. No upstream merge, push or schedule registration was performed.

## Review and fixes (Claude)

Two bugs would have stopped every real update. Both are fixed and covered by tests.

1. **The Modes Manager styles were looked for in the wrong renderer file.** `renderer()` only scanned `index-*.js`, but the 3.2.1 styles live in `App-DKzvT9XD.js`. Preparation would have thrown "Could not uniquely locate the Modes Manager styles". It now scans every `.js` asset. I verified this by running `premiumReport` against the archived 3.2.1 bundle compared with itself: 72 of 72 modules identical, 0 style changes.
2. **An upstream premium submodule bump was reported as a merge conflict.** With `premium/` as a directory here, git moves upstream's gitlink to `premium~<commit>` and exits non-zero. Conflicts were listed before the restore, so they included that entry, and the merge error was always rethrown. Now:
   - conflicts are listed after `premium/` is restored;
   - `premium~*` leftovers are removed;
   - the merge error is dropped only when `MERGE_HEAD` exists and no conflicts remain.

   A new real-git test covers a premium-only bump: the merge commits cleanly and `premium` stays a tree.

Additional tests cover listing conflicts after the restore, the premium-only clean merge, and keeping the merge error when no merge is in progress.

### Validation (Claude)
- `node --test scripts/update/tests/`: 11 passed, 0 failed.
- `node --test scripts/parity/tests/`: 22 passed, 0 failed.
- `npm run typecheck:electron`: passed.
- `check.mjs`: exit 0, with upstream, baseline and installed app all at v3.2.1.
- `prepare.mjs 3.2.1 --dry-run`: exit 0.
- `schedule.mjs status`: not registered.

### Platform status
- Tested physically on Windows: check, dry run, schedule status, the premium report step and the tests.
- Covered by automated macOS branch tests: paths, launchd plan and notification command.
- Requires physical macOS verification: launchd install, `osascript` notification, archive and preparation on a real Mac.
- The Windows scheduled task is not installed yet. That waits for the user's approval.
