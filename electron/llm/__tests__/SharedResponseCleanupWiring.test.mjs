// electron/llm/__tests__/SharedResponseCleanupWiring.test.mjs
//
// Phase 4 integration tests for Natively's shared plain-English response cleanup:
//   - shared cleanupResponse() entry point (spoken vs text mode, preservation)
//   - default-OFF sharedResponseCleanup intelligence flag
//   - Live Brain ResponseOrchestrator final-text cleanup (immediate first words,
//     no duplicate bubble, control messages untouched, interrupted streams safe)
//   - single-pass wiring checks for Auto Answer and Text Replies (V3 + Legacy)

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

const llmMod = await import(pathToFileURL(path.join(repoRoot, 'dist-electron', 'electron', 'llm', 'index.js')).href);
const flagsMod = await import(pathToFileURL(path.join(repoRoot, 'dist-electron', 'electron', 'intelligence', 'intelligenceFlags.js')).href);
const orchMod = await import(pathToFileURL(path.join(repoRoot, 'dist-electron', 'premium', 'electron', 'liveBrain', 'ResponseOrchestrator.js')).href);

const { cleanupResponse } = llmMod;
const { isIntelligenceFlagEnabled, __resetIntelligenceFlagsCache } = flagsMod;
const { ResponseOrchestrator } = orchMod;

afterEach(() => {
  delete process.env.NATIVELY_SHARED_RESPONSE_CLEANUP;
  __resetIntelligenceFlagsCache();
});

describe('sharedResponseCleanup feature flag', () => {
  test('is OFF by default and can be opted in via env', () => {
    delete process.env.NATIVELY_SHARED_RESPONSE_CLEANUP;
    __resetIntelligenceFlagsCache();
    assert.equal(isIntelligenceFlagEnabled('sharedResponseCleanup'), false);

    process.env.NATIVELY_SHARED_RESPONSE_CLEANUP = '1';
    __resetIntelligenceFlagsCache();
    assert.equal(isIntelligenceFlagEnabled('sharedResponseCleanup'), true);
  });
});

describe('cleanupResponse — spoken vs text mode & preservation', () => {
  test('spoken mode normalizes semicolons and corporate idioms while preserving facts', () => {
    const res = cleanupResponse({
      text: 'The service is robust and scalable; it cuts p95 latency from 800ms to 300ms.',
      mode: 'spoken',
      answerType: 'experience_answer',
    });
    assert.equal(res.changed, true);
    assert.equal(res.text, 'The service is reliable and scalable. It cuts p95 latency from 800ms to 300ms.');
  });

  test('text mode preserves headings, nested lists, semicolons, code, and formulas', () => {
    const input = [
      '### Architecture',
      '- Built a robust and scalable worker; handles 5—10k RPS.',
      '  - Nested item with `retryWithBackoff()` and $O(n)$.',
    ].join('\n');
    const res = cleanupResponse({
      text: input,
      mode: 'text',
      answerType: 'experience_answer',
    });
    assert.equal(res.changed, true);
    assert.ok(res.text.startsWith('### Architecture\n'));
    assert.ok(res.text.includes('reliable and scalable worker; handles 5-10k RPS.'));
    assert.ok(res.text.includes('\n  - Nested item with `retryWithBackoff()` and $O(n)$.'));
  });

  test('preserves control messages and structured answer types untouched', () => {
    for (const msg of ['Ask: Which region?', '**Ask:** Which region?', 'No action.', '[[NO_ACTION]]', '[[ASK]] Clarify?']) {
      assert.deepEqual(cleanupResponse({ text: msg, mode: 'spoken' }), { text: msg, changed: false });
    }
    const tech = 'The service is robust and scalable with `Redis`.';
    assert.deepEqual(
      cleanupResponse({ text: tech, mode: 'spoken', answerType: 'technical_concept_answer' }),
      { text: tech, changed: false },
    );
  });

  test('spoken cleanup preserves nested lists, indented code, hard breaks, and money ranges', () => {
    const text = 'I used leverage ratios.  \n- Budget is $5M — $20M.\n  - Found actionable insights.\n\n    actionable insights';
    assert.equal(cleanupResponse({ text, mode: 'spoken' }).text,
      'I used leverage ratios.  \n- Budget is $5M — $20M.\n  - Found useful takeaways.\n\n    actionable insights');
    assert.equal(cleanupResponse({ text: 'a—b', mode: 'spoken' }).text, 'a—b');
    assert.equal(cleanupResponse({ text: 'Run x; y.', mode: 'spoken' }).text, 'Run x; y.');
  });

  test('written cleanup keeps Markdown line breaks, links, and alternative code fences', () => {
    const protectedText = '[docs](https://example.com/actionable-insights)  \n\n\n~~~text\nactionable insights\n```\nactionable insights\n```\n~~~\n\n    https://example.com/actionable-insights\n';
    const text = 'I found actionable insights.  \n' + protectedText;
    assert.equal(cleanupResponse({ text, mode: 'text' }).text, 'I found useful takeaways.  \n' + protectedText);
  });

  test('spoken cleanup keeps percent and scaled number ranges together', () => {
    for (const range of ['10%—20%', '10.5% – 20.5%', '10%—20', '5k–8k']) {
      const text = `The target range is ${range}.`;
      assert.deepEqual(cleanupResponse({ text, mode: 'spoken' }), { text, changed: false });
    }
  });
});

