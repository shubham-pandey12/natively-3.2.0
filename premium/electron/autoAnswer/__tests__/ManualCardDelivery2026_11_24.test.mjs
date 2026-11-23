import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { FakeClock } from './fakeClock.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const { SimpleAutoAnswerEngine, STABILITY_MS } =
  require(path.join(root, 'dist-electron', 'premium', 'electron', 'autoAnswer', 'SimpleAutoAnswer.js'));
const Q1 = 'How long are raw spans kept before they are compacted?';
const Q2 = 'What database would you choose to store session data?';
const YES = JSON.stringify({ is_ask: true, directed_at_user: true, complete: true, act: 'question', answerability: 0.95 });
const flush = () => new Promise(resolve => setImmediate(resolve));

function rig() {
  const clock = new FakeClock();
  const dispatched = [];
  const engine = new SimpleAutoAnswerEngine({
    isEnabled: () => true, isMeetingActive: () => true, meetingGeneration: () => 1, engineAccepting: () => true,
    recentTurns: () => [], judgeCandidate: async () => YES,
    dispatch: question => { dispatched.push(question); return { status: 'completed' }; },
  }, clock);
  engine.onMeetingStart();
  const say = (text, timestamp = clock.now()) => engine.ingest({ speaker: 'interviewer', text, timestamp, final: true, origin: 'stt' });
  const advance = async (ms) => {
    for (let left = ms; left > 0;) {
      const step = Math.min(left, 50);
      clock.advance(step);
      left -= step;
      await flush();
    }
  };
  return { engine, clock, dispatched, say, advance };
}

for (const answered of [true, false]) {
  test(answered ? 'a delivered cut-off card consumes the manual handover'
    : 'an error notice gives the manual handover back once', async () => {
    const h = rig();
    h.say(Q1);
    const pressId = h.engine.onManualAnswerStarted();
    h.engine.onManualSpokenAnswer(Q1);
    h.engine.onManualAnswerSettled({ answered, answeredQuestion: Q1, pressId });
    await h.advance(STABILITY_MS * 3);
    assert.deepEqual(h.dispatched.map(question => question.text), answered ? [] : [Q1]);
  });
}

test('handover of a locked Q1 leaves Q2 pending with its source timestamp', async () => {
  const h = rig();
  h.say(Q1);
  const q2At = h.clock.now() - 5;
  h.say(Q2, q2At);
  const pressId = h.engine.onManualAnswerStarted();
  h.engine.onManualSpokenAnswer(Q1);
  h.engine.onManualAnswerSettled({ answered: true, answeredQuestion: Q1, pressId });
  await h.advance(STABILITY_MS * 3);
  assert.deepEqual(h.dispatched.map(question => [question.text, question.sourceSegments]), [[Q2, [q2At]]]);
});
