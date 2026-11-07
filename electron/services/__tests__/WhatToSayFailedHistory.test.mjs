import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreenshotRetry } from '../../../src/lib/screenshotRetry.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { IntelligenceEngine } = require('../../../dist-electron/electron/IntelligenceEngine.js');
const { SessionTracker } = require('../../../dist-electron/electron/SessionTracker.js');
function fixture() {
  const session = new SessionTracker();
  const engine = new IntelligenceEngine({setNegotiationCoachingHandler() {}}, session);
  engine.on('error', () => {});
  const records = [];
  engine.recordLiveTurn = (...args) => records.push(args);
  return {engine,session,records};
}
for (const status of ['failed','cancelled',undefined]) {
  test(`a returned display string with ${status ?? 'unconfirmed'} outcome never becomes answered history`, async () => {
    const {engine,records} = fixture();
    engine.runWhatShouldISayInner = async (_q,_c,_images,options) => {
      options.turnOut.question = 'What should I say about this?';
      if (status) options.outcomeOut.value = {status,retryable:status==='failed',reason:'provider_timeout_no_answer'};
      return 'Displayed failure notice';
    };
    const outcomeOut = {};
    assert.equal(await engine.runWhatShouldISay('What should I say about this?',.8,['new.png'],{outcomeOut}),'Displayed failure notice');
    assert.equal(records.length,0);
    assert.notEqual(outcomeOut.value.status,'success');
  });
}
test('configuration failure carries a typed final outcome and enters neither session nor turn history', async () => {
  const {engine,session,records} = fixture();
  engine.whatToAnswerLLM = null;
  engine.answerLLM = null;
  const finals=[];
  engine.on('suggested_answer',(...args)=>finals.push(args));
  const outcomeOut={};
  const answer=await engine.runWhatShouldISay('What should I say about this?',.8,['new.png'],{forceFresh:true,skipCooldown:true,outcomeOut});
  assert.match(answer,/API Keys/);
  assert.deepEqual(outcomeOut.value,{status:'failed',retryable:false,reason:'configuration_required'});
  assert.deepEqual(finals[0][6],outcomeOut.value);
  assert.equal(session.getAssistantResponseHistory().length,0);
  assert.equal(records.length,0);
});
test('provider exceptions do not commit an answered turn', async () => {
  const {engine,session,records} = fixture();
  engine.whatToAnswerLLM={async *generateStream(){throw Object.assign(new Error('Rate limit exceeded'),{status:429});}};
  const outcomeOut={};
  await engine.runWhatShouldISay('What is a mutex?',.8,undefined,{forceFresh:true,skipCooldown:true,outcomeOut});
  assert.equal(outcomeOut.value.status,'failed');
  assert.equal(session.getAssistantResponseHistory().length,0);
  assert.equal(records.length,0);
});
test('legacy provider success retains session and turn recording', async () => {
  const {engine,session,records} = fixture();
  engine.whatToAnswerLLM=null;
  engine.answerLLM={async generate(){return 'The screenshot shows a lock ordering violation.';}};
  const outcomeOut={};
  await engine.runWhatShouldISay('What should I say about this?',.8,['new.png'],{forceFresh:true,skipCooldown:true,outcomeOut});
  assert.deepEqual(outcomeOut.value,{status:'success',retryable:false});
  assert.equal(session.getAssistantResponseHistory().length,1);
  assert.equal(records.length,1);
});
test('the actual no-token screenshot deadline reports failure without poisoning either history', async (t) => {
  const {engine,session,records} = fixture();
  session.addTranscript({ speaker: 'interviewer', text: 'What is deadlock?', timestamp: Date.now(), final: true });
  const retries = createScreenshotRetry();
  const attempt = retries.begin({ audioRevision: 1, question: 'What should I say about this?', attachments: [{ path: 'new.png' }] });
  const realTimeout = globalThis.setTimeout;
  // Accelerate only production deadline timers; no network/provider runs here.
  t.mock.method(globalThis,'setTimeout',(callback,ms,...args)=>realTimeout(callback,ms>=8000 ? 5 : ms,...args));
  engine.whatToAnswerLLM={async *generateStream(){await new Promise(()=>{});}};
  const outcomeOut={};
  const finals=[];
  engine.on('suggested_answer',(...args)=>finals.push(args));
  const answer=await engine.runWhatShouldISay('What should I say about this?',.8,['new.png'],{forceFresh:true,skipCooldown:true,outcomeOut});
  assert.match(answer,/did not produce an answer in time/);
  assert.equal(outcomeOut.value.status,'failed');
  assert.equal(outcomeOut.value.retryable,true);
  assert.equal(outcomeOut.value.reason,'provider_error_no_answer');
  assert.deepEqual(finals.at(-1)[6],outcomeOut.value);
  assert.equal(session.getAssistantResponseHistory().length,0);
  assert.equal(records.length,0);

  retries.settle(attempt.id, outcomeOut.value.status);
  const retry = retries.pending(1).snapshot;
  const calls = [];
  engine.whatToAnswerLLM = {
    async *generateStream(_transcript, _temporal, _intent, images, ...rest) {
      calls.push({ images, question: rest[5]?.question });
      yield 'The current screenshot shows a binary tree with three levels.';
    },
  };
  const retryOutcome = {};
  const retryAnswer = await engine.runWhatShouldISay(retry.question, .8, retry.attachments.map(shot => shot.path),
    { forceFresh: true, skipCooldown: true, outcomeOut: retryOutcome });
  assert.match(retryAnswer, /binary tree/);
  assert.equal(retryOutcome.value.status, 'success');
  assert.deepEqual(calls, [{ images: ['new.png'], question: retry.question }]);
  assert.equal(records.length, 1);
});
