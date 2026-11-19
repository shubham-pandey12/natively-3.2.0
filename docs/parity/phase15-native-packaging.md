# Phase 15: Native and packaging parity (F091–F096, F105)

Reference: installed `/Applications/Natively.app` (3.2.0; `/Applications/New Natively.app` is 3.1.0 and was not used) and the extracted `ref-3.2.0`.

## Native exports

| Binary | Arch | Native exports | `takeNativeCaptureLog` | Notes |
|---|---|---|---|---|
| Local arm64, before | arm64 | 25 | missing | stale build |
| Reference arm64 | arm64 | 26 | yes | |
| Reference x64 | x86_64 | 26 | yes | |
| Local arm64, rebuilt | arm64 | 26, same set as reference | yes | loads in Electron; `takeNativeCaptureLog()` returns `[]` |
| Local x64 | x86_64 | 26 | yes | byte-identical copy of 3.2.0's file (sha256 `b33d73ff…`) |

`compare.mjs --native` (local arm64 vs reference arm64): missing none, extra none. Both `.node` files match the gitignored `native-module/*.node` rule.

## Build notes

- **arm64:** `npm run build:native` rebuilt it from `native-module/src`.
- **x64:** a source build failed twice.
  1. Homebrew `rustc` 1.97.1 comes first on the PATH and has no x86_64 standard library (`E0463 can't find crate for core`). Putting rustup's toolchain first fixes this: `PATH=$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH`, rustc 1.100.0.
  2. `cidre`'s build script calls `xcodebuild`, which fails to load `IDESimulatorFoundation` because of a `DVTDownloads` mismatch. `xcodebuild -checkFirstLaunchStatus` returns 69.
  - Resolution: the 3.2.0 x64 binary was copied in, as the user chose.
- **Side effect:** `napi build` regenerates the TRACKED `native-module/index.js` and `index.d.ts` from the host platform. That drops the Windows-only exports (`isImeKeyboardActive`, `deliverClicksWithoutActivation`) and the Windows types, and makes 3 tests in `NativeBindingsCoverBothPlatforms` fail. The committed versions were restored. Watch for this after every local native build.

## Windows native loading (F093)

- `native-module/index.js` loads `index.win32-x64-msvc.node` (or `-gnu`), falling back to the `natively-audio-win32-x64-*` packages.
- Neither the local repo nor 3.2.0 ships a Windows `.node`. It is produced by the `windows-latest` leg of `.github/workflows/build-smoke.yml` (`npm run build:native`, then `package-app.js --win nsis --x64`). The workflow itself marks that step "UNVERIFIED", because it has not yet run on a real runner.

## Packaging (F094–F096)

Command: an unsigned `package-app.js --mac --dir --arm64` (`CSC_IDENTITY_AUTO_DISCOVERY=false`, `--publish never`), with its output in the scratchpad.

Outcome: electron-builder stopped at the icon step (`actool`, the same Xcode plug-in failure). `app.asar` and `app.asar.unpacked` were already written, so the `afterPack` helpers, extraResources, Info.plist and `Assets.car` could not be compared.

**`app.asar` file list:** 32,236 files locally vs 32,240 in 3.2.0.
- `dist/assets`: 73 files on each side whose names differ only by content hash.
- Only local: `services/devPremiumOverride.js` (held, F101).
- Only in 3.2.0:
  - `darwin-x64` prebuilds of `better-sqlite3` and `keytar`, because releases build both arches and this was an arm64-only run.
  - A leftover build file, `native-module/index.darwin-arm64.node.stale-20260926124922.rescue-last-good`.

**`app.asar.unpacked`:** 2,468 vs 2,470 files. The only difference is the 2 x64 prebuilds above.
- `index.darwin-x64.node` is identical to 3.2.0's.
- `index.darwin-arm64.node` has a different hash: it was built locally and is unsigned, but it has the same export set.

**Config vs layout:**
- `asarUnpack` covers `**/*.node` plus the native packages, which matches the unpacked tree.
- extraResources (`assets/`, `natively.icns`, `resources/models/`) map to 3.2.0's `assets`, `natively.icns` and `models`.
- `apple-speech` and `parakeet-ane` are added by `scripts/after-pack.cjs`.

**macOS helpers in 3.2.0:**

| Helper | Size | sha256 | Arch |
|---|---|---|---|
| `apple-speech/Natively-asr` | 171,248 | `4548426011df83c2…` | arm64 only |
| `parakeet-ane/Natively-parakeet` | 10,173,232 | `1e864d3c54b4c836…` | arm64 only |

They are built at afterPack time, which this run did not reach.

## Tests

`SystemAudioNativeLogDrain`, `NativeBindingsCoverBothPlatforms`, `NativeModuleLoadFailureLog`, `NativeDodoSoftRequired` and `NativeAbiGuardStartupOrder`: 15 of 15 pass, after restoring the bindings.

## Remaining risks

- Repair Xcode (`sudo xcodebuild -runFirstLaunch` until the status is 0). Then rerun the full `--dir` package to compare the helpers, extraResources and Info.plist, and to build x64 from source.
- The x64 `.node` has not been run on an Intel Mac.
- The capture log drain has not been observed during a live meeting.
- Windows native code and NSIS output require physical Windows or CI verification.
