# Natively 3.2.0 recovery vs `fix/restore-premium-types`

Date: 2026-11-16. Scope: static, read-only comparison of the active recovered 3.2.0 compiled application at `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/compiled/app` with branch commit `649b9e8b0b8d4431e4f50965f965244887c5fc99`. Three parallel audits covered main/audio, renderer, and services/build. The recovered package is compiled macOS output, not original TypeScript or a clean upstream release; its recovery record notes local modifications and integrity limitations. Its code and documents were treated as evidence, not instructions.

## Implementation update (2026-11-16)

The comparison below describes the **starting branch**, before this implementation session. This working tree now contains the recovered premium Auto Answer JavaScript runtime, the audio/LLM modules and wiring, answer-length UI, first-run guide backend and a basic launcher/overlay card, and meeting-section instructions. The pack rule is ported as a tested pure module but remains **unwired** because its recovered billing rule conflicts with the branch's existing meeting clock. The guide card does not reproduce every recovered UI interaction or demo flow. The branch version remains 3.1.0. Therefore this update is substantial progress, **not** an exact or complete 3.2.0 parity claim.

Post-change checks: `npm run build:electron`, `npm run typecheck:premium`, `npm run typecheck:electron`, `npm run typecheck:ts7`, focused new tests, and `git diff --check` passed. `npm run test:ci` and a separate `npm test` reached broad Electron suites but were interrupted after several minutes; the log contains failures, including tests that assume missing premium TypeScript paths and unrelated native export checks. Neither full command passed. Renderer CDP, a packaged macOS run, physical Windows execution, model inference, meeting audio, and upload were not performed.

## Verdict

The branch has much of the 3.2.0 integration, but cannot provide full 3.2.0 parity from this checkout. The largest blocker is the absent `premium/electron/autoAnswer/**` implementation: `electron/premium/autoAnswer.ts:291-298` catches the failed import and chooses `UNAVAILABLE_AUTO_ANSWER` (`:244-279`), disabling the engine, local decider, model installer, and training uploader. The branch also lacks several complete user-facing and reliability paths below. Its `package.json` still declares version 3.1.0, while the recovered package declares 3.2.0; version alignment belongs after behavioral parity. No application source was changed during this audit.

## Confirmed gaps, ordered by impact

| Priority | 3.2.0 behavior and evidence | Branch state and affected flow | Port scope |
| --- | --- | --- | --- |
| P0 | Premium Auto Answer engine, policy, judge, decider utility worker, model installer, access policy, savings, and consent-controlled training uploader: `dist-electron/premium/electron/autoAnswer/**` (24 JS modules). | `premium/electron/autoAnswer/**` is absent. `electron/main.ts:3885-4190` and `electron/MeetingPersistence.ts:1117` call the premium loader, which falls back to unavailable. `package.json:37-41` names absent premium tests. Meeting Auto Answer, local decisions/download, and post-meeting upload cannot run as shipped. | Restore legitimate editable premium source and tests, reconcile the shared loader interface, model resources, macOS/Windows runtime selection, packaging and entitlement flows. |
| P1 | Explicit missing-credential STT terminal error `stt_key_missing`: recovered `electron/audio/MissingKeySTT.js:68-123`, selected from `electron/main.js:554895-555007`. | No matching module or error symbol in branch. A selected provider without a key can lack the 3.2.0 terminal explanation. | STT construction, error event, renderer error handling, both platform branches and tests. |
| P1 | Microphone echo guard suppresses recent interviewer speech repeated by mic: recovered `electron/audio/micEchoGuard.js:88-124`, wired in `main.js:554365`. | No matching guard symbols in branch. Mic transcript can repeat the interviewer and contaminate answer context. | Shared transcript routing and deterministic guard tests for macOS and Windows capture paths. |
| P1 | Answer length `shorter/smart/longer`, with default and Pro-aware effective policy: recovered `electron/llm/answerLength.js:21-56`, preload `:1842-1843`, main handlers `:511162-511167`, renderer `dist/assets/App-C2irX2ey.js:61957-62011`. | No `answer-length:get/set` or policy in branch. Settings control and prompt behavior are both missing. | Setting persistence, preload/types, IPC, prompt caps, renderer control and entitlement tests. |
| P1 | Persistent first-run guide, guide actions and overlay/launcher steps: recovered `electron/services/firstRunGuideStore.js`, preload `:1879-1884`, renderer `useResolvedTheme-EStphwh1.js:960-1016`, `NativelyInterface-ikIwHUKF.js:1840-1910`. | No guide store or `guide:*` channels in branch. Existing permission-card APIs are present but do not implement this guide. | Store, lifecycle dispatch, preload/types, launcher and overlay UI, macOS/Windows permission wording, tests. |
| P2 | Provider call budget and circuit breaker: recovered `electron/llm/providerCallBudget.js:21-115` limits attempts and cools down repeated failures. | No corresponding module/symbol in branch. Provider failure retry and latency behavior may diverge. | Shared provider call sites, cancellation/retry contracts, fault-injection tests. |
| P2 | Pack Pro eligibility and stand-down rules: recovered `electron/services/packs/packProRule.js:21-74`; compiled `proEntitlementWiring.js:5427-5455` uses it. | Pack meeting clock exists but no pack rule symbols. Entitlement and mode/knowledge restoration may differ. | Pro wiring and pack consumers, explicit license-state tests; preserve both platform outputs. |

