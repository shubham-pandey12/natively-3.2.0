# Phase 8: shortcuts and lifecycle parity (F079–F090)

## Method

Built local output `electron → renderer → electron`, then split the local and signed 3.2.0 `dist-electron/electron/main.js` at esbuild `// <path>` headers. Binary-containing bundles were read as Latin-1 and checked using `diff -a` and file sizes. The reference was never executed or loaded. The code-review-graph MCP server was unavailable (no graph tools exposed), so the source and emitted-bundle comparison supplied the evidence. IPC parity is established separately in [phase7-ipc.md](phase7-ipc.md). No code was modified in this phase.

Reference main-bundle anchors (line numbers in `ref-3.2.0/asar/dist-electron/electron/main.js`): `windowsTaskbarPolicy.ts:25021`, `acceleratorValidation.ts:300056`, `StealthKeyboardManager.ts:300284`, `KeybindManager.ts:300808`, `macDockPolicy.ts:521659`, `WindowHelper.ts:521886`, `SettingsWindowHelper.ts:524210`, `ModelSelectorWindowHelper.ts:524554`, `NotesWindowHelper.ts:525075`, `CropperWindowHelper.ts:525399`, `stealthProtection.ts:549059`, `trayIcon.ts:549156`, `openAtLoginDefault.ts:549178`, `main.ts:550666`. These were compared with the corresponding local files cited below.

## Module comparison and real differences

| Scope | Identical | Rename-only | Real difference | Missing/extra |
|---|---:|---:|---:|---:|
| Main process shortcut, keybind, window, tray/menu, updater, lifecycle, disguise/stealth, and `main.ts` modules | 82 | 44 | 1 (`main.ts`) | 0/0 |

The `main.ts` unified diff has 945 lines because a bundled import-number shift propagates through the large module. Normalizing numbered identifiers leaves three substantive groups:

```diff
-        try { packSelectionChanged(); } catch {}
         const targets = [
```

This `sendModelChanged` callback is local-only pack-clock wiring in the held trial/packs area (F012/F100), not a lifecycle or shortcut difference. Two other groups are comment-only: a longer reference explanation for recovered transcript Auto Answer and different Auto Answer judge comments. A meeting-surface comment also changes; `autoAnswerAccess`/`newTrainingConsent` local aliases become numbered reference aliases. No startup, single-instance, quit, update, tray, window-option, keybind, or registration statement changed or moved. In particular, the previously corrected answer-length registration is absent from local `main.ts` and resides in `ipcHandlers` as in the reference. The full diff is reproducible with the referenced `moddiff.mjs` and `diff -a -u`; no held secrets are reproduced here.

## Full default keybind tables: darwin and win32

The complete 26-row [DEFAULT_KEYBINDS](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/services/KeybindManager.ts:24) module is identical to the reference `KeybindManager.ts` module. The shared Electron `CommandOrControl` token resolves as shown. **Darwin diff: none. Win32 diff: none.** Scope describes the configured keybind; active registration is mode-dependent (below). “Default” means the key is assigned on a fresh profile, not necessarily registered in every mode.

