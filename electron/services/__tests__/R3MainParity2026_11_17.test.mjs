// R3 (main process) source matches recovered Natively 3.2.0. Compiled-module
// equality was checked with scripts/parity/compare-modules.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const main = read('electron/main.ts');

test('guide hears meeting_saved from main after stop, like 3.2.0', () => {
  // 3.2.1 guards meetingEnded in its own try and adds a comment line before the guide event.
  assert.match(main, /this\.liveNotes\.meetingEnded\(meetingId\);[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*try \{ applyGuideEvent\(\{ type: 'meeting_saved', meetingId \}\); \} catch \(e(?:: any)?\) \{ console\.warn\('\[Main\] guide not told about the saved meeting:'/);
  assert.ok(!main.includes("applyGuideEvent({ type: 'meeting_started' })"));
  assert.ok(!main.includes("applyGuideEvent({ type: 'meeting_stopped' })"));
  assert.ok(!read('electron/MeetingPersistence.ts').includes("type: 'meeting_saved'"));
});

test('mic echo guard: 3.2.0 field, log line, no reset at meeting start', () => {
  assert.ok(main.includes('private readonly _micEcho = new MicEchoGuard();'));
  assert.ok(main.includes('not counted as the user'));
  assert.ok(!main.includes('micEchoGuard.reset()'));
});

test('missing STT keys use the 3.2.0 message and provider id', () => {
  assert.ok(!main.includes('reporting missing key'));
  assert.ok((main.match(/transcription is off until one is saved/g) || []).length >= 8);
  assert.ok(!/new MissingKeySTT\('/.test(main));
});

test('Gemini embed wait: 0 or invalid falls back to 75s as in 3.2.0', () => {
  assert.ok(read('electron/rag/providers/GeminiEmbeddingProvider.ts').includes('Number(process.env.NATIVELY_GEMINI_EMBED_MAX_WAIT_MS) || 75_000'));
});

test('guide store rebuilds facts per event type as in 3.2.0', () => {
  const s = read('electron/services/firstRunGuideStore.ts');
  assert.match(s, /type: 'meeting_saved', meetingId: event\.meetingId, meetingActive: deps\.meetingActive\(\)/);
  assert.match(s, /return \{ raw, state: normalizeGuideState\(raw, now\) \};/);
});