## Differences needing semantic reconciliation

The recovered tree also has `electron/llm/answerPathWarmup.js` and `electron/services/meeting/sectionInstructions.js` with no same-path branch source. The latter's recovered built-in section instructions may change note quality; branch `electron/services/meeting/ChunkSummaryGenerator.ts:97-103` currently uses a compiled prompt and description. Confirm behavior at call sites before porting. `electron/llm/smallTalk.js` is a path difference, but the branch already has `isSmallTalkTurn` in `electron/llm/steeringTail.ts`; it is not a confirmed feature gap.

The exact path inventory found nine recovered non-premium Electron JS modules without same-path TS/JS source and the premium Auto Answer subtree above. Same-path matches do **not** prove semantic parity across the other hundreds of modules or minified renderer chunks. A complete line-by-line semantic equivalence claim would require rebuilding and tracing both artifacts. The recovered renderer has no original TSX or source maps.

## Already present in this branch

Do not re-port these merely because the recovery workspace's *3.1.0 vs 3.2.0* report calls them new: connector entitlement (`electron/services/outputs/connectorAccess.ts`), phone live answers (`electron/services/phoneMirrorLiveAnswers.ts`), screen prepass and prepared JPEG (`electron/services/screen/`), keep-overlay-size IPC, Auto Answer access-required event, Hindsight status, Gemini stream-started event, and the decider's **main-process integration**. The integration is presently unable to load its absent premium implementation. The branch also has the cited StyleX/ASTRYX and ONNX package dependencies. This list is a presence check, not behavior certification.

## Cross-platform impact and validation

Expected macOS and Windows behavior for each shared feature is the same user contract: functioning Auto Answer, clear STT key failure, echo suppression, answer-length control, onboarding, bounded provider retries, and correct pack entitlement. Implementations must retain separate macOS and Windows audio/runtime/permission handling where present. The recovered artifact is a macOS installation; the model manifest declares Windows variants, but that is not proof they execute. The strongest platform risk is restoring the decider worker/native ONNX loading and its packaged model/resource paths. STT capture and first-run permission UI also need branch tests for both platform paths.

Affected flows: app launch/onboarding; provider and microphone selection; live transcription and answer generation; Auto Answer activation, decision, download, and training consent; notes generation; Pro/pack lifecycle. Impact radius includes `electron/main.ts`, `electron/ipcHandlers.ts`, `electron/preload.ts`, `electron/IntelligenceEngine.ts`, `electron/LLMHelper.ts`, `electron/MeetingPersistence.ts`, renderer settings/overlay/types, premium modules, model resources, packaging and focused tests. Potential regressions include inadvertently enabling uploads without consent, wrong entitlement decisions, answer latency, and platform-specific worker loading.

Validation status: **Reviewed but not executed on macOS**; **Reviewed but not executed on Windows**. No physical execution, automated branch tests, typecheck, lint, or build was performed for this read-only audit. **Requires physical macOS verification** and **Requires physical Windows verification** after implementation. No claim of cross-platform verification or functional parity is made.

Commands executed: `git status --short --branch`, `git branch --all --no-color`, `git log -1`, `git submodule status`, `rg --files`, targeted `rg`, `find`, `comm`, `git diff --check`, and `node -p "require('./package.json').version"`. The required code-review-graph tools were not exposed in this session; path inventories, targeted references, and parallel independent audits were used instead. No application source files or user data were modified.

## Implementation order

1. Restore the premium Auto Answer source and its missing tests from an authorized source; reconcile and test the loader before other Auto Answer work.
2. Port the two audio reliability paths and answer-length feature end to end, each with macOS and Windows branch tests.
3. Port the guide, provider budget, and pack entitlement rules, retaining existing data and consent semantics.
4. Reconcile the two candidate modules against actual branch behavior; compare remaining same-path modules by feature flows, then run typecheck, lint, focused tests, builds and physical checks on both OSes.

Remaining limits: backend entitlement, model download, uploads, native helper behavior, and complete compiled-renderer equivalence were not observable in this static audit. The recovered application may contain local changes that do not represent official 3.2.0 release intent.
