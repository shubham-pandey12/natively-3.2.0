import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadIntelligenceEngine() {
  const enginePath = path.resolve(__dirname, '../../../dist-electron/electron/IntelligenceEngine.js');
  return import(pathToFileURL(enginePath).href);
}

async function loadSessionTracker() {
  const sessionPath = path.resolve(__dirname, '../../../dist-electron/electron/SessionTracker.js');
  return import(pathToFileURL(sessionPath).href);
}

class StubLLMHelper {
  getActiveModel() { return { provider: 'gemini', model: 'gemini-2.0-flash' }; }
  isStreamingSupported() { return true; }
  setNegotiationCoachingHandler(_fn) { }
  getGeminiClient() { return null; }
  getOpenAIClient() { return null; }
  getClaudeClient() { return null; }
  getGroqClient() { return null; }
  getOllamaClient() { return null; }
  getModesManager() { return { getActiveMode: () => null, getActiveModeSystemPromptSuffix: () => '' }; }
  getSettingsManager() { return { get: () => null, set: () => {} }; }
}

async function makeEngine() {
  const { IntelligenceEngine } = await loadIntelligenceEngine();
  const { SessionTracker } = await loadSessionTracker();
  const session = new SessionTracker();
  const engine = new IntelligenceEngine(new StubLLMHelper(), session);
  return { engine, session, IntelligenceEngine };
}

describe('What-to-Say & Cmd+Y Intermittent Bugs Forensic Integration', () => {

  test('Bug 1 Fix: Screenshot-only request does not fall back to old audio question and includes vision instruction', async () => {
    const { engine, session, IntelligenceEngine } = await makeEngine();
    const calls = [];
    const recordedTurns = [];

    // Simulate old audio question in the transcript
    session.addTranscript({
      speaker: 'interviewer',
      final: true,
      text: 'How do you handle traffic spikes on one brand without affecting others?',
      timestamp: Date.now() - 30000,
    });

    engine.whatToAnswerLLM = {
      async *generateStream(cleanedTranscript, temporalContext, intentResult, receivedImagePaths, receivedScreenContext, promptInstruction, ...rest) {
        const snapshot = rest[2]; // WhatToAnswerRequestSnapshot
        calls.push({
          receivedImagePaths,
          receivedScreenContext,
          promptInstruction,
          question: snapshot?.contextOsGeneration?.turnPlan?.question || rest[3]?.question,
          snapshot,
        });
        yield 'Tenant isolation via Redis keys and rate limiting.';
      }
    };

    engine.recordLiveTurn = (...args) => {
      recordedTurns.push({
        answer: args[0],
        screenContext: args[1],
        question: args[2],
        imageCount: args[3],
        imagePaths: args[4],
        from: args[5],
      });
    };

    // User submits a screenshot with "What should I say about this?"
    const answer = await engine.runWhatShouldISay(
      'What should I say about this?',
      0.8,
      ['/tmp/new_coding_problem.png'],
      { forceFresh: true, skipCooldown: true, screenFromImage: true },
    );

    assert.equal(calls.length, 1);
    // 1. The question that reached WhatToAnswerLLM must NOT be the old traffic spikes question
    assert.equal(calls[0].question, 'What should I say about this?');
    assert.deepEqual(calls[0].receivedImagePaths, ['/tmp/new_coding_problem.png']);

    // 2. The recorded turn must be attributed to user and marked with SCREENSHOT_TURN_QUESTION
    assert.equal(recordedTurns.length, 1);
    assert.equal(recordedTurns[0].question, 'What should I say about this?');
    assert.equal(recordedTurns[0].from, 'user');
    assert.deepEqual(recordedTurns[0].imagePaths, ['/tmp/new_coding_problem.png']);
  });

  test('Bug 2 Fix: Cmd+Y page capture lifecycle clears and does not re-send DOM on subsequent audio turns', async () => {
    const { engine, session } = await makeEngine();
    const calls = [];

    session.addTranscript({
      speaker: 'interviewer',
      final: true,
      text: 'Explain this design document.',
      timestamp: Date.now() - 10000,
    });

    engine.whatToAnswerLLM = {
      async *generateStream(cleanedTranscript, temporalContext, intentResult, receivedImagePaths, receivedScreenContext, promptInstruction, ...rest) {
        calls.push({
          domContext: rest[1]?.domContext || rest[2]?.domContext,
          question: rest[3]?.question,
        });
        yield 'This design doc explains distributed consensus.';
      }
    };

    // Turn 1: Page context is captured via Cmd+Y
    await engine.runWhatShouldISay(
      'What should I say about this?',
      0.8,
      undefined,
      { domContext: '<html>Design Doc Content</html>', forceFresh: true, skipCooldown: true },
    );
    assert.equal(calls.length, 1);

    // Turn 2: New spoken question arrives; page context was cleared in renderer (domContext: undefined)
    session.addTranscript({
      speaker: 'interviewer',
      text: 'What is database replication?',
      timestamp: Date.now() - 1000,
      final: true,
    });

    const calls2 = [];
    engine.whatToAnswerLLM = {
      async *generateStream(cleanedTranscript, temporalContext, intentResult, receivedImagePaths, receivedScreenContext, promptInstruction, ...rest) {
        calls2.push({
          question: rest[3]?.question,
          imagePaths: receivedImagePaths,
        });
        yield 'Replication is copying data to replicas.';
      }
    };

    await engine.runWhatShouldISay(
      undefined,
      0.8,
      undefined,
      { forceFresh: true, skipCooldown: true }, // domContext is now undefined!
    );

    assert.equal(calls2.length, 1);
    assert.equal(calls2[0].question, 'What is database replication?');
    assert.equal(calls2[0].imagePaths, undefined);
  });

  test('Scenario 5: Dynamic prompt instruction preserves spoken question without screenshots', async () => {
    const { engine, session } = await makeEngine();
    const calls = [];

    session.addTranscript({
      speaker: 'interviewer',
      text: 'Why do you want to work at our company?',
      timestamp: Date.now() - 2000,
      final: true,
    });

    engine.whatToAnswerLLM = {
      async *generateStream(cleanedTranscript, temporalContext, intentResult, receivedImagePaths, receivedScreenContext, promptInstruction, ...rest) {
        calls.push({
          promptInstruction,
          question: rest[3]?.question,
        });
        yield 'I admire your mission and scale.';
      }
    };

    await engine.runWhatShouldISay(
      undefined,
      0.8,
      undefined,
      { promptInstruction: 'sound_smart', forceFresh: true, skipCooldown: true },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].promptInstruction, 'sound_smart');
    assert.equal(calls[0].question, 'Why do you want to work at our company?');
  });

  test('Scenario 1: Pure audio switches from Question A to Question B', async () => {
    const { engine, session } = await makeEngine();
    const calls = [];

    session.addTranscript({
      speaker: 'interviewer',
      text: 'What is a B-Tree?',
      timestamp: Date.now() - 5000,
      final: true,
    });
    session.addTranscript({
      speaker: 'interviewer',
      text: 'What is an LSM Tree?',
      timestamp: Date.now() - 500,
      final: true,
    });

    engine.whatToAnswerLLM = {
      async *generateStream(cleanedTranscript, temporalContext, intentResult, receivedImagePaths, receivedScreenContext, promptInstruction, ...rest) {
        calls.push({ question: rest[3]?.question });
        yield 'An LSM Tree optimizes for write-heavy workloads.';
      }
    };

    await engine.runWhatShouldISay(undefined, 0.8, undefined, { forceFresh: true, skipCooldown: true });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].question, 'What is an LSM Tree?');
  });
});
