// Guards the company-research search-provider wiring (2026-07-31 fix).
//
// Bug: the Tavily → Natively → none provider cascade lived ONLY in the manual
// profile:research-company IPC handler, so the automatic AOT pipeline (JD
// upload) always ran with searchProvider=null and silently degraded every
// dossier to LLM-only guesswork — even with a Natively key configured. The
// degraded dossier was then cached for 24h and consumed by the whole
// negotiation/gap-analysis/mock-question chain.
//
// Two layers of protection here, matching the repo's mixed style:
//  1. Behavioral tests against the compiled CompanyResearchEngine — the
//     degraded-flag + cache-bypass semantics.
//  2. Source-inspection guards that the wiring call sites exist and both the
//     manual and AOT paths go through the ONE shared resolver.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const { CompanyResearchEngine } = require(
    path.join(root, 'dist-electron/premium/electron/knowledge/CompanyResearchEngine.js')
);
const { AOTPipeline } = require(
    path.join(root, 'dist-electron/premium/electron/knowledge/AOTPipeline.js')
);
const { KnowledgeDatabaseManager } = require(
    path.join(root, 'dist-electron/premium/electron/knowledge/KnowledgeDatabaseManager.js')
);
const Database = require('better-sqlite3');

const VALID_DOSSIER_JSON = JSON.stringify({
    company: 'Acme',
    hiring_strategy: 'hires',
    interview_focus: 'coding',
    salary_estimates: [],
    competitors: [],
    recent_news: '',
    core_values: [],
    sources: [],
});

function makeFakeDb({ cachedDossier = null, stale = false } = {}) {
    const saved = [];
    return {
        saved,
        getDossier: () => (cachedDossier ? { dossier: cachedDossier } : null),
        isDossierStale: () => stale,
        saveDossier: (name, dossier, sources) => saved.push({ name, dossier, sources }),
    };
}

test('no search provider → LLM-only dossier is marked degraded and cached as such', async () => {
    const db = makeFakeDb();
    const engine = new CompanyResearchEngine(db);
    engine.setGenerateContentFn(async () => VALID_DOSSIER_JSON);

    const dossier = await engine.researchCompany('Acme', {});
    assert.ok(dossier, 'should still produce a dossier');
    assert.equal(dossier.degraded, true, 'LLM-only dossier must carry degraded:true');
    assert.equal(db.saved.length, 1, 'degraded dossier is still cached');
    assert.equal(db.saved[0].dossier.degraded, true, 'cached copy carries the flag');
});

test('LLM-only failure is surfaced to the caller with its provider diagnosis', async () => {
    const engine = new CompanyResearchEngine(makeFakeDb());
    await assert.rejects(
        engine.researchCompany('Acme', {}),
        /No AI provider is configured for Company Intel/
    );
});

test('fresh cached DEGRADED dossier + provider now available → cache bypassed, search attempted', async () => {
    const db = makeFakeDb({ cachedDossier: { company: 'Acme', degraded: true }, stale: false });
    const engine = new CompanyResearchEngine(db);
    engine.setGenerateContentFn(async () => VALID_DOSSIER_JSON);
    let searchCalls = 0;
    engine.setSearchProvider({
        // Throw after recording: proves the search path was ENTERED (cache
        // bypassed) without paying the engine's inter-query delays.
        search: async () => { searchCalls++; throw new Error('stub'); },
    });

    const dossier = await engine.researchCompany('Acme', {});
    assert.ok(searchCalls > 0, 'degraded cache must not be served once search is available');
    // All searches failed → falls back to LLM-only, still marked degraded.
    assert.equal(dossier.degraded, true);
});

test('fresh cached degraded dossier + still NO provider → served from cache, no LLM call', async () => {
    const cached = { company: 'Acme', degraded: true };
    const db = makeFakeDb({ cachedDossier: cached, stale: false });
    const engine = new CompanyResearchEngine(db);
    let llmCalls = 0;
    engine.setGenerateContentFn(async () => { llmCalls++; return VALID_DOSSIER_JSON; });

    const dossier = await engine.researchCompany('Acme', {});
    assert.equal(dossier, cached, 'without a provider the degraded cache is still valid');
    assert.equal(llmCalls, 0, 'no regeneration while nothing has improved');
});

test('fresh cached NON-degraded dossier is served even when a provider exists', async () => {
    const cached = { company: 'Acme', sources: ['https://x'] };
    const db = makeFakeDb({ cachedDossier: cached, stale: false });
    const engine = new CompanyResearchEngine(db);
    let searchCalls = 0;
    engine.setSearchProvider({ search: async () => { searchCalls++; return []; } });

    const dossier = await engine.researchCompany('Acme', {});
    assert.equal(dossier, cached);
    assert.equal(searchCalls, 0, 'search-backed cache honors its TTL');
});

test('setSearchProvider accepts null (clears a stale provider)', () => {
    const engine = new CompanyResearchEngine(makeFakeDb());
    engine.setSearchProvider({ search: async () => [] });
    engine.setSearchProvider(null);
    assert.equal(engine.searchProvider, null);
});

test('getCachedDossier does not expose an expired persisted dossier', () => {
    const db = makeFakeDb({ cachedDossier: { company: 'Acme' }, stale: true });
    const engine = new CompanyResearchEngine(db);
    assert.equal(engine.getCachedDossier('Acme'), null);
});

