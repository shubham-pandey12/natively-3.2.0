import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {read,callCallback,evaluate} from './liveInterviewTestUtils.mjs';
const root=process.cwd();
const guard=await import(pathToFileURL(path.join(root,'src/lib/chatStreamGuard.mjs')));
const {discardStreamingByIntentMessages}=await import(pathToFileURL(path.join(root,'src/lib/overlayMessagePersistence.mjs')));
test('discard ownership requires the same identified generation',()=>{
 assert.equal(typeof guard.shouldDiscardLiveAnswer,'function');
 assert.equal(guard.shouldDiscardLiveAnswer(22,21),false);
 assert.equal(guard.shouldDiscardLiveAnswer(22,undefined),false);
 assert.equal(guard.shouldDiscardLiveAnswer(22,22),true);
});
test('main discard IPC preserves generation identity',()=>{
 let data; const owner={autoAnswerUsage:{stopAwaitingAnswer(){}},sendToWindow(_w,_c,p){data=p}};
 const cb=evaluate('('+callCallback('electron/main.ts',"intelligenceManager.on",'suggested_answer_discard')+')',{...owner,flushBatchesBeforeFinal(){},answerWindow(){return {}}});
 cb('superseded',21); assert.equal(data.generationId,21);
});
function renderDiscard(generationId,intent='what_to_answer'){
 let rows=[{id:'new',role:'system',intent,isStreaming:true,text:'pending'}];
 let processing=true;const mutations=[];
 const refs=Object.fromEntries(['activeDirectAssistRef','legacyIntelligenceTombstonedRef','streamingNodeRef','streamingTextRef','streamingMsgIdRef','streamingIntentRef','streamingRenderModeRef','eagerCodeExpansionHoldRef','streamingRafRef','streamingCodeRafRef','pendingFinalizeRef','pendingFinalizeTimeoutRef'].map(k=>[k,{current:null}]));
 refs.pendingFinalizeRef.current={msgId:'new',intent,text:'pending'};refs.pendingFinalizeTimeoutRef.current=123;
 refs.streamingMsgIdRef.current='new';refs.streamingIntentRef.current=intent;refs.streamingTextRef.current='pending';
 const cb=evaluate('('+callCallback('src/components/NativelyInterface.tsx','onIntelligenceSuggestedAnswerDiscard')+')',{
 ...refs,liveAnswerGenIdRef:{current:22},...guard,discardStreamingByIntentMessages,
 setIsProcessing(value){processing=value;mutations.push('processing')},cancelAnimationFrame(){},clearTimeout(id){mutations.push('clear-timeout:'+id)},setMessages(fn){rows=fn(rows);mutations.push('rows')}
 });cb({reason:'superseded',generationId});return {rows,refs,processing,mutations};
}
test('stale discard leaves the newer streaming row AND refs intact',()=>{const r=renderDiscard(21);assert.equal(r.rows[0]?.id,'new');assert.equal(r.refs.streamingMsgIdRef.current,'new');assert.equal(r.refs.streamingTextRef.current,'pending');assert.equal(r.processing,true);assert.equal(r.refs.pendingFinalizeRef.current.msgId,'new');assert.equal(r.refs.pendingFinalizeTimeoutRef.current,123);assert.equal(r.mutations.length,0)});
test('matching discard removes its own streaming row',()=>{const r=renderDiscard(22);assert.equal(r.rows.length,0);assert.equal(r.refs.streamingMsgIdRef.current,null);assert.equal(r.processing,false);assert.equal(r.refs.pendingFinalizeRef.current,null);assert.equal(r.refs.pendingFinalizeTimeoutRef.current,null);assert.ok(r.mutations.includes('clear-timeout:123'))});
test('a matching WTA discard cannot clear an active manual chat',()=>{const r=renderDiscard(22,'chat');assert.equal(r.rows[0]?.id,'new');assert.equal(r.refs.streamingMsgIdRef.current,'new');assert.equal(r.refs.streamingTextRef.current,'pending')});
test('preload and renderer type contracts carry generationId',()=>{
 for(const file of ['electron/preload.ts','src/types/electron.d.ts']){const s=read(file);const at=s.indexOf('onIntelligenceSuggestedAnswerDiscard');assert.ok(at>=0);assert.match(s.slice(at,at+400),/generationId\??\s*:\s*number/)}
});
