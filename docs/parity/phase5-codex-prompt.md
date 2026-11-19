# Phase 5: release validation for Natively 3.2.0 parity (Codex, with ECC agents)

Keep working until every item on the "Done when" list is met. Don't stop to ask permission between steps. Don't report back with only part of the work done.

## Context
- You are on branch `fix/restore-premium-types`. HEAD is `93972a14` ("Restore 3.2.0 renderer behavior (parity phase 4b, full audit)"). Read `AGENTS.md` and `CLAUDE.md` first.
- Phases 1 to 4b restored the 3.2.0 main process and renderer. All eight gate commands pass on HEAD: `npm test` 17,622 passed, `test:intelligence` 3,255, `test:lib` 3,136, `test:components` 954, `test:scripts` 330.
- The `package.json` and `package-lock.json` version has been bumped from 3.1.0 to 3.2.0 and is uncommitted. Keep that change.
- Phase 5 is validation and release readiness. It is **not** a new feature audit.

## The rule
Copy recovered 3.2.0 exactly. Invent nothing and improve nothing.
- If a build or packaging fix would change app behaviour, record it as "unsure" and stop. Don't improvise.

## Source of truth
- `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/reconstructed/readable/dist/assets`, which is the readable copy.
- `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/compiled/app`, which is the compiled 3.2.0 app (`dist/assets`, `dist-electron`, `package.json`).
- `scripts/parity/compare-modules.mjs` and `scripts/parity/compare-renderer-strings.mjs` give leads only.

## Never touch
- **Billing, packs and plans:**
  - `proAccess.ts`, `packProRule`, `packClockWiring`, `PackMeetingClock` and ProEntitlement*
  - the licence and pack code in `electron/ipcHandlers.ts`
  - the answer-length Pro registration in `electron/main.ts`
  - the plans tab and the pack/UnlockProPlans UI
- **Other protected code:**
  - The `forceTrialEnded` dev query.
  - `electron/services/devPremiumOverride.ts` and its call sites. This is a standing rule: keep it.
  - The `pinUserData` isPackaged guard.
  - The calendar OAuth client ID and secret. They stay empty. Never copy secrets out of the recovered bundle.

## Disk space (check first)
The disk is nearly full: about 7 GB free. Before any packaging build, run `df -h` and confirm that **at least 20 GB** is free. If it isn't, stop and report how much space is needed. Never delete anything outside this repo's own build output without asking. Within the repo, you may clear `release/`, the old `dist/` and `$TMPDIR/phonechat-ro-dist-*`.

## Scope

### 1. Packaging config parity
Compare the local configuration with the compiled 3.2.0 `package.json` and the `build` config. Cover:
- electron-builder targets, mac `dmg`/`zip` and win `nsis`
- `files`, `extraResources` and `asarUnpack`
- native modules: better-sqlite3, sharp, @napi-rs/canvas, node-llama-cpp, sqlite-vec and the native audio helpers
- entitlements, hardenedRuntime and notarize settings
- NSIS options
- publish/update artifacts (`latest-mac.yml`, `latest.yml`)
- arch targets: mac arm64 + x64, win x64

Copy the 3.2.0 values. Signing identities and secrets come from env or CI only. Don't commit secrets.

### 2. macOS build
Run `npm run app:build`. Then verify all of the following:
- The `.app` launches from `release/` and reports version 3.2.0.
- The native modules load from `app.asar.unpacked` for both arm64 and x64. Use `file` and `lipo -info` on the `.node` files.
- `npm run verify:packaged-local-assets` passes.
- In the packaged app, the dev override, the CDP port and the dev-only paths are inactive.

### 3. Windows build
This machine is macOS, so don't claim a Windows build.
- Review `scripts/package-app.js` and the win config for anything that only works on Unix (shell commands, `/` paths, chmod, missing `.exe` extensions).
- Add or verify a CI workflow with `windows-latest` that runs the gate and builds the NSIS installer without signing. Mirror the mac job, as CLAUDE.md's "CI expectations" section asks.
- If a Windows-only native helper is missing from the build output, report it. Don't stub it.

### 4. Known risks to resolve or record
- WindowHelper writes `/tmp/natively-overlay-resize-trace.log`. This breaks the CLAUDE.md path rule.
  - If 3.2.0 has the same path, keep it and record it as "matches 3.2.0, violates CLAUDE.md".
  - If it doesn't, copy the 3.2.0 code.
- `App.tsx` has the guide dispatch for `trial_out` and the `!guideActive` guard on the trial modals. Confirm both match 3.2.0 byte-for-byte.
- 17 unimported legacy renderer files remain, including PermissionsOnboardingFull, ModelSelector, SuggestionOverlay and pdfGenerator.
  - Check whether 3.2.0 ships them.
  - If they're dead in both 3.2.0 and here, record "unsure, leave" and don't delete them.

### 5. Final parity inventory
Run both parity scripts. Classify every remaining difference as one of:
- Leave-billing
- Leave-secret
- Leave-dev-override
- Leave-format (minifier noise)
- Unsure

Write the result to `docs/parity/phase5-final-inventory.md`. No difference may be unclassified.

## Use ECC agents (plugin `ecc@ecc`)
| Step | Agent | Job |
| --- | --- | --- |
| Config diff | `code-explorer` (×2: mac config, win config) | Table of local vs 3.2.0 build config with a proposed action |
| Win portability | `silent-failure-hunter` + `code-explorer` | Unix-only commands and paths in `scripts/` and packaging |
| Build fixes | `build-error-resolver` | Fix build/package failures without changing app behaviour |
| CI | `planner` | Design the macos-latest + windows-latest matrix job |
| Inventory | `spec-miner` | Merge the parity-script output into `phase5-final-inventory.md` |
| Final | `code-reviewer` | Check the diff against the rule and the never-touch list |
| Loop | `loop-operator` | Repeat fix → gate → build until green |

If the `code-review-graph` MCP is unavailable, use `rg` and the recovered bundles directly.

## Gate
After your final edit, run all eight gate commands in order, then the macOS package build:
```
npm run build:electron
npm run build
npm run typecheck:electron
npm test
npm run test:intelligence
npm run test:lib
npm run test:components
npm run test:scripts
npm run app:build
```
Only one `npm test` may run at a time. If another tool is running tests, wait for it to finish, because concurrent runs overwrite `dist-electron`.

## Don't commit
Leave everything staged. Files under `docs/parity` are gitignored, so stage them with `git add -f`.

## Done when
- [ ] Packaging config matches 3.2.0, or every deviation is classified
- [ ] `npm run app:build` succeeds, and the packaged `.app` launches and reports 3.2.0
- [ ] Native modules have been checked for arm64 + x64 in the packaged output
- [ ] Windows packaging has been reviewed, a CI job for windows-latest exists, and nothing Unix-only is left in the shared scripts
- [ ] The four known risks are each resolved or recorded
- [ ] `phase5-final-inventory.md` has no unclassified difference
- [ ] All eight gate commands and `app:build` pass after the last edit (report the counts)
- [ ] `code-reviewer` found no violation of the rule or the never-touch list

## Report
Include:
- the files changed
- the config differences and what you did with each
- the build output paths and sizes
- the native-module arch check
- the Windows findings
- the CI job
- the final inventory summary
- the Unsure items
- which ECC agents ran
- the gate counts

Use the CLAUDE.md categories exactly as written:
- `Build validated on macOS`
- `Reviewed but not executed on Windows`
- `Requires physical macOS verification`
- `Requires physical Windows verification`

Never write "cross-platform verified".
