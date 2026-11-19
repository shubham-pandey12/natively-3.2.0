# Phase 6: knowledge and retrieval parity (3.2.0)

## Method and scope

Built `electron → renderer → electron`, then compared `dist-electron/electron/main.js` with the signed 3.2.0 `asar/dist-electron/electron/main.js` as Latin-1, split at esbuild `// <path>` headers. Binary-containing bundles were checked with `diff -a` and file sizes. The reference was read as data only. The code-review-graph MCP server was unavailable (no graph tools exposed), so source inspection and bundle diffs supplied the evidence. IPC equivalence was previously established in [phase7-ipc.md](phase7-ipc.md). The reference's advertised `asar/premium` path does not exist; its shipped premium output is `asar/dist-electron/premium`.

Reference module anchors (line numbers in `ref-3.2.0/asar/dist-electron/electron/main.js`): embedding catalog 3616, manual profile intelligence 169213, ProfileJitPromptBuilder 232093, StructuredExtractor 246824, DocumentChunker 247685, CompanyResearchEngine 249177, KnowledgeOrchestrator 255081, SemanticChunker 500790, LiveRAGIndexer 502430, RAGManager 503004. Local source evidence is cited below. The same main bundle is used on darwin and win32; native ONNX/SQLite execution was observed only on macOS.

## Module comparison

| Scope | Identical | Rename-only | Real difference | Apparent missing/extra |
|---|---:|---:|---:|---:|
| `electron/context-intelligence`, `electron/rag`, `electron/llm`, `premium/electron/knowledge` | 262 | 24 | 10 | 2/2 source-extension aliases |

The two apparent missing `.ts` modules and two extra `.js` modules are `NativelySearchProvider` and `TavilySearchProvider`. Their emitted provider bodies match; the header comments carry the source extension. Each of the ten real differences was inspected with a unified `diff -a -u`:

| Module | Classification and diff excerpt |
|---|---|
| `KnowledgeOrchestrator.ts` | Reordering/comment and equivalent Pro-key spelling: reference `globalThis[KNOWLEDGE_PRO_ACCESS_KEY2]`, local `globalThis.__nativelyKnowledgeProAccessV1__`; both use the same literal key. Reference's `allowed=false` catch and local early-return catch both deny on failure. Other call movement is formatting. |
| `smallTalk.ts` | Four explanatory comments in reference; executable regexes match. |
| `manualProfileIntelligence.ts` | Regex alternatives reordered before a fixed `\s+you`; accepted language unchanged. |
| `HeuristicExtractor.ts` | Local `/\0/g`, reference regex containing literal NUL; both match U+0000. |
| `mode-retrieval-port.ts` | Independent constant declarations reordered; same values. |
| `liveDeadlines.ts`, `speakability.ts`, `codingShape.ts` | Function declarations reordered, bodies unchanged. |
| `StructuredExtractor.ts` | Module initialization order changed; extraction functions and schema unchanged. |
| `orchestration/orchestrator.ts` | `applyModeSourceContract` moves across the additive `extraAllowedSourceTypes` step. Both paths give the same membership and source priorities; the order of `allowedSourceTypes` can differ if the contract adds `REFERENCE_FILE` alongside a different extra type. Local [orchestrator.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/context-intelligence/orchestration/orchestrator.ts:260), reference main module `electron/context-intelligence/orchestration/orchestrator.ts`. No observed retrieval result difference; retained for targeted follow-up rather than altering a shared policy on inference alone. |

## Shipped premium output

Local and reference each contain 72 `.js` paths, with no missing path. Local additionally contains 72 `.js.map` files. Thirty same-path JS files differ at byte level: 25 `autoAnswer` files (outside this phase), four knowledge files plus `KnowledgeOrchestrator.js`, and `LicenseManager.js` (held licence area). Knowledge diffs: `NativelySearchProvider.js` and `TavilySearchProvider.js` differ only in `.js` versus `.ts` source-header comments; `HeuristicExtractor.js` has the NUL regex spelling above; `StructuredExtractor.js` relocates `types`/`llmUtils` declarations without changing their bodies; the large `KnowledgeOrchestrator.js` bundles the same module reordering/comment differences above. The autoAnswer and licence file differences are not classified as knowledge gaps; they remain in the Phase 2 and held F099 scopes. Both provider bodies were also located in the main bundle; no provider is absent.

