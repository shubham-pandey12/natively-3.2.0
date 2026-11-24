import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { decideResetCancel, resolveLiveAnswerBatch } from '../../lib/chatStreamGuard.mjs';

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
