# 3.2.0 Parity Completion Plan (2026-11-17)

## How each phase runs
1. Paste the phase's **Codex prompt** into Codex. Codex implements only that phase.
2. Claude verifies it. Claude does the following:
   - Reviews the diff.
   - Re-runs the per-module comparison against recovered 3.2.0.
   - Runs the phase's tests and the regression gate.
   - Reports PASS or FAIL with evidence.
3. Commit only after Claude reports PASS. Each phase is one commit on `fix/restore-premium-types`.
4. If a phase fails, send Claude's findings back to Codex and repeat the phase.

**Recovered reference:** `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/compiled/app`

**Audit evidence (from the 2026-11-17 audit):**
- Read-only audit summary: `NATIVELY_3_2_0_PARITY_AUDIT.md`.
- Raw evidence: the Claude scratchpad of that session, which may be cleared.

**Regression gate (every phase).** Run these commands in this order. `npm run build` deletes `dist-electron`, so `build:electron` must run after it.
```
npm run build
npm run build:electron
npm run typecheck:electron
npm test
npm run test:intelligence
npm run test:lib
npm run test:components
npm run test:scripts
```
The gate expects only known failures:
- `npm test`: the 1 FastModelPreferFast source-shape failure.
- The 36 OKF tests under `electron/services/knowledge/__tests__`, which fail when "Sample thesis for testing.pdf" is missing.

**Rules for every Codex prompt.** Include this block verbatim:
```
Follow AGENTS.md / CLAUDE.md (macOS + Windows contract). Change only what this phase lists.
Do not touch pack billing debit, server charging, or packClockWiring/packProRule behavior.
Keep the development Ultra plan mode (devPremiumOverride) working.
Do not weaken, skip, or delete existing tests to make them pass.
Every behavior change gets a focused test in the matching __tests__ folder, named <Topic>2026_11_17.test.mjs.
EXACT PARITY: the target is byte-for-byte 3.2.0 behavior. Copy logic, strings, translations, conditions, ordering and defaults exactly from the recovered 3.2.0 build at /Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/compiled/app (dist-electron for main process, dist/assets for renderer). Do not invent, rephrase, improve, refactor, or "clean up" anything. If the recovered code is ambiguous or you cannot find it, STOP and report instead of guessing.
Do not commit. At the end, list files changed, tests added, and commands run with results.
```

---

## Phase 0: Decisions (no code)
The following items behave differently in the branch on purpose. Confirm one choice for each before Phase 3.

| # | Item | Recommended |
|---|---|---|
| D1 | Screenshot screen matching. The branch fails when the screen can't be matched; 3.2.0 falls back to the screen's position in the list. | Keep the branch's strict match. Add the 3.2.0 fallback only when no source has a display id and the source and display counts match. |
| D2 | Trial users are broadcast as `isPremium: true`. 3.2.0 sends the licence-only value. | Restore 3.2.0. |
| D3 | What to Say page auto-capture, removed by commit 6d3dc44e. | Keep removed and document it as an exception. |
| D4 | `NATIVELY_GEMINI_EMBED_MAX_WAIT_MS=0` means "no wait" in the branch. | Keep the branch behavior and document it as an exception. |
| D5 | The vendored compiled premium components in `premium/src/recovered/`. | Accept them for now; rewriting them as source happens after parity. |

Record the answers in this file under "Accepted exceptions" at the bottom.

---

## Phase 1: Missing 3.2.0 behavior (high priority)

**Scope**
1. `electron/context-intelligence/orchestration/engine-bridge.ts`: restore the `modeSourceContract` lookup (see the prompt below).
2. Answer-length translations for ru, zh, ja and es in the `src/i18n.*` dictionaries.

