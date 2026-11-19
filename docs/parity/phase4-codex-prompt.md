# Phase 4 — Renderer parity with Natively 3.2.0 (Codex prompt)

You are working in the Natively Electron repo on branch `fix/restore-premium-types`
(HEAD `c2d3ddac`, "parity R3, part 2"). Phases 1–3 restored the main process to
recovered Natively 3.2.0. Phase 4 does the same for the **renderer** (`src/`, `premium/src/`).

## Rule
Copy the recovered 3.2.0 behaviour exactly. Invent nothing, "improve" nothing.
If 3.2.0 lacks something the local code has, remove it. If unsure, list it and leave it.

## Source of truth
- Recovered build: `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/compiled/app`
  - Renderer (minified): `dist/assets/*.js`
  - Main bundle: `dist-electron/electron/CropperWindowHelper.js`
- Also check `.../recovered/source` and `.../recovered/reconstructed` for readable copies before reading minified code.
- Tools:
  - `node scripts/parity/compare-renderer-strings.mjs` — UI strings in 3.2.0 vs local.
  - `node scripts/parity/compare-modules.mjs [--module <path>]` — main-process modules (should already be clean apart from the exclusions below).

## Do NOT touch (on hold / intentional)
- Billing: `proAccess.ts`, packs (`packProRule`, `packClockWiring`, `PackMeetingClock`), ProEntitlement*,
  licence/pack code in `electron/ipcHandlers.ts`, the answer-length Pro registration in `electron/main.ts`,
  and any pack/billing/plans UI.
- `devPremiumOverride` (keep).
- `pinUserData` isPackaged guard used by `npm run dev:agent` (keep).
- Calendar OAuth client ID/secret stay empty.
- Main process files — already at parity; only change one if a renderer contract (preload/IPC name) forces it, and report it.

## Already done (verify, don't redo)
Auto Answer access / stop-sharing dialogs, `natively.autoAnswer.introSeen.v1`, Intelligence Auto Answer section,
AutoAnswerModelCard (`src/components/__tests__/AutoAnswerUiParity2026_11_17.test.mjs`); guide APIs use
`guideGet`/`guideDispatch`; `buildDirectWhatToSayPayload` matches 3.2.0.

## Work
1. **Audit.** Run `compare-renderer-strings.mjs`. For each component in `src/components`, `src/components/settings`,
   `src/lib`, `src/premium`, `premium/src`, compare against the matching 3.2.0 chunk in `dist/assets`
   (chunk names follow component names, e.g. `NativelyInterface-*.js`). Write findings to
   `docs/parity/phase4-renderer-audit.md`: file, local vs 3.2.0, action (copy / remove / leave-billing).
2. **Leads to check first:**
   - ModesSettings knowledge-pack panel (skip pack *billing* parts)
   - OKF export UI
   - `mm-nt-*` note templates
   - What's New
   - model selector display names
   - trial strings (text only; no billing logic)
   - SettingsOverlay tabs (`SETTINGS_NAV_ORDER`) and their contents
   - NativelyInterface handlers: `handleWhatToSay`, screenshot/attachment flow, manual chat, phone mirror UI
   - `src/types/electron.d.ts` and `electron/preload.ts`: every API the 3.2.0 renderer calls must exist; remove ones it never calls (except billing)
   - i18n keys used by 3.2.0 but missing locally (and vice versa)
3. **Fix** each finding by copying 3.2.0 behaviour into readable TS/TSX in the existing file. Keep local formatting/naming
   where it doesn't change behaviour. No new dependencies.
4. **Tests.** A test that pins removed local-only behaviour: delete it if it was created by a local-only commit
   (check `git log --diff-filter=A`), otherwise update it to assert the 3.2.0 shape. Add parity tests for restored UI
   in the style of `AutoAnswerUiParity2026_11_17.test.mjs`.

## Gate (all must pass)
```
npm run build:electron
npm run build
npm run typecheck:electron
npm test
npm run test:intelligence
npm run test:lib
npm run test:components
npm run test:scripts
```
Optional: `npm run dev:agent` and check changed screens via agent-browser (see CLAUDE.md "Agent UI testing via CDP";
remember `?window=settings` is the quick-toggles popup, the Settings panel lives in the launcher window).

## Cross-platform
Follow CLAUDE.md. No Unix-only commands in scripts, no hard-coded paths, keep `CommandOrControl`
shortcuts and both darwin/win32 branches. Don't claim Windows testing you didn't do.

## Commit & report
- Commit as `Restore 3.2.0 renderer behavior (parity phase 4)` ending with your co-author line.
- Report: files changed, behaviour changed, each remaining difference and why (billing / format-only / unsure),
  gate results with counts, and validation using the CLAUDE.md categories
  (e.g. `Build validated on macOS`, `Requires physical Windows verification`).
