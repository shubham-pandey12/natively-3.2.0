import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const dist = (...parts) => require(path.join(root, 'dist-electron', 'electron', ...parts));
const { IntelligenceEngine } = dist('IntelligenceEngine.js');
const { SessionTracker } = dist('SessionTracker.js');
const { planNextAssistantAction } = dist('llm', 'PlannerDecision.js');

const Q1 = 'How long are raw spans kept before they are compacted?';
const Q2 = 'What database would you choose to store session data?';
const ANSWER = 'Raw spans are kept for fourteen days in the hot tier before compaction.';
const PARTIAL = 'Raw spans are kept for fourteen';
const flush = () => new Promise(resolve => setImmediate(resolve));

async function until(predicate) {
  for (let tries = 0; tries < 300; tries++) {
    if (predicate()) return;
    await flush();
  }
  assert.fail('The scripted answer did not reach the expected state');
}

function makeEngine(steps = []) {
  const session = new SessionTracker();
  const engine = new IntelligenceEngine({ setNegotiationCoachingHandler() {} }, session);
  let calls = 0;
  engine.lastTriggerTime = 0;
  engine.verifyAnswerClaims = async o => o.answer;
  engine.whatToAnswerLLM = {
    async *generateStream(...args) {
      const step = steps[calls++];
      if (step === 'cut') {
        yield PARTIAL;
        args[13].truncated = true;
        args[13].reason = 'provider_failed_after_first_token';
      } else if (step) {
        yield ANSWER.slice(0, 40);
        await step;
        yield ANSWER.slice(40);
      } else {
        yield ANSWER;
      }
    },
  };
  engine.planSuggestionTrigger = async trigger => ({ kind: 'answer', reason: 'answerable_question', confidence: trigger.confidence ?? 0.9 });
  const finals = [];
  const settlements = [];
  engine.on('suggested_answer', (answer, question, _confidence, generationId, _label, stopReason, outcome) => {
    finals.push({ answer, question, generationId, stopReason, outcome });
  });
  engine.on('error', () => {});
  const say = (text, timestamp, final = true) => {
    const segment = { speaker: 'interviewer', text, timestamp, final, origin: 'stt' };
    if (final) session.addTranscript(segment);
    else session.handleTranscript(segment);
  };
  const auto = (text, id, sourceSegments, reuseSpeculative = false) => engine.runAutoAnswer({
    id, text, sourceSegments, confidence: 0.9, answerability: 0.9, dialogueAct: 'technical_question',
    isFollowUp: false, endpointSource: 'quiet_window', candidateGeneration: 1,
  }, { reuseSpeculative, context: '' });
  const press = async (spokenQuestion) => {
    const outcomeOut = {};
    await engine.runWhatShouldISay(undefined, 0.8, undefined, {
      spokenQuestion, forceFresh: true, skipCooldown: true, joinAutomatic: true, outcomeOut,
      onSettled: settlement => settlements.push(settlement),
    });
    return outcomeOut.value;
  };
  return { engine, session, finals, settlements, say, auto, press, calls: () => calls };
}

test('a cut-off manual answer is delivered once and remains excluded from both histories', async () => {
  const h = makeEngine(['cut']);
  const ringWrites = [];
  h.engine.recordLiveTurn = (...args) => ringWrites.push(args);
  const at = Date.now();
  h.say(Q1, at);
  const outcome = await h.press(Q1);
  assert.equal(outcome.status, 'failed', 'the completion status still describes a cut-off generation');
  assert.equal(outcome.delivered, true);
  assert.equal(h.finals[0].outcome.delivered, true);
  assert.equal(h.finals[0].stopReason, 'provider_failed_after_first_token');
  assert.deepEqual(h.settlements, [{ answered: true, question: Q1 }]);
  assert.equal(h.session.getLastAssistantMessage(), null);
  await h.auto(Q1, 'q1', [at]);
  assert.equal(h.calls(), 1);
  assert.equal(h.finals.length, 1);
  assert.deepEqual(ringWrites, []);
});

test('a configuration notice does not answer the spoken question', async () => {
  const h = makeEngine();
  const at = Date.now();
  h.say(Q1, at);
  const provider = h.engine.whatToAnswerLLM;
  h.engine.whatToAnswerLLM = null;
  h.engine.answerLLM = null;
  const outcome = await h.press(Q1);
  assert.equal(outcome.reason, 'configuration_required');
  assert.equal(outcome.delivered, false);
  assert.match(h.finals[0].answer, /configure your API keys/i);
  assert.equal(h.settlements[0].answered, false);
  h.engine.whatToAnswerLLM = provider;
  assert.equal((await h.auto(Q1, 'q1', [at])).status, 'completed');
  assert.equal(h.calls(), 1);
});

