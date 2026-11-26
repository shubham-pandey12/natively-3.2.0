import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { InterviewNotebook, emptyNotebook } = require('../../../../dist-electron/premium/electron/liveBrain/InterviewNotebook.js');
const flush = () => new Promise(resolve => setImmediate(resolve));

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
