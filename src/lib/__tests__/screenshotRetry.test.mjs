import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScreenshotRetry } from '../screenshotRetry.mjs';
import { conversationContextFromMessages } from '../conversationContextFromMessages.mjs';

const snapshot = (audioRevision=1, path='screen.png', question='What should I say about this?') => ({audioRevision, attachments:[{path,preview:'preview'}],question});
test('deadlock -> screenshot failure -> quiet What to say retries the same screenshot and question', () => {
  const released=[];const state=createScreenshotRetry(id=>released.push(id));
  const request=snapshot();const first=state.begin(request);state.attachLease(first.id,'retained-image');
  assert.equal(state.settle(first.id,'failed'),true);
  const retry=state.pending(1);
  assert.deepEqual(retry.snapshot,request);
  assert.equal(retry.snapshot.question,'What should I say about this?');
  const second=state.begin(retry.snapshot,true);
  assert.equal(second.lease,'retained-image');
  assert.deepEqual(released,[]);
  state.settle(second.id,'success');
  assert.deepEqual(released,['retained-image']);
  assert.equal(state.pending(1,true),null);
});
test('new audio prevents implicit retry but explicit retry remains available', () => {
  const state=createScreenshotRetry();const req=state.begin(snapshot(4));state.settle(req.id,'failed');
  assert.equal(state.pending(5),null);
  assert.equal(state.pending(5,true).snapshot.audioRevision,4);
});
test('new screenshot or typed question supersedes old retry and releases only its lease', () => {
  const released=[];const state=createScreenshotRetry(id=>released.push(id));
  const old=state.begin(snapshot());state.attachLease(old.id,'old');state.settle(old.id,'failed');
  const next=state.begin(snapshot(2,'new.png','Explain the error'));
  state.attachLease(next.id,'new');
  assert.equal(state.settle(old.id,'failed'),false);
  assert.equal(state.pending(2,true),null);
  assert.deepEqual(released,['old']);
  state.settle(next.id,'failed');
  assert.equal(state.pending(2).snapshot.question,'Explain the error');
  const typed=state.begin(null);
  assert.equal(state.isCurrent(typed.id),true);
  assert.equal(state.pending(2,true),null);
  assert.deepEqual(released,['old','new']);
});
test('late retention reply after reset cannot resurrect the screenshot', () => {
  const released=[];const state=createScreenshotRetry(id=>released.push(id));
  const old=state.begin(snapshot());state.clear();
  assert.equal(state.attachLease(old.id,'late'),false);
  assert.equal(state.settle(old.id,'failed'),false);
  assert.equal(state.pending(1,true),null);
  assert.deepEqual(released,['late']);
});
test('cancellation, replacement and dismissal each release ownership without creating a retry', () => {
  for(const end of ['cancel','replace','dismiss']) {
    const released=[];const state=createScreenshotRetry(id=>released.push(id));
    const first=state.begin(snapshot());state.attachLease(first.id,end);
    if(end==='cancel')state.settle(first.id,'cancelled');
    else if(end==='replace')state.begin(null);
    else {state.settle(first.id,'failed');state.clear();}
    assert.deepEqual(released,[end]);
    assert.equal(state.pending(1,true),null);
  }
});
test('duplicate terminals and out-of-order failures cannot overwrite newer state', () => {
  const state=createScreenshotRetry();const old=state.begin(snapshot());const newer=state.begin(snapshot(2,'B.png'));
  assert.equal(state.settle(old.id,'failed'),false);
  state.settle(newer.id,'success');
  assert.equal(state.settle(newer.id,'failed'),false);
  assert.equal(state.pending(2,true),null);
});
test('failed and partial notices remain display-only while successful replies retain context', () => {
  const context=conversationContextFromMessages([
    {role:'user',text:'Explain deadlock'}, {role:'system',text:'Deadlock answer'},
    {role:'system',text:'timeout notice',answerOutcome:'failed'},
    {role:'system',text:'partial answer',failure:{code:'CUTOFF'}},
    {role:'system',text:'unfinished',isStreaming:true},
    {role:'system',text:'superseded',note:{kind:'superseded'}},
    {role:'system',text:'still working',hint:'what_to_say'},
    {role:'system',text:'Correct screenshot answer',answerOutcome:'success'},
  ]);
  assert.match(context,/Deadlock answer/);
  assert.match(context,/Correct screenshot answer/);
  assert.doesNotMatch(context,/timeout|partial|unfinished|superseded|still working/);
});
