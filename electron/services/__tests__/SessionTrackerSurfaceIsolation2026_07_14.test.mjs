// Surface isolation (real-app source-switch repair, 2026-07-14, Phase 9).
//
// ROOT CAUSE this pins: SessionTracker is ONE shared instance across every
// conversational surface (manual chat, What-to-Answer live suggestions,
// screenshot-triggered code-hint/brainstorm, phone-mirror). A WTA answer
// written via addAssistantMessage(text, wd, 'what_to_answer') landed in the
// SAME lastAssistantMessage/assistantResponseHistory that manual-chat's
// follow-up-referent code read with NO surface filter — so an anaphoric
// manual-chat question ("what processor controls it?") could resolve against
// whatever the WTA path happened to answer moments earlier on a live meeting
// transcript, not the user's own manual-chat conversation.
//
// THE FIX: addAssistantMessage/getLastAssistantMessage/getAssistantResponseHistory
// gained an OPTIONAL `surface` parameter. Passing no surface preserves the
// exact prior shared behavior (legitimate cross-surface continuity — e.g. live
// transcript refinement-intent detection reading "did the assistant just say
// something on ANY surface" — is untouched). Passing a surface scopes strictly
// to that surface's own history.
//
// Requires: npm run build:electron.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../../../dist-electron/electron');
const { SessionTracker } = await import(pathToFileURL(path.join(distDir, 'SessionTracker.js')).href);
const intelligenceEngineSrc = fs.readFileSync(path.resolve(__dirname, '../../IntelligenceEngine.ts'), 'utf8');

function freshTracker() {
  return new SessionTracker();
}

