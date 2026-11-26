import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const dist = '../../../../dist-electron/';
const load = (name) => require(`${dist}premium/electron/liveBrain/${name}.js`);
const { createResponseParser, NO_ACTION_SENTINEL, ASK_SENTINEL } = load('responseParser');
const { DECIDE_TURN_TOOL, toGeminiDecideTurnTool, parseDecideTurnArgs } = load('decideTurnTool');
const { buildDeciderInstructions, buildAnswerInstructions } = load('instructions');
const { createLiveBrain } = load('index');
const { FakeLiveBrain } = load('__tests__/FakeLiveBrain');
const {
    HUMAN_SPOKEN_ANSWER_CONTRACT,
    SPOKEN_ANSWER_CONTRACT,
    UNIVERSAL_WHAT_TO_ANSWER_PROMPT,
    MODE_TECHNICAL_INTERVIEW_PROMPT,
    SHARED_CODING_RULES,
} = require(`${dist}electron/llm/prompts.js`);

const kind = (value) => ({ type: 'kind', kind: value });
const text = (value) => ({ type: 'text', text: value });

test('wait commits as soon as its split sentinel completes and emits no text', () => {
    const parser = createResponseParser();
    assert.deepEqual(parser.push('  **[[NO_'), []);
    assert.deepEqual(parser.push('ACTION]]'), [kind('wait')]);
    assert.deepEqual(parser.push('** should not be shown'), []);
    assert.deepEqual(parser.finish(), []);
});

test('ask consumes split Markdown and quote wrappers around the sentinel', () => {
    const parser = createResponseParser();
    assert.deepEqual(parser.push(' > **`“[[A'), []);
    assert.deepEqual(parser.push('SK]]”`*'), [kind('ask')]);
    assert.deepEqual(parser.push('*   '), []);
    assert.deepEqual(parser.push('Which '), [text('Which ')]);
    assert.deepEqual(parser.push('database?'), [text('database?')]);
    assert.deepEqual(parser.finish(), []);
    assert.deepEqual(parser.push('after finish'), []);
});

test('the classified answer preserves tentative prefixes and mid-text sentinels verbatim', () => {
    const parser = createResponseParser();
    assert.deepEqual(parser.push('  **'), []);
    assert.deepEqual(parser.push('Start here'), [kind('answer'), text('  **Start here')]);
    assert.deepEqual(parser.push(' [[ASK]] or '), [text(' [[ASK]] or ')]);
    assert.deepEqual(parser.push(NO_ACTION_SENTINEL), [text(NO_ACTION_SENTINEL)]);
    assert.deepEqual(parser.finish(), []);
});

test('empty chunks do not commit a kind, and an incomplete sentinel is plain text at EOF', () => {
    const empty = createResponseParser();
    assert.deepEqual(empty.push(''), []);
    assert.deepEqual(empty.push(' \n \t'), []);
    assert.deepEqual(empty.finish(), []);
    assert.deepEqual(empty.finish(), []);

    const parser = createResponseParser();
    assert.deepEqual(parser.push('  [[NO_ACT'), []);
    assert.deepEqual(parser.finish(), [kind('answer'), text('  [[NO_ACT')]);
});

test('every chunk boundary preserves the decision and clarification text', () => {
    const input = `\n\t"${ASK_SENTINEL}"  **Which** database?`;
    for (let split = 0; split <= input.length; split++) {
        const parser = createResponseParser();
        const events = [...parser.push(input.slice(0, split)), ...parser.push(input.slice(split)), ...parser.finish()];
        assert.deepEqual(events.filter(event => event.type === 'kind'), [kind('ask')]);
        assert.equal(events.filter(event => event.type === 'text').map(event => event.text).join(''), '**Which** database?');
    }
});

test('spoken sentinels survive split chunks, punctuation and case', () => {
    for (const wait of ['No action', 'NO action.', '“no ACTION!”', '_No action_']) {
        const parser = createResponseParser();
        const events = [...Array.from(wait).flatMap(char => parser.push(char)), ...parser.finish()];
        assert.deepEqual(events, [kind('wait')]);
    }
    const parser = createResponseParser();
    assert.deepEqual(parser.push('“A'), []);
    assert.deepEqual(parser.push('sK ：” Wh'), [kind('ask'), text('Wh')]);
    assert.deepEqual(parser.push('ich one?'), [text('ich one?')]);
    assert.deepEqual(parser.finish(), []);
    assert.deepEqual(createResponseParser().push('No actionable error.'), [kind('answer'), text('No actionable error.')]);
    const bounded = createResponseParser();
    assert.deepEqual(bounded.push('*'.repeat(17)), [kind('answer'), text('*'.repeat(17))]);
});