## Data and configuration

Every `electron/rag` module and all knowledge modules containing these values is identical or has only the classified differences above, so the emitted values match the reference. Examples from the local sources, with the corresponding reference module anchors above:

| Contract | Local and reference value/evidence |
|---|---|
| Embedding IDs/dimensions | [embeddingCatalog.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/rag/embeddingCatalog.ts:91): OpenAI `text-embedding-3-small` 1536, `-large` 3072, `ada-002` 1536; Gemini `gemini-embedding-2` and `-001` 3072 with 768/1536/3072 options; managed `voyage-4` 2048. Provider/model/dimension form the persisted space key in `embeddingSpace.ts:21-29`. Runtime selected Gemini 3072d. |
| Chunking | [SemanticChunker.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/rag/SemanticChunker.ts:19): target 300, max 400, overlap target 50 tokens. [DocumentChunker.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/premium/electron/knowledge/DocumentChunker.ts:297): embed batch 10, retry 1500 ms at line 231. |
| Reembed/version | [types.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/premium/electron/knowledge/types.ts:170): profile schema 2. [KnowledgeOrchestrator.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/premium/electron/knowledge/KnowledgeOrchestrator.ts:138): debounce 60,000 ms, max five passes at line 2429. [RAGManager.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/rag/RAGManager.ts:1211): auto reindex delay 15,000 ms, live recheck 30,000 ms, drain poll 2,000 ms. |
| Live indexer | [LiveRAGIndexer.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/rag/LiveRAGIndexer.ts:15): 30,000 ms tick, three new segments, embed batch 16, eight batches per tick. |
| Search | [NativelySearchProvider.js](/Users/shubhampandey/testing/natively-cluely-ai-assistant/premium/electron/knowledge/NativelySearchProvider.js:24): `https://api.natively.software/v1/search`. [TavilySearchProvider.js](/Users/shubhampandey/testing/natively-cluely-ai-assistant/premium/electron/knowledge/TavilySearchProvider.js:48): result count clamped 1–20; provider implementation and its request parameters are byte identical apart from source-header comments. Retrieval score/limit modules are identical, including `RAGRetriever.ts` (reference main bundle). |
| Extractor and research | [StructuredExtractor.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/premium/electron/knowledge/StructuredExtractor.ts:173): sanitized document text and JSON-only response instruction; schemas/fields match `types.ts` in both bundles. [CompanyResearchEngine.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/premium/electron/knowledge/CompanyResearchEngine.ts:332) uses the same web-snippet dossier prompt and line 395 fallback prompt in both. No separate numeric prompt ID is emitted for those prompts. |
| JD/resume | [ProfileJitPromptBuilder.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/electron/llm/ProfileJitPromptBuilder.ts:1), [StructuredResumeNormalizer.ts](/Users/shubhampandey/testing/natively-cluely-ai-assistant/premium/electron/knowledge/StructuredResumeNormalizer.ts:1), and `CompanyResearchEngine.ts` are identical module bodies in the reference; prompt text and limits match. |

The 15 files under local `resources/models` match `ref-3.2.0/models` by relative name, byte size, and SHA-256, including both ONNX embedding/reranker weights, tokenizers, manifests, and smart-turn model. `package.json:299-303` packages `resources/models` as `models`; comparing the repo's top-level `models/` would be the wrong mapping. Missing: 0; extra: 0; changed: 0.

## Renderer string comparison

The renderer has 77 matched chunks: 67 byte identical, 10 byte different, no missing/extra chunks. `App.js` contains Retrieval, Intelligence, Profile Intelligence and knowledge UI. Literal extraction on `App.js`, `NativelyInterface.js`, and `AuxRoot.js` was filtered to readable knowledge/retrieval strings, then each apparent missing string was checked as a substring in the other bundle (to account for Vite/minifier quote changes). The six apparent reference-only strings, including `queued for indexing`, `indexing complete, semantic search ready`, and the JD placeholder, all occur in the local `App` bundle and source `premium/src/ModesSettings.tsx:625,787`. No knowledge UI text gap was proved. The remaining chunk differences include known held billing/trial content and minifier symbol/hash changes; raw minified code is not treated as a text diff.

