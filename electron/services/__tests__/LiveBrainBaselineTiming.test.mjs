import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { IntelligenceEngine } = require('../../../dist-electron/electron/IntelligenceEngine.js');
const { clearPromptDebugState, getPromptDebugState } = require('../../../dist-electron/electron/llm/promptDebug.js');

test('the dev auto-answer timing records only the first visible text of the armed generation', async (t) => {
    const original = process.env.NATIVELY_PROMPT_DEBUG;
    const originalFile = process.env.NATIVELY_PROMPT_DEBUG_FILE;
    t.after(() => {
        if (original === undefined) delete process.env.NATIVELY_PROMPT_DEBUG;
        else process.env.NATIVELY_PROMPT_DEBUG = original;
        if (originalFile === undefined) delete process.env.NATIVELY_PROMPT_DEBUG_FILE;
        else process.env.NATIVELY_PROMPT_DEBUG_FILE = originalFile;
        clearPromptDebugState();
    });
    delete process.env.NATIVELY_PROMPT_DEBUG_FILE;
    t.mock.timers.enable({ apis: ['Date'], now: 1_000 });
    clearPromptDebugState();
    const engine = Object.create(IntelligenceEngine.prototype);
    engine.currentGenerationId = 7;

    delete process.env.NATIVELY_PROMPT_DEBUG;
    engine.armSpeechStopTiming(7, 800);
    engine.noteFirstVisibleText(7, 'First answer', 'stream');
    assert.deepEqual(getPromptDebugState().answerTimings, []);

    process.env.NATIVELY_PROMPT_DEBUG = '1';
    engine.armSpeechStopTiming(7, 800);
    engine.noteFirstVisibleText(6, 'Superseded answer', 'stream');
    engine.noteFirstVisibleText(7, ' ', 'stream');
    engine.noteFirstVisibleText(7, 'First answer', 'stream');
    engine.noteFirstVisibleText(7, 'Final answer', 'final');
    assert.deepEqual(getPromptDebugState().answerTimings, [{
        generationId: 7,
        speechStoppedAt: 800,
        firstVisibleTextAt: 1_000,
        speechStopToFirstVisibleTextMs: 200,
        via: 'stream',
    }]);
    await new Promise(resolve => setImmediate(resolve));
});