test('the decide_turn declaration wraps the provider-neutral JSON schema for Gemini', () => {
    assert.equal(DECIDE_TURN_TOOL.name, 'decide_turn');
    assert.deepEqual(DECIDE_TURN_TOOL.parameters.properties.action.enum, ['answer', 'ask', 'wait']);
    assert.deepEqual(DECIDE_TURN_TOOL.parameters.properties.kind.enum, ['new', 'follow_up', 'correction']);
    assert.deepEqual(DECIDE_TURN_TOOL.parameters.required, ['action']);
    assert.deepEqual(toGeminiDecideTurnTool(), {
        functionDeclarations: [{
            name: 'decide_turn',
            description: DECIDE_TURN_TOOL.description,
            parametersJsonSchema: DECIDE_TURN_TOOL.parameters,
        }],
    });
});

test('decide_turn normalizes the three actions and reads serialized JSON', () => {
    assert.deepEqual(parseDecideTurnArgs({ action: ' answer ', question: ' Why Redis? ', kind: ' follow_up ', clarification: 'unused' }),
        { action: 'answer', question: 'Why Redis?', kind: 'follow_up' });
    assert.deepEqual(parseDecideTurnArgs('{"action":"ask","clarification":" Which database? ","kind":"unknown"}'),
        { action: 'ask', clarification: 'Which database?' });
    assert.deepEqual(parseDecideTurnArgs({ action: 'ask', clarification: 'Which database?', question: ' Design a catalog. ' }),
        { action: 'ask', clarification: 'Which database?', question: 'Design a catalog.' });
    assert.deepEqual(parseDecideTurnArgs({ action: 'wait', question: 'unused' }), { action: 'wait' });
});

test('decide_turn rejects incomplete or malformed arguments and caps long text', () => {
    for (const value of [
        {}, { action: 'answer' }, { action: 'answer', question: '  ' }, { action: 'ask' },
        { action: 'ask', clarification: 123 }, { action: 'speak' }, null, 'bad JSON', 'null', '[]', 42,
    ]) assert.equal(parseDecideTurnArgs(value), null);
    assert.equal(parseDecideTurnArgs({ action: 'answer', question: 'q'.repeat(2500) }).question.length, 2000);
    assert.equal(parseDecideTurnArgs({ action: 'ask', clarification: 'c'.repeat(400) }).clarification.length, 300);
    assert.equal(parseDecideTurnArgs({ action: 'ask', clarification: 'Which database?', question: 'q'.repeat(2500) }).question.length, 2000);
    assert.equal(parseDecideTurnArgs({ action: 'ask', clarification: 'c'.repeat(299) + '😀' }).clarification.length, 299);
});

test('the decider builder is pure and contains turn rules without spoken-answer style', () => {
    const context = Object.freeze({ profileSummary: 'Works on distributed caches', modeName: 'Technical Interview', notebookText: 'Caching is forbidden' });
    const output = buildDeciderInstructions(context);
    assert.equal(output, buildDeciderInstructions({ ...context }));
    for (const value of [
        'Candidate said:', 'decide_turn', 'Never speak an answer', 'materially changes the answer',
        'Never repeat a clarification', 'newest interviewer instruction', ...Object.values(context),
    ]) assert.ok(output.includes(value), value);
    assert.equal(output.includes('<human_spoken_answer_contract>'), false);
    assert.equal(output.includes('Start with the answer, not a windup.'), false);
    assert.equal(buildDeciderInstructions({}).includes('Interview notebook:'), false);
});

