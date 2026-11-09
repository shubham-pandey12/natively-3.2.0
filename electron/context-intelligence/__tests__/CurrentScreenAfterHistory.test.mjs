import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildDirectWhatToSayPayload } from '../../../src/lib/directAssistWhatToSayPayload.mjs';
const require = createRequire(import.meta.url);
const { decide } = require('../../../dist-electron/electron/context-intelligence/orchestration/orchestrator.js');
const { composePrompt } = require('../../../dist-electron/electron/context-intelligence/generation/prompt-composer.js');
const { resolveModePolicy } = require('../../../dist-electron/electron/context-intelligence/policies/mode-policy-registry.js');
const { prepareDirectAssistPrompt, DIRECT_ASSIST_CURRENT_TURN_SPEECH_MARKER } = require('../../../dist-electron/electron/direct-assist/requestBuilder.js');
const { WhatToAnswerLLM, SCREEN_DIRECT_VISION_INSTRUCTION } = require('../../../dist-electron/electron/llm/WhatToAnswerLLM.js');
const question = 'What should I say about this?';
const oldSpeech = 'Explain tenant isolation using Redis';
const histories = ['', `User: ${oldSpeech}\nAssistant: Use Redis keys.`, 'User: What is an LSM tree?\nAssistant: It uses sorted runs.\nUser: Explain caching\nAssistant: Cache hot values.'];
const request = (modeId, text = question, screen = true) => ({requestId:'screen-regression',requestSequence:2,sessionId:'screen-regression',scope:{userId:'local'},surface:'what-to-answer',modeId,manualQuestion:text,hasScreenContext:screen,isFollowUp:true});
for (const mode of ['general','technical-interview']) {
  test(`${mode}: final screenshot provider prompt never redirects to old conversation`, async () => {
    for (const history of histories) {
      const decision = decide(request(mode));
      assert.equal(decision.isFollowUp, false);
      assert.ok(!decision.questionTypes.includes('FOLLOW_UP'));
      // Images travel outside textual evidence; an empty evidence block must be safe.
      const composed = composePrompt({decision,policy:resolveModePolicy(mode),evidence:[],conversationSummary:history,conversationHasContent:!!history});
      const calls = [];
      const helper = {getCapabilities:()=>({outputBudgetTokens:2000}),getPromptTier:()=> 'full',fitContextForCurrentModel:t=>t,async *streamChat(...args){calls.push(args);yield 'Current image answer';}};
      const modes = {getActiveModeSystemPromptSuffix:()=>'',buildRetrievedActiveModeContextBlockHybrid:async()=>'',buildRetrievedActiveModeContextBlock:()=>'',buildActiveModeContextBlock:()=>''};
      const answerer = new WhatToAnswerLLM(helper,modes);
      const snapshot = {activeModeInfo:null,modeId:mode,requestId:'screen-regression',surface:'what_to_answer',generationId:2,v3Prompt:composed};
      for await (const _ of answerer.generateStream(history,undefined,undefined,['new-question.png'],undefined,undefined,undefined,undefined,undefined,undefined,undefined,snapshot)) {}
      assert.equal(calls.length,1);
      assert.deepEqual(calls[0][1],['new-question.png']);
      const prompt = calls[0][0]+'\n'+calls[0][3];
      assert.ok(prompt.includes(SCREEN_DIRECT_VISION_INSTRUCTION));
      assert.match(prompt,/Answer the question or task in the current attachment/);
      assert.doesNotMatch(prompt,/This follow-up refers to the most recent topic/);
    }
  });
}
test('genuine follow-ups and explicit typed image questions retain their intent', () => {
  assert.ok(decide(request('general','shorter please')).questionTypes.includes('FOLLOW_UP'));
  assert.ok(decide(request('general',question,false)).questionTypes.includes('FOLLOW_UP'));
  assert.equal(decide(request('general','Explain the error in this image')).resolvedQuestion,'Explain the error in this image');
});
test('Direct screenshot prompts never promote rolling speech; audio still uses it', () => {
  for(const speech of ['',oldSpeech,'What is an LSM tree?  ·  '+oldSpeech]) {
    const payload=buildDirectWhatToSayPayload({interviewerRequest:speech,hasScreenshots:true});
    const prepared=prepareDirectAssistPrompt({requestId:'direct-screen',selection:{provider:'gemini',model:'gemini-3-flash'},imagePaths:['new-question.png'],...payload});
    assert.equal(payload.transcript,undefined);
    assert.doesNotMatch(prepared.userPrompt,/Explain tenant isolation/);
    assert.ok(!prepared.userPrompt.includes(DIRECT_ASSIST_CURRENT_TURN_SPEECH_MARKER));
    assert.match(prepared.userPrompt,/answer the question or task shown in it/);
    assert.deepEqual([...prepared.imagePaths],['new-question.png']);
  }
  const audio=buildDirectWhatToSayPayload({interviewerRequest:oldSpeech,hasScreenshots:false});
  assert.equal(audio.currentRequest,oldSpeech);
  assert.equal(audio.source,'stt');
});

