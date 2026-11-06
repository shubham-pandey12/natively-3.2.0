# Company Intel: Deep Investigation & Fix Prompt (for Codex)

## Mission

The Company Intel feature is **not working correctly** (user-confirmed). Your job is to:
1. Trace the full data flow and find every broken link
2. Fix every bug you find
3. Confirm fixes with tests and TypeScript check

This is NOT read-only. Fix what you find.

---

## Context

- **Project:** `/Users/shubhampandey/testing/natively-cluely-ai-assistant`
- **Recovered Source:** `/Users/shubhampandey/Desktop/Natively-Recovered-Source/recovered/source/natively-3.1.0/premium/electron/`
- **Dev flag:** `NATIVELY_DEV_PREMIUM=1 NATIVELY_DEV_PLAN=ultra NODE_ENV=development`
- **Branch:** `premium`

---

## Full Data Flow to Verify

Company Intel works through this pipeline:

```
User has JD uploaded
  → profile:research-company IPC (or AOT pipeline auto-triggers it)
  → resolveCompanySearchProvider() → TavilySearchProvider | NativelySearchProvider | null
  → CompanyResearchEngine.researchCompany(companyName, jdCtx, forceRefresh)
  → SearchProvider.search() — web search results
  → LLM summarization → CompanyDossier object
  → KnowledgeDatabaseManager cache (7-day TTL)
  → profile:get-company-dossier IPC (renderer reads it)
  → Company Intel UI panel renders
```

---

## Step 1: Verify the IPC handler

File: `electron/ipcHandlers.ts`

```bash
grep -n "profile:research-company\|CompanyIntel\|research-company\|get-company-dossier" electron/ipcHandlers.ts | head -30
```

Read the full `profile:research-company` handler (around line 18814). Verify:
- Does it correctly get the `KnowledgeOrchestrator` instance?
- Does it call `resolveCompanySearchProvider()` and pass it to `engine.setSearchProvider()`?
- Does it correctly extract `companyName` from the JD if none is passed?
- Does it correctly call `engine.researchCompany(companyName, jdCtx, forceRefresh)`?
- Does it return the dossier to the renderer?
- Does it handle the case where `searchProvider` is `null` (LLM-only fallback)?

**BUG HUNT:** Does the handler crash silently if no JD is uploaded first?

---

## Step 2: Verify the CompanyResearchEngine

File: `premium/electron/knowledge/CompanyResearchEngine.ts`

```bash
wc -l premium/electron/knowledge/CompanyResearchEngine.ts
```

### A. `researchCompany()` method
- Does `researchCompany()` correctly check the 7-day cache first?
- Does it correctly fall back to LLM-only research when `searchProvider` is null?
- Does it correctly handle empty search results from the provider?
- Does it handle LLM returning malformed JSON?

```bash
grep -n "researchCompany\|async research\|7.*day\|TTL\|cache\|dossier" premium/electron/knowledge/CompanyResearchEngine.ts | head -30
```

### B. `setSearchProvider()` method
- Does `setSearchProvider()` exist and work?
- Is the provider correctly used in `researchCompany()`?

```bash
grep -n "setSearchProvider\|searchProvider\|this\.search" premium/electron/knowledge/CompanyResearchEngine.ts | head -20
```

### C. LLM summarization
- Does the engine call an LLM to generate the dossier?
- Which LLM utility does it use? (`llmUtils.ts`? direct provider?)
- Does it correctly parse the LLM JSON response into a `CompanyDossier` object?

```bash
grep -n "llm\|LLM\|generateContent\|prompt\|CompanyDossier\|dossier" premium/electron/knowledge/CompanyResearchEngine.ts | head -30
```

**BUG HUNT:** Does LLM-only mode (no search key) produce a valid dossier or fail silently?

---

## Step 3: Verify the Search Providers

File: `electron/services/resolveCompanySearchProvider.ts`

The cascade is: Tavily key → Natively API key → null (LLM-only).

```bash
cat electron/services/resolveCompanySearchProvider.ts
```

**BUG HUNT:** Does `resolveCompanySearchProvider()` correctly resolve in dev mode?
- Does it correctly read Tavily API key from `CredentialsManager`?
- Does it correctly fall back to Natively API key?
- Does it return `null` correctly when neither key is configured?

Also verify the actual providers:

```bash
head -60 premium/electron/knowledge/TavilySearchProvider.js
head -60 premium/electron/knowledge/NativelySearchProvider.js
```

- Do these `.js` providers have matching `.d.ts` declarations?
- Are they correctly loaded via `require()` in `resolveCompanySearchProvider.ts`?

---

## Step 4: Verify caching in KnowledgeDatabaseManager

File: `premium/electron/knowledge/KnowledgeDatabaseManager.ts`