test('decider question drops constraints superseded by an interviewer correction', () => {
    assert.match(buildDeciderInstructions({}), /In question, the interviewer's latest correction replaces earlier conflicting constraints\. Drop the replaced constraint and never carry both\./);
});

test('answer variants retain the imported voice while trimmed omits scenario rules', () => {
    const context = Object.freeze({ profileContext: 'Has built a queue', modeName: 'My Google interview', modeTemplate: 'technical-interview', notebookText: 'Budget is fixed' });
    const full = buildAnswerInstructions(context, 'full');
    const trimmed = buildAnswerInstructions(context, 'trimmed');
    for (const [variant, output] of [['full', full], ['trimmed', trimmed]]) {
        assert.equal(output, buildAnswerInstructions({ ...context }, variant));
        assert.ok(output.includes(HUMAN_SPOKEN_ANSWER_CONTRACT.trim()));
        assert.ok(output.includes(SPOKEN_ANSWER_CONTRACT.trim()));
        assert.ok(output.includes('Start with the answer, not a windup.'));
        assert.equal(output.split('<human_spoken_answer_contract>').length, 2);
        for (const value of [NO_ACTION_SENTINEL, ASK_SENTINEL, 'stated assumption', 'newest interviewer instruction', context.profileContext, context.modeName, context.notebookText]) {
            assert.ok(output.includes(value), value);
        }
    }
    assert.ok(full.includes(UNIVERSAL_WHAT_TO_ANSWER_PROMPT.trim()));
    assert.ok(full.includes(MODE_TECHNICAL_INTERVIEW_PROMPT.trim()));
    assert.ok(SHARED_CODING_RULES.trim().length > 0);
    assert.ok(!trimmed.includes(SHARED_CODING_RULES.trim()));
    assert.ok(!trimmed.includes('DETECT INTENT AND RESPOND:'));
    assert.ok(!trimmed.includes('<decision_hierarchy>'));
    assert.ok(buildAnswerInstructions({}, 'full').includes(HUMAN_SPOKEN_ANSWER_CONTRACT.trim()));
    assert.ok(trimmed.length < full.length);
    // The mode NAME is a user label: it must not select the Technical Interview prompt.
    assert.ok(!buildAnswerInstructions({ modeName: 'Technical Interview' }, 'full').includes(MODE_TECHNICAL_INTERVIEW_PROMPT.trim()));
});

test('the exhaustive factory constructs each known provider and rejects unknown ids', () => {
    for (const id of ['gemini-live', 'gemini']) assert.equal(createLiveBrain(id, { apiKey: 'fake' }).id, 'gemini-live');
    assert.equal(createLiveBrain('pipeline', {}).id, 'pipeline');
    for (const id of ['openai-realtime', 'elevenlabs-realtime']) {
        assert.equal(createLiveBrain(id, { apiKey: 'fake' }).id, id);
    }
    assert.throws(() => createLiveBrain('future-brain', {}), { message: 'Unsupported live brain: future-brain' });
});

test('the fake records calls, emits scripted events and stops idempotently', async () => {
    const brain = new FakeLiveBrain();
    const events = [];
    const unsubscribe = brain.onEvent(event => events.push(event));
    const context = {
        sessionId: 'test',
        instructions: 'Test instructions',
        notebook: { topics: [], currentTopic: null, requirements: [], constraints: [], clarifications: [], decisions: [], answered: [], summary: '', updatedAt: 0 },
        recentTurns: [],
        signal: new AbortController().signal,
    };
    await brain.start(context);
    const samples = new Int16Array([1, -1]);
    brain.pushInterviewerAudio(samples, 16000);
    samples[0] = 0;
    brain.addCandidateText('A candidate turn', 10);
    brain.cancelResponse('interrupted');
    assert.deepEqual(brain.starts, [context]);
    assert.deepEqual(brain.audio, [{ pcm: new Int16Array([1, -1]), sampleRate: 16000 }]);
    assert.deepEqual(brain.candidateTurns, [{ text: 'A candidate turn', at: 10 }]);
    assert.deepEqual(brain.cancellations, ['interrupted']);

    const script = [
        { type: 'decision', decisionId: 'd1', action: 'ask', clarification: 'Which database?', at: 11 },
        { type: 'response_started', responseId: 'r1', at: 12 },
        { type: 'response_delta', responseId: 'r1', text: 'Answer' },
        { type: 'response_done', responseId: 'r1', status: 'completed' },
        { type: 'error', code: 'quota', fatal: true },
    ];
    for (const event of script) brain.emit(event);
    await brain.stop();
    await brain.stop();
    brain.emit(script[0]);
    assert.equal(brain.stopCalls, 1);
    assert.deepEqual(events, script);
    unsubscribe();
    await brain.start(context);
    brain.emit(script[0]);
    assert.deepEqual(events, script);
    await brain.stop();
    assert.equal(brain.stopCalls, 2);
});