const { resolveReference } = require('../../../dist-electron/electron/context-intelligence/question/conversation-state.js');
for (const caption of ['What should I say about this screenshot?', 'What should I say about this image?', 'How should I respond to this?', 'How can I answer this screen?']) {
  test(`current screen caption keeps its subject: ${caption}`, () => {
    const prior = {previousQuestion:oldSpeech,activeTopic:'Redis',activeEntities:['Redis'],turns:[]};
    const resolved = resolveReference(caption, prior, undefined, {hasScreenContext:true});
    assert.equal(resolved.resolved,caption);
    assert.equal(resolved.usedState,false);
    for (const mode of ['general','technical-interview','looking-for-work']) {
      // Description-only callers and image callers must agree on screen presence.
      for (const context of [{hasScreenContext:true},{hasScreenContext:undefined,screenText:'A new problem'}]) {
        const d = decide({...request(mode,caption),...context});
        assert.equal(d.isFollowUp,false);
        assert.ok(d.questionTypes.includes('SCREEN_SPECIFIC'));
        assert.ok(!d.questionTypes.includes('PERSONAL_EXPERIENCE'));
        assert.ok(d.claimRequirements.every(c=>!c.claimType.startsWith('USER_')));
      }
    }
  });
}
test('a screenshot does not erase explicit subjects or previous-answer refinements', () => {
  const state = {previousQuestion:oldSpeech,activeTopic:'Redis',activeEntities:['Redis'],turns:[]};
  const ownSubject = 'What should I say about salary expectations?';
  assert.equal(resolveReference(ownSubject,state,undefined,{hasScreenContext:true}).resolved,ownSubject);
  const refinement = resolveReference('shorter please',state,undefined,{hasScreenContext:true});
  assert.equal(refinement.usedState,true);
  assert.match(refinement.resolved,/Redis/);
});

test('manual attachment captions and explicit image questions cannot inherit a prior topic', () => {
  const prior = {previousQuestion:oldSpeech,activeTopic:'Redis',activeEntities:['Redis'],turns:[]};
  for (const caption of ['Analyze this screenshot', 'Answer this', 'Solve this screenshot', 'What is in this screenshot?', 'Explain the error in this image']) {
    assert.equal(resolveReference(caption,prior,undefined,{hasScreenContext:true}).resolved,caption);
    assert.equal(decide(request('general',caption)).isFollowUp,false);
  }
  const edit = 'Make the previous answer shorter using this image';
  assert.ok(decide(request('general',edit)).isFollowUp, 'explicit previous-answer intent must survive');
});


test('a newer spoken request reaches the provider with the capture as supporting evidence', async () => {
  const speech = 'How would you test the solution under high load?';
  const modeId = 'technical-interview';
  const imagePaths = ['earlier-problem.png'];
  const decision = decide(request(modeId, speech));
  const v3Prompt = composePrompt({ decision, policy: resolveModePolicy(modeId), evidence: [] });
  const calls = [];
  const helper = { getCapabilities: () => ({ outputBudgetTokens: 2000 }), getPromptTier: () => 'full',
    fitContextForCurrentModel: text => text, async *streamChat(...args) { calls.push(args); yield 'Use a load test'; } };
  const modes = { getActiveModeSystemPromptSuffix: () => '', buildRetrievedActiveModeContextBlockHybrid: async () => '',
    buildRetrievedActiveModeContextBlock: () => '', buildActiveModeContextBlock: () => '' };
  const answerer = new WhatToAnswerLLM(helper, modes);
  const snapshot = { activeModeInfo: null, modeId, requestId: 'speech-after-screen', surface: 'what_to_answer', generationId: 3, v3Prompt };
  for await (const _ of answerer.generateStream(speech, undefined, undefined, imagePaths, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined, snapshot, undefined, undefined, true)) {}
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], imagePaths);
  assert.match(calls[0][0], /current spoken interviewer request/);
  assert.ok(calls[0][0].includes(speech));
  assert.ok(!calls[0][0].includes(SCREEN_DIRECT_VISION_INSTRUCTION));

  const payload = buildDirectWhatToSayPayload({ interviewerRequest: speech, hasScreenshots: false });
  const direct = prepareDirectAssistPrompt({ requestId: 'direct-speech-after-screen', selection: { provider: 'gemini', model: 'gemini-3-flash' }, imagePaths, ...payload });
  assert.equal(payload.source, 'stt');
  assert.ok(direct.userPrompt.includes(speech));
  assert.deepEqual([...direct.imagePaths], imagePaths);
});