test('company dossier persists in SQLite and expires at the configured 24-hour TTL', () => {
    const sqlite = new Database(':memory:');
    try {
        const db = new KnowledgeDatabaseManager(sqlite);
        db.initializeSchema();
        const dossier = { company: 'Acme', sources: ['https://example.com'] };
        db.saveDossier('Acme', dossier, dossier.sources);

        assert.deepEqual(db.getDossier('Acme').dossier, dossier);
        assert.equal(db.isDossierStale('Acme'), false);
        sqlite.prepare("UPDATE company_dossiers SET last_checked = datetime('now', '-2 days') WHERE company_name = ?").run('acme');
        assert.equal(db.isDossierStale('Acme'), true);
    } finally {
        sqlite.close();
    }
});

test('legacy company_dossiers schema migrates timestamps and sources without dropping rows', () => {
    const sqlite = new Database(':memory:');
    try {
        sqlite.exec(`
            CREATE TABLE company_dossiers (
                company_name TEXT PRIMARY KEY,
                dossier_json TEXT NOT NULL,
                sources_json TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        const dossier = { company: 'Barq', hiring_strategy: 'Legacy cached dossier' };
        const sources = ['https://example.com/barq'];
        sqlite.prepare('INSERT INTO company_dossiers (company_name, dossier_json, sources_json, updated_at) VALUES (?, ?, ?, ?)')
            .run('barq', JSON.stringify(dossier), JSON.stringify(sources), new Date().toISOString());

        const db = new KnowledgeDatabaseManager(sqlite);
        db.initializeSchema();
        db.initializeSchema();

        assert.deepEqual(db.getDossier('Barq').dossier, dossier);
        assert.deepEqual(db.getDossier('Barq').sources, sources);
        assert.equal(db.isDossierStale('Barq'), false);
        db.saveDossier('Barq', { ...dossier, hiring_strategy: 'Updated' }, sources);
        assert.equal(db.getDossier('Barq').dossier.hiring_strategy, 'Updated');
    } finally {
        sqlite.close();
    }
});

test('invalid search summary falls back to a degraded LLM-only dossier', async () => {
    const db = makeFakeDb();
    const engine = new CompanyResearchEngine(db);
    engine.minSearchIntervalMs = 0;
    engine.buildSearchQueries = () => ['Acme hiring'];
    engine.setSearchProvider({ search: async () => [{ title: 'Acme', link: 'https://example.com', snippet: 'Hiring details' }] });
    let llmCalls = 0;
    engine.setGenerateContentFn(async () => ++llmCalls === 1 ? 'not-json' : VALID_DOSSIER_JSON);

    const dossier = await engine.researchCompany('Acme', {});
    assert.equal(llmCalls, 2);
    assert.equal(dossier.degraded, true);
    assert.deepEqual(dossier.sources, []);
    assert.equal(db.saved.length, 1);
});

test('AOT marks null research failed and clears the previous company dossier', async () => {
    const engine = new CompanyResearchEngine(makeFakeDb());
    engine.researchCompany = async () => null;
    const pipeline = new AOTPipeline({}, engine);
    pipeline.setGenerateContentFn(async () => 'unused');
    pipeline.cachedDossier = { company: 'Previous Co' };

    await pipeline.runForJD({ structured_data: { company: 'Acme', title: 'Engineer' } }, null);

    assert.equal(pipeline.getStatus().companyResearch, 'failed');
    assert.equal(pipeline.getCachedDossier(), null);
});

// ---------- source-inspection wiring guards ----------

test('KnowledgeOrchestrator resolves the search provider per AOT run, before runForJD', () => {
    const src = read('premium/electron/knowledge/KnowledgeOrchestrator.ts');
    assert.ok(src.includes('setSearchProviderResolver('), 'resolver setter must exist');
    const jdBranch = src.indexOf('this.aotPipeline.reset()');
    assert.ok(jdBranch >= 0, 'JD ingest branch should exist');
    const resolveAt = src.indexOf('this.companyResearch.setSearchProvider(this.searchProviderResolver())', jdBranch);
    const runAt = src.indexOf('this.aotPipeline.runForJD(', jdBranch);
    assert.ok(resolveAt >= 0, 'AOT path must wire the provider from the resolver');
    assert.ok(runAt > resolveAt, 'provider must be wired BEFORE runForJD fires');
});

test('main.ts injects the shared resolver into the orchestrator', () => {
    const src = read('electron/main.ts');
    assert.ok(
        src.includes('setSearchProviderResolver(resolveCompanySearchProvider)'),
        'main.ts must inject resolveCompanySearchProvider at orchestrator init'
    );
});

test('manual research-company handler uses the SAME shared resolver (no drift)', () => {
    const src = read('electron/ipcHandlers.ts');
    const handler = src.indexOf("safeHandle('profile:research-company'");
    assert.ok(handler >= 0);
    const nextHandler = src.indexOf('safeHandle(', handler + 1);
    const body = src.slice(handler, nextHandler);
    assert.ok(
        body.includes('engine.setSearchProvider(resolveCompanySearchProvider())'),
        'manual path must delegate to the shared resolver'
    );
    assert.ok(
        !body.includes('new TavilySearchProvider'),
        'no inline cascade left in the handler'
    );
});

test('shared resolver: Tavily first, Natively fallback, trial-sentinel handled', () => {
    const src = read('electron/services/resolveCompanySearchProvider.ts');
    const tavily = src.indexOf('getTavilyApiKey()');
    const natively = src.indexOf('getNativelyApiKey()');
    assert.ok(tavily >= 0 && natively > tavily, 'Tavily (user key) must be checked before Natively fallback');
    assert.ok(
        src.includes('TRIAL_SENTINEL_KEY') && src.includes('getTrialToken()'),
        'trial-sentinel → x-trial-token handling must come along with the cascade'
    );
});
