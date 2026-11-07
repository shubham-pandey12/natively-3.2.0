import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPendingScreenshots } from '../pendingScreenshots.mjs';

const source = readFileSync(new URL('../../components/NativelyInterface.tsx', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('const handleWhatToSay = async'), source.indexOf('const handleFollowUp = async'));
// Exercise the production capture gate with the real tracker and controlled capture promises.
const gate = body.slice(body.indexOf('    const pending = pendingCaptureRef.current;'), body.indexOf('    // Capture and clear attached image context.'));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function runGate(tracker, pending = null) {
  const messages = [], restored = [], ended = [];
  const result = await new AsyncFunction('pendingCaptureRef', 'pendingShotsRef', 'handleScreenshotAttach', 'setIsProcessing', 'endOverlayAction', 'setMessages', 'genMessageId', `${gate}\nreturn { pending, lateShots };`)(
    { current: pending }, { current: tracker }, (shot) => restored.push(shot), () => {},
    (key) => ended.push(key), (update) => messages.push(...update([])), () => 'notice',
  );
  return { result, messages, restored, ended };
}
test('completed current capture reaches the request', async () => {
  const tracker = createPendingScreenshots();
  const current = { path: 'current.png', preview: 'current' };
  tracker.track(new Promise((resolve) => setTimeout(() => resolve(current), 5)));
  const out = await runGate(tracker);
  assert.deepEqual(out.result.lateShots, [current]);
  assert.deepEqual(out.ended, []);
});
test('cancelled capture stops submission rather than answering old speech', async () => {
  const tracker = createPendingScreenshots();
  tracker.track(new Promise((resolve) => setTimeout(() => resolve(null), 5)));
  const out = await runGate(tracker);
  assert.equal(out.result, undefined);
  assert.deepEqual(out.ended, ['what_to_say']);
  assert.match(out.messages[0].text, /capture did not finish/);
});
test('unfinished capture stops submission and preserves completed attachments', async () => {
  const completed = { path: 'ready.png' };
  const out = await runGate({ settle: async () => [completed], inFlight: () => true });
  assert.equal(out.result, undefined);
  assert.deepEqual(out.restored, [completed]);
  assert.deepEqual(out.ended, ['what_to_say']);
});
test('audio, page and screenshot requests select the intended question independently of action instructions', () => {
  const expression = body.match(/const questionForWta = ([\s\S]*?);/)[1];
  const select = new Function('currentAttachments', 'domContext', 'dynamicPromptInstruction', `const retry = null; return ${expression}`);
  assert.equal(select([], undefined, 'Explain the topic plainly'), undefined);
  assert.equal(select([{path: 'new.png'}], undefined, 'Explain plainly'), 'What should I say about this?');
  assert.equal(select([], 'current captured page', undefined), 'What should I say about this?');
  assert.equal(select([], undefined, undefined), undefined);
  assert.ok(!body.includes('phoneMirrorRequestAutoContext'));
});
test('retry freshness distinguishes identical speech events by transcript timestamp', () => {
  assert.match(source, /const speechEvent = speech \? `\$\{transcript\.timestamp \?\? 'unknown'\}\\0\$\{speech\}` : '';/);
});
