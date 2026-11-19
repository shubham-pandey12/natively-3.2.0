# Phase 10: AI provider parity (F053–F060)

Reference: the extracted installed signed 3.2.0 app at `/Users/shubhampandey/.codex/visualizations/2026/11/18/01a1ee13-ada0-71a0-8c34-3af68ba0e2ae/ref-3.2.0`. Reference bundles were read as data only; no reference binary was executed or loaded. Reference `main.js:<number>` citations below are latin1 byte offsets because the bundle is one physical line. The code-review-graph MCP was unavailable, so the required graph-first discovery used targeted source search and the reference `AREA-MAP.md`, followed by source-region review and compiled-module comparison.

The source-and-bundle comparison did not prove a contained provider behavior gap, so no application source or tests were changed. The UI checks did uncover a credential-state side effect during an invalid-key probe; that incident is described below and remains the outstanding profile-recovery risk.

## Per-feature verdicts

| ID | Feature | Difference class | Verdict and evidence |
| --- | --- | --- | --- |
| F053 | Provider list | Expected | **Implemented on macOS.** Local provider IDs, names and key URLs are in `src/components/settings/AIProvidersSettings.tsx:1573-1595`; the cloud-provider list was rendered in Settings. Selected reference literals from `App-C2irX2ey.js:1` matched exactly. Provider entries include Gemini, Fluxion/Sidrune AI, AgentRouter, Groq, OpenAI, Claude, DeepSeek, Nvidia Nim and OpenRouter. |
| F054 | Custom endpoints | Expected | **Implemented on macOS.** Local validation/save/reload/delete flow is `src/components/settings/AIProvidersSettings.tsx:5188-5237`, with IPC handlers in `electron/ipcHandlers.ts:13873-13993`; reference UI is in `App-C2irX2ey.js:1`. A temporary custom provider using `example.invalid` saved, remained after switching tabs, and was deleted through the confirmation UI. No request was sent to that host. The final list returned to its prior empty state. |
| F055 | Ollama | Expected | **Partial.** Local resolver and manager are `electron/services/ollamaExecutable.ts` and `electron/services/OllamaManager.ts`; reference module marker is `main.js:7592421` in `OllamaManager.ts`. The installed app had Ollama disabled/not selected, `command -v ollama` found no executable, and main logs reported startup skipped. No server was started. macOS and injected Windows path tests passed; a physical Ollama install was not available. |
| F056 | Codex CLI / ChatGPT Codex | Expected | **Implemented on macOS.** Local auth is read-only and supports macOS `~/.codex/auth.json` and Windows `%USERPROFILE%\\.codex\\auth.json` (`electron/services/CodexCliAuth.ts:2-23,55-86`); model-cache path support is in `electron/services/CodexModelCatalog.ts`; built-in model IDs are in `src/utils/modelUtils.ts:220-266`. Local endpoint and retry logic are `electron/services/CodexCliService.ts:297-308,708-838`; reference Codex transport module starts at `main.js:1494772`. A harmless test prompt returned through the Codex transport on macOS. The app uses the ChatGPT Codex backend; it does not execute the `codex` binary to answer. Windows path/auth tests passed on macOS with injected paths. |
| F057 | Natively API | Expected / held | **Partial.** Local UI distinction between a Natively API key and a license key is `src/components/settings/NativelyApiSettings.tsx:1517-1557`; IPC state is in `electron/ipcHandlers.ts:12684-12990`. Reference `ipcHandlers.ts` begins at `main.js:28142673`. Phase 7 already found the `set-natively-api-key` and usage handlers differ only in held Pro/license/dev behavior. Runtime quota reported `no_key`, so managed Natively API visibility/usage and API-backed answering were not exercised; no license or API-key settings were changed. |
| F058 | Model lists | Expected | **Implemented by source and renderer comparison.** Local preset tables, live-catalogue filtering and Codex fallback presets are `src/utils/modelUtils.ts:1-178,220-266`; card wiring is `src/components/settings/AIProvidersSettings.tsx:4078-4107`. App chunk literal comparison had no provider-ID, selected model-ID, or official key-URL set delta. Codex/NVIDIA model summaries were visible in Settings; provider visibility and model-selection tests passed. Not every provider catalogue was opened in the UI. |
| F059 | Key test/save/rollback | Expected in code; unresolved runtime incident | **Partial.** UI test handler passes the typed candidate to `testLlmConnection` without saving it (`src/components/settings/AIProvidersSettings.tsx:5146-5164`); Gemini save is a separate `set-gemini-api-key` path (`electron/ipcHandlers.ts:11900-11930`). The fake invalid Gemini candidate returned HTTP 400 and the UI showed Error. Afterward main logs also showed `[CredentialsManager] Gemini API Key updated`, and the embedding pipeline demoted Gemini. The test request handler itself contains no credential setter. The interaction sequence used stale CDP refs after a rerender, so the precise cause is unresolved; the test is not counted as a successful rollback check. The exact pre-test value is not present in this checkout's backups. Do not treat this as a confirmed product gap or repeat the test until the profile's prior Gemini key is restored. No key value is included here. |
| F060 | Fast Response fallback | Expected | **Partial.** Local cold Auto order is Groq → DeepSeek → Gemini → Natively API → OpenAI → Codex → Claude (`electron/LLMHelper.ts:283-295`). A failed pre-token pick can rescue in Codex → Groq → Natively server-fast order (`electron/LLMHelper.ts:5293-5360,11537-11610`). The local `LLMHelper.ts` module at `main.js:7610737` matches the reference module at `main.js:7610661` after generated identifier normalization. Existing fallback tests passed, but no live provider failure was forced in this run. |
| F026 | Fast Response route carry-over | Expected | **Partial.** Fast Response UI was temporarily enabled; source gate and route log are `electron/LLMHelper.ts:5293-5313` and `:5300`. The answer completed on Codex, but the captured main logs did not contain the background-pick marker `Fast Response Mode: answering on ...`; this proves an answer, not the Fast Response route. The setting was turned off before quitting. |
| F039 | Quiet notes carry-over | Expected | **Partial.** Existing evidence remains `src/components/NativelyInterface.tsx:608,8606` and Phase 9 runtime. Quiet-note live-stream triggers require an active meeting. No quiet-note trigger was observed in this provider phase. |
| CTA | “Start Natively” meeting and microphone | Expected | **Same in 3.2.0.** Local CTA invokes `onStartMeeting()` at `src/components/Launcher.tsx:1128-1132`; local capture starts in `electron/main.ts:7898-8097`. Installed 3.2.0 capture path is `main.js:557479-557519`, where meeting lifecycle calls `startCaptureChannels()` and starts microphone capture before system audio (also documented in Phase 9). Runtime emitted `start_natively_cta`, `meeting_started`, and `[Meeting] Using CoreAudio backend (Default)`. |