| Action ID | darwin accelerator | win32 accelerator | Scope | Enabled by default |
|---|---|---|---|---|
| `general:toggle-visibility` | `Command+B` | `Control+B` | global | assigned |
| `general:toggle-mouse-passthrough` | `Command+Shift+B` | `Control+Shift+B` | global | assigned |
| `general:process-screenshots` | `Command+Enter` | `Control+Enter` | global | assigned |
| `general:capture-and-process` | `Command+Shift+Enter` | `Control+Shift+Enter` | global | assigned |
| `general:reset-cancel` | `Command+R` | `Control+R` | local | assigned |
| `general:take-screenshot` | `Command+H` | `Control+H` | global | assigned |
| `general:selective-screenshot` | `Command+Shift+H` | `Control+Shift+H` | global | assigned |
| `general:capture-dom` | `Command+Y` | `Control+Y` | global | assigned |
| `chat:whatToAnswer` | `Command+1` | `Control+1` | global | assigned |
| `chat:clarify` | `Command+2` | `Control+2` | global | assigned |
| `chat:dynamicAction4` | `Command+3` | `Control+3` | global | assigned |
| `chat:followUp` | `Command+4` | `Control+4` | global | assigned |
| `chat:answer` | `Command+5` | `Control+5` | global | assigned |
| `chat:codeHint` | `Command+6` | `Control+6` | global | assigned |
| `chat:brainstorm` | `Command+7` | `Control+7` | global | assigned |
| `chat:acceptSuggestion` | `Command+8` | `Control+8` | global | assigned |
| `chat:scrollUp` | `Command+Up` | `Control+Up` | global | assigned |
| `chat:scrollDown` | `Command+Down` | `Control+Down` | global | assigned |
| `chat:scrollLeft` | `Command+Alt+Left` | `Control+Alt+Left` | global | assigned |
| `chat:scrollRight` | `Command+Alt+Right` | `Control+Alt+Right` | global | assigned |
| `chat:focusInput` | `Command+Shift+Space` | `Control+Shift+Space` | global | assigned |
| `window:move-up` | `Command+Shift+Up` | `Control+Shift+Up` | global | assigned |
| `window:move-down` | `Command+Shift+Down` | `Control+Shift+Down` | global | assigned |
| `window:move-left` | `Command+Shift+Left` | `Control+Shift+Left` | global | assigned |
| `window:move-right` | `Command+Shift+Right` | `Control+Shift+Right` | global | assigned |
| `dictation:toggle` | `Command+Shift+D` | `Control+Shift+D` | global | assigned; conditional on dictation |

[KeybindManager.ts:142-165](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/services/KeybindManager.ts:142) registers only visibility controls in launcher mode, more shortcuts in overlay mode, and dictation only while enabled. `globalShortcutsEnabled` defaults on; when off, Toggle Visibility remains registered. The health check runs every 10 seconds (`KeybindManager.ts:109,638`). Neither side has a static reserved/blocked *accelerator* list. Both use the same [acceleratorValidation.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/services/acceleratorValidation.ts:25) modifier/named-key allowlist and reject malformed/unrepresentable keys; actual OS collisions are reported as registration failures. The macOS edit and Windows chord adapters are in the identical/rename-only module set. No platform entry is missing.

## Window-option diffs

All window helper and platform policy modules match the reference (identical or numbered-identifier rename only). No window-option diff was found. The per-window contract is:

| Window | macOS | Windows | Shared options/behavior |
|---|---|---|---|
| Launcher | regular window, normal Dock tile when detectable | regular taskbar window; stealth taskbar policy | focusable; content protection follows state; no forced always-on-top ([WindowHelper.ts:610-699](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/WindowHelper.ts:610)). |
| Overlay | `panel`, `floating` then `screen-saver` level; all Spaces including full screen | no-activate policy, `screen-saver` level | always on top, skipTaskbar, content protection; click-through uses `setIgnoreMouseEvents(true, {forward:true})` ([WindowHelper.ts:886-990](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/WindowHelper.ts:886), [1484-1510](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/WindowHelper.ts:1484)). |
| Pill and toggle | `panel`, `floating`, all Spaces | no-activate policy, `screen-saver` | always on top, skipTaskbar, content protection ([WindowHelper.ts:1784-1856](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/WindowHelper.ts:1784)). |
| Popover catcher | `panel`, `floating` relative level `-1`, all Spaces | no panel type | never focusable, skipTaskbar, content protection ([WindowHelper.ts:1712-1741](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/WindowHelper.ts:1712)). |
| Settings popup and model selector | `panel`, `floating`, all Spaces in overlay mode | always-on-top popup, skipTaskbar | content protection follows state ([SettingsWindowHelper.ts:228-272](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/SettingsWindowHelper.ts:228), [ModelSelectorWindowHelper.ts:272-324](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/ModelSelectorWindowHelper.ts:272)). |
| Notes | `panel` | platform-specific taskbar/focus policy | alwaysOnTop, skipTaskbar, content protection ([notesWindowPolicy.ts:65](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/utils/notesWindowPolicy.ts:65), [NotesWindowHelper.ts:124-139](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/NotesWindowHelper.ts:124)). |
| Cropper | `panel`, all Spaces, `screen-saver` | no toolbar type, `screen-saver` | alwaysOnTop, skipTaskbar, content protection ([CropperWindowHelper.ts:205-235](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/CropperWindowHelper.ts:205), [886-887](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/CropperWindowHelper.ts:886)). |