**Codex prompt**
```
Task: restore two Natively 3.2.0 behaviors missing from this branch.

1) engine-bridge modeSourceContract.
In electron/context-intelligence/orchestration/engine-bridge.ts, before the orchestrator request is built (~line 318), add the 3.2.0 lookup:
  let modeSourceContract = null;
  if (input.modeUniqueId) {
    try {
      const { ModesManager } = require('../../services/ModesManager');  // lazy, same style as 3.2.0
      const mode = ModesManager.getInstance().getModes().find(m => m.id === input.modeUniqueId);
      const c = mode?.sourceContract;
      if (c && typeof c.sourceAuthority === 'string' && typeof c.origin === 'string')
        modeSourceContract = { sourceAuthority: c.sourceAuthority, origin: c.origin };
    } catch {}
  }
and pass `modeSourceContract` in the request object. Use the import style the file already uses. Keep the lookup lazy so no import cycle appears.
Tests (electron/context-intelligence/__tests__/EngineBridgeModeSourceContract2026_11_17.test.mjs):
 - a mode with sourceAuthority reference_files_only gets reference files ranked first (policy changed by applyModeSourceContract);
 - an unknown modeUniqueId, origin default_new_mode, and getModes() throwing all leave the policy unchanged.

2) Answer-length translations.
SettingsOverlay.tsx:4659-4661 uses t('Answer length') and three descriptions. Add translations to the ru, zh, ja and es dictionaries (find where existing Settings strings live in src/i18n.*.ts):
 en "Answer length" -> ru "Длина ответа", zh "回答长度", ja "回答の長さ", es "Longitud de la respuesta"
 "Shorter" -> ru "Короче", zh "更短", ja "短め", es "Más corta"
 "Smart" -> ru "Умная", zh "智能", ja "スマート", es "Inteligente"
 "Longer" -> ru "Длиннее", zh "更长", ja "長め", es "Más larga"
 "1–2 sentences, 15–35 words" -> ru "1–2 предложения, 15–35 слов", zh "1–2 句，15–35 个词", ja "1〜2文、15〜35語", es "1–2 frases, 15–35 palabras"
 "Fits each question, usually 40–60 words" -> ru "Под каждый вопрос, обычно 40–60 слов", zh "按问题调整，通常 40–60 个词", ja "質問に合わせて調整、通常40〜60語", es "Se ajusta a cada pregunta, normalmente 40–60 palabras"
 "Fuller answers, 90–200 words" -> ru "Более полные ответы, 90–200 слов", zh "更完整的回答，90–200 个词", ja "より詳しい回答、90〜200語", es "Respuestas más completas, 90–200 palabras"
 "Couldn't save the answer length. Please try again." -> ru "Не удалось сохранить длину ответа. Попробуйте ещё раз.", zh "无法保存回答长度，请重试。", ja "回答の長さを保存できませんでした。もう一度お試しください。", es "No se pudo guardar la longitud de la respuesta. Inténtalo de nuevo."
Make sure the Shorter/Smart/Longer button labels go through t() if they don't already.
Test (src/lib/__tests__ or src/components/__tests__ AnswerLengthI18n2026_11_17.test.mjs): every key above exists in each of the 4 dictionaries.
```
(Claude will check the zh "Smart" string, 智能, against the 3.2.0 bundle before PASS.)

**Claude verifies**
- `engine-bridge.ts` compiled module matches 3.2.0 after normalization, or the only remaining difference is a documented local hunk.
- All answer-length strings are present in the local `dist/assets`.
- The new tests and the regression gate pass.

---

## Phase 2: Licence and Pro-check differences (non-billing)

**Scope**
- Item 5: call `checkProNow()` after API-key activation.
- Item 6: `isLicencePremium` returns `null` on error instead of `false`.
- Item 7: check for a revoked licence before the guard, with no dependency on the native module.
- D2: restore the trial broadcast value, if D2 is confirmed.
- Item 10: restore the Gumroad refund message.
- Item 10: restore the 10-second licence-details cache.

**Codex prompt**
```
Task: restore 3.2.0 licence / Pro-check behavior (NOT pack billing).
1) electron/ipcHandlers.ts ~12803 (Natively API key activation): call checkProNow() after a successful activation AND after the fallback to a working default model, as 3.2.0 did.
2) electron/ipcHandlers.ts ~1455-1460 (Pro watcher change handler): broadcast license-status-changed with the licence-only premium value (not isProOrTrialActive), sent after the restore step completes. [only if Phase 0 D2 = restore]
3) electron/services/proAccess.ts:37-52 isLicencePremium: if computing the pack rule throws, return null (unknown) so a valid licence keeps Pro, matching 3.2.0. Also restore the 10s cache of licence details.
4) premium/electron/services/LicenseManager.ts ~524: do the revoked-licence check before perpetualLicenseGuard. It must not depend on readStoredLicense()/the native module, so a revoked Gumroad/Dodo licence can be replaced when the native module fails to load.
5) LicenseManager.ts ~372: restore the 3.2.0 Gumroad refund/reversal error message text.
Do not change pack hours, pack Pro rule, packClock, or any charging path.
Tests: one test per item in electron/services/__tests__/ (LicenceParity2026_11_17.test.mjs), including a native-module-load-failure case for item 4 and a throwing pack rule for item 3.
```

**Claude verifies**
- The hunks in `ipcHandlers`, `proAccess` and `LicenseManager` now match 3.2.0, apart from billing hunks tagged ON-HOLD.
- No billing hunk changed.
- Dev Ultra mode still works: `NATIVELY_DEV_PLAN=ultra` and the related tests pass.

