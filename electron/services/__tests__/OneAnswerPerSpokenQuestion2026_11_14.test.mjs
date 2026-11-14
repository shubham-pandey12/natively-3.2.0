/**
 * One answer per spoken question (2026-11-14).
 *
 * Reported: the interviewer asks a question, the user presses "What should I
 * say", and two answers arrive — the manual one and the automatic one. Two
 * routes produced it:
 *   1. an automatic dispatch parked behind the busy engine (or still at the
 *      planner) fired after the manual press and answered the same turn again;
 *   2. a manual press during or after an automatic answer started a second
 *      generation for the question that was already answered.
 *
 * The engine now gives each interviewer turn one owner. These tests drive the
 * real runWhatShouldISay / handleSuggestionTrigger with a fake provider and
 * count provider calls, so "no second answer" means "no second model call".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const enginePath = path.resolve(__dirname, '../../../dist-electron/electron/IntelligenceEngine.js');
const sessionPath = path.resolve(__dirname, '../../../dist-electron/electron/SessionTracker.js');
const require = createRequire(import.meta.url);

const QUESTION = 'Why did you choose PostgreSQL over the alternatives for this service?';
const NEXT_QUESTION = 'How would you shard the orders table once it outgrows one node?';
const ANSWER = 'I picked PostgreSQL for the ecosystem and the tooling around it, and because the team already knew it well.';
const MANUAL = { skipCooldown: true, forceFresh: true };

const flush = () => new Promise((r) => setImmediate(r));

/**
 * `plan` decides each provider call in order: 'ok' streams ANSWER, 'fail'
 * throws, a Promise holds the stream open until it resolves.
 */
async function makeEngine({ plan = [] } = {}) {
    const { IntelligenceEngine } = await import(pathToFileURL(enginePath).href);
    const { SessionTracker } = require(sessionPath);
    const session = new SessionTracker();
    const engine = new IntelligenceEngine({ setNegotiationCoachingHandler() {} }, session);
    engine.lastTriggerTime = 0;
    const calls = [];
    engine.whatToAnswerLLM = {
        async *generateStream() {
            const step = plan[calls.length] ?? 'ok';
            calls.push(step);
            if (step === 'fail') throw new Error('provider exploded');
            if (step && typeof step.then === 'function') {
                yield ANSWER.slice(0, 40);
                await step;
                yield ANSWER.slice(40);
                return;
            }
            yield ANSWER;
        },
    };
    engine.planSuggestionTrigger = async () => ({ kind: 'answer', reason: 'answerable_question', confidence: 0.9 });
    const finals = [];
    const skipped = [];
    engine.on('suggested_answer', (answer, question, _c, generationId, _s, _r, outcome) => finals.push({ answer, question, generationId, outcome }));
    engine.on('suggestion_skipped', (info) => skipped.push(info));
    engine.on('error', () => {});
    const say = (text, timestamp = Date.now()) => session.addTranscript({ speaker: 'interviewer', text, timestamp, final: true });
    return { engine, session, calls, finals, skipped, say };
}

function autoAnswer(engine, text = QUESTION) {
    return engine.runAutoAnswer({
        id: 'q1', text, confidence: 0.9, answerability: 0.9, dialogueAct: 'technical_question',
        isFollowUp: false, endpointSource: 'quiet_window', candidateGeneration: 1,
    }, { reuseSpeculative: false, context: '' });
}

async function manualPress(engine, options = {}) {
    const outcomeOut = {};
    let started = 0;
    const answer = await engine.runWhatShouldISay(undefined, 0.8, undefined, {
        ...MANUAL, joinAutomatic: true, onStart: () => { started++; }, outcomeOut, ...options,
    });
    return { answer, outcome: outcomeOut.value, started };
}

test('a manual press after the automatic answer joins it: no second model call, no second answer', async () => {
    const h = await makeEngine();
    h.say(QUESTION);
    await autoAnswer(h.engine);
    assert.equal(h.calls.length, 1);
    assert.equal(h.finals.length, 1);

    const press = await manualPress(h.engine);
    assert.equal(press.answer, null);
    assert.deepEqual(press.outcome, { status: 'cancelled', retryable: false, reason: 'automatic_answer_exists' });
    assert.equal(press.started, 0, 'a joined press never reports itself as a new answer (no feedback "superseded")');
    assert.equal(h.calls.length, 1, 'no second provider call');
    assert.equal(h.finals.length, 1, 'no second answer');
    h.engine.reset();
});

test('a manual press DURING the automatic answer waits for it instead of cancelling it', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const h = await makeEngine({ plan: [gate] });
    h.say(QUESTION);
    const auto = autoAnswer(h.engine);
    await flush(); await flush();
    assert.equal(h.engine.getActiveMode(), 'what_to_say', 'the automatic answer is streaming');

    const pressing = manualPress(h.engine);
    await flush();
    assert.equal(h.calls.length, 1, 'the press did not start a second generation');
    release();
    await auto;
    const press = await pressing;
    assert.equal(press.outcome.reason, 'automatic_answer_exists');
    assert.equal(h.calls.length, 1);
    assert.equal(h.finals.length, 1);
    assert.equal(h.finals[0].outcome?.status, 'success', 'the automatic answer was not cancelled by the press');
    h.engine.reset();
});

