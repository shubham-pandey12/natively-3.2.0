# Phase 5 final parity inventory

The parity scripts compare build artifacts and provide leads, not proof of source equality. Every reported difference is classified below. `Unsure` entries remain untouched under the phase 5 rule.

## Packaging configuration and build readiness

The recovered compiled 3.2.0 `package.json` has version 3.2.0 but no `build` field. No effective electron-builder config or release artifacts were recovered. The local version now matches; every builder setting below is **Unsure** against 3.2.0 and was left unchanged.

| Local setting | Current value | 3.2.0 parity |
| --- | --- | --- |
| Targets and architectures | macOS ZIP/DMG arm64+x64; Windows NSIS/portable x64 | Unsure |
| `files`, `extraResources`, `asarUnpack` | Local package build rules, including native addons and model resources | Unsure |
| macOS identity, entitlements, hardened runtime, notarization | Identity null; hardened runtime false; no notarize or entitlements in local `build` | Unsure |
| NSIS options | Per-user, multi-step, directory selection, preserve app data | Unsure |
| Publish and update metadata | GitHub publish; update files enabled | Unsure |

The eight validation gate commands passed after the code and CI edits. `npm run app:build` did not complete: first the x64 Rust target was unavailable; after installing it locally, the `cidre` native build required full Xcode, while this machine has only Command Line Tools. Installer packaging would also require `GOOGLE_CALENDAR_CLIENT_SECRET`, which is absent locally. No `.app`, DMG, ZIP, native-module architecture check, packaged local asset check, or packaged launch can be claimed from this attempt. The Windows NSIS CI step uses the CI secret and remains unexecuted here.

## Known risks

- `electron/WindowHelper.ts` writes `/tmp/natively-overlay-resize-trace.log`; compiled 3.2.0 has the same literal. **Unsure, leave:** matches 3.2.0 but violates the cross-platform path rule in `CLAUDE.md`.
- `src/App.tsx` dispatches `{ type: 'trial_out' }` when `guideActive && (showTrialExpiredModal || trialEndedDue)`; compiled `App-C2irX2ey.js:78605-78623` has the same condition and event. `trialEndedOpen` and `<FreeTrialModal>` both have `!guideActive` in local and compiled 3.2.0 (`App-C2irX2ey.js:78687,79273`). This is structural correspondence of compiled output, not source byte equality.
- The 17 unimported legacy renderer files listed in `phase4-renderer-audit.md` are absent from the compiled renderer because they are tree-shaken. Whether they were present in the unrecovered 3.2.0 source cannot be determined. **Unsure, leave** all 17.

## Main-process module comparison

`node scripts/parity/compare-modules.mjs`: 91 reported entries. Extension-only `.js`/`.ts` premium module banners are `Leave-format`; other `Unsure` entries need source-level review before any change.