describe('Phase 10 meeting ledger', () => {
  test('keeps a short reply and older turns while preserving legacy views', () => {
    const tracker = freshTracker();
    const short = tracker.beginMeetingTurn('Should we use a heap?');
    assert.equal(tracker.addAssistantMessage('Yes.', undefined, 'manual_chat', undefined, { meetingTurn: short }), false);
    assert.equal(tracker.getLastAssistantMessage(), null);
    assert.equal(tracker.getFormattedContext(), '');
    assert.equal(tracker.getPersistableTranscript().length, 0);
    assert.equal(tracker.getMeetingTurns()[0].answer.text, 'Yes.');

    for (let i = 0; i < 12; i++) {
      const turn = tracker.beginMeetingTurn(`Question ${i}`);
      assert.equal(tracker.addAssistantMessage(`A complete answer ${i}`, undefined, 'manual_chat', undefined, { meetingTurn: turn }), true);
    }
    assert.equal(tracker.getMeetingTurns().filter(turn => turn.answer).length, 13);
    assert.equal(tracker.getAssistantResponseHistory().length, 10);
  });

  test('excludes non-answers and rejects writes to retired meetings or completed turns', () => {
    const tracker = freshTracker();
    const turn = tracker.beginMeetingTurn('What is the expected load?');
    assert.equal(tracker.recordMeetingAnswer(turn, '[[NO_ACTION]]'), false);
    assert.equal(tracker.recordMeetingAnswer(turn, 'A blocked reply.', { writeDecision: { blockedFromSessionTracker: true } }), false);
    assert.equal(tracker.recordMeetingAnswer(turn, 'A blocked reply.', { writeDecision: { policy: 'do_not_store' } }), false);
    assert.equal(tracker.recordMeetingAnswer(turn, "I don't know."), false);
    assert.equal(tracker.recordMeetingAnswer(turn, 'Around', { status: 'interrupted' }), true);
    assert.equal(tracker.getMeetingTurns()[0].answer.status, 'interrupted');
    assert.equal(tracker.recordMeetingAnswer(turn, 'Around 100 requests per second.'), true);
    assert.equal(tracker.recordMeetingAnswer(turn, 'Stale completion.'), false);
    tracker.reset();
    assert.deepEqual(tracker.getMeetingTurns(), []);
    assert.equal(tracker.recordMeetingAnswer(turn, 'Late completion.'), false);
    assert.equal(tracker.enrichMeetingTurn(turn, { resolvedQuestion: 'Late screenshot' }), false);
  });

  test('deduplicates speech finals and clears history on meeting start', () => {
    const tracker = freshTracker();
    const turn = tracker.noteMeetingSpeech('What is a heap?', 'interviewer', 1_000);
    const repeated = tracker.noteMeetingSpeech('What is a heap', 'interviewer', 4_100, 'realtime');
    assert.equal(repeated.turnId, turn.turnId);
    assert.equal(tracker.getMeetingTurns().length, 1);
    const newSpeech = tracker.noteMeetingSpeech('What is a heap?', 'interviewer', 4_300);
    assert.notEqual(newSpeech.turnId, turn.turnId);
    tracker.resetMeetingHistory();
    assert.deepEqual(tracker.getMeetingTurns(), []);
    assert.equal(tracker.recordMeetingAnswer(turn, 'Late answer.'), false);
  });

  test('Auto Answer attaches to speech and a mid-meeting reset preserves the ledger', () => {
    const tracker = freshTracker();
    const spoken = tracker.noteMeetingSpeech('What is the time complexity?', 'interviewer', 1_500);
    tracker.addAssistantMessage('It takes logarithmic time.', undefined, 'meeting_auto_answer');
    assert.equal(tracker.getMeetingTurns().length, 1);
    assert.equal(tracker.getMeetingTurns()[0].turnId, spoken.turnId);
    tracker.reset({ keepMeetingRecord: true });
    assert.equal(tracker.getMeetingTurns()[0].answer.text, 'It takes logarithmic time.');
    assert.equal(tracker.getLastAssistantMessage(), null);
    tracker.reset();
    assert.deepEqual(tracker.getMeetingTurns(), []);
  });

  test('a second answer to the same question gets a fresh ledger turn', () => {
    const tracker = freshTracker();
    const question = 'How does a heap work?';
    tracker.noteMeetingSpeech(question, 'interviewer', 1000);
    tracker.addAssistantMessage('The first completed answer.', undefined, 'meeting_auto_answer', undefined, { question });
    tracker.addAssistantMessage('A fresh manual answer.', undefined, 'what_to_answer', undefined, { question });
    assert.deepEqual(tracker.getMeetingTurns().map(turn => turn.answer?.text), [
      'The first completed answer.', 'A fresh manual answer.',
    ]);
  });
  test('a completed correction links both turns and retains the replaced text', () => {
    const tracker = freshTracker();
    const first = tracker.beginMeetingTurn('Design a store.');
    const next = tracker.beginMeetingTurn('Use MongoDB.');
    tracker.recordMeetingAnswer(first, 'Use PostgreSQL', { status: 'interrupted' });
    tracker.recordMeetingAnswer(next, 'Use an index in MongoDB.', { replaces: first });
    const [replaced, replacement] = tracker.getMeetingTurns();
    assert.equal(replaced.answer.status, 'replaced');
    assert.equal(replaced.answer.text, 'Use PostgreSQL');
    assert.equal(replaced.replacedByTurnId, next.turnId);
    assert.equal(replacement.replacesTurnId, first.turnId);
    assert.equal(tracker.recordMeetingAnswer(first, 'Late completion.'), false);
  });
});