test('the joined automatic answer FAILS → the manual press answers instead (one fallback call)', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const failing = gate.then(() => { throw new Error('provider exploded'); });
    failing.catch(() => {});
    const h = await makeEngine({ plan: [failing, 'ok'] });
    h.say(QUESTION);
    const auto = autoAnswer(h.engine);
    await flush(); await flush();
    const pressing = manualPress(h.engine);
    await flush();
    assert.equal(h.calls.length, 1, 'nothing runs in parallel while the automatic answer is alive');
    release();
    await auto;
    const press = await pressing;
    assert.equal(press.started, 1, 'the press became the answer');
    assert.equal(press.outcome?.status, 'success');
    assert.equal(press.answer, ANSWER);
    assert.equal(h.calls.length, 2, 'exactly one fallback call');
    h.engine.reset();
});

test('an automatic answer that already FAILED does not block a later manual press', async () => {
    const h = await makeEngine({ plan: ['fail', 'ok'] });
    h.say(QUESTION);
    await autoAnswer(h.engine);
    const press = await manualPress(h.engine);
    assert.equal(press.outcome?.status, 'success');
    assert.equal(h.calls.length, 2);
    h.engine.reset();
});

test('an automatic trigger for a question the manual press already answered is skipped (parked dispatch)', async () => {
    const h = await makeEngine();
    h.say(QUESTION);
    const press = await manualPress(h.engine);
    assert.equal(press.outcome?.status, 'success');
    assert.equal(h.calls.length, 1);

    await autoAnswer(h.engine);
    assert.equal(h.calls.length, 1, 'the late automatic dispatch made no provider call');
    assert.equal(h.finals.length, 1, 'and showed no second answer');
    assert.equal(h.skipped.at(-1)?.reason, 'already_answered');
    h.engine.reset();
});

test('the final that replaces the interim the press answered is the same question: still skipped', async () => {
    const h = await makeEngine();
    const t = Date.now();
    h.say('Why did you leave', t);
    await manualPress(h.engine);
    h.say('Why did you leave Google?', t + 1500);
    await autoAnswer(h.engine, 'Why did you leave Google?');
    assert.equal(h.calls.length, 1, 'a short question still matches its own revision');
    h.engine.reset();
});

test('a NEW interviewer question after the manual answer is answered automatically as usual', async () => {
    const h = await makeEngine();
    h.say(QUESTION, Date.now() - 20_000);
    await manualPress(h.engine);
    h.say(NEXT_QUESTION);
    h.engine.lastTriggerTime = 0; // the trigger cooldown after the press has elapsed
    await autoAnswer(h.engine, NEXT_QUESTION);
    assert.deepEqual(h.skipped.map((s) => s.reason), [], 'the new question was not mistaken for the answered one');
    assert.equal(h.calls.length, 2);
    assert.equal(h.finals.length, 2);
    h.engine.reset();
});

test('a manual press overtaking an automatic trigger at the planner wins; the trigger is dropped', async () => {
    let releasePlanner;
    const planner = new Promise((r) => { releasePlanner = r; });
    const h = await makeEngine();
    h.engine.planSuggestionTrigger = async () => { await planner; return { kind: 'answer', reason: 'answerable_question', confidence: 0.9 }; };
    h.say(QUESTION);
    const auto = autoAnswer(h.engine);
    await flush();
    const press = await manualPress(h.engine);
    assert.equal(press.outcome?.status, 'success');
    releasePlanner();
    await auto;
    assert.equal(h.calls.length, 1, 'the automatic run never started');
    assert.equal(h.finals.length, 1);
    assert.equal(h.skipped.at(-1)?.reason, 'already_answered');
    h.engine.reset();
});

test('a press with anything extra (prompt, page, typed question, screenshot) is its own request and never joins', async () => {
    for (const extra of [
        { options: { promptInstruction: 'shorten' } },
        { options: { domContext: 'page text' } },
        { question: 'What is a B-tree?' },
    ]) {
        const h = await makeEngine();
        h.say(QUESTION);
        await autoAnswer(h.engine);
        const outcomeOut = {};
        await h.engine.runWhatShouldISay(extra.question, 0.8, undefined, { ...MANUAL, joinAutomatic: true, outcomeOut, ...(extra.options || {}) });
        assert.notEqual(outcomeOut.value?.reason, 'automatic_answer_exists', JSON.stringify(extra));
        assert.equal(h.calls.length, 2, `${JSON.stringify(extra)} generated its own answer`);
        h.engine.reset();
    }
});

test('with Auto Answer off (joinAutomatic false) a press always answers', async () => {
    const h = await makeEngine();
    h.say(QUESTION);
    await autoAnswer(h.engine);
    const press = await manualPress(h.engine, { joinAutomatic: false });
    assert.equal(press.outcome?.status, 'success');
    assert.equal(h.calls.length, 2);
    h.engine.reset();
});

test('isSameSpokenTurn: interim→final revisions match; different or distant turns do not', async () => {
    const { isSameSpokenTurn } = await import(pathToFileURL(enginePath).href);
    const t = 1_000_000;
    assert.equal(isSameSpokenTurn({ timestamp: t, text: 'Why did you leave' }, { timestamp: t + 900, text: 'Why did you leave Google?' }), true);
    assert.equal(isSameSpokenTurn({ timestamp: t, text: QUESTION }, { timestamp: t, text: QUESTION }), true);
    assert.equal(isSameSpokenTurn({ timestamp: t, text: QUESTION }, { timestamp: t + 2000, text: NEXT_QUESTION }), false);
    assert.equal(isSameSpokenTurn({ timestamp: t, text: QUESTION }, { timestamp: t + 60_000, text: QUESTION }), false, 'the same words a minute later are a new turn');
    assert.equal(isSameSpokenTurn({ timestamp: t, text: 'Okay' }, { timestamp: t + 500, text: 'Okay so tell me more' }), false, 'one or two words are too little to call it the same question');
    assert.equal(isSameSpokenTurn(undefined, { timestamp: t, text: QUESTION }), false);
});