---

## Phase 3: Guide, knowledge, screenshot, small fixes

**Scope**
- Item 8: the first-run guide's `meeting_saved` event timing.
- Item 10: the résumé `getStatus` guard.
- Item 10: the dead `"win"` check in `AppleSpeechSTT`.
- D1: the screenshot fallback, if D1 is confirmed.

**Codex prompt**
```
Task: restore remaining 3.2.0 behaviors.
1) First-run guide: 3.2.0 dispatches applyGuideEvent({type:'meeting_saved', meetingId}) in the main-process meeting STOP flow (meetingId may be null). Restore that call in electron/main.ts's stop flow. Keep the later dispatch in MeetingPersistence.ts:~1962; the guide policy already tolerates a late save. Test: stopping with meetingId null and no DB save advances the guide past `notes`.
2) premium/electron/knowledge/KnowledgeOrchestrator.ts getStatus (~875-884): restore the `if (processed)` guard so no résumé summary is reported when the processed résumé is missing (3.2.0 behavior; currently shows "Professional / 0 years").
3) electron/audio/AppleSpeechSTT.ts: `process.platform === "win"` can never be true. Make the kill path child.kill('SIGKILL') in a try/catch (3.2.0 semantics; Node maps SIGKILL to TerminateProcess on Windows). Add a test with an injected platform for darwin and win32.
4) [only if Phase 0 D1 = add fallback] electron/ScreenshotHelper.ts requireDisplaySource (~74, 82, 559): keep exact display_id matching; when NO source has a display_id AND source count === display count, fall back to index matching as 3.2.0 did; otherwise keep throwing. Test in ScreenshotCaptureRuntime with two displays and empty display_ids, for darwin and win32.
```

**Claude verifies**
- The module comparisons show only the documented exceptions.
- The platform-branch tests cover both darwin and win32.
- The regression gate passes.

---

## Phase 4: Renderer parity review (Claude-led audit, then a Codex fix)
The Electron side is fully reviewed. The renderer was only compared at the string level.

**4a. Claude audit (no code).**
- Extract each 3.2.0 renderer chunk and compare it with the local chunk, component by component: App, NativelyInterface, NotesWindow, ModesSettings (`premium/src`), the Auto Answer dialogs, SettingsPopup, ModelSelectorWindow, useResolvedTheme, useToggleInit and i18n.
- Output a gap list in the same format as the earlier audit: MISSING, DIVERGENT, or LOCAL INTENTIONAL.
- Known leads to check:
  - The Auto Answer access and stop-sharing dialog copy and flow. 3.2.0 has a separate `AutoAnswerStopSharingDialog` and an `introSeen` flag.
  - The ModesSettings knowledge-pack panel: load, export OKF, approve and reject cards, regenerate.
  - The mode note-template picker (the `mm-nt-*` class names).
  - What's New items and the version string.
  - Model selector provider names: Natively, Google, DeepSeek, NVIDIA NIM, Sidrune.
  - Trial notice strings.

**4b. Codex prompt.** Claude generates it from the 4a gap list.

**4c. Claude verification.**
- The string diff is reduced to accepted exceptions only.
- CDP checks with agent-browser (`npm run dev:agent`) on the Settings tabs: modes, intelligence, overlay and general.

---

## Phase 5: Fixtures, tests, packaging, release validation

**Scope**
- Make the OKF tests skip cleanly when "Sample thesis for testing.pdf" is absent, with a clear skip reason. Do not delete them.
- Fix the stale FastModelPreferFast source test. Both 3.2.0 and the branch keep `preferFast` only for API compatibility, so update the test to match the documented behavior, and say why in the test. Do not just loosen it.
- Bump `package.json` to 3.2.0, as a release decision.
- Packaging: run `npm run app:build` on macOS, including the x64 native binary, and a Windows build in CI or on a Windows machine.

**Claude verifies**
- The full regression gate passes with 0 unexpected failures.
- Claude re-runs the full artifact inventory against the recovered tree. Every remaining difference is either in "Accepted exceptions" or ON-HOLD-BILLING.
- Claude writes the final completion report in the CLAUDE.md format.

---

## Phase 6: Physical platform verification (manual)
Check on both macOS and Windows:
- Multi-monitor screenshot capture, including a display change during capture.
- STT failover and the watchdog.
- Auto Answer.
- Phone-mirror chat in the overlay window.
- Local-embedder memory in a long meeting (more than 1 hour).
- Start, stop and save in the guide flow.
- The packaged app launches, and its native module loads, on arm64, x64 and Windows x64.

Parity is complete when Phases 1–5 have reported PASS and been committed, and Phase 6 is checked on both operating systems.