## Module and renderer comparison

The main bundle comparison split on esbuild `// <path>` markers. It used latin1 reads and `diff -a`; bundle sizes were checked because these files contain binary bytes.

| Comparison | Identical | Rename-only | Real differences | Missing / extra |
| --- | ---: | ---: | ---: | ---: |
| Provider service module set (`LLMHelper`, credentials, Ollama, Codex auth/service/catalogue, live catalogue and provider status) | 7 | 2 | 0 | 0 / 0 |
| Broader `electron/llm/*` set included by the provider-route filter | 157 | 13 | 5 | 0 / 0 |
| `electron/ipcHandlers.ts` module | 0 | 0 | 1 module-level diff | 0 / 0 |

The 5 broader LLM differences were read individually: `smallTalk.ts` comment-only; `liveDeadlines.ts`, `speakability.ts` and `codingShape.ts` function reordering; `manualProfileIntelligence.ts` has a real verb-stripping behavior difference unrelated to F053–F060. No provider change was made for that out-of-scope profile-intelligence difference. The IPC difference includes the known license/Pro/dev holds documented in [Phase 7](phase7-ipc.md); its provider-related held handlers include `set-natively-api-key`, `get-natively-usage`, `get-stored-credentials`, `set-stt-provider`, `set-model`, `set-fast-model` and `set-default-model`. Phase 7 found no non-held provider handler gap. Billing/license/trial/packs, `devPremiumOverride`, OAuth secrets and related entitlement behavior remain Expected and untouched.

