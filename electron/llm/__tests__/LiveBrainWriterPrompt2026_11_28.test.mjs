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
    LIVE_BRAIN_WRITER_REFERENCE_HEADING,
    LIVE_BRAIN_WRITER_CLOSING,
} = await import(pathToFileURL(path.resolve(__dirname, '../../../dist-electron/electron/llm/liveBrainWriterPrompt.js')).href);
const { SPOKEN_INTERVIEW_BACKGROUND } = await import(pathToFileURL(path.resolve(__dirname, '../../../dist-electron/electron/llm/answerStyle.js')).href);
const {
    isExplicitDesignOrDiagramRequest,
    resolveDiagramTurn,
    SYSTEM_DESIGN_ACTION_INSTRUCTION,
} = await import(pathToFileURL(path.resolve(__dirname, '../../../dist-electron/electron/llm/diagramPromptSignals.js')).href);
const { planAnswer, formatAnswerPlanForPrompt } = await import(pathToFileURL(path.resolve(__dirname, '../../../dist-electron/electron/llm/AnswerPlanner.js')).href);

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
    assert.match(engine, /liveBrainWriter:\s*Boolean\(options\?\.liveBrain \|\| options\?\.privateDraft\)/);
});

test('writer prompt includes tightened spoken rules and reference heading boundary', () => {
    for (const phrase of [
        'Simple words:',
        "Talk, don't document:",
        'No fixed closing line:',
        'Assumption opener:',
        'No repetition:',
        'Link back when it fits:',
        'Production / failure scenarios',
        'applies ONLY to explicit "design X" requests',
        'American English spelling',
        'no paragraph breaks unless the answer is longer than 6 sentences',
    ]) {
        assert.ok(LIVE_BRAIN_WRITER_SYSTEM_PROMPT.includes(phrase), phrase);
    }
    assert.ok(LIVE_BRAIN_WRITER_REFERENCE_HEADING.includes('never decide length, structure, closing lines or whether to use a system-design format'));
});

test('isExplicitDesignOrDiagramRequest distinguishes explicit design/draw asks from production scenarios', () => {
    for (const q of [
        'Design a URL shortener',
        'Can you draw the architecture?',
        'How would you design a rate limiter for an API?',
        'Sketch the components',
        'Design Twitter',
        "Let's design WhatsApp.",
        'How would you build a chat system for a million users?',
        'Okay. Can you design Instagram stories?',
    ]) {
        assert.equal(isExplicitDesignOrDiagramRequest(q), true, `expected true for: ${q}`);
    }

    for (const q of [
        'Imagine your Redis server goes down during peak traffic. What happens?',
        'Suppose your rate limiter in Redis fails open. How do you handle that?',
        'If the cache becomes empty after deploy, what happens to the database?',
        'Page load is five seconds. What do you check first?',
        'If you see slow SQL queries after traffic returns, what is your first debugging step?',
        'What design patterns did you use in that project?',
        'Describe a tough choice between speed and quality.',
        'Why did you make that design decision?',
    ]) {
        assert.equal(isExplicitDesignOrDiagramRequest(q), false, `expected false for: ${q}`);
    }
});

test('Live Brain writer turns gate out diagrams on scenario questions without regressing non-Live-Brain turns', () => {
    const scenario = 'Imagine your Redis server goes down completely during peak traffic. What happens to your API requests, and how do you keep Postgres safe?';
    const liveScenario = resolveDiagramTurn({
        question: scenario,
        answerType: 'system_design_answer',
        activeDesign: null,
        featureEnabled: true,
        liveBrainWriter: true,
    });
    assert.equal(liveScenario.request.enabled, false);
    assert.equal(liveScenario.signals, null);
    assert.equal(liveScenario.turnBlock, '');

    const nonLiveScenario = resolveDiagramTurn({
        question: scenario,
        answerType: 'system_design_answer',
        activeDesign: null,
        featureEnabled: true,
    });
    assert.equal(nonLiveScenario.request.enabled, true);
    assert.ok(nonLiveScenario.signals);

    const liveExplicit = resolveDiagramTurn({
        question: 'Design a URL shortener',
        answerType: 'system_design_answer',
        activeDesign: null,
        featureEnabled: true,
        liveBrainWriter: true,
    });
    assert.equal(liveExplicit.request.enabled, true);
    assert.ok(liveExplicit.signals);

    const liveActionCard = resolveDiagramTurn({
        question: scenario,
        answerType: 'system_design_answer',
        activeDesign: null,
        actionInstruction: SYSTEM_DESIGN_ACTION_INSTRUCTION,
        forceDesign: true,
        featureEnabled: true,
        liveBrainWriter: true,
    });
    assert.equal(liveActionCard.request.enabled, true);
});

test('formatAnswerPlanForPrompt drops system-design template on gated Live Brain scenario turns', () => {
    const plan = { ...planAnswer('Imagine Redis goes down'), answerType: 'system_design_answer' };
    const gated = formatAnswerPlanForPrompt(plan, false, undefined, true);
    assert.doesNotMatch(gated, /Clarify Requirements:|Follow the diagram contract in the system prompt/);
    const normal = formatAnswerPlanForPrompt(plan, false);
    assert.match(normal, /Clarify Requirements:|Follow the diagram contract in the system prompt/);
});