| Result | Module | Classification |
| --- | --- | --- |
| DIFF | `electron/config/constants.ts` | Unsure |
| DIFF | `electron/context-intelligence/orchestration/engine-bridge.ts` | Unsure |
| DIFF | `electron/context-intelligence/orchestration/orchestrator.ts` | Unsure |
| DIFF | `electron/context-intelligence/retrieval/mode-retrieval-port.ts` | Unsure |
| DIFF | `electron/IntelligenceEngine.ts` | Unsure |
| DIFF | `electron/ipcHandlers.ts` | Unsure |
| DIFF | `electron/llm/codeVerification/localRunner.ts` | Unsure |
| DIFF | `electron/llm/codingShape.ts` | Unsure |
| DIFF | `electron/llm/liveDeadlines.ts` | Unsure |
| DIFF | `electron/llm/manualProfileIntelligence.ts` | Unsure |
| DIFF | `electron/llm/providerErrorClassifier.ts` | Unsure |
| DIFF | `electron/llm/speakability.ts` | Unsure |
| DIFF | `electron/main.ts` | Unsure |
| DIFF | `electron/MeetingPersistence.ts` | Unsure |
| DIFF | `electron/preload.ts` | Unsure |
| DIFF | `electron/premium/autoAnswer.ts` | Unsure |
| DIFF | `electron/services/calendar/providers/microsoftGraph.ts` | Leave-secret |
| DIFF | `electron/services/CalendarManager.ts` | Unsure |
| LOCAL_ONLY | `electron/services/devPremiumOverride.ts` | Leave-dev-override |
| DIFF | `electron/services/knowledge/v3ProfileSources.ts` | Unsure |
| DIFF | `electron/services/meeting/ChunkSummaryGenerator.ts` | Unsure |
| DIFF | `electron/services/meeting/v2FallbackNotes.ts` | Unsure |
| DIFF | `electron/services/packs/packClockWiring.ts` | Leave-billing |
| DIFF | `electron/services/packs/PackMeetingClock.ts` | Leave-billing |
| DIFF | `electron/services/packs/packProRule.ts` | Leave-billing |
| DIFF | `electron/services/proAccess.ts` | Leave-billing |
| DIFF | `electron/services/ProEntitlementReconciler.ts` | Leave-billing |
| DIFF | `electron/services/proEntitlementWiring.ts` | Leave-billing |
| DIFF | `electron/services/RateLimiter.ts` | Unsure |
| DIFF | `electron/utils/onnxLoadSentinel.ts` | Unsure |
| DIFF | `electron/utils/onnxThreadConfig.ts` | Unsure |
| DIFF | `electron/utils/onnxWorkerShutdown.ts` | Unsure |
| DIFF | `electron/utils/pinUserData.ts` | Unsure |
| LOCAL_ONLY | `premium/electron/autoAnswer/autoAnswerAccess.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/autoAnswerAccess.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/AutoAnswerClock.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/AutoAnswerClock.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/AutoAnswerJudge.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/AutoAnswerJudge.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/AutoAnswerPolicy.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/AutoAnswerPolicy.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/AutoAnswerText.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/AutoAnswerText.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/AutoAnswerTypes.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/AutoAnswerTypes.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/AutoAnswerUsageTelemetry.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/AutoAnswerUsageTelemetry.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/appDecider.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/appDecider.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/AutoAnswerDecider.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/AutoAnswerDecider.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/deciderManifest.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/deciderManifest.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/deciderModelInstaller.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/deciderModelInstaller.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/deciderPipeline.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/deciderPipeline.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/deciderPlatform.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/deciderPlatform.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/deciderRuntime.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/deciderRuntime.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/deciderSavings.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/deciderSavings.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/deciderState.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/deciderState.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/deciderUtilityHost.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/deciderUtilityHost.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/deciderWorker.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/deciderWorker.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/DecisionBackend.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/DecisionBackend.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/layaSequence.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/layaSequence.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/layaTokenizer.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/layaTokenizer.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/decider/LocalLayaBackend.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/decider/LocalLayaBackend.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/index.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/index.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/SimpleAutoAnswer.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/SimpleAutoAnswer.ts` | Leave-format |
| LOCAL_ONLY | `premium/electron/autoAnswer/training/TrainingTranscriptUploader.js` | Leave-format |
| RECOVERED_ONLY | `premium/electron/autoAnswer/training/TrainingTranscriptUploader.ts` | Leave-format |
| DIFF | `premium/electron/knowledge/HeuristicExtractor.ts` | Unsure |
| DIFF | `premium/electron/knowledge/KnowledgeOrchestrator.ts` | Unsure |
| LOCAL_ONLY | `premium/electron/knowledge/NativelySearchProvider.js` | Unsure |
| RECOVERED_ONLY | `premium/electron/knowledge/NativelySearchProvider.ts` | Unsure |
| DIFF | `premium/electron/knowledge/StructuredExtractor.ts` | Unsure |
| LOCAL_ONLY | `premium/electron/knowledge/TavilySearchProvider.js` | Unsure |
| RECOVERED_ONLY | `premium/electron/knowledge/TavilySearchProvider.ts` | Unsure |
| DIFF | `src/lib/onboarding/firstRunGuide.mjs` | Unsure |

Counts: Leave-billing 6, Leave-dev-override 1, Leave-format 50, Leave-secret 1, Unsure 33.

## Renderer string comparison

`node scripts/parity/compare-renderer-strings.mjs`: 504 reported literals. This script extracts quote fragments from minified chunks, so punctuation fragments and hashed asset names are `Leave-format`. Billing text and selectors are `Leave-billing`. Remaining literals are `Unsure` pending semantic review; none were changed.

Counts: Leave-billing 9, Leave-format 459, Unsure 36.