describe('Live Brain ResponseOrchestrator — final-text cleanup integration', () => {
  function createHarness(cleanupText) {
    let now = 1000;
    const shownTexts = [];
    const asks = [];
    const outdated = [];
    const orchestrator = new ResponseOrchestrator({
      clock: {
        now: () => now,
        setTimeout: (cb, ms) => setTimeout(cb, ms),
        clearTimeout: (id) => clearTimeout(id),
      },
      cleanupText,
      overlay: {
        showAsk: (a) => asks.push(a),
        setOutdated: (genId, val) => outdated.push({ genId, val }),
        setInterviewerSpeaking: () => {},
        showText: (r) => shownTexts.push(r),
      },
    });
    return {
      orchestrator,
      shownTexts,
      asks,
      outdated,
      advance: (ms) => { now += ms; },
    };
  }

  test('keeps first streamed words immediate, cleans on completion in-place with no duplicate bubble', () => {
    let cleanupCalls = 0;
    const h = createHarness((text) => {
      cleanupCalls++;
      return cleanupResponse({ text, mode: 'spoken' }).text;
    });

    h.orchestrator.handleEvent({ type: 'response_started', responseId: 'r1', at: 1000 });
    h.orchestrator.handleEvent({ type: 'response_delta', responseId: 'r1', text: 'The service is robust ' });

    assert.equal(h.shownTexts.length, 1);
    assert.equal(h.shownTexts[0].done, false);
    assert.equal(h.shownTexts[0].text, 'The service is robust ');
    assert.equal(cleanupCalls, 0, 'streaming delta must not invoke final cleanup');
    h.orchestrator.handleEvent({ type: 'response_delta', responseId: 'r1', text: 'and scalable.' });
    h.orchestrator.handleEvent({ type: 'response_done', responseId: 'r1', status: 'completed' });

    const last = h.shownTexts[h.shownTexts.length - 1];
    assert.equal(cleanupCalls, 1, 'cleanup runs once at completion');
    assert.equal(last.responseId, 'r1');
    assert.equal(last.generationId, h.shownTexts[0].generationId, 'updates same generationId in place');
    assert.equal(last.done, true);
    assert.equal(last.text, 'The service is reliable and scalable.');
  });

  test('control messages (Ask: / [[NO_ACTION]]) bypass cleanupText completely', () => {
    let cleanupCalls = 0;
    const h = createHarness((text) => {
      cleanupCalls++;
      return cleanupResponse({ text, mode: 'spoken' }).text;
    });

    h.orchestrator.handleEvent({ type: 'response_started', responseId: 'r-ask', at: 1000 });
    h.orchestrator.handleEvent({ type: 'response_delta', responseId: 'r-ask', text: 'Ask: Which cloud provider?' });
    h.orchestrator.handleEvent({ type: 'response_done', responseId: 'r-ask', status: 'completed' });

    assert.equal(cleanupCalls, 0);
    assert.equal(h.asks.length >= 1, true);
    assert.equal(h.asks[h.asks.length - 1].clarification, 'Which cloud provider?');

    h.orchestrator.handleEvent({ type: 'response_started', responseId: 'r-noop', at: 2000 });
    h.orchestrator.handleEvent({ type: 'response_delta', responseId: 'r-noop', text: '[[NO_ACTION]]' });
    h.orchestrator.handleEvent({ type: 'response_done', responseId: 'r-noop', status: 'completed' });
    assert.equal(cleanupCalls, 0);
  });

  test('interrupted stream cleans its tail and late completion cannot mutate the replacement reply', () => {
    let cleanupCalls = 0;
    const h = createHarness((text) => {
      cleanupCalls++;
      return cleanupResponse({ text, mode: 'spoken' }).text;
    });

    h.orchestrator.handleEvent({ type: 'response_started', responseId: 'r1', at: 1000 });
    h.orchestrator.handleEvent({ type: 'response_delta', responseId: 'r1', text: 'The service is robust and scalable ' });
    h.advance(100);
    h.orchestrator.handleEvent({ type: 'interviewer_speech_started', at: 1100 });
    h.orchestrator.handleEvent({ type: 'response_done', responseId: 'r1', status: 'cancelled' });

    assert.equal(cleanupCalls, 1);
    assert.equal(h.shownTexts.at(-1).text, 'The service is reliable and scalable ');

    h.orchestrator.handleEvent({ type: 'response_started', responseId: 'r2', at: 1200 });
    h.orchestrator.handleEvent({ type: 'response_delta', responseId: 'r2', text: 'The pipeline turns raw data into actionable intelligence.' });
    h.orchestrator.handleEvent({ type: 'response_done', responseId: 'r1', status: 'completed' });
    assert.equal(cleanupCalls, 1, 'late completion must not clean the replacement stream');
    h.orchestrator.handleEvent({ type: 'response_done', responseId: 'r2', status: 'completed' });

    assert.equal(cleanupCalls, 2);
    const r2Finals = h.shownTexts.filter((t) => t.responseId === 'r2' && t.done);
    assert.equal(r2Finals.length, 1);
    assert.equal(r2Finals[0].text, 'The pipeline turns raw data into useful information.');
  });
});

describe('Wiring guards — single pass & default-OFF', () => {
  test('Auto Answer guards against double cleanup with answerDiversityGuard', () => {
    const engineSrc = fs.readFileSync(path.join(repoRoot, 'electron', 'IntelligenceEngine.ts'), 'utf8');
    assert.match(engineSrc, /humanizedAlready = shaped\.applied\.includes\('humanized_spoken_answer'\)/);
    assert.match(engineSrc, /isIntelligenceFlagEnabled\('sharedResponseCleanup'\) && !humanizedAlready && !isCoding/);
    assert.match(engineSrc, /isIntelligenceFlagEnabled\('sharedResponseCleanup'\) && !humanizedAlready && finished\.answerType && !finished\.answerIsNotice && !finished\.stopReason/);
  });

  test('Text chat V3 and Legacy paths gate sharedResponseCleanup cleanly', () => {
    const ipcSrc = fs.readFileSync(path.join(repoRoot, 'electron', 'ipcHandlers.ts'), 'utf8');
    assert.match(ipcSrc, /via: 'shared_response_cleanup_v3'/);
    assert.match(ipcSrc, /isIntelligenceFlagEnabled\('sharedResponseCleanup'\)\s*\?\s*cleanupResponse\(/);
  });
});