```bash
grep -n "dossier\|company\|cache\|getCachedDossier\|saveDossier\|7.*day\|TTL\|expires" premium/electron/knowledge/KnowledgeDatabaseManager.ts | head -30
```

- Does `getCachedDossier(companyName)` correctly return null for expired entries?
- Does `saveDossier(companyName, dossier)` correctly store with an expiry timestamp?
- Is the SQLite table for dossiers created in `initializeSchema()`?

**BUG HUNT:** Is the dossier cache table missing from the schema? If `CREATE TABLE IF NOT EXISTS` for the dossier table was never called, every lookup returns null and every save silently fails.

---

## Step 5: Verify the hydration handler

File: `electron/ipcHandlers.ts` around line 18586

```bash
sed -n '18580,18630p' electron/ipcHandlers.ts
```

The `profile:get-company-dossier` (or similar) handler is called on app startup to rehydrate the panel.

- Does it correctly get the orchestrator?
- Does it correctly extract the company name from the active JD?
- Does it correctly return the cached dossier?

**BUG HUNT:** Does it return `null` when it should return a cached dossier?

---

## Step 6: Verify the renderer UI

```bash
grep -rn "companyResearch\|company.*dossier\|CompanyIntel\|profileResearchCompany\|research.*company\|doCompanyResearch" src/ --include="*.tsx" --include="*.ts" | head -30
```

- Does the UI component call `profile:research-company` correctly?
- Does it correctly display loading state while research is in progress?
- Does it correctly handle the case where no dossier exists yet?
- Does it correctly display company name, hiring strategy, culture ratings, etc. from the dossier?

**BUG HUNT:**
- Does the UI call `profile:research-company` with the correct company name?
- Does the UI poll or wait for the dossier, or just show stale/null state?
- Is the dossier hydration on app startup working (`profile:get-company-dossier`)?

---

## Step 7: Verify the AOT pipeline triggers company research

File: `premium/electron/knowledge/AOTPipeline.ts`

```bash
grep -n "company\|research\|CompanyResearch\|researchCompany" premium/electron/knowledge/AOTPipeline.ts | head -20
```

- Does the AOT pipeline automatically trigger `CompanyResearchEngine.researchCompany()` after JD upload?
- Is it gated on the search provider being available, or does it run with LLM-only too?

---

## Step 8: Check the CompanyDossier type contract

File: `premium/electron/knowledge/types.ts`

```bash
grep -n "CompanyDossier\|hiring_strategy\|culture_ratings\|salary" premium/electron/knowledge/types.ts
```

- Does the `CompanyDossier` type match what `CompanyResearchEngine` returns?
- Does the type match what the renderer UI expects?

**BUG HUNT:** Are there field name mismatches between what the engine returns and what the UI reads?

---

## Step 9: Run TypeScript checks

```bash
npx tsc --project electron/tsconfig.premium-check.json --noEmit 2>&1 | grep -i "company\|dossier\|research" | head -20
npx tsc --noEmit 2>&1 | grep -i "company\|dossier\|research" | head -20
```

---

## Step 10: Run existing tests

```bash
npm run test:company-research-spend 2>&1 | tail -30
npm test 2>&1 | grep -i "company\|dossier\|research" | head -20
```

---

## Fix Priority (in order)

1. **Schema bug** — if the dossier cache table is missing from `initializeSchema()`, company research cannot persist and always re-runs
2. **LLM-only fallback** — if research silently fails when no search provider key is configured
3. **IPC handler null guard** — if handler crashes when JD is not uploaded
4. **AOT pipeline not triggering** — if company research never auto-runs after JD upload
5. **UI state bug** — if renderer doesn't correctly display the returned dossier
6. **Type mismatches** — any field name mismatch between engine output and UI rendering

---

## Report Format

### Root Cause Summary
- What specifically is broken in Company Intel
- File:line reference for each bug

### Bugs Fixed
For each fix:
```
BUG: [description]
File: path/to/file.ts:line
Root cause: [what was wrong]
Fix applied: [what you changed]
```

### Bugs NOT Fixed (need more info)
e.g. "needs Tavily API key to test live search"

### Validation Commands Run
```bash
# list what you actually ran
```

### What Still Needs Physical Testing
e.g. "live Tavily search requires a real API key"

---

## Success Criteria

- `npm test` exits 0
- `npx tsc --noEmit` exits 0
- `npx tsc --project electron/tsconfig.premium-check.json --noEmit` exits 0
- `npm run test:company-research-spend` exits 0
- `profile:research-company` IPC returns a valid `CompanyDossier` in dev mode (LLM-only)
- Dossier correctly persists in SQLite cache
- UI panel correctly renders dossier fields