describe('SessionTracker surface isolation (Phase 9)', () => {
  test('no-surface calls (legacy callers) behave EXACTLY as before: shared lastAssistantMessage sees every write', () => {
    const s = freshTracker();
    s.addAssistantMessage('This is the first assistant answer, written with no surface tag at all.');
    s.addAssistantMessage('This is the second assistant answer, also with no surface tag.');
    assert.equal(s.getLastAssistantMessage(), 'This is the second assistant answer, also with no surface tag.');
    assert.equal(s.getAssistantResponseHistory().length, 2);
  });

  test('a WTA-tagged write does NOT appear under a manual_chat-scoped read', () => {
    const s = freshTracker();
    s.addAssistantMessage('This is a live What-to-Answer suggestion about the meeting topic.', undefined, 'what_to_answer');
    assert.equal(s.getLastAssistantMessage('manual_chat'), null,
      'a WTA answer must never surface as the manual-chat surface\'s own last message');
    assert.equal(s.getLastAssistantMessage('what_to_answer'), 'This is a live What-to-Answer suggestion about the meeting topic.');
  });

  test('the shared (no-surface) read STILL sees a WTA write — cross-surface continuity for legitimate consumers is preserved', () => {
    const s = freshTracker();
    s.addAssistantMessage('This is a live What-to-Answer suggestion about the meeting topic.', undefined, 'what_to_answer');
    assert.equal(s.getLastAssistantMessage(), 'This is a live What-to-Answer suggestion about the meeting topic.',
      'the shared getter (no surface arg) must be untouched — refinement-intent detection on the live transcript still needs it');
  });

  test('manual-chat and WTA turns interleave without cross-contaminating each other\'s surface-scoped view', () => {
    const s = freshTracker();
    s.addAssistantMessage('Manual chat answer number one about the users uploaded thesis document.', undefined, 'manual_chat');
    s.addAssistantMessage('A WTA live suggestion about something the interviewer just asked verbally.', undefined, 'what_to_answer');
    s.addAssistantMessage('Manual chat answer number two continuing the same thesis conversation.', undefined, 'manual_chat');

    assert.equal(s.getLastAssistantMessage('manual_chat'), 'Manual chat answer number two continuing the same thesis conversation.');
    assert.equal(s.getLastAssistantMessage('what_to_answer'), 'A WTA live suggestion about something the interviewer just asked verbally.');
    // The shared view sees whichever surface wrote MOST RECENTLY.
    assert.equal(s.getLastAssistantMessage(), 'Manual chat answer number two continuing the same thesis conversation.');
  });

  test('a surface with no turns yet returns null, never a different surface\'s answer', () => {
    const s = freshTracker();
    s.addAssistantMessage('Only a phone-mirror answer has been written so far in this session.', undefined, 'phone_mirror');
    assert.equal(s.getLastAssistantMessage('manual_chat'), null);
    assert.equal(s.getLastAssistantMessage('what_to_answer'), null);
    assert.equal(s.getLastAssistantMessage('phone_mirror'), 'Only a phone-mirror answer has been written so far in this session.');
  });

  test('getAssistantResponseHistory(surface) filters to exactly that surface\'s turns, in order', () => {
    const s = freshTracker();
    s.addAssistantMessage('Manual chat turn one is a reasonably long sentence for the length filter.', undefined, 'manual_chat');
    s.addAssistantMessage('WTA turn one is also a reasonably long sentence for the length filter.', undefined, 'what_to_answer');
    s.addAssistantMessage('Manual chat turn two continues the manual conversation with more detail.', undefined, 'manual_chat');
    s.addAssistantMessage('Screenshot code hint turn is triggered from an uploaded screenshot image.', undefined, 'screenshot');

    const manualHistory = s.getAssistantResponseHistory('manual_chat');
    assert.equal(manualHistory.length, 2);
    assert.ok(manualHistory.every((r) => r.surface === 'manual_chat'));
    assert.equal(manualHistory[0].text, 'Manual chat turn one is a reasonably long sentence for the length filter.');
    assert.equal(manualHistory[1].text, 'Manual chat turn two continues the manual conversation with more detail.');

    const wtaHistory = s.getAssistantResponseHistory('what_to_answer');
    assert.equal(wtaHistory.length, 1);

    // No-surface call is unfiltered (legacy behavior) — sees all 4 turns.
    assert.equal(s.getAssistantResponseHistory().length, 4);
  });

  test('every AssistantResponse entry from a surface-tagged write carries that surface; legacy (no-tag) entries carry none', () => {
    const s = freshTracker();
    s.addAssistantMessage('An untagged legacy write behaving exactly as it always has before this fix.');
    s.addAssistantMessage('A tagged manual-chat write using the new optional surface parameter.', undefined, 'manual_chat');
    const all = s.getAssistantResponseHistory();
    assert.equal(all[0].surface, undefined);
    assert.equal(all[1].surface, 'manual_chat');
  });

  // ── Wiring regression guard (code-review round 2) ──────────────────────────
  //
  // The 7 tests above pin SessionTracker's own logic, but a real defect
  // shipped in the FIRST version of this fix: runManualAnswer (the manual-chat
  // fallback path, IPC-invoked via submit-manual-question) was mistagged
  // 'what_to_answer' instead of 'manual_chat' — invisible to code review's own
  // unit tests because they never touch IntelligenceEngine.ts's actual call
  // sites. A full IntelligenceEngine integration test is disproportionate
  // (heavy LLM/session setup); a source-guard test — the same pattern already
  // used elsewhere in this repo (e.g. OkfPhase0FalseRefusalGuard.test.mjs) —
  // pins the actual tag at the actual call site instead.
  test('IntelligenceEngine.runManualAnswer tags its addAssistantMessage call manual_chat, not what_to_answer', () => {
    const fnStart = intelligenceEngineSrc.indexOf('async runManualAnswer(');
    assert.ok(fnStart >= 0, 'expected to find runManualAnswer in IntelligenceEngine.ts');
    // Bound the search to this function's body (next method/closing brace at
    // the same indent level is `runCodeHint`, the next MODE handler).
    const fnEnd = intelligenceEngineSrc.indexOf('async runCodeHint(', fnStart);
    assert.ok(fnEnd > fnStart, 'expected to find the next method (runCodeHint) bounding runManualAnswer');
    const body = intelligenceEngineSrc.slice(fnStart, fnEnd);
    assert.match(body, /addAssistantMessage\([^)]*'manual_chat',\s*undefined,\s*\{ meetingTurn \}\)/,
      'runManualAnswer must tag its addAssistantMessage write manual_chat (it is the manual-chat fallback path, confirmed by its own pushUsage({source: \'manual_chat\'}) call)');
    assert.doesNotMatch(body, /addAssistantMessage\([^)]*'what_to_answer'(?:,|\))/,
      'runManualAnswer must NOT be tagged what_to_answer — that mislabels a manual-chat answer as a WTA suggestion');
  });

  test('MEDIUM-2: runFollowUp, runRecap, runClarify, and runLiveHelper read shared history and never attach to an unrelated interviewer turn', () => {
    for (const [fnName, nextFn] of [
      ['async runFollowUp(', 'private buildRecapFollowUpContract('],
      ['async runRecap(', 'async runClarify('],
      ['async runClarify(', 'async runLiveHelper('],
      ['async runLiveHelper(', 'async runCustomButton('],
    ]) {
      const start = intelligenceEngineSrc.indexOf(fnName);
      const end = intelligenceEngineSrc.indexOf(nextFn, start);
      assert.ok(start >= 0 && end > start, `expected ${fnName} bounded by ${nextFn}`);
      const body = intelligenceEngineSrc.slice(start, end);
      assert.match(body, /formatProviderMeetingHistory\(/, `${fnName} must read shared history`);
      if (fnName === 'async runFollowUp(') {
        assert.match(body, /addAssistantMessage\([^)]*\{ meetingTurn \}\)/, 'runFollowUp must record its own meetingTurn');
      } else {
        assert.match(body, /addAssistantMessage\([^)]*\{ skipMeetingLedger: true \}\)/, `${fnName} must pass skipMeetingLedger: true`);
      }
    }
  });
});
