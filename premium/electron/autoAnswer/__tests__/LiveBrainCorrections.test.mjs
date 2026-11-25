import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { FakeClock } from './fakeClock.mjs';

const require = createRequire(import.meta.url);
const compiled = '../../../../dist-electron/premium/electron/autoAnswer/';
const { SimpleAutoAnswerEngine, STABILITY_MS } = require(`${compiled}SimpleAutoAnswer.js`);
const { buildJudgePrompt } = require(`${compiled}AutoAnswerJudge.js`);
const question = 'How would you design the read path for a product lookup service?';
const correction = 'Actually, caching is not allowed.';
const revisedQuestion = `${question}\n${correction}`;
const answer = JSON.stringify({ is_ask: true, directed_at_user: true, complete: true, act: 'question', answerability: 0.95 });
const silent = JSON.stringify({ is_ask: false, directed_at_user: true, complete: true, act: 'statement', answerability: 0.1 });
const flush = () => new Promise(resolve => setImmediate(resolve));

function rig({ enabled = true, complete = false } = {}) {
    const clock = new FakeClock();
    const dispatches = [];
    const judgments = [];
    const marks = [];
    const cancels = [];
    const original = Promise.withResolvers();
    const verdict = Promise.withResolvers();
    const flags = { enabled };
    const engine = new SimpleAutoAnswerEngine({
        isEnabled: () => true,
        correctionsEnabled: () => flags.enabled,
        isMeetingActive: () => true,
        meetingGeneration: () => 1,
        engineAccepting: () => true,
        recentTurns: () => [],
        dispatch(request) {
            dispatches.push(request);
            engine.onAutomaticAnswerProgress(dispatches.length);
            return dispatches.length === 1 && !complete ? original.promise : { status: 'completed' };
        },
        judgeCandidate(req) {
            judgments.push(req);
            return req.previousQuestion ? verdict.promise : Promise.resolve(answer);
        },
        cancelAutomaticAnswer(reason) {
            cancels.push(reason);
            original.resolve({ status: 'cancelled' });
            return true;
        },
        setAnswerOutdated: (generation, outdated) => marks.push({ generation, outdated }),
    }, clock);
    engine.onMeetingStart();
    const say = (text, final = true) => engine.ingest({
        speaker: 'interviewer', text, final, timestamp: clock.now(), origin: 'stt', punctuationSource: 'provider',
    });
    const advance = async (ms = STABILITY_MS) => {
        clock.advance(ms);
        await flush();
    };
    const start = async () => {
        say(question);
        await advance();
        await advance();
        assert.equal(dispatches[0]?.text, question);
    };
    return { engine, flags, dispatches, judgments, marks, cancels, say, advance, start, verdict };
}

test('a correction mid-stream marks the row immediately and cancels only on a positive verdict', async () => {
    const h = rig();
    await h.start();
    h.say(correction);
    assert.deepEqual(h.marks, [{ generation: 1, outdated: true }]);
    await h.advance();
    assert.equal(h.judgments.at(-1).candidateText, revisedQuestion);
    assert.deepEqual(h.cancels, []);
    const prompt = buildJudgePrompt(h.judgments.at(-1));
    assert.ok(prompt.includes(`<candidate>\n${correction}\n</candidate>`));
    assert.ok(prompt.includes(`<previous_question>\n${question}\n</previous_question>`));
    h.verdict.resolve(answer);
    await flush();
    assert.deepEqual(h.cancels, ['answer_corrected']);
    assert.deepEqual(h.dispatches.map(q => q.text), [question, revisedQuestion]);
    assert.equal(h.dispatches[1].replacesAutomaticAnswer, true);
    assert.deepEqual(h.marks, [{ generation: 1, outdated: true }]);
});

test('a correction ten seconds after delivery leaves the previous row outdated and re-answers', async () => {
    const h = rig({ complete: true });
    await h.start();
    await h.advance(10_000);
    h.say(correction);
    assert.deepEqual(h.marks, [{ generation: 1, outdated: true }]);
    h.verdict.resolve(answer);
    await h.advance();
    assert.deepEqual(h.cancels, []);
    assert.deepEqual(h.dispatches.map(q => q.text), [question, revisedQuestion]);
});

test('backchannels during a stream leave the draft and judge alone', async () => {
    const h = rig();
    await h.start();
    for (const filler of ['mm-hmm', 'okay', 'right']) {
        h.say(filler, false);
        h.say(filler);
        await h.advance();
    }
    assert.deepEqual(h.marks, []);
    assert.deepEqual(h.cancels, []);
    assert.equal(h.judgments.length, 1);
    assert.equal(h.dispatches.length, 1);
});

test('a non-answer verdict clears the outdated marker and preserves the live stream', async () => {
    const h = rig();
    await h.start();
    h.say('I just got a notification from my calendar.');
    await h.advance();
    h.verdict.resolve(silent);
    await flush();
    assert.deepEqual(h.marks, [{ generation: 1, outdated: true }, { generation: 1, outdated: false }]);
    assert.deepEqual(h.cancels, []);
    assert.equal(h.dispatches.length, 1);
});

test('the disabled switch preserves the regular judge and parking path', async () => {
    const h = rig({ enabled: false });
    await h.start();
    h.say(correction);
    await h.advance();
    await h.advance();
    assert.equal(h.judgments.at(-1).previousQuestion, undefined);
    assert.deepEqual(h.marks, []);
    assert.deepEqual(h.cancels, []);
    assert.equal(h.dispatches.length, 1);
});

test('a delivered answer outside the twenty-second window is not marked outdated', async () => {
    const h = rig({ complete: true });
    await h.start();
    await h.advance(20_001);
    h.say('How would you partition the document store?');
    await h.advance();
    await h.advance();
    assert.deepEqual(h.marks, []);
    assert.equal(h.judgments.at(-1).previousQuestion, undefined);
    assert.equal(h.dispatches[1]?.replacesAutomaticAnswer, undefined);
});

test('a new self-contained question during an answer is answered on its own words', async () => {
    const h = rig();
    await h.start();
    const followUp = 'What happens if the database goes down?';
    h.say(followUp);
    assert.deepEqual(h.marks, [{ generation: 1, outdated: true }]);
    await h.advance();
    h.verdict.resolve(answer);
    await flush();
    assert.deepEqual(h.cancels, ['answer_corrected']);
    // Not "<previous question>\n<follow-up>": the answer model would address both.
    assert.deepEqual(h.dispatches.map(q => q.text), [question, followUp]);
});

test('candidate speech during an answer never marks, judges or cancels', async () => {
    const h = rig();
    await h.start();
    h.engine.ingest({ speaker: 'user', text: 'Actually, let me think about caching first.', final: true,
        timestamp: Date.now(), origin: 'stt', punctuationSource: 'provider' });
    await h.advance();
    await h.advance();
    assert.deepEqual(h.marks, []);
    assert.deepEqual(h.cancels, []);
    assert.equal(h.judgments.length, 1);
    assert.equal(h.dispatches.length, 1);
});

test('disabling the switch while the correction is being judged clears its marker', async () => {
    const h = rig();
    await h.start();
    h.say(correction);
    await h.advance();
    h.flags.enabled = false;
    h.verdict.resolve(answer);
    await flush();
    assert.deepEqual(h.marks, [{ generation: 1, outdated: true }, { generation: 1, outdated: false }]);
    assert.deepEqual(h.cancels, []);
    assert.equal(h.dispatches.length, 1);
});