The App renderer was parsed as literals per matching chunk name without the hash. In the selected provider/model/key/endpoint text set, provider IDs and names, the checked official key URLs, and selected model identifiers matched. The wider App text scan produced 1,151 local and 1,152 reference relevant literals; remaining differences were hashed asset paths, one legacy Auto Answer phrase, and known Pro/pack copy, all outside this provider UI or part of the held entitlement baseline. This was a text/literal comparison, not raw minified-code equivalence. The custom endpoint, provider, local-gateway and Codex surfaces were inspected in the running renderer.

### IDs, endpoints, defaults and filtering

- Provider IDs and key-URL strings were compared in the App chunk literal sets: 51 selected values on each side; no provider ID, checked endpoint or selected model ID was local-only or reference-only. Fluxion/Sidrune and AgentRouter referral links are constants rather than the checked official vendor URL set.
- Local model presets are `src/utils/modelUtils.ts:8-165`; fetched catalogue replacement is restricted to AgentRouter at `:168-178`. Codex uses the installed CLI catalogue when available, otherwise built-in presets at `:220-266`. Reference selected model literals matched. Provider filter tests cover key/config gating and renderer/main family agreement.
- Codex ChatGPT route uses `https://chatgpt.com/backend-api/codex/responses` in `electron/services/CodexCliService.ts`; local/ref module comparison found no endpoint/parameter behavior difference. Ollama defaults and readiness checks are in `electron/services/OllamaManager.ts` and are module-identical after generated import-name normalization.
- Timeout/retry and fallback behavior in `LLMHelper.ts` is module-equivalent. Existing route tests exercise dispatchable/unavailable picks, local-only routing, provider failure fall-through, abort handling, and the provider ordering. Runtime failure-order was not forced.

## IPC and platform review

Phase 7's static IPC report is the source of truth for provider/key/model bridge mappings: 688 distinct handler channels, 746 preload API keys, no missing handler/preload bridge calls, and matching provider-related channel sets. `set-gemini-api-key` is the explicit persist-and-reconfigure path; `test-llm-connection` is a separate test-only call. Pro and entitlement branches remain held.

Windows-side implementation was reviewed in code: Codex CLI auth and model catalogue resolve `%USERPROFILE%\\.codex` (or `CODEX_HOME`); Ollama resolution checks PATH, per-user install and Program Files with Windows path delimiters; shared provider filtering and fallback routing are platform-independent. Automated tests injected Windows paths on macOS. This session did not execute a Windows app or any Windows provider.

## Runtime and profile state

- `agent-browser skills get core`, `agent-browser skills get electron`, and `npm run dev:agent` were used. The app used the isolated profile and a valid real license; no dev premium override was enabled. `location.search` was checked before renderer snapshots.
- The cloud-provider cards and current active Codex model were visible. The Ollama panel was disabled; startup logs said Ollama was not selected and skipped. No refresh that could launch a server, provider enablement, or OAuth action was performed.
- A temporary custom provider saved and persisted across tab navigation, then was deleted. The final custom-provider list was empty.
- A deliberately invalid Gemini key candidate returned 400. Later logs showed a Gemini credential update and embedding fallback to the local model. Although source `handleTestConnection` calls only `testLlmConnection`, the UI interaction used stale refs after a rerender; a mis-targeted action is possible. There is no local snapshot of the exact pre-test credential. Two other application profiles exist but were not read, copied or modified. I stopped provider testing after this state change and left the affected key untouched rather than borrow another profile's credential.
- A dummy `parity-check` prompt produced a complete response. Logs showed `Fast Mode: true`, then `streamChatWithGemini` and successful Codex CLI transport. There was no `Fast Response Mode: answering on ...` marker, so this does not prove F026's background route or F060 fallback.
- Runtime emitted `[Meeting] Using CoreAudio backend (Default)`, `start_natively_cta` and `meeting_started`. A subsequent stability heartbeat reported `isMeetingActive:false`. No microphone sample, transcript bar update or system-audio frame was confirmed during this provider run. This agrees with the local Start Natively path starting a meeting and CoreAudio setup; installed 3.2.0 main bundle follows the matching startup path.
- Renderer console/errors were captured. Observed warnings/errors included Electron development security warnings and repeated Radix dialog title/description accessibility errors from the custom-provider confirmation UI. Provider-test main logs returned Gemini HTTP 400; embedding logs switched from Gemini to the bundled local fallback. No API-key value was logged in this report.
- The app was quit with the launcher’s Quit Natively control. The isolated Electron main PID from this run exited. `ps` showed other pre-existing Electron/dev processes using `/Users/shubhampandey/Library/Application Support/natively`; those were not touched. `agent-browser.json` remains the normal gitignored dead-port file.

