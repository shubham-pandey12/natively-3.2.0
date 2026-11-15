/**
 * The engine reports how an automatic answer ended (2026-11-15).
 *
 * SimpleAutoAnswer keeps a question's words until its answer settles, retries
 * a failure once and re-judges a cancelled one with the speech that followed.
 * That needs runAutoAnswer to say what happened, and cancelAutomaticAnswer to
 * stop only automatic work. Real IntelligenceEngine, fake provider.
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
const ANSWER = 'I picked PostgreSQL for the ecosystem and the tooling around it, and because the team already knew it well.';
const flush = () => new Promise((r) => setImmediate(r));

async function makeEngine({ plan = [] } = {}) {
    const { IntelligenceEngine } = await import(pathToFileURL(enginePath).href);
    const { SessionTracker } = require(sessionPath);
    const session = new SessionTracker();
    const engine = new IntelligenceEngine({ setNegotiationCoachingHandler() {} }, session);
    engine.lastTriggerTime = 0;
    const calls = [];
    engine.whatToAnswerLLM = {
        async *generateStream(..._args) {
            const step = plan[calls.length] ?? 'ok';
            calls.push(step);
            if (step === 'fail') throw new Error('provider exploded');
            if (step === 'net') throw Object.assign(new Error('fetch failed: ECONNRESET'), { status: 503 });
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
    engine.on('error', () => {});
    session.addTranscript({ speaker: 'interviewer', text: QUESTION, timestamp: Date.now(), final: true });
    return { engine, calls };
}

const autoAnswer = (engine) => engine.runAutoAnswer({
    id: 'q1', text: QUESTION, confidence: 0.9, answerability: 0.9, dialogueAct: 'technical_question',
    isFollowUp: false, endpointSource: 'quiet_window', candidateGeneration: 1,
}, { reuseSpeculative: false, context: '' });

test('a streamed automatic answer reports completed', async () => {
    const h = await makeEngine();
    const result = await autoAnswer(h.engine);
    assert.equal(result.status, 'completed');
    h.engine.reset();
});

test('a provider failure reports failed, and frees the trigger cooldown for the retry', async () => {
    const h = await makeEngine({ plan: ['fail'] });
    const result = await autoAnswer(h.engine);
    assert.equal(result.status, 'failed');
    assert.equal(h.engine.lastTriggerTime, 0, 'the retry is not blocked by the cooldown of an answer that never showed');
    h.engine.reset();
});

test('a provider outage the user was SHOWN reports completed, so the retry cannot post a second card', async () => {
    const h = await makeEngine({ plan: ['net'] });
    const shown = [];
    h.engine.on('suggested_answer', (a) => shown.push(a));
    const result = await autoAnswer(h.engine);
    assert.ok(shown.some((a) => typeof a === 'string' && a.trim()), 'a provider-error card was shown');
    assert.equal(result.status, 'completed');
    h.engine.reset();
});

test('interviewer resuming cancels the streaming automatic answer and reports cancelled', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const h = await makeEngine({ plan: [gate] });
    const running = autoAnswer(h.engine);
    await flush(); await flush();
    assert.equal(h.engine.cancelAutomaticAnswer('interviewer_resumed'), true);
    release();
    const result = await running;
    assert.equal(result.status, 'cancelled');
    assert.equal(h.engine.lastTriggerTime, 0);
    h.engine.reset();
});

test('cancelAutomaticAnswer never stops a MANUAL answer', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const h = await makeEngine({ plan: [gate] });
    const outcomeOut = {};
    const manual = h.engine.runWhatShouldISay(undefined, 0.8, undefined, { skipCooldown: true, forceFresh: true, outcomeOut });
    await flush(); await flush();
    assert.equal(h.engine.cancelAutomaticAnswer('interviewer_resumed'), false, 'nothing automatic to cancel');
    release();
    await manual;
    assert.equal(outcomeOut.value?.status, 'success', 'the manual answer finished');
    h.engine.reset();
});

test('a cancel that lands while the trigger is still at the planner stops it before any model call', async () => {
    let releasePlanner;
    const planner = new Promise((r) => { releasePlanner = r; });
    const h = await makeEngine();
    h.engine.planSuggestionTrigger = async () => { await planner; return { kind: 'answer', reason: 'answerable_question', confidence: 0.9 }; };
    const running = autoAnswer(h.engine);
    await flush();
    assert.equal(h.engine.cancelAutomaticAnswer('interviewer_resumed'), true);
    releasePlanner();
    const result = await running;
    assert.equal(result.status, 'cancelled');
    assert.equal(h.calls.length, 0);
    h.engine.reset();
});
