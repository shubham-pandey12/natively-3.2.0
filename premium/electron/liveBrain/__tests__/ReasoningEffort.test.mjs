import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Stub electron for Node test runner when loading main-process modules.
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
        return {
            app: { isPackaged: false, getPath: () => process.cwd() },
            safeStorage: { isEncryptionAvailable: () => false },
        };
    }
    return origLoad.call(this, request, parent, isMain);
};

let AnswerWriter;
let buildThinkingConfig;
let getSupportedLiveBrainReasoningEfforts;
let resolveEffectiveLiveBrainReasoningEffort;
try {
    ({ AnswerWriter } = require('../../../../dist-electron/premium/electron/liveBrain/AnswerWriter.js'));
    ({ buildThinkingConfig } = require('../../../../dist-electron/electron/LLMHelper.js'));
    ({
        getSupportedLiveBrainReasoningEfforts,
        resolveEffectiveLiveBrainReasoningEffort,
    } = require('../../../../dist-electron/electron/services/liveBrainSettings.js'));
} finally {
    Module._load = origLoad;
}

test('reasoning effort capability matrix matches provider and model support', () => {
    assert.deepEqual(
        getSupportedLiveBrainReasoningEfforts({ provider: 'gemini-live', model: 'gemini-3.1-flash-live-preview' }),
        ['minimal', 'low', 'medium', 'high'],
    );
    assert.deepEqual(
        getSupportedLiveBrainReasoningEfforts({ provider: 'gemini-live', model: 'gemini-3.8-live-extended-thinking' }),
        ['low', 'medium', 'high'],
    );
    assert.deepEqual(
        getSupportedLiveBrainReasoningEfforts({ provider: 'gemini-live', model: 'gemini-3.8-live' }),
        [],
    );
    assert.deepEqual(
        getSupportedLiveBrainReasoningEfforts({ provider: 'openai-realtime', model: 'gpt-realtime-2.1' }),
        ['minimal', 'low', 'medium', 'high', 'xhigh'],
    );
    assert.deepEqual(
        getSupportedLiveBrainReasoningEfforts({ provider: 'elevenlabs-realtime', model: 'eleven_realtime_v1_mini' }),
        [],
    );
    assert.deepEqual(
        getSupportedLiveBrainReasoningEfforts({ provider: 'amazon-sonic', model: 'amazon.nova-2-5-sonic' }),
        [],
    );
    assert.deepEqual(
        getSupportedLiveBrainReasoningEfforts({ provider: 'deepgram-flux', fluxAiProvider: 'openai', fluxAiModel: 'gpt-5.4' }),
        ['none', 'low', 'medium', 'high', 'xhigh'],
    );
    assert.deepEqual(
        getSupportedLiveBrainReasoningEfforts({ provider: 'deepgram-flux', fluxAiProvider: 'openai', fluxAiModel: 'gpt-4o-mini' }),
        [],
    );
    assert.equal(resolveEffectiveLiveBrainReasoningEffort('xhigh', ['low', 'medium', 'high']), 'default');
    assert.equal(resolveEffectiveLiveBrainReasoningEffort('medium', ['low', 'medium', 'high']), 'medium');
});

test('buildThinkingConfig preserves defaults when reasoningEffort is omitted and honors explicit overrides', () => {
    assert.deepEqual(buildThinkingConfig('gemini-3.8-flash', 0), { thinkingLevel: 'LOW' });
    assert.deepEqual(buildThinkingConfig('gemini-3.6-flash', 0), { thinkingLevel: 'MINIMAL' });
    assert.deepEqual(buildThinkingConfig('gemini-3.8-flash', 0, 'high'), { thinkingLevel: 'HIGH' });
    assert.deepEqual(buildThinkingConfig('gemini-3.8-flash', 0, 'minimal'), { thinkingLevel: 'LOW' });
    assert.deepEqual(buildThinkingConfig('gemini-2.5-flash', 0, 'medium'), { thinkingBudget: 4096 });
});

test('AnswerWriter discards private draft when reasoningEffort changes routeKey before confirmation', async () => {
    let activeEffort = 'low';
    const draftEvents = [];
    const draftRequests = [];
    const confirmedRequests = [];
    let cancelledReason = null;

    const engine = {
        getLiveBrainAiRouteKey: () => `openai:gpt-5.4:effort=${activeEffort}`,
        startLiveBrainDraft: (request) => {
            draftRequests.push(request);
            const routeKey = `openai:gpt-5.4:effort=${activeEffort}`;
            return {
                draftId: 1,
                sessionId: request.sessionId,
                turnKey: request.turnKey,
                question: request.question,
                routeKey,
                canAdopt: () => engine.getLiveBrainAiRouteKey() === routeKey,
                cancel: (reason) => { cancelledReason = reason; },
                adopt: () => { throw new Error('Should not adopt draft after effort change'); },
            };
        },
        runLiveBrainAnswer: (request) => {
            confirmedRequests.push(request);
            return {
                generationId: 42,
                done: Promise.resolve({ status: 'completed' }),
            };
        },
    };

    const writer = new AnswerWriter(engine, {
        sessionId: 'sess-1',
        onDraftEvent: (event) => draftEvents.push(event),
    });

    const started = writer.prepareDraft({
        turnKey: 'sess-1:c1:t1',
        question: 'How does Raft elect a leader?',
        reasoningEffort: 'low',
    });
    assert.equal(started, true);
    assert.equal(draftRequests[0].reasoningEffort, 'low');

    // User changes reasoning effort before EndOfTurn confirms
    activeEffort = 'high';
    const result = writer.write({
        question: 'How does Raft elect a leader?',
        turnKey: 'sess-1:c1:t1',
        replacesAutomaticAnswer: false,
        reasoningEffort: 'high',
    });
    const status = await result.done;
    assert.equal(status, 'completed');
    assert.equal(cancelledReason, 'route_changed');
    assert.equal(confirmedRequests.length, 1);
    assert.equal(confirmedRequests[0].reasoningEffort, 'high');
    assert.ok(draftEvents.some(e => e.action === 'discarded' && e.reason === 'route_changed'));
});