## HeuristicExtractor typecheck

`npm run typecheck:premium` fails on existing `HeuristicExtractor.ts` inferred-`never` property errors (lines 240, 250, 260, 275–276, 314, 454, 489, 505, 534, 542). Its emitted module differs from 3.2.0 only in the equivalent NUL regex spelling. This is a type-only problem in this comparison, not evidence of a different extraction result. It still blocks a clean premium typecheck and needs a separate type fix.

## Runtime (isolated macOS dev profile)

Commands: `agent-browser skills get core`, `agent-browser skills get electron`, `npm run dev:agent`, then `AGENT_BROWSER_CONFIG=$PWD/agent-browser.json agent-browser tab/eval/snapshot/console/errors`. `location.search` was confirmed as `?window=launcher` before every snapshot. The Retrieval settings tab showed Gemini embedding selected, local models Installed (1), and reranker controls. Main log: `[EmbeddingProviderResolver] Selected provider: gemini (3072d)`, `[EmbeddingPipeline] Ready with provider: gemini (3072d)`, `[VectorStore] Using native sqlite-vec for vector search`, `[EmbeddingPipeline] Queue empty`. Intelligence settings showed Memory and Search past meetings off. Profile Intelligence showed a saved resume, empty JD upload surface, and a readable Profile with Experience and Skills. Console/errors were captured in `/private/tmp/phase12-console.txt` and `/private/tmp/phase12-errors.txt` (scratch only).

| Feature | Runtime result and limit |
|---|---|
| F061 spaces | Settings and profile reached; no user knowledge space was created or deleted. Space list/indexing UI was not reached. |
| F062 reembed | Version and trigger reviewed statically; no reembed triggered on user data. |
| F063 live indexer | Startup showed embedding queue empty; no meeting or new document indexed in this phase. |
| F064/F065 search | Provider path reviewed statically; no search request was sent because configured service availability was not established without touching credentials. |
| F066/F067 extractor/orchestrator | Existing profile rendered; ingestion and orchestration not driven live. |
| F068 company research | Company Intel entry was visible; no external research request sent. |
| F069/F070 profile/JD/resume | Existing resume and profile read only; JD upload was empty, no saved profile changes. |

No settings or profile records were changed. App was stopped through launcher **Quit Natively**. The isolated profile was left as found.

## Fixes, validation, and risks

No source fix: the observed differences are cosmetic or lack a proven behavior gap. The single policy ordering difference remains a targeted follow-up. `npm run build:electron && npm run build && npm run build:electron` passed. `npm run typecheck:electron` passed. `node --test electron/context-intelligence/__tests__/OpenKnowledgeRouting2026_08_02.test.mjs electron/llm/__tests__/JdResumeJitPipeline2026_07_07.test.mjs` passed (143 tests). A broader RAG test run failed because installed `better-sqlite3.node` targets Node ABI 148 while the CLI Node requires ABI 137; that is test-runtime setup, not a parity result. Windows code was reviewed via shared bundle and platform paths, not executed on Windows. Physical Windows model loading, search, SQLite vector indexing, and profile ingestion remain unverified. The new report is ignored by the existing `.gitignore` rule; `.gitignore` was not edited in this phase.

## Fix (2026-11-19)

The ordering in `orchestration/orchestrator.ts` was a real difference.

- **What 3.2.0 does:** `decide()` runs `applyModeSourceContract` AFTER folding in `extraAllowedSourceTypes`.
- **What the local build did:** it ran the contract first. When an attachment extra supplied `REFERENCE_FILE` and the reference file was already the top priority, it set `attachedMaterialIsPrimary: true` and placed `REFERENCE_FILE` at a different position in the list. 3.2.0 leaves the policy unchanged in that case.
- **Fix:** the local build now uses the 3.2.0 order. The emitted module is identical to the reference.
- **Test:** `electron/context-intelligence/__tests__/ModeSourceContractOrder320.test.mjs`.