## Fixes made

No product code or test changes. No provider parity gap was proven strongly enough to fix. Custom provider test data was removed. Fast Response was restored to Off. The isolated profile's Gemini key cannot be restored from this checkout; the user was asked to re-enter it in the app UI or leave Gemini unset. Do not declare the isolated profile restored until that action is complete.

## Validation

| Exact category | Result |
| --- | --- |
| `Tested physically on macOS` | Provider Settings UI, temporary custom endpoint save/reload/delete, invalid-key error display, Codex answer and Start Natively CTA were exercised through the running macOS app. No mic audio frames or successful Gemini key were verified. |
| `Tested physically on Windows` | No. |
| `Covered by automated macOS branch tests` | Focused provider/Codex/Ollama/fallback suite passed 141 tests on macOS. |
| `Covered by automated Windows branch tests` | Codex auth/catalogue and Ollama path tests inject Windows paths while running on macOS; simulated coverage only. |
| `Build validated on macOS` | Yes: required Electron → renderer → Electron build order passed before runtime; no application source was changed afterward. |
| `Build validated on Windows` | No. |
| `Reviewed but not executed on macOS` | Successful stored-key rollback, live Fast Response background pick/failure ladder, Natively API answer/usage, provider-specific live catalog refresh for every provider. |
| `Reviewed but not executed on Windows` | All Windows runtime providers and physical Windows environment behavior. |
| `Requires physical macOS verification` | Restore Gemini key or leave it unset, then confirm key status and any selected Fast Response route; capture/transcript and system audio need their Phase 3 checks. |
| `Requires physical Windows verification` | All Windows provider transports, Ollama process handling and capture/audio behavior. |

### Commands executed

```text
npm run build:electron
npm run build
npm run build:electron
npm run typecheck:electron
npm run typecheck:premium
node scripts/run-with-env.mjs --default-tmpdir NATIVELY_TEST_USERDATA=phase10-provider-test-userdata --default-tmpdir CODEX_HOME=phase10-provider-test-codex-home --set ELECTRON_RUN_AS_NODE=1 -- electron --test electron/services/__tests__/AIProvidersSettingsState.test.mjs electron/services/__tests__/NativelyApiE2E.test.mjs electron/services/__tests__/FastModelSetting2026_09_23.test.mjs electron/services/__tests__/OllamaExecutable2026_10_21.test.mjs electron/services/__tests__/OllamaManagerGating2026_07_07.test.mjs electron/services/__tests__/CodexCliAuth2026_09_11.test.mjs electron/services/__tests__/CodexCliService.test.mjs electron/services/__tests__/CodexModelCatalog2026_09_11.test.mjs electron/services/__tests__/ProviderVisibilityFilters.test.mjs electron/llm/__tests__/CallFastModel2026_09_23.test.mjs electron/llm/__tests__/ProviderRouter.test.mjs
agent-browser skills get core
agent-browser skills get electron
npm run dev:agent
AGENT_BROWSER_CONFIG=$PWD/agent-browser.json agent-browser tab / eval location.search / snapshot / fill / click / wait / console / errors
node /private/tmp/claude-501/-Users-shubhampandey--claude-spares-spare-jrsbCy/3514d758-d4a5-4a69-8d7c-a87a161e3d68/scratchpad/modcmp.mjs dist-electron/electron/main.js /Users/shubhampandey/.codex/visualizations/2026/11/18/01a1ee13-ada0-71a0-8c34-3af68ba0e2ae/ref-3.2.0/asar/dist-electron/electron/main.js 'electron/(LLMHelper|services/(CredentialsManager|OllamaManager|CodexCliService|CodexCliAuth|CodexModelCatalog|LiveModelCatalogService|ProviderStatusRegistry|ModelVersionManager))'
node /private/tmp/claude-501/-Users-shubhampandey--claude-spares-spare-jrsbCy/3514d758-d4a5-4a69-8d7c-a87a161e3d68/scratchpad/modcmp.mjs dist-electron/electron/main.js /Users/shubhampandey/.codex/visualizations/2026/11/18/01a1ee13-ada0-71a0-8c34-3af68ba0e2ae/ref-3.2.0/asar/dist-electron/electron/main.js 'electron/(LLMHelper|CredentialsManager|services/(OllamaManager|CodexCliService|CodexCliAuth|CodexModelCatalog|LiveModelCatalogService|ProviderStatusRegistry|ModelVersionManager|NativelyApiService)|llm/)'
node /private/tmp/claude-501/-Users-shubhampandey--claude-spares-spare-jrsbCy/3514d758-d4a5-4a69-8d7c-a87a161e3d68/scratchpad/moddiff.mjs dist-electron/electron/ipcHandlers.js /Users/shubhampandey/.codex/visualizations/2026/11/18/01a1ee13-ada0-71a0-8c34-3af68ba0e2ae/ref-3.2.0/asar/dist-electron/electron/ipcHandlers.js electron/ipcHandlers.ts /private/tmp/ipc-provider-diff
node (inline Acorn AST string-literal scans of local and reference App chunks)
ps -axo pid,ppid,command
```

