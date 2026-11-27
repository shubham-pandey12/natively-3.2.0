import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { decideResetCancel, resolveLiveAnswerBatch, shouldApplyLiveAnswerDiscard } from '../../lib/chatStreamGuard.mjs';

const ui = readFileSync(new URL('../NativelyInterface.tsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
const resetHandlers = [...ui.matchAll(/^    resetCancel: (async \(\) => \{[\s\S]*?^    \}),$/gm)]
  .map(([, handler]) => handler);
const finalAnswer = ui.match(/onIntelligenceSuggestedAnswer\((\(data\) => \{[\s\S]*?\n      \})\),/)?.[1];

test('both Reset/Cancel handlers use current stream and Direct Assist refs', () => {
  assert.equal(resetHandlers.length, 2);
  for (const handler of resetHandlers) {
    assert.match(handler, /if \(decideResetCancel\(\{\s*isProcessing,\s*hasLiveStream: hasLiveChatStream\(\) \|\| streamingMsgIdRef\.current !== null,\s*hasDirectAssist: activeDirectAssistRef\.current !== null,\s*\}\) === 'cancel'\) \{\s*cancelActiveChatStream\(\);/);
  }
});

test('the accepted suggested-answer final guards its only busy-flag clear', () => {
  assert.ok(finalAnswer);
  assert.match(finalAnswer, /if \(!decision\.accept\) return;[\s\S]*?if \(!hasOtherLiveRequest\(\)\) setIsProcessing\(false\);/);
  assert.equal([...finalAnswer.matchAll(/setIsProcessing\(false\)/g)].length, 1);
});

test('a late id-less final reaches finalization and Reset/Cancel preserves the ongoing typed chat', async () => {
  // Execute the renderer callbacks with stubbed UI effects so the regression
  // can be exercised without mounting the Electron overlay.
  const chatStreamCheck = ui.match(/const hasLiveChatStream = useCallback\(\s*(\(\) => [^\n]+),/)?.[1];
  const liveRequestChecks = ui.match(/const hasUnrelatedStreamingRow = [\s\S]*?const hasOtherLiveRequest = [^;]+;/)?.[0];
  assert.ok(chatStreamCheck && liveRequestChecks && finalAnswer && resetHandlers[1]);
  const history = ['Previous answer', 'Typed question', 'Streaming reply'];
  const effects = [];
  const state = {
    isProcessing: true,
    chatStreamIdRef: { current: 42 },
    chatStreamSourceRef: { current: 'desktop' },
    streamingMsgIdRef: { current: 'typed-reply' },
    streamingIntentRef: { current: 'chat' },
    activeDirectAssistRef: { current: null },
    legacyIntelligenceTombstonedRef: { current: false },
    liveAnswerGenIdRef: { current: null },
    liveAnswerFloorRef: { current: null },
    resolveLiveAnswerBatch,
    decideResetCancel,
    setIsProcessing: (busy) => { state.isProcessing = busy; },
    takeBackWhatToSayNotice: () => {},
    pinAnswerPanel: () => {},
    liveAnswerStopFailure: () => null,
    labelLateAnswer: (_id, _question, answer) => answer,
    finalizeStreamingByIntent: (intent, answer) => effects.push([intent, answer]),
    cancelActiveChatStream: () => effects.push('cancel'),
    window: { electronAPI: { resetIntelligence: async () => effects.push('reset') } },
    resetChatState: () => { history.length = 0; },
    setAttachedContext: () => {},
    setInputValue: () => {},
  };
  const resetCancel = runInNewContext(stripTypeScriptTypes(`
    const hasLiveChatStream = ${chatStreamCheck};
    ${liveRequestChecks}
    (${finalAnswer})({ answer: 'Late answer' });
    (${resetHandlers[1]});
  `), state);

  assert.equal(state.isProcessing, true);
  assert.deepEqual(effects, [['what_to_answer', 'Late answer']]);
  await resetCancel();

  // An independently stale busy flag must still be safe.
  state.isProcessing = false;
  await resetCancel();
  assert.deepEqual(effects, [['what_to_answer', 'Late answer'], 'cancel', 'cancel']);
  assert.deepEqual(history, ['Previous answer', 'Typed question', 'Streaming reply']);
});

test('a correction marks only its generation and seals the discarded draft for the outdated fold', () => {
  const onQuestion = ui.match(/onWhatToAnswerQuestion\?\.\((\(\{[^\n]*\}\) => \{[\s\S]*?\n      \})\) \?\?/)?.[1];
  const onDiscard = ui.match(/onIntelligenceSuggestedAnswerDiscard\?\.\((\(data\) => \{[\s\S]*?\n      \})\) \?\?/)?.[1];
  assert.ok(onQuestion && onDiscard);
  let rows = [
    { id: 'earlier', whatToAnswerGeneration: 2, text: 'Another answer' },
    { id: 'interviewer-answer-3', answerPending: true },
    { id: 'draft', whatToAnswerGeneration: 3, isStreaming: true, text: 'Old answer' },
  ];
  const state = {
    activeDirectAssistRef: { current: null },
    legacyIntelligenceTombstonedRef: { current: false },
    liveAnswerGenIdRef: { current: 3 },
    liveAnswerFloorRef: { current: null },
    closedLiveBrainGenIdsRef: { current: new Set() },
    streamingIntentRef: { current: 'what_to_answer' },
    streamingTextRef: { current: 'Old answer' },
    setMessages: (update) => { rows = update(rows); },
    resolveLiveAnswerBatch,
    shouldApplyLiveAnswerDiscard,
    hasOtherLiveRequest: () => false,
    setIsProcessing: () => {},
    flushToken: () => { rows = rows.map(row => row.id === 'draft' ? { ...row, isStreaming: false } : row); },
  };
  runInNewContext(stripTypeScriptTypes(`
    const onQuestion = ${onQuestion};
    onQuestion({ generationId: 3, outdated: true });
    (${onDiscard})({ generationId: 3, reason: 'answer_corrected' });
  `), state);
  assert.equal(rows[0].outdated, undefined);
  assert.equal(rows[1].answerPending, false);
  assert.equal(rows[2].outdated, true);
  assert.equal(rows[2].text, 'Old answer');
  assert.equal(rows[2].isStreaming, false);
  assert.equal(resolveLiveAnswerBatch(state.liveAnswerGenIdRef.current, 3, state.liveAnswerFloorRef.current).accept, false);
  assert.equal(resolveLiveAnswerBatch(state.liveAnswerGenIdRef.current, 4, state.liveAnswerFloorRef.current).accept, true);
});

test('Live Brain asks reuse the answer row and speaking updates only the identified answer', () => {
  const onQuestion = ui.match(/onWhatToAnswerQuestion\?\.\((\(\{[^\n]*\}\) => \{[\s\S]*?\n      \})\) \?\?/)?.[1];
  assert.ok(onQuestion);
  let rows = [
    { id: 'earlier', role: 'system', whatToAnswerGeneration: 2, text: 'Older answer' },
    { id: 'current', role: 'system', whatToAnswerGeneration: 3, text: 'Existing answer' },
  ];
  const dispatch = runInNewContext(stripTypeScriptTypes(onQuestion), {
    activeDirectAssistRef: { current: null },
    legacyIntelligenceTombstonedRef: { current: false },
    liveAnswerGenIdRef: { current: 3 },
    liveAnswerFloorRef: { current: null },
    activeLiveBrainAskIdsRef: { current: new Set() },
    closedLiveBrainAskIdsRef: { current: new Set() },
    closedLiveBrainGenIdsRef: { current: new Set() },
    resolveLiveAnswerBatch,
    updatedAnswerGenerationRef: { current: null },
    pinAnswerPanel: () => {},
    setMessages: (update) => { rows = update(rows); },
  });
  dispatch({ generationId: 3, interviewerSpeaking: true });
  assert.equal(rows[0].interviewerSpeaking, undefined);
  assert.equal(rows[1].interviewerSpeaking, true);
  dispatch({ generationId: 3, interviewerSpeaking: false });
  assert.equal(rows[1].interviewerSpeaking, false);

  dispatch({ askId: 'clarify-writes', clarification: 'How many writes per second?' });
  dispatch({ askId: 'clarify-writes', clarification: 'How many writes per second?' });
  const asks = rows.filter(row => row.kind === 'ask');
  assert.equal(asks.length, 1);
  assert.equal(asks[0].role, 'system');
  assert.equal(asks[0].intent, 'what_to_answer');
  assert.equal(asks[0].text, 'How many writes per second?');
  assert.match(ui, /msg\.kind === 'ask'.*overlay-text-muted.*t\('Ask:'\)/);
  assert.match(ui, /msg\.interviewerSpeaking && \([\s\S]*?<div role="status" className="mt-1 text-\[12px\] overlay-text-muted">[\s\S]*?t\('Interviewer speaking'\)/);

  dispatch({ generationId: 4, question: 'Ordinary Auto Answer question', pending: true });
  assert.equal(rows.at(-1).id, 'interviewer-answer-4');
  assert.equal(rows.at(-1).role, 'interviewer');
  assert.equal(rows.at(-1).answerPending, true);
  assert.equal(rows.at(-1).kind, undefined);
  assert.equal(rows.at(-1).interviewerSpeaking, undefined);
});

test('U9-2: resetChatState clears liveBrainStatus and ignores pre-reset or discarded realtime events', () => {
  const onQuestion = ui.match(/onWhatToAnswerQuestion\?\.\((\(\{[^\n]*\}\) => \{[\s\S]*?\n      \})\) \?\?/)?.[1];
  const resetChat = ui.match(/const resetChatState = useCallback\((\(\) => \{[\s\S]*?\n  \}), \[cancelActiveChatStream/)?.[1];
  assert.ok(onQuestion && resetChat);
  let rows = [];
  let status = 'Listening';
  const state = {
    activeDirectAssistRef: { current: null },
    legacyIntelligenceTombstonedRef: { current: false },
    liveAnswerGenIdRef: { current: null },
    liveAnswerFloorRef: { current: null },
    updatedAnswerGenerationRef: { current: null },
    activeLiveBrainQuestionIdsRef: { current: new Set() },
    closedLiveBrainQuestionIdsRef: { current: new Set() },
    activeLiveBrainAskIdsRef: { current: new Set() },
    closedLiveBrainAskIdsRef: { current: new Set() },
    activeLiveBrainGenIdsRef: { current: new Set() },
    closedLiveBrainGenIdsRef: { current: new Set() },
    resolveLiveAnswerBatch,
    placeLiveBrainQuestion: (prev, q) => [...prev, { id: `live-brain-q-${q.questionId}`, role: 'interviewer', text: q.text, isStreaming: !q.done }],
    pinAnswerPanel: () => {},
    setMessages: (update) => { rows = typeof update === 'function' ? update(rows) : update; },
    setLiveBrainStatus: (next) => { status = next; },
    clearScreenshotRetry: () => {},
    cancelActiveChatStream: () => {},
    diagramRepairBlockedRef: { current: new Set() },
    previousDiagramRef: { current: null },
    resumeAutoScroll: () => {},
    answerPanelPinnedRef: { current: false },
    setAnswerPanelPinned: () => {},
    lastManualSubmitRef: { current: null },
    manualSubmitInFlightRef: { current: false },
    directAssistHistoryRef: { current: [] },
  };
  const { dispatch, reset } = runInNewContext(stripTypeScriptTypes(`
    const dispatch = ${onQuestion};
    const reset = ${resetChat};
    ({ dispatch, reset });
  `), state);

  dispatch({ liveBrainQuestion: { questionId: 'q-old', text: 'Half question', done: false } });
  dispatch({ askId: 'ask-old', clarification: 'Which DB?', askStreaming: true });
  dispatch({ generationId: -10, liveBrainAnswerStart: true });
  dispatch({ generationId: -10, responseText: { text: 'Partial', done: false } });
  assert.equal(rows.length, 3);

  reset();
  assert.equal(status, null);
  assert.equal(rows.length, 0);

  // Late events for pre-reset ids are ignored.
  dispatch({ liveBrainQuestion: { questionId: 'q-old', text: 'Half question finished', done: true } });
  dispatch({ askId: 'ask-old', clarification: 'Which DB?', askStreaming: false });
  dispatch({ generationId: -10, responseText: { text: 'Partial more', done: true } });
  assert.equal(rows.length, 0);

  // Provisionally discarded generationId is also ignored afterwards.
  dispatch({ generationId: -11, responseText: { text: 'Provisional', done: false } });
  assert.equal(rows.length, 1);
  dispatch({ generationId: -11, discard: true });
  assert.equal(rows.length, 0);
  dispatch({ generationId: -11, responseText: { text: 'Late provisional', done: true } });
  assert.equal(rows.length, 0);

  // New ids after reset still render normally.
  dispatch({ liveBrainQuestion: { questionId: 'q-new', text: 'New question?', done: true } });
  dispatch({ generationId: -12, responseText: { text: 'New answer', done: true } });
  assert.equal(rows.length, 2);
});
