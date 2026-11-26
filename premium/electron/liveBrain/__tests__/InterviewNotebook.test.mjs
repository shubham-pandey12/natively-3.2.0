import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { InterviewNotebook, emptyNotebook } = require('../../../../dist-electron/premium/electron/liveBrain/InterviewNotebook.js');
const flush = () => new Promise(resolve => setImmediate(resolve));

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