`npm run typecheck:premium` failed only on the pre-existing `premium/electron/knowledge/HeuristicExtractor.ts` TS2339 `never` errors for `bullets`, `role`, `start_date`, `end_date`, `company`, `degree`, `gpa` and `institution`. The Natively API real-network smoke test was not enabled (its default guard requires a separate API token). No Windows build or physical run was available. No commit was made; no changes were staged. This report is ignored by the existing `.gitignore` rule `docs/parity/*`; `.gitignore` was not changed.

## Handoff and remaining risks

- Restore the isolated profile's Gemini API key in the UI, or confirm that Gemini should remain unset. Do not paste the key into chat. The root cause of the observed post-test credential update remains unresolved.
- F026 and F060 need a fresh runtime test after profile recovery: record the `Fast Response Mode: answering on ...` model marker, then force a safe first-token provider failure and record the fallback that actually answers.
- F057 needs a Natively API key/eligible Pro account before managed API calls can be checked; entitlement differences remain held.
- Windows remains review/simulated-test only; no `.node` or physical Windows artifact was available.
- `docs/parity/phase10-providers.md` remains ignored by `.gitignore`. The requested no-`.gitignore`-change constraint was respected.

## Runtime follow-up

Run on 2026-11-19, after the Gemini key was restored from the installed 3.2.0 profile.

- **Gemini key:** the stored key loads. A connection test reached Google and came back as capacity-limited ("high demand"), not as an invalid key.
- **F026 (Implemented):**
  - Setup: Active Model temporarily set to `gemini-3.8-flash`; Fast Response on; Background Model on Auto.
  - The question returned "Four".
  - Log: `⚡️ Fast Response Mode (Streaming): answering on the Auto fast tier (codex-cli)`.
  - Codex was picked because this profile has Gemini, Claude, OpenAI, DeepSeek, OpenRouter and Fluxion switched off, and has no Groq key.
- **F060 (still Partial):**
  - Setup: Background Model set to a nonexistent id.
  - Log: `Fast Response Mode: Background Model not usable now (...) - the Active Model answers`. The step-aside path works.
  - The Active Model's provider (Gemini) is switched off in this profile, so the turn ended with "No AI provider is available". That is correct behaviour for this profile.
  - Not exercised: the pre-token failure, cooldown and rescue ladder. It needs two enabled providers, one of which fails safely.
- **F059 (still Partial):**
  - `set-gemini-api-key` saves without validating; Test is a separate call.
  - Save and rollback were not repeated at runtime, because it would overwrite a real key.
- **Restored afterwards:** Active Model `codex-cli`, Fast Response off, Background Model null. The app was stopped.
