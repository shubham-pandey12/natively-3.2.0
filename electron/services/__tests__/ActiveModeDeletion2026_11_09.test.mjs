import {test} from 'node:test';
import assert from 'node:assert/strict';
import {callCallback,evaluate,findNode,ts,read} from './liveInterviewTestUtils.mjs';
function deletion(active=true){
 const calls=[];const mode={id:'custom',name:'Interview',templateType:'technical-interview'};
 const mgr={getModes:()=>[mode],getActiveMode:()=>active?mode:null,deleteMode(){calls.push('delete')},setActiveMode(){calls.push('set-active')}};
 const manager={supersedeLiveAnswers(){calls.push('supersede')},clearSessionContext(){calls.push('clear')},clearDynamicActionContext(){calls.push('clear-dynamic')},clearWtaDiversityHistory(){}};
 const abortAndInvalidateChatStreams=registry=>{calls.push('invalidate-chat');registry.clear()};
 const require=(name)=>{if(name.endsWith('ModesManager'))return {ModesManager:{getInstance:()=>mgr}};if(name.endsWith('chatStreamRegistry'))return {abortAndInvalidateChatStreams};if(name.includes('conversation-state-store'))return {clearConversationState(){calls.push('clear-conversation')}};throw new Error('Unmocked production dependency '+name)};
 const globals={require,isProOrTrialActive:()=>true,appState:{getIntelligenceManager:()=>manager,applyAutoAnswerThresholds(value){calls.push('threshold:'+value)}},BrowserWindow:{getAllWindows:()=>[{isDestroyed:()=>false,webContents:{send:()=>calls.push('broadcast')}}]},_chatStreamsBySender:new Map(),_phoneChatStreamController:{cancel(){calls.push('cancel-phone')}},_manualConversationMemory:{clearAllSessions(){calls.push('clear-manual')}},_manualCodingState:{clearAllSessions(){calls.push('clear-coding')}}};
 const handler=evaluate('('+callCallback('electron/ipcHandlers.ts','safeHandle','modes:delete')+')',globals);
 return {calls,run:()=>handler({},'custom')};
}
test('deleting the active mode supersedes live answers and clears context before clearing the badge',async()=>{const s=deletion();const out=await s.run();assert.equal(out.success,true);assert.ok(s.calls.includes('supersede'));assert.ok(s.calls.includes('clear'));for(const step of ['invalidate-chat','cancel-phone','clear-dynamic','clear-manual','clear-coding','clear-conversation','threshold:null'])assert.ok(s.calls.includes(step),step);assert.ok(s.calls.indexOf('supersede')<s.calls.indexOf('broadcast'));assert.ok(s.calls.indexOf('clear')<s.calls.indexOf('broadcast'))});
test('deleting an inactive mode leaves current live answer/context alone',async()=>{const s=deletion(false);assert.equal((await s.run()).success,true);assert.ok(!s.calls.includes('supersede'));assert.ok(!s.calls.includes('clear'))});
function supersessionGuard(mode,active){
 const declaration=findNode('electron/IntelligenceEngine.ts',n=>ts.isVariableDeclaration(n)&&n.name.getText()==='isWtaSuperseded');
 const token={};
 const cb=evaluate('('+declaration.initializer.getText()+')',{whatToAnswerCancellationToken:token,generationId:7,snapshotModeInfo:mode,snapshotModeId:mode?.id,answerModeId:mode?.id,
 currentGenerationId:7,whatToAnswerCancellationToken:token,getActiveModeInfo:()=>active,
 require:()=>({ModesManager:{getInstance:()=>({getModes:()=>active?[active]:[],getActiveModeInfo:()=>active,getActiveMode:()=>active})}})});
 return cb();
}
test('WTA guard rejects a deleted snapshotted mode even with current generation/controller',()=>{assert.equal(supersessionGuard({id:'deleted'},null),true)});
test('WTA guard permits an answer whose mode still exists and is active',()=>{assert.equal(supersessionGuard({id:'active'},{id:'active'}),false)});
test('WTA guard permits an ordinary answer started without an active mode',()=>{assert.equal(supersessionGuard(null,null),false)});

test('WTA revalidates ownership after code cleanup before flushing tokens and committing the answer',async()=>{
 const source=read('electron/IntelligenceEngine.ts');
 const start=source.indexOf('const rawAnswerForVerify = fullAnswer;');
 const end=source.indexOf('// Token-emit reconciliation',start);
 assert.ok(start>=0&&end>start);
 const fn=evaluate('(async()=>{'+source.slice(start,end)+';return "would-emit";})',{
  fullAnswer:'fixture answer',isCoding:false,isWtaSuperseded:()=>true,
  recordWtaCancellation(){},openedStreamRow:false,generationId:7,
 });
 assert.equal(await fn(),null,'an answer retired during an awaited post-processing step must never reach token/final commits');
});