test('a different generation cannot satisfy a manual press settlement', async () => {
  const gate = Promise.withResolvers();
  const h = makeEngine([gate.promise]);
  h.say(Q1, Date.now());
  const press = h.press(Q1);
  await until(() => h.calls() === 1);
  const own = h.engine.currentGenerationId;
  h.engine.emit('suggested_answer', ANSWER, Q2, 0.9, own - 1, undefined, undefined, { status: 'success', retryable: false, delivered: true });
  h.engine.reset();
  gate.resolve();
  await press;
  assert.equal(h.settlements[0].answered, false);
});

for (const timing of ['before', 'after']) {
  test(`Q2 arriving ${timing} Q1 adoption is still answered after Q1`, async () => {
    const gate = Promise.withResolvers();
    const h = makeEngine([gate.promise]);
    const at = Date.now() - 100;
    h.say(Q1, at);
    h.engine.prefetchAutoAnswer('q1', Q1);
    await until(() => h.calls() === 1);
    const sayQ2 = () => {
      h.say('What database would you choose', at + 20, false);
      h.say(Q2, at + 40);
    };
    if (timing === 'before') sayQ2();
    const first = h.auto(Q1, 'q1', [at], true);
    await until(() => h.engine.speculativeAdoptedGenerationId != null);
    assert.equal(h.engine.spokenAnswer?.turn.text, Q1);
    assert.equal(h.engine.beginWhatToSayPress(undefined, true).joinableAutomaticGenerationId,
      timing === 'after' ? h.engine.currentGenerationId : undefined);
    if (timing === 'after') sayQ2();
    gate.resolve();
    assert.equal((await first).status, 'completed');
    assert.equal((await h.auto(Q2, 'q2', [at + 40])).status, 'completed');
    assert.equal(h.calls(), 2);
    assert.deepEqual(h.finals.map(final => final.question), [Q1, Q2]);
  });
}

test('a finished Q1 prefetch revealed after Q2 arrives still owns Q1', async () => {
  const h = makeEngine();
  const at = Date.now() - 100;
  h.say(Q1, at);
  h.engine.prefetchAutoAnswer('q1', Q1);
  await until(() => h.engine.getActiveMode() === 'idle' && h.calls() === 1);
  h.say(Q2, at + 20);
  assert.equal((await h.auto(Q1, 'q1', [at], true)).status, 'completed');
  assert.equal(h.engine.spokenAnswer?.turn.text, Q1);
  assert.equal((await h.auto(Q2, 'q2', [at + 20])).status, 'completed');
  assert.deepEqual(h.finals.map(final => final.question), [Q1, Q2]);
});

test('a manual press locked to Q1 does not claim the newer Q2', async () => {
  const h = makeEngine();
  const at = Date.now() - 100;
  h.say(Q1, at);
  h.say(Q2, at + 20);
  await h.press(Q1);
  assert.equal(h.engine.spokenAnswer?.turn.text, Q1);
  assert.equal((await h.auto(Q2, 'q2', [at + 20])).status, 'completed');
  assert.equal(h.calls(), 2);
});

test('an unmatched candidate claims nothing and the D3 planner guard still blocks its repeat', async () => {
  const h = makeEngine();
  h.say(Q2, Date.now());
  h.engine.planSuggestionTrigger = async trigger => planNextAssistantAction({
    triggerQuestion: trigger.lastQuestion, confidence: trigger.confidence, transcriptContext: Q2,
    hasRecentAssistantResponse: Boolean(h.session.getLastAssistantMessage()), hasDetectedCodingQuestion: false,
    now: Date.now(), lastTriggerTime: h.engine.lastTriggerTime, cooldownMs: 3000,
    lastTriggerQuestion: h.engine.lastTriggerQuestion, automatic: true,
  });
  assert.equal((await h.auto(Q1, 'q1')).status, 'completed');
  assert.equal(h.engine.spokenAnswer, undefined);
  assert.equal((await h.auto(Q1, 'q1-again')).status, 'skipped');
  assert.equal(h.calls(), 1);
});
