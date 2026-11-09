import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, findNode, callCallback, evaluate, ts, deferred, tick } from './liveInterviewTestUtils.mjs';
function terminalHost(active=true,generation=7) {
 const controller=findNode('electron/main.ts',n=>ts.isNewExpression(n)&&n.expression.getText()==='SimpleAutoAnswerEngine');
 const terminal=controller.arguments[0].properties.find(n=>n.name?.getText()==='terminal');
 assert.ok(terminal,'production host must wire terminal missed-question notices');
 const sent=[];
 const fn=evaluate('('+terminal.initializer.getText()+')',{
  isMeetingActive:active,_meetingGeneration:generation,
  windowHelper:{getOverlayWindow:()=>({})},getWindowHelper:()=>({getOverlayWindow:()=>({})}),
  sendToWindow(_w,channel,payload){sent.push({channel,payload})}
 });
 return {sent,fn};
}
test('terminal failures reach the current meeting overlay only',()=>{
 const host=terminalHost();host.fn({questionId:'q',text:'fixture',reason:'stale',meetingGeneration:7});
 assert.equal(host.sent.length,1);assert.equal(host.sent[0].channel,'auto-answer-missed');assert.equal(host.sent[0].payload.questionId,'q');
 host.fn({questionId:'overflow',text:'fixture',reason:'superseded',meetingGeneration:7});assert.equal(host.sent.length,2,'queue overflow remains visible; mode resets suppress the host callback upstream');
 host.fn({questionId:'failed',text:'fixture',reason:'dispatch_failed',meetingGeneration:7});
 assert.equal(host.sent[2]?.payload.reason,'dispatch_failed');
 for(const [active,generation,reason] of [[false,7,'stale'],[true,8,'judge_failed'],[true,7,'meeting_ended']]){
  const old=terminalHost(active,generation);old.fn({questionId:'q',text:'fixture',reason,meetingGeneration:7});assert.equal(old.sent.length,0);
 }
});
test('preload missed-notice subscription has a matching unsubscribe and declared API',()=>{
 const s=read('electron/preload.ts');const start=s.indexOf('onAutoAnswerMissed:');assert.ok(start>=0);const implementation=s.slice(s.lastIndexOf('onAutoAnswerMissed:'),s.lastIndexOf('onAutoAnswerMissed:')+800);assert.match(implementation,/ipcRenderer\.on\(['"]auto-answer-missed['"]/);assert.match(implementation,/ipcRenderer\.removeListener\(['"]auto-answer-missed['"]/);assert.match(read('src/types/electron.d.ts'),/onAutoAnswerMissed/);
});
function retryHarness(response,delayed=false){
 const declaration=findNode('src/components/NativelyInterface.tsx',n=>ts.isVariableDeclaration(n)&&n.name.getText()==='retryMissedQuestion');
 const expression=ts.isCallExpression(declaration.initializer)?declaration.initializer.arguments[0]:declaration.initializer;
 let notices=[{questionId:'q',text:'fixture',meetingGeneration:7,reason:'stale'}];let retrying=null;
 const epoch={current:1};const gate=deferred();const calls=[];
 const fn=evaluate('('+expression.getText()+')',{
  missedNoticeEpochRef:epoch,missedQuestions:notices,retryingMissedQuestionId:null,
  setMissedQuestions(update){notices=typeof update==='function'?update(notices):update},
  setRetryingMissedQuestionId(value){retrying=value},
  window:{electronAPI:{generateWhatToSay:async(...args)=>{calls.push(args);return delayed?gate.promise:response}}},
 });
 return {fn,notice:notices[0],calls,epoch,gate,get notices(){return notices},get retrying(){return retrying}};
}
test('Generate manually answers the stored question and removes only its successful notice',async()=>{
 const h=retryHarness({success:true,answer:'fixture answer'});await h.fn(h.notice);assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],h.notice.text);assert.equal(h.notices.length,0);
});
test('failed or empty manual retry preserves the notice and exposes an error',async()=>{
 for(const result of [{success:false,error:'fixture failure'},{success:true,answer:null}]){const h=retryHarness(result);await h.fn(h.notice);assert.equal(h.notices.length,1);assert.ok(h.notices[0].error)}
});
test('a retry finishing after a meeting/mode boundary cannot restore or edit notices',async()=>{
 const h=retryHarness(null,true);const pending=h.fn(h.notice);await tick();h.epoch.current++;h.gate.resolve({success:false,error:'fixture failure'});await pending;assert.equal(h.notices.length,1);assert.equal(h.notices[0].error,undefined);
});
test('session and mode boundaries clear notices and invalidate in-flight retries',()=>{
 for(const method of ['onSessionReset','onModeChanged']){const callback=callCallback('src/components/NativelyInterface.tsx',method);assert.match(callback,/setMissedQuestions\(\[\]\)/);assert.match(callback,/missedNoticeEpochRef\.current\+\+/)}
});
test('the overlay renders the required notice with a manual Generate action',()=>{
 const banner=findNode('src/components/NativelyInterface.tsx',n=>(ts.isJsxElement(n)||ts.isJsxSelfClosingElement(n))&&(ts.isJsxElement(n)?n.openingElement.tagName:n.tagName).getText()==='OverlayBanner'&&n.getText().includes('Missed a question — tap to generate'));
 assert.match(banner.getText(),/OverlayBannerButton/);assert.match(banner.getText(),/retryMissedQuestion/);assert.match(banner.getText(),/Generate/);
});

test('synthetic live notice trigger is opt-in and disabled in packaged applications',async()=>{
 const sourceNode=findNode('electron/ipcHandlers.ts',n=>ts.isCallExpression(n)&&n.expression.getText()==='safeHandle'&&n.arguments[0]?.text==='__e2e__:auto-answer-missed');
 let parent=sourceNode.parent;let optedIn=false;while(parent){if(ts.isIfStatement(parent)&&parent.expression.getText().includes('NATIVELY_E2E'))optedIn=true;parent=parent.parent}assert.equal(optedIn,true);
 for(const packaged of [false,true]){
  const sent=[];const overlay={isDestroyed:()=>false,webContents:{send:(...args)=>sent.push(args)}};
  const fn=evaluate('('+sourceNode.arguments[1].getText()+')',{app:{isPackaged:packaged},appState:{getWindowHelper:()=>({getOverlayWindow:()=>overlay})}});
  const result=await fn({});assert.equal(result.success,!packaged);assert.equal(sent.length,packaged?0:1);if(!packaged)assert.equal(sent[0][0],'auto-answer-missed');
 }
});