```text
recovered	Leave-format	"&&se.depth<re?"
recovered	Leave-format	"&&se.depth>re?"
recovered	Unsure	"',f,'"
recovered	Leave-format	"+t.next+"
recovered	Leave-format	",Be,"
recovered	Leave-format	",En,"
recovered	Leave-format	",It.size-ye,"
recovered	Leave-format	",J?"
recovered	Leave-format	",Mt.length-H,"
recovered	Leave-format	",P?.error??"
recovered	Leave-format	",P?.message??"
recovered	Leave-format	",St,"
recovered	Leave-format	",Tl.length,"
recovered	Leave-format	",U.days,"
recovered	Leave-format	",W?"
recovered	Leave-format	",We,"
recovered	Leave-format	",[Vu]:"
recovered	Leave-format	",background:Y,boxShadow:d.pill.rim,color:N.featured?d.pill.lavenderInk:d.pill.paperInk,cursor:p?"
recovered	Leave-format	",background:vD[p.confidence]??"
recovered	Leave-format	",badge:Cn?"
recovered	Leave-format	",badge:Q??"
recovered	Leave-format	",badge:bd?"
recovered	Leave-format	",badge:ce?"
recovered	Leave-format	",badge:dd?"
recovered	Leave-format	",badge:gd?"
recovered	Leave-format	",badge:md?"
recovered	Leave-format	",badge:pd?"
recovered	Leave-format	",badge:ra?"
recovered	Leave-format	",badge:rn?"
recovered	Leave-format	",borderBottom:st<1?"
recovered	Leave-format	",ce,"
recovered	Leave-format	",children:Ne?"
recovered	Leave-format	",children:[En,"
recovered	Leave-format	",children:[m.preview.fileTree.length,"
recovered	Leave-format	",children:[oe.files.length,"
recovered	Leave-format	",children:[yt,"
recovered	Unsure	",className:Mx,onClick:i,disabled:a||s,"
recovered	Leave-format	",col:1,row:1,type:"
recovered	Leave-format	",col:2,row:1,type:"
recovered	Leave-format	",col:2,row:2,type:"
recovered	Leave-format	",color:S,margin:"
recovered	Leave-format	",color:h.body,margin:0,maxWidth:"
recovered	Leave-format	",color:y.body,margin:0,maxWidth:"
recovered	Leave-format	",color:y.strong,lineHeight:1,fontVariantNumeric:"
recovered	Leave-format	",d2?"
recovered	Leave-format	",disabled:je,title:je?"
recovered	Leave-format	",displace:.5,tint:l?zy:Oy,saturation:l?Wy:By,className:"
recovered	Leave-format	",events:null,format:rp,formatHref:rp,nl2br:!1,tagName:"
recovered	Leave-format	",fill:me?"
recovered	Leave-format	",fontFamily:Qa,fontSize:"
recovered	Leave-format	",fontFamily:Qa,outline:"
recovered	Leave-format	",fontFamily:go,fontSize:12,fontWeight:500,color:d.inkFaint,cursor:"
recovered	Leave-format	",fontFamily:go,fontSize:12.5,fontWeight:600,color:d.ink,cursor:"
recovered	Unsure	",fontSize:m||y?"
recovered	Leave-format	",gap:12,width:"
recovered	Leave-format	",gap:8,cursor:i?"
recovered	Leave-format	",gap:8,fontFamily:go,fontSize:12.5,fontWeight:600,letterSpacing:"
recovered	Leave-format	",gridTemplateRows:"
recovered	Leave-format	",height:Ul,borderRadius:Ul/2,borderWidth:Ly,blur:$y,brightness:60,opacity:.9,distortionScale:l?Dy:Fy,redOffset:0,greenOffset:0,blueOffset:0,yChannel:"
recovered	Leave-format	",height:m,reason:"
recovered	Leave-format	",id:F[z.id]?"
recovered	Leave-format	",id:Ft??"
recovered	Leave-format	",id:Ne?"
recovered	Leave-format	",id:h?"
recovered	Leave-format	",id:je?"
recovered	Leave-format	",id:jt?"
recovered	Leave-format	",id:l?"
recovered	Leave-format	",id:nt?"
recovered	Leave-format	",id:oe?"
recovered	Leave-format	",id:yi?"
recovered	Leave-format	",inert:He,"
recovered	Leave-format	",inert:_i,"
recovered	Leave-format	",k.warning.count,"
recovered	Leave-format	",k.warning.newProvider,"
recovered	Leave-format	",k.warning.oldProvider,"
recovered	Leave-format	",kt.length-ht,"
recovered	Leave-format	",label:Aa?"
recovered	Leave-format	",lineHeight:1.45,color:S?"
recovered	Leave-format	",lineHeight:1.65,color:l,margin:"
recovered	Leave-format	",logo:fP,subtitle:"
recovered	Leave-format	",low:b,high:j,meaning:v?"
recovered	Leave-format	",m.length,"
recovered	Unsure	",message:Zt?.message||"
recovered	Unsure	",message:t?.message||"
recovered	Leave-billing	",oe.unacknowledgedLicense.spdx,"
recovered	Leave-format	",onClick:Yu,className:"
recovered	Leave-format	",onClick:ed,disabled:D,className:"
recovered	Leave-format	",onClick:h,disabled:d,className:"
recovered	Leave-format	",opacity:Mt,flexShrink:0,fontVariantNumeric:"
recovered	Leave-format	",openingView:s,snapshotPaused:Rn,closeInstantly:l,backdropId:"
recovered	Leave-format	",padding:0,minHeight:200,background:b?"
recovered	Leave-format	",pointerEvents:jt?"
recovered	Leave-format	",prompt:XU,screenshot:!1,instruction:"
recovered	Leave-format	",se,"
recovered	Leave-format	",src:Q.url,alt:"
recovered	Leave-format	",st.length-Gt,"
recovered	Leave-format	",st.location,"
recovered	Leave-format	",startedAt:we.startedAt??"
recovered	Leave-format	",startedAt:we.started_at??"
recovered	Leave-format	",stroke:t,strokeWidth:"
recovered	Leave-format	",svg:l.svg,width:l.width,height:l.height,label:"
recovered	Leave-format	",te?.error??"
recovered	Leave-format	",text:Kt[t]??"
recovered	Unsure	",text:t.text||"
recovered	Leave-format	",to:hj,su:"
recovered	Leave-format	",transform:Ae&&!k?"
recovered	Leave-format	",value:He,className:"
recovered	Leave-format	",variants:yz,initial:"
recovered	Leave-format	",ve.bindAddress,"
recovered	Leave-format	",ve.lanUrls.length-1,"
recovered	Leave-format	",xe.olderTitle,"
recovered	Leave-format	",yn,"
recovered	Leave-format	",yt,"
recovered	Leave-format	"./App-C2irX2ey.js"
recovered	Leave-format	"./App-DCscU86D.css"
recovered	Leave-format	"./AuxRoot-Ca343Ect.js"
recovered	Leave-format	"./Cropper-IZeWKP0W.js"
recovered	Leave-format	"./ModelSelectorWindow-1jHL08sf.js"
recovered	Leave-format	"./NativelyInterface-BJ95nTkf.css"
recovered	Leave-format	"./NativelyInterface-ikIwHUKF.js"
recovered	Leave-format	"./NotesWindow-C6aKiJKb.js"
recovered	Leave-format	"./SettingsPopup-CLSGPgiv.js"
recovered	Leave-format	"./abnfDiagram-VCTEODGH-CaUmAwjQ.js"
recovered	Leave-format	"./arc-BcN_67O7.js"
recovered	Leave-format	"./architectureDiagram-5GKGNRK7-DDxpJAUl.js"
recovered	Leave-format	"./blockDiagram-I7D4REHJ-DI10-E6R.js"
recovered	Leave-format	"./c4Diagram-7LVT6UL2-xd2nfqJP.js"
recovered	Leave-format	"./channel-Btz_Akox.js"
recovered	Leave-format	"./chunk-2Q5K7J3B-1KjFTQro.js"
recovered	Leave-format	"./chunk-5VM5RSS4-DTOdBYfK.js"
recovered	Leave-format	"./chunk-F27PBJKO-Cc2Y681g.js"
recovered	Leave-format	"./chunk-IMKFNOWR-BNqK_q8Q.js"
recovered	Leave-format	"./chunk-JWPE2WC7-BL-PPqMN.js"
recovered	Leave-format	"./chunk-POPQ4Y6H-DoEFHVeP.js"
recovered	Leave-format	"./chunk-SVP7TREG-d1gbcD62.js"
recovered	Leave-format	"./chunk-TICWLB2K-B9_LLQct.js"
recovered	Leave-format	"./chunk-XXDRQBXY-CL-puYzf.js"
recovered	Leave-format	"./classDiagram-ZZMXUADV-CyTiHq3D.js"
recovered	Leave-format	"./classDiagram-v2-VYDZK3BY-CyTiHq3D.js"
recovered	Leave-format	"./cose-bilkent-JH36ORCC-CmeTbC1I.js"
recovered	Leave-format	"./cynefinDiagram-5FMLGOSQ-BQFUD9tP.js"
recovered	Leave-format	"./dagre-GXQ25YYZ-UCfIclGI.js"
recovered	Leave-format	"./diagram-S7CK7UJ4-C8I2kDhL.js"
recovered	Leave-format	"./diagram-UQ7AKVKN-BZZ8iVSc.js"
recovered	Leave-format	"./diagram-VSXAHHWV-DilBz4lx.js"
recovered	Leave-format	"./diagram-VX7I27RA-CBgJJash.js"
recovered	Leave-format	"./diagram-Z3DM3KII-L5iUJdrc.js"
recovered	Leave-format	"./ebnfDiagram-PWID7BFC-qyBh2itD.js"
recovered	Leave-format	"./erDiagram-RLTQ6QDP-9M2-GFv1.js"
recovered	Leave-format	"./flowDiagram-HODETNUW-CVuKKszv.js"
recovered	Leave-format	"./ganttDiagram-EL5Y4UJY-DBHJeuIA.js"
recovered	Leave-format	"./gitGraphDiagram-WWUBYQGX-Du00-V_l.js"
recovered	Leave-format	"./i18n-Fls_i-jT.js"
recovered	Leave-format	"./icon-vendor-DfH6n_0H.js"
recovered	Leave-format	"./index-B4Sgr6RG.js"
recovered	Leave-format	"./index-WC6tpguN.css"
recovered	Leave-format	"./infoDiagram-27XIBGKW-Dccgc99B.js"
recovered	Leave-format	"./ishikawaDiagram-5VMMS53U-Dl9kQ3X2.js"
recovered	Leave-format	"./journeyDiagram-3NMN7TZE-CNxAC6Xt.js"
recovered	Leave-format	"./kanban-definition-UXKFOSKX-CMPgW_El.js"
recovered	Leave-format	"./layout-COcFKWLu.js"
recovered	Leave-format	"./linear-Dy1SL7H0.js"
recovered	Leave-format	"./mermaid.core-C4EyzrUd.js"
recovered	Leave-format	"./mindmap-definition-YA3MSWOX-GPWj7X7f.js"
recovered	Leave-format	"./pegDiagram-XKGWAZYB-Chddrf_8.js"
recovered	Leave-format	"./pieDiagram-E7YTZNPT-CSY-wXqb.js"
recovered	Leave-format	"./quadrantDiagram-AXDQQJYC-BfpLfBKr.js"
recovered	Leave-format	"./railroadDiagram-O6MQD6OU-CiNrFVjw.js"
recovered	Leave-format	"./requirementDiagram-BXWQKSXE-CSttRjNa.js"
recovered	Leave-format	"./sankeyDiagram-P5KCCOFB-y0aqXowI.js"
recovered	Leave-format	"./sequenceDiagram-WJ2MYXX4-CXquz9zn.js"
recovered	Leave-format	"./sizeCapture-INFHLROL-DvPh709K.js"
recovered	Leave-format	"./stageCatalog-E8RZkqdt.js"
recovered	Leave-format	"./stateDiagram-D77RDMKH-kbKLGioT.js"
recovered	Leave-format	"./stateDiagram-v2-MP3YSRHH-DGG4ZPuz.js"
recovered	Leave-format	"./swimlanes-42K2YHIH-M6FMTQDb.js"
recovered	Leave-format	"./swimlanesDiagram-VR7AAH4N-twuMeTi6.js"
recovered	Leave-format	"./timeline-definition-24CTP7MA-B89t29NT.js"
recovered	Leave-format	"./useResolvedTheme-EStphwh1.js"
recovered	Leave-format	"./vennDiagram-4TSXK5OY-DxIJpiU-.js"
recovered	Leave-format	"./wardleyDiagram-VM6X3IG4-D0bacxPx.js"
recovered	Leave-format	"./xychartDiagram-S5SC5T6Z-tbDN7cII.js"
recovered	Unsure	"10px 8px 4px"
recovered	Unsure	"5e55af381cdc-dirty"
recovered	Leave-format	":$0,advisory:j0,"
recovered	Leave-format	":$p,troubleshooting:A0,"
recovered	Leave-format	":Aa?"
recovered	Leave-format	":Bp,"
recovered	Leave-format	":D0,networking:O0,"
recovered	Leave-format	":E0,"
recovered	Leave-format	":H0,hiring:F0,"
recovered	Leave-format	":I0,"
recovered	Leave-format	":Ke,"
recovered	Leave-format	":Kt?"
recovered	Leave-format	":L0,"
recovered	Leave-format	":N0,brainstorm:C0,"
recovered	Leave-format	":Oy?"
recovered	Leave-format	":P0,"
recovered	Leave-format	":R0,"
recovered	Leave-format	":S,role:"
recovered	Leave-format	":S0,"
recovered	Leave-format	":T0,"
recovered	Leave-format	":Te?"
recovered	Leave-format	":Ul,"
recovered	Leave-format	":Ve?"
recovered	Leave-format	":X["
recovered	Leave-format	":Xe?"
recovered	Leave-format	":_0,"
recovered	Leave-format	":al?"
recovered	Leave-format	":b,"
recovered	Leave-format	":bn?"
recovered	Leave-format	":c.title??"
recovered	Leave-format	":dt,className:"
recovered	Leave-format	":h.done?"
recovered	Unsure	":ie||p?"
recovered	Leave-format	":j?.success?"
recovered	Unsure	":kt||void 0,title:en,className:"
recovered	Leave-format	":le?"
recovered	Leave-format	":le["
recovered	Leave-format	":ln?"
recovered	Leave-format	":m,className:"
recovered	Leave-format	":m[A.action]?"
recovered	Leave-format	":m[x.action]?"
recovered	Leave-format	":nn?"
recovered	Leave-format	":null,ready:ve,className:"
recovered	Leave-format	":oe,className:"
recovered	Leave-format	":q>.94?"
recovered	Leave-format	":rt?"
recovered	Leave-format	":ul?"
recovered	Leave-format	":v.status,"
recovered	Unsure	":x||void 0,title:"
recovered	Leave-format	":ye&&j?"
recovered	Leave-format	":ye&&j?.success?"
recovered	Leave-format	":z0,"
recovered	Unsure	"><head></head><body>'+O+"
recovered	Leave-format	"?12:11,color:"
recovered	Leave-format	"?14:11,fontWeight:600,color:"
recovered	Leave-format	"?I:"
recovered	Leave-format	"?L.label:void 0,className:"
recovered	Leave-format	"?Ur:"
recovered	Leave-format	"?c[d?"
recovered	Leave-format	"?d??c.title??"
recovered	Unsure	"?ge:ge?.body||"
recovered	Leave-format	"?n.meta.markText:"
recovered	Leave-format	"?t.overview:"
recovered	Unsure	"ExposureRow"
recovered	Unsure	"For a busy week of meetings, with no plan to cancel."
recovered	Leave-billing	"Your pack includes Natively Pro, paused while AI or transcription uses another provider. Switch both back to Natively API to turn Pro on again."
recovered	Unsure	"ap-close-btn"
recovered	Leave-billing	"ap-unlock-arrow"
recovered	Leave-billing	"api-tier-save api-tier-save-inline"
recovered	Leave-billing	"data-pack-pro-paused"
recovered	Leave-billing	"data-pack-provider-rule"
recovered	Unsure	"grayscale"
recovered	Unsure	"large-sq"
recovered	Leave-billing	"lg-sm ap-unlock-lg"
recovered	Leave-billing	"modes-pro-gate"
recovered	Unsure	"modes_settings"
recovered	Unsure	"text-[11px] text-text-tertiary px-1 leading-snug"
recovered	Unsure	"text-[12px] text-text-secondary px-1 leading-snug"
local	Leave-format	"&&ie.depth<se?"
local	Leave-format	"&&ie.depth>se?"
local	Unsure	"',h,'"
local	Leave-format	"+i+r+"
local	Leave-format	"+n.next+"
local	Leave-format	",Ge,"
local	Leave-format	",L?.error??"
local	Leave-format	",L?.message??"
local	Leave-format	",Le,"
local	Leave-format	",Rt.length-K,"
local	Leave-format	",Tt.size-je,"
local	Leave-format	",U?"
local	Leave-format	",V.days,"
local	Leave-format	",[Ah]:"
local	Leave-format	",ae?.error??"
local	Leave-format	",at.length-Ut,"
local	Leave-format	",at.location,"
local	Leave-format	",background:CZ[p.confidence]??"
local	Leave-format	",background:Y,boxShadow:d.pill.rim,color:A.featured?d.pill.lavenderInk:d.pill.paperInk,cursor:p?"
local	Leave-format	",badge:Au?"
local	Leave-format	",badge:Ea?"
local	Leave-format	",badge:En?"
local	Leave-format	",badge:Eu?"
local	Leave-format	",badge:Iu?"
local	Leave-format	",badge:Pu?"
local	Leave-format	",badge:Su?"
local	Leave-format	",badge:ge?"
local	Leave-format	",badge:on?"
local	Leave-format	",badge:q??"
local	Leave-format	",be.bindAddress,"
local	Leave-format	",be.lanUrls.length-1,"
local	Leave-format	",borderBottom:at<1?"
local	Leave-format	",c2?"
local	Leave-format	",children:Ae?"
local	Leave-format	",children:[f.preview.fileTree.length,"
local	Leave-format	",children:[ft,"
local	Leave-format	",children:[he.files.length,"
local	Leave-format	",children:[wn,"
local	Unsure	",className:t1,onClick:i,disabled:a||s,"
local	Leave-format	",color:N,margin:"
local	Leave-format	",color:b.body,margin:0,maxWidth:"
local	Leave-format	",color:b.strong,lineHeight:1,fontVariantNumeric:"
local	Leave-format	",color:m.body,margin:0,maxWidth:"
local	Leave-format	",disabled:we,title:we?"
local	Leave-format	",displace:.5,tint:o?l2:o2,saturation:o?d2:c2,className:"
local	Leave-format	",events:null,format:tp,formatHref:tp,nl2br:!1,tagName:"
local	Leave-format	",f.length,"
local	Leave-format	",fill:B?"
local	Leave-format	",fontFamily:Zo,fontSize:12,fontWeight:500,color:d.inkFaint,cursor:"
local	Leave-format	",fontFamily:Zo,fontSize:12.5,fontWeight:600,color:d.ink,cursor:"
local	Leave-format	",fontFamily:xr,fontSize:"
local	Leave-format	",fontFamily:xr,outline:"
local	Leave-format	",fontSize:14,fontWeight:600,cursor:"
local	Unsure	",fontSize:f||b?"
local	Leave-format	",ft,"
local	Leave-format	",gap:12,flexWrap:"
local	Leave-format	",gap:8,cursor:r?"
local	Leave-format	",gap:8,fontFamily:Zo,fontSize:12.5,fontWeight:600,letterSpacing:"
local	Leave-format	",ge,"
local	Leave-billing	",he.unacknowledgedLicense.spdx,"
local	Leave-format	",height:44,borderRadius:22,background:"
local	Leave-format	",height:Dc,borderRadius:Dc/2,borderWidth:s2,blur:a2,brightness:60,opacity:.9,distortionScale:o?r2:i2,redOffset:0,greenOffset:0,blueOffset:0,yChannel:"
local	Leave-format	",height:g,reason:"
local	Leave-format	",id:Ae?"
local	Leave-format	",id:Dt??"
local	Leave-format	",id:F[W.id]?"
local	Leave-format	",id:he?"
local	Leave-format	",id:o?"
local	Leave-format	",id:qi?"
local	Leave-format	",id:st?"
local	Leave-format	",id:we?"
local	Leave-format	",id:wt?"
local	Leave-format	",inert:We,"
local	Leave-format	",inert:ji,"
local	Leave-format	",j.warning.count,"
local	Leave-format	",j.warning.newProvider,"
local	Leave-format	",j.warning.oldProvider,"
local	Leave-format	",jc.length,"
local	Leave-format	",jt,"
local	Leave-format	",label:Fa?"
local	Leave-format	",label:s.labels.only_answer_from_references??"
local	Leave-format	",lineHeight:1.45,color:N?"
local	Leave-format	",lineHeight:1.65,color:o,margin:"
local	Leave-format	",logo:AO,subtitle:"
local	Leave-format	",low:v,high:k,meaning:w?"
local	Unsure	",message:Yt?.message||"
local	Unsure	",message:n?.message||"
local	Leave-format	",ne?"
local	Leave-format	",oe,"
local	Leave-format	",onClick:Gu,className:"
local	Leave-format	",onClick:f,disabled:d,className:"
local	Leave-format	",onClick:mu,disabled:Q,className:"
local	Leave-format	",opacity:Rt,flexShrink:0,fontVariantNumeric:"
local	Leave-format	",openingView:s,snapshotPaused:Rn,closeInstantly:o,backdropId:"
local	Leave-format	",padding:0,minHeight:200,background:k?"
local	Leave-format	",pe.olderTitle,"
local	Leave-format	",pointerEvents:wt?"
local	Leave-format	",prompt:Use,screenshot:!1,instruction:"
local	Leave-format	",rn,"
local	Leave-format	",src:J.url,alt:"
local	Leave-format	",startedAt:Ne.startedAt??"
local	Leave-format	",startedAt:Ne.started_at??"
local	Leave-format	",svg:o.svg,width:o.width,height:o.height,label:"
local	Leave-format	",text:Gt[t]??"
local	Unsure	",text:n.text||"
local	Leave-format	",to:xA,su:"
local	Leave-format	",transform:te&&!j?"
local	Leave-format	",value:Ke,className:"
local	Leave-format	",variants:ree,initial:"
local	Leave-format	",vt.length-gt,"
local	Leave-format	",wn,"
local	Leave-format	"./App-BYtY8HfP.js"
local	Leave-format	"./App-BaYvEF8_.css"
local	Leave-format	"./AuxRoot-BLynmbpr.js"
local	Leave-format	"./Cropper-eWzY-Hge.js"
local	Leave-format	"./ModelSelectorWindow-DoiLTrLy.js"
local	Leave-format	"./NativelyInterface-BeuwdlQh.css"
local	Leave-format	"./NativelyInterface-pd7c9QC1.js"
local	Leave-format	"./NotesWindow-l3AkOgzH.js"
local	Leave-format	"./SettingsPopup-DqQRkQe_.js"
local	Leave-format	"./abnfDiagram-VCTEODGH-C4Ta9P-l.js"
local	Leave-format	"./arc-B1CKD3VM.js"
local	Leave-format	"./architectureDiagram-5GKGNRK7-BIux7cWU.js"
local	Leave-format	"./blockDiagram-I7D4REHJ-D7ZCUlQv.js"
local	Leave-format	"./c4Diagram-7LVT6UL2-DnwNeHEV.js"
local	Leave-format	"./channel-pv87HpE7.js"
local	Leave-format	"./chunk-2Q5K7J3B-DZsXxZsX.js"
local	Leave-format	"./chunk-5VM5RSS4-Bk2Sc7wj.js"
local	Leave-format	"./chunk-F27PBJKO-DI2Ik2vs.js"
local	Leave-format	"./chunk-IMKFNOWR-DP2k7vd4.js"
local	Leave-format	"./chunk-JWPE2WC7-CedBJU4O.js"
local	Leave-format	"./chunk-POPQ4Y6H-DJAtbj1m.js"
local	Leave-format	"./chunk-SVP7TREG-D9CrCtLh.js"
local	Leave-format	"./chunk-TICWLB2K-CpX8RHEj.js"
local	Leave-format	"./chunk-XXDRQBXY-C7LJavzR.js"
local	Leave-format	"./classDiagram-ZZMXUADV-gvF3QKrc.js"
local	Leave-format	"./classDiagram-v2-VYDZK3BY-gvF3QKrc.js"
local	Leave-format	"./cose-bilkent-JH36ORCC-Bt0G4UO2.js"
local	Leave-format	"./cynefinDiagram-5FMLGOSQ-CAm4CBDW.js"
local	Leave-format	"./dagre-GXQ25YYZ-BAdEpYUV.js"
local	Leave-format	"./diagram-S7CK7UJ4-DdJiOZ7v.js"
local	Leave-format	"./diagram-UQ7AKVKN-CzX4qWiS.js"
local	Leave-format	"./diagram-VSXAHHWV-BcBU2t87.js"
local	Leave-format	"./diagram-VX7I27RA-CgWUxS8D.js"
local	Leave-format	"./diagram-Z3DM3KII-8_j6Z4Eb.js"
local	Leave-format	"./ebnfDiagram-PWID7BFC-Dah-8Yoh.js"
local	Leave-format	"./erDiagram-RLTQ6QDP-C3nVBp6R.js"
local	Leave-format	"./flowDiagram-HODETNUW-C_v0S3o-.js"
local	Leave-format	"./ganttDiagram-EL5Y4UJY-IHTviYpa.js"
local	Leave-format	"./gitGraphDiagram-WWUBYQGX-DOdBenC5.js"
local	Leave-format	"./i18n-Cu3EpVy4.js"
local	Leave-format	"./icon-vendor-OX8-iRas.js"
local	Leave-format	"./index-BS2__XZx.css"
local	Leave-format	"./index-CSxNV5EW.js"
local	Leave-format	"./infoDiagram-27XIBGKW-B15WGwZJ.js"
local	Leave-format	"./ishikawaDiagram-5VMMS53U-C2C7EYLn.js"
local	Leave-format	"./journeyDiagram-3NMN7TZE-8uj_b3mC.js"
local	Leave-format	"./kanban-definition-UXKFOSKX-DMVrhY9o.js"
local	Leave-format	"./layout-hkR8X_UX.js"
local	Leave-format	"./linear-CNLU4RSF.js"
local	Leave-format	"./mermaid.core-CF__5O0i.js"
local	Leave-format	"./mindmap-definition-YA3MSWOX-BAfQiE6g.js"
local	Leave-format	"./pegDiagram-XKGWAZYB-B-ALWiic.js"
local	Leave-format	"./pieDiagram-E7YTZNPT-jlccyrZ0.js"
local	Leave-format	"./quadrantDiagram-AXDQQJYC-D8YZOxY0.js"
local	Leave-format	"./railroadDiagram-O6MQD6OU-DrRVb3dW.js"
local	Leave-format	"./requirementDiagram-BXWQKSXE-Be9jEfAB.js"
local	Leave-format	"./sankeyDiagram-P5KCCOFB-vL4tdKWJ.js"
local	Leave-format	"./sequenceDiagram-WJ2MYXX4-7mOafURz.js"
local	Leave-format	"./sizeCapture-INFHLROL-SAMmYGu6.js"
local	Leave-format	"./stageCatalog-DSKtSZ6U.js"
local	Leave-format	"./stateDiagram-D77RDMKH-DdHwsb8S.js"
local	Leave-format	"./stateDiagram-v2-MP3YSRHH-Dt5NdOrC.js"
local	Leave-format	"./swimlanes-42K2YHIH-D94txt0_.js"
local	Leave-format	"./swimlanesDiagram-VR7AAH4N-C4-uNy5i.js"
local	Leave-format	"./timeline-definition-24CTP7MA-DFD00G-F.js"
local	Leave-format	"./useResolvedTheme-DXQb49gR.js"
local	Leave-format	"./vennDiagram-4TSXK5OY-CftKnzAm.js"
local	Leave-format	"./wardleyDiagram-VM6X3IG4-BG1EzljA.js"
local	Leave-format	"./xychartDiagram-S5SC5T6Z-CJDsVbFh.js"
local	Unsure	"2 meeting hours within 7 days"
local	Unsure	"4px 8px 4px"
local	Unsure	"93972a143894-dirty"
local	Leave-format	":$0,"
local	Leave-format	":A0,"
local	Leave-format	":C0,"
local	Leave-format	":D0,"
local	Leave-format	":De,"
local	Leave-format	":Ee?"
local	Leave-format	":Fa?"
local	Leave-format	":G>.94?"
local	Leave-format	":I0,networking:R0,"
local	Leave-format	":Iy?"
local	Leave-format	":Je?"
local	Leave-format	":L0,advisory:P0,"
local	Leave-format	":Lp,troubleshooting:E0,"
local	Leave-format	":N,role:"
local	Leave-format	":N0,"
local	Leave-format	":Ne?"
local	Leave-format	":O0,"
local	Leave-format	":Ql?"
local	Leave-format	":T0,brainstorm:S0,"
local	Leave-format	":Wl,"
local	Leave-format	":_0,hiring:z0,"
local	Leave-format	":ct,className:"
local	Leave-format	":dn?"
local	Leave-format	":ee["
local	Leave-format	":f[S.action]?"
local	Leave-format	":f[x.action]?"
local	Leave-format	":fe?"
local	Leave-format	":fe["
local	Leave-format	":g,className:"
local	Leave-format	":g0,"
local	Leave-format	":h.title??"
local	Leave-format	":he,className:"
local	Leave-format	":ic?"
local	Leave-format	":j0,"
local	Leave-format	":je&&k?"
local	Leave-format	":je&&k?.success?"
local	Leave-format	":jp,"
local	Leave-format	":k?.success?"
local	Leave-format	":m,fill:"
local	Leave-format	":m.done?"
local	Leave-format	":null,ready:be,className:"
local	Leave-format	":o?"
local	Unsure	":oe||p?"
local	Leave-format	":ot?"
local	Leave-format	":qe?"
local	Leave-format	":ue?"
local	Unsure	":vt||void 0,title:tn,className:"
local	Unsure	":v||void 0,title:"
local	Leave-format	":w,"
local	Leave-format	":w.status,"
local	Leave-format	":y0,"
local	Unsure	"><head></head><body>'+H+"
local	Leave-format	"?T:"
local	Leave-format	"?_.label:void 0,className:"
local	Leave-format	"?c[u?"
local	Leave-format	"?m??h.title??"
local	Leave-format	"?n.overview:"
local	Leave-format	"?qr:"
local	Leave-format	"?t.meta.markText:"
local	Unsure	"?ue:ue?.body||"
local	Unsure	"For two busy weeks of meetings, with no plan to cancel."
```

Every reported module and literal has a classification.