All macOS `setVisibleOnAllWorkspaces` calls route through [macDockPolicy.ts:50-55](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/utils/macDockPolicy.ts:50), passing `{visibleOnFullScreen: true, skipTransformProcessType: true}` when shown across Spaces. Windows has no equivalent Space flag; its no-activate, focusability, skipTaskbar, and z-order policies are separate. These are code comparisons, not physical window-level tests.

## Tray, Dock/taskbar, startup, quit, and update diffs

- **Tray/menu:** No diff. [trayIcon.ts:24-40](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/utils/trayIcon.ts:24) checks packaged `resources/assets/iconTemplate.png`, dev `src/components/iconTemplate.png`, then platform-independent `icon.png` fallback. The reference uses the same paths. [main.ts:9896-10007](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/main.ts:9896) sets tooltip `Natively`; menu entries in order: Show Natively, Toggle Window, separator, Take Screenshot, separator, Quit. The screenshot entry uses the current keybind. The display formatter spells `Cmd` even on Windows in both versions; parity does not establish that as good Windows UX.
- **Dock/taskbar:** No diff. macOS persisted undetectable hides Dock before windows; normal packaged build is born regular; dev Electron may be promoted to `regular` after startup ([main.ts:11133-11159](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/main.ts:11133), [11655](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/main.ts:11655)). There is no runtime `accessory` round trip. Windows AppUserModelID/login item and launcher taskbar policy are in identical [windowsTaskbarPolicy.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/utils/windowsTaskbarPolicy.ts:54).
- **Single instance/startup:** No diff. Outside `dev:agent`, `requestSingleInstanceLock()` runs before native ABI checks; lost lock exits. `second-instance` focuses/recenters the existing window ([main.ts:10975-11002](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/main.ts:10975)). `dev:agent` intentionally skips the lock via isolated userData. Fresh packaged installs enable open-at-login once, only in `/Applications` on macOS, not in the Windows portable build ([openAtLoginDefault.ts:31-68](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/utils/openAtLoginDefault.ts:31)); `setOpenAtLogin` uses `{openAtLogin, openAsHidden:false, path}` on macOS and a named Windows Run entry plus legacy-name cleanup ([windowsTaskbarPolicy.ts:54-69](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/utils/windowsTaskbarPolicy.ts:54)). F102 `pinUserData` remains a deliberate hold; no change was made.
- **Quit:** No diff. `before-quit` first allows local embedding drain, marks quitting, flushes context-debug output, stops audio/capture watchers, checkpoints WAL, stops Hindsight, flushes review/download state, disposes windows and scrubs credentials ([main.ts:12636 onward](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/main.ts:12636)). `will-quit` disposes performance cache, records shutdown before its checkpoint, stops telemetry/extensions/MCP/native tracing/Hindsight, then checkpoints ([main.ts:12368-12407](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/main.ts:12368)). The ordering is identical after identifier normalization.
- **Updater:** No diff. GitHub publish feed `Natively-AI-assistant/natively-cluely-ai-assistant`, `latest` channel, `allowDowngrade=false`, `autoDownload=false`, conditional `autoInstallOnAppQuit` for installable signed builds; one automatic check 10 seconds after setup, skipped in dev and undetectable mode ([main.ts:3344-3401](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/main.ts:3344), [3493-3501](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/main.ts:3493)). No explicit periodic check interval or differential/blockmap override appears in these modules; electron-updater defaults apply. No update download/install was triggered.

