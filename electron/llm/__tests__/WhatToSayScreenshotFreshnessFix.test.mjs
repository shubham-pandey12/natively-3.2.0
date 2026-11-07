import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

const { resolveReference } = await import(
  pathToFileURL(path.join(root, 'dist-electron/electron/context-intelligence/question/conversation-state.js')).href
);
const { SCREEN_DIRECT_VISION_INSTRUCTION } = await import(
  pathToFileURL(path.join(root, 'dist-electron/electron/llm/WhatToAnswerLLM.js')).href
);

describe('What to say screenshot freshness & referent anchoring', () => {
  const previousState = {
    previousQuestion: 'How do you handle traffic spikes across brands?',
    previousDecision: null,
    activeTopic: 'traffic spikes',
    activeEntities: ['Redis'],
    turns: [],
  };

  test('without screen context, "What should I say about this?" anchors to previous question (rephrase)', () => {
    const res = resolveReference('What should I say about this?', previousState, undefined, {
      hasScreenContext: false,
    });
    assert.equal(res.usedState, true);
    assert.equal(res.reason, 'REPHRASE_ANCHORED_TO_PREVIOUS_QUESTION');
    assert.match(res.resolved, /traffic spikes/);
  });

  test('WITH screen context, "What should I say about this?" does NOT anchor to previous question', () => {
    const res = resolveReference('What should I say about this?', previousState, undefined, {
      hasScreenContext: true,
    });
    assert.equal(res.usedState, false);
    assert.equal(res.reason, 'SCREEN_CONTEXT_IS_PRIMARY_SUBJECT');
    assert.equal(res.resolved, 'What should I say about this?');
    assert.doesNotMatch(res.resolved, /traffic spikes/);
  });

  test('WITH screen context, bare "What should I say?" does NOT anchor to previous question', () => {
    const res = resolveReference('What should I say?', previousState, undefined, {
      hasScreenContext: true,
    });
    assert.equal(res.usedState, false);
    assert.equal(res.reason, 'SCREEN_CONTEXT_IS_PRIMARY_SUBJECT');
    assert.equal(res.resolved, 'What should I say?');
    assert.doesNotMatch(res.resolved, /traffic spikes/);
  });

  test('SCREEN_DIRECT_VISION_INSTRUCTION is defined and instructs direct image analysis', () => {
    assert.match(SCREEN_DIRECT_VISION_INSTRUCTION, /The attached image is the current screen/);
    assert.match(SCREEN_DIRECT_VISION_INSTRUCTION, /Treat visible code, problem statements/);
  });
});


for (const question of ['shorter please', 'in simple words']) {
  test(`screen attachment preserves refinement: ${question}`, () => {
    const state = { previousQuestion: 'Explain database replication', activeTopic: 'replication', activeEntities: [], turns: [] };
    const result = resolveReference(question, state, undefined, { hasScreenContext: true });
    assert.equal(result.usedState, true);
    assert.match(result.resolved, /Explain database replication/);
  });
}
