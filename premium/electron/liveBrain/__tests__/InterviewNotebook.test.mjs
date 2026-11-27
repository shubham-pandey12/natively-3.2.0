import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { InterviewNotebook, emptyNotebook } = require('../../../../dist-electron/premium/electron/liveBrain/InterviewNotebook.js');
const flush = () => new Promise(resolve => setImmediate(resolve));

test('a saturated notebook keeps complete priority sections and the summary', async () => {
    let at = 1_000;
    const summary = 'Summary marker. ' + 's'.repeat(1_300);
    const notebook = new InterviewNotebook({ now: () => at, summarize: async () => summary });
    const record = (role, text, ask) => notebook.record({ role, text, at: at++ }, ask);
    for (let i = 0; i < 7; i++) {
        record('assistant', 'Ask ' + i + ' ' + 'a'.repeat(143), true);
        record('interviewer', 'Design ' + i + ' must ' + 'x'.repeat(150) + '?');
        record('candidate', 'I will ' + i + ' ' + 'c'.repeat(150));
        record('assistant', 'Answer ' + i);
    }
    record('assistant', 'Which region is pending?', true);
    await flush();
    const rendered = notebook.renderNotebook();
    assert.ok(rendered.length <= 5_000);
    assert.ok(rendered.includes('Current topic: Design 6'));
    assert.ok(rendered.includes('Which region is pending? → Open'));
    assert.ok(rendered.includes('Earlier context: ' + summary));
    assert.ok(rendered.endsWith('</meeting_history>'));
    const requirements = rendered.match(/^Requirements: (.+)$/m)?.[1].split(' | ') ?? [];
    const saved = notebook.snapshot().requirements;
    assert.deepEqual(requirements, saved.slice(saved.length - requirements.length));
});

test('backchannels leave a clarification open and short substantive replies close it', () => {
    let at = 1_000;
    const notebook = new InterviewNotebook({ now: () => at });
    const ask = () => notebook.record({ role: 'assistant', text: 'Which region?', at: at++ }, true);
    const reply = text => notebook.record({ role: 'interviewer', text, at: at++ });
    ask();
    for (const filler of ['Mm-hmm.', 'okay', 'right', 'uh huh']) reply(filler);
    assert.equal(notebook.snapshot().clarifications.at(-1).answer, null);
    reply('Tokyo.');
    assert.equal(notebook.snapshot().clarifications.at(-1).answer, 'Tokyo.');
    for (const text of ['Yes.', 'No.', 'Postgres']) {
        ask();
        reply(text);
        assert.equal(notebook.snapshot().clarifications.at(-1).answer, text);
    }
    assert.equal(notebook.snapshot().currentTopic, null);
    assert.deepEqual(notebook.snapshot().requirements, []);
    notebook.clear();
});

test('a correction discards stale refinement and the next pass sees the new constraint', async () => {
    const slow = Promise.withResolvers();
    const prompts = [];
    const notebook = new InterviewNotebook({
        now: () => 2,
        summarize: prompt => {
            prompts.push(prompt);
            return prompts.length === 1 ? slow.promise : Promise.resolve('Use PostgreSQL.');
        },
    });
    notebook.record({ role: 'interviewer', text: 'Must use Redis.', at: 1 });
    await flush();
    notebook.record({ role: 'interviewer', text: 'Actually, must use PostgreSQL.', at: 2 });
    slow.resolve('Obsolete Redis summary.');
    await flush();
    assert.doesNotMatch(notebook.snapshot().summary, /Obsolete Redis summary/);
    await flush();
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /Actually, must use PostgreSQL/);
    assert.doesNotMatch(prompts[1], /Obsolete Redis summary/);
    assert.equal(notebook.snapshot().summary, 'Use PostgreSQL.');
});

test('refinement deadline releases a never-settling request and reset aborts the next request', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const signals = [];
    const notebook = new InterviewNotebook({
        now: () => 2,
        summarize: (_prompt, signal) => {
            signals.push(signal);
            return new Promise(() => {});
        },
    });
    notebook.record({ role: 'interviewer', text: 'Must use Redis.', at: 1 });
    await flush();
    assert.equal(signals.length, 1);
    t.mock.timers.tick(12_000);
    await flush();
    assert.equal(signals[0].aborted, true);
    assert.match(notebook.snapshot().summary, /Must use Redis/);
    notebook.record({ role: 'assistant', text: 'I would start with a cache.', at: 2 });
    await flush();
    assert.equal(signals.length, 2);
    notebook.clear();
    assert.equal(signals[1].aborted, true);
});

test('a backward clock jump does not suppress a repeated turn', () => {
    const notebook = new InterviewNotebook({ now: () => 10_000 });
    const text = 'Design a cache?';
    for (const at of [10_000, 9_000, 9_001]) notebook.record({ role: 'interviewer', text, at });
    assert.deepEqual(notebook.recentTurns().map(turn => turn.at), [10_000, 9_000]);
});