## Packaging comparison

The reference `asar/package.json` has **no `build` section**, so a full electron-builder config diff cannot be reconstructed from it. Its extracted `app-update.yml` names the same GitHub owner/repo, provider, release type, and updater cache as the local [package.json build section](/Users/shubhampandey/testing/natively-cluely-ai-assistant/package.json:233). Local targets: macOS zip+dmg x64/arm64 and Windows NSIS+portable x64. Local `asarUnpack` has 116 patterns, including native modules/workers; `extraResources` includes assets and models; `protocols` and `LSUIElement` are absent from the local builder config. The dev Electron Info.plist patch adds LSUIElement, while the signed packaged config does not ([patch-electron-plist.js:94-114](/Users/shubhampandey/testing/natively-cluely-ai-assistant/scripts/patch-electron-plist.js:94)). No matching reference Info.plist or builder-effective file was present, so target, unpack, resource, protocol and LSUIElement parity is **not independently proved** by package metadata. The signed reference's shipped assets and main runtime code support the narrower comparisons above. No packaging configuration was changed.

## Renderer literal diff and macOS runtime

The renderer has 77 matched chunk basenames: 67 byte identical, 10 byte different, no missing/extra chunks. Acorn tokenization compared every string/template literal in `App.js`, `NativelyInterface.js`, and `AuxRoot.js`, with a keybind/shortcut filter. No Keybinds label or accelerator literal is missing. The two filtered `App.js` set artifacts are an unrelated CSS template and a minifier `dragControls` identifier. The Keybinds UI is inside `App.js` and local [SettingsOverlay.tsx:3434](/Users/shubhampandey/testing/natively-cluely-ai-assistant/src/components/SettingsOverlay.tsx:3434).

Ran `agent-browser skills get core`, `agent-browser skills get electron`, `npm run dev:agent`, then `AGENT_BROWSER_CONFIG=$PWD/agent-browser.json agent-browser tab/eval/snapshot/console/errors`. Confirmed `location.search` was `?window=launcher` before snapshots. `window.electronAPI.openSettingsTab('keybinds')` displayed all expected macOS glyphs; read-only `getKeybinds()` returned 26 rows and the configured `CommandOrControl` accelerators. Global shortcuts switch was on. No binding or setting was changed. Dev mode log: `[AutoUpdater] Development mode: Skipping auto check (use manual button)`. Startup logs included SettingsManager/CredentialsManager initialization, KeybindManager registrations, window creation, and renderer `dom-ready`. `dev:agent` skipped the single-instance lock by design.

The launcher **Quit Natively** action produced `[Lifecycle] before-quit reason=user-quit`, cropper disposal, credentials/model/LLM memory scrub, screenshot queue clearing, `[Lifecycle] clean exit`, and `[Lifecycle] will-quit reason=user-quit` in that observed order. Renderer console and error captures are in `/private/tmp/phase14-console.txt` and `/private/tmp/phase14-errors.txt` (scratch only). CDP cannot establish actual tray/Dock/taskbar presence, global shortcut ownership, click-through, content protection, z-order, or Spaces/virtual-desktop behavior; those remain physical checks.

## Fixes, validation, and remaining risks

No proven F079–F090 behavior gap was found and no source code was changed. `npm run build:electron && npm run build && npm run build:electron` passed, `npm run typecheck:electron` passed, and selected shortcut, startup, Dock/taskbar, stealth and updater tests passed 78/78. `openAtLoginDefault.test.mjs`, `windowsTaskbarPolicy.test.mjs`, and `macDockPolicy.test.mjs` inject `darwin` and `win32` values. Physical macOS and Windows checks remain required for global shortcut collisions, tray/Dock/taskbar, window levels, click-through, content protection, Spaces/virtual desktops, and signed updater/install behavior. The reference package metadata cannot prove full packaging parity. This report is ignored by existing `.gitignore:512`; `.gitignore` was not changed in this phase.
