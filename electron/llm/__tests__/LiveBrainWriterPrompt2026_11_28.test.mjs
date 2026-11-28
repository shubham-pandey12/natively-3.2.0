// electron/llm/__tests__/LiveBrainWriterPrompt2026_11_28.test.mjs
//
// Deepgram Flux + AI provider answers sounded written, not spoken: the writer
// turn ran on the chat What-to-Answer persona with spoken rules tacked on the
// end. Live Brain writer turns now lead and close with a dedicated prompt.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const {
    buildLiveBrainWriterSystemPrompt,
    LIVE_BRAIN_WRITER_SYSTEM_PROMPT,
    LIVE_BRAIN_WRITER_CLOSING,
} = await import(pathToFileURL(path.resolve(__dirname, '../../../dist-electron/electron/llm/liveBrainWriterPrompt.js')).href);
const { SPOKEN_INTERVIEW_BACKGROUND } = await import(pathToFileURL(path.resolve(__dirname, '../../../dist-electron/electron/llm/answerStyle.js')).href);

test('writer prompt leads, keeps reference rules in the middle, and closes with the reminder', () => {
    const prompt = buildLiveBrainWriterSystemPrompt('REFERENCE GROUNDING RULES', true);
    assert.ok(prompt.startsWith(LIVE_BRAIN_WRITER_SYSTEM_PROMPT));
    assert.ok(prompt.endsWith(LIVE_BRAIN_WRITER_CLOSING));
    const ref = prompt.indexOf('REFERENCE GROUNDING RULES');
    assert.ok(ref > LIVE_BRAIN_WRITER_SYSTEM_PROMPT.length && ref < prompt.indexOf(LIVE_BRAIN_WRITER_CLOSING));
    assert.ok(prompt.includes(SPOKEN_INTERVIEW_BACKGROUND));
});

test('background rule follows the policy flag', () => {
    assert.ok(!buildLiveBrainWriterSystemPrompt('x', false).includes(SPOKEN_INTERVIEW_BACKGROUND));
});

test('writer prompt keeps the turn sentinels the engine parses', () => {
    assert.ok(LIVE_BRAIN_WRITER_SYSTEM_PROMPT.includes('output exactly [[NO_ACTION]]'));
    assert.ok(LIVE_BRAIN_WRITER_SYSTEM_PROMPT.includes('start the reply with Ask:'));
});

test('writer prompt covers every heavy question type', () => {
    for (const section of ['DSA / coding problem', 'Machine coding', 'System design', 'Debugging', 'SQL', 'Behavioral', 'Correctness first']) {
        assert.ok(LIVE_BRAIN_WRITER_SYSTEM_PROMPT.includes(section), section);
    }
});

test('WhatToAnswerLLM applies the writer prompt after the diagram contract, and engine flags Live Brain turns', () => {
    const wta = fs.readFileSync(path.resolve(__dirname, '../WhatToAnswerLLM.ts'), 'utf8');
    const diagram = wta.indexOf("_wtaSystemPrompt = withDiagramContract(_wtaSystemPrompt");
    const writer = wta.indexOf('_wtaSystemPrompt = buildLiveBrainWriterSystemPrompt(');
    assert.ok(diagram > 0 && writer > diagram);
    assert.match(wta, /requestSnapshot\?\.spokenInterview && !requestSnapshot\.liveBrainWriter/);
    const engine = fs.readFileSync(path.resolve(__dirname, '../../IntelligenceEngine.ts'), 'utf8');
    assert.match(engine, /options\?\.liveBrain \|\| options\?\.privateDraft \? \{ liveBrainWriter: true as const \}/);
});