test('Japanese question punctuation is recognized and clipping preserves surrogate pairs', () => {
    const notebook = new InterviewNotebook({ now: () => 2 });
    notebook.record({ role: 'interviewer', text: '前置きです。どのリージョンですか？', at: 1 });
    assert.equal(notebook.snapshot().currentTopic, 'どのリージョンですか？');
    assert.deepEqual(notebook.snapshot().requirements, ['どのリージョンですか？']);
    notebook.record({ role: 'candidate', text: 'x'.repeat(1_999) + '😀 trailing', at: 2 });
    assert.equal(notebook.recentTurns().at(-1).text, 'x'.repeat(1_999));
});

test('the deterministic notes preserve interview details when refinement returns no result', async () => {
    const notebook = new InterviewNotebook({ now: () => 1, summarize: async () => null });
    const record = (role, text) => notebook.record({ role, text, at: 1 });
    record('interviewer', '靜語雜訊');
    record('interviewer', 'The service needs to support scheduled notifications. Use push by default.');
    record('candidate', 'I would use a durable queue.');
    record('interviewer', 'Actually, the service must use email only.');
    record('assistant', 'We will shard by tenant.');
    await flush();
    const snapshot = notebook.snapshot();
    assert.match(snapshot.summary, /Requirement: The service needs to support scheduled notifications\./);
    assert.match(snapshot.summary, /Constraint: Actually, the service must use email only\./);
    assert.match(snapshot.summary, /Decision: I would use a durable queue\./);
    assert.deepEqual(snapshot.decisions, ['I would use a durable queue.']);
    assert.doesNotMatch(snapshot.summary, /discussion covering|Started with|靜語雜訊|shard by tenant/);
    assert.equal(notebook.recentTurns()[0].text, '靜語雜訊');
});

test('refinement receives structured evidence and its last successful notes on the next update', async () => {
    const prompts = [];
    const notebook = new InterviewNotebook({
        now: () => 1,
        summarize: async prompt => {
            prompts.push(prompt);
            return prompts.length === 1 ? 'Email notifications use a durable queue.' : null;
        },
    });
    notebook.record({ role: 'interviewer', text: 'The service must use email only.', at: 1 });
    notebook.record({ role: 'candidate', text: 'I will use a durable queue.', at: 2 });
    await flush();
    assert.match(prompts[0], /Constraint: The service must use email only/);
    assert.match(prompts[0], /Decision: I will use a durable queue/);
    assert.equal(notebook.snapshot().summary, 'Email notifications use a durable queue.');
    notebook.record({ role: 'assistant', text: 'The queue keeps retries durable.', at: 3 });
    await flush();
    assert.match(prompts[1], /Earlier notes:\nEmail notifications use a durable queue\./);
    assert.match(notebook.snapshot().summary, /Decision: I will use a durable queue/);
});

test('bounded notebook updates without waiting for the fast model and clears pending work on stop', async () => {
    let at = 1_000;
    let summarizerSignal;
    const slow = Promise.withResolvers();
    const notebook = new InterviewNotebook({
        now: () => at,
        summarize: (_prompt, signal) => { summarizerSignal = signal; return slow.promise; },
    });
    notebook.record({ role: 'interviewer', text: 'The service must use email only.', at });
    notebook.record({ role: 'assistant', text: 'What rate limit applies?', at: ++at }, true);
    notebook.record({ role: 'interviewer', text: 'At most 500 per hour.', at: ++at });
    notebook.record({ role: 'candidate', text: 'I would use a durable queue.', at: ++at });
    notebook.record({ role: 'assistant', text: 'I would throttle bursts to stay under 500 per hour.', at: ++at });
    assert.equal(summarizerSignal, undefined);
    assert.match(notebook.renderNotebook(), /email only/);
    assert.equal(notebook.snapshot().clarifications[0].answer, 'At most 500 per hour.');
    await flush();
    assert.equal(summarizerSignal.aborted, false);
    for (let i = 0; i < 1_000; i++) notebook.record({ role: 'assistant', text: `${i} ${'word '.repeat(800)}`, at: ++at });
    assert.ok(notebook.renderNotebook().length <= 5_000);
    assert.ok(notebook.recentTurns().reduce((sum, turn) => sum + turn.text.length, 0) <= 16_000);
    at += 4 * 60_000 + 1;
    assert.deepEqual(notebook.recentTurns(), []);
    notebook.clear();
    assert.equal(summarizerSignal.aborted, true);
    slow.resolve('The old meeting must not leak into the new one.');
    await flush();
    assert.deepEqual(notebook.snapshot(), emptyNotebook());
    assert.equal(notebook.renderNotebook(), '');
});