---

## Accepted exceptions (fill in after Phase 0)
- D1:
- D2:
- D3:
- D4:
- D5:
- ON-HOLD-BILLING: pack billing debit, server charging, packClockWiring, packProRule, licencePremiumForWindows / packProPaused, pack stand-down restore.
- Kept: development Ultra plan mode (devPremiumOverride).

---

# REVISED PLAN (2026-11-17, supersedes Phases 2–6 above)

**Decision:** the branch must match recovered 3.2.0 exactly, so D1, D2, D3 and D4 are all set to restore 3.2.0. D5 stays as is, because that code is already 3.2.0.

**Method:** for each module, transcribe the recovered compiled module back into its TypeScript source. That includes logic, log lines, error text, ordering and defaults. The only edits allowed are TypeScript types and the original source's import form.

**Acceptance (Claude runs this):**

    npm run build:electron
    node scripts/parity/compare-modules.mjs --module <path>

Every module in the phase must report `IDENTICAL to 3.2.0`. A module may stay non-identical only where its difference is listed as an allowed exception below. Claude reviews each remaining hunk.

**Allowed exceptions:**
- devPremiumOverride (development Ultra mode)
- the `dev:agent` CDP harness guards required by CLAUDE.md (for example the `pinUserData` isPackaged guard)
- billing modules: `proAccess`, `packProRule` and `packClockWiring` stay ON HOLD (user decision, 2026-11-17)

Phase 1: DONE (commit 9c35c88e).

**Remaining phases:**

| Phase | Area | Modules |
|---|---|---|
| R2 | Licence and Pro | `premium/electron/services/LicenseManager.ts`, `premium/electron/services/licenseVerifyPolicy.ts`, `electron/services/proEntitlementWiring.ts`, `electron/premium/featureGate.ts`, `electron/premium/autoAnswer.ts` |
| R3 | Main process and platform | `main.ts`, `MeetingPersistence.ts`, `services/firstRunGuideStore.ts`, `preload.ts`, `SessionTracker.ts`, `WindowHelper.ts`, `ScreenshotHelper.ts` (D1), `audio/AppleSpeechSTT.ts`, `audio/MissingKeySTT.ts`, `rag/providers/GeminiEmbeddingProvider.ts` (D4), `services/RateLimiter.ts`, `utils/onnxThreadConfig.ts`, `utils/onnxLoadSentinel.ts`, `utils/onnxWorkerShutdown.ts`, `utils/pinUserData.ts` (keep the harness guard) |
| R4 | IPC | `electron/ipcHandlers.ts` (D2 trial broadcast, `checkProNow` after API-key activation, D3 What to Say auto-capture main-side) |
| R5 | LLM and intelligence | `electron/llm/*` modules, `IntelligenceEngine.ts`, `LLMHelper.ts`, `context-intelligence/*`, `intelligence/OutputShapeNormalizer.ts` |
| R6 | Knowledge, modes and meeting | `services/knowledge/*`, `premium/electron/knowledge/*`, `ModesManager.ts`, `ModeGenerator.ts`, `services/meeting/*`, `meetingDetection/meetingOffer.ts`, `organise/personFacts.ts`, `calendar/*` |
| R7 | Renderer | Claude first audits the `dist/assets` chunks against 3.2.0, then writes a Codex prompt; D3 renderer side is included |
| R8 | Billing | `proAccess`, `packProRule`, `packClockWiring` (only if the user lifts the hold) |
| R9 | Release | Thesis-fixture skips, FastModelPreferFast test, version 3.2.0, `app:build`, Windows build, final full inventory with `compare-modules.mjs` |
| R10 | Physical checks | macOS and Windows |

## Auto Answer parity (user request, 2026-11-17)

**Status:**
- **Engine:** all 26 `premium/electron/autoAnswer/*` modules already match 3.2.0.
- **`autoAnswerGate`:** matches 3.2.0.
- **IPC channels:** identical to 3.2.0.

**Remaining work:**
- **Phase 2 follow-up:** remove the "delete shared data" feature (`requestDeletion` and `auto-answer:delete-shared-data`), which 3.2.0 does not have.
- **Phase 2b:** port the renderer Auto Answer UI from the 3.2.0 chunk `App-C2irX2ey.js`:
  - the access dialog
  - `AutoAnswerStopSharingDialog`
  - the `introSeen` flag
  - the Intelligence settings section
  - `AutoAnswerModelCard`

**Check:**

    node scripts/parity/compare-renderer-strings.mjs --filter "auto.?answer|Auto Answer|shar(e|ing)|introSeen"

This must show no Auto Answer strings in either list.
