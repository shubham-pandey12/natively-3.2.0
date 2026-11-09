import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadMethods,deferred,tick,read} from './liveInterviewTestUtils.mjs';
function setup(platform,pause,deferCleanup=false){
 const gate=deferred();const cleanupGate=deferred();const calls=[];let stopped=false;
 class Capture{constructor(kind){this.kind=kind;calls.push({kind,op:'construct',afterStop:stopped,platform})}start(){calls.push({kind:this.kind,op:'start',afterStop:stopped,platform})}async destroy(){calls.push({kind:this.kind,op:'destroy',afterStop:stopped,platform});if(stopped&&deferCleanup)await cleanupGate.promise}}
 class MicrophoneCapture extends Capture{constructor(){super('mic')}}
 class SystemAudioCapture extends Capture{constructor(){super('system')}}
 const Class=loadMethods('electron/main.ts','AppState',name=>/resume/i.test(name)&&!name.includes('MeetingSurface'),{MicrophoneCapture,SystemAudioCapture,resolveMacSystemAudioCapability:async()=>pause==='capability'?await gate.promise:{effectiveDenied:false},formatPermissionMessage:()=>'',permissionTitleKey:()=>''});
 const app=new Class();Object.assign(app,{isMeetingActive:true,_meetingGeneration:4,_meetingWithoutAudio:false,
 microphoneCapture:{destroy:async()=>pause==='mic'?await gate.promise:undefined},systemAudioCapture:{destroy:async()=>pause==='system'?await gate.promise:undefined},googleSTT:null,googleSTT_User:null,
 wireMicCapture(){},wireSystemCapture(){},sendAudioCaptureFailed(){},broadcastDeviceSelection(){},sendSystemAudioPermissionDenied(){},
 createSTTProvider(kind){calls.push({kind,op:'stt-create',afterStop:stopped,platform});return {start(){calls.push({kind,op:'stt-start',afterStop:stopped,platform})}}}});
 return {app,calls,gate,cleanupGate,stop(){stopped=true;app.isMeetingActive=false;app._meetingGeneration++}};
}
for(const platform of ['darwin','win32']){
 for(const pause of ['mic','system','capability'])test(`${platform} native stand-ins: Stop during ${pause} await prevents subsequent capture/STT creation`,async()=>{
  const s=setup(platform,pause);const pending=s.app.restartCapturesAfterResume();await tick();s.stop();s.gate.resolve({effectiveDenied:false});await pending;
  assert.deepEqual(s.calls.filter(c=>c.afterStop&&['construct','start','stt-create','stt-start'].includes(c.op)),[]);
 });
 test(`${platform} native stand-ins: normal resume recreates and starts both channels`,async()=>{const s=setup(platform);await s.app.restartCapturesAfterResume();for(const kind of ['mic','system'])assert.ok(s.calls.some(c=>c.kind===kind&&c.op==='start'));assert.equal(s.calls.filter(c=>c.op==='stt-start').length,2)});
 test(`${platform} native stand-ins: overlapping resumes share one reconstruction`,async()=>{const s=setup(platform,'mic');const a=s.app.restartCapturesAfterResume();const b=s.app.restartCapturesAfterResume();await tick();s.gate.resolve({effectiveDenied:false});await Promise.all([a,b]);assert.equal(s.calls.filter(c=>c.op==='construct'&&c.kind==='mic').length,1);assert.equal(s.calls.filter(c=>c.op==='construct'&&c.kind==='system').length,1)});
}
test('Stop invalidates meeting ownership before waiting for the in-progress resume',()=>{
 const s=read('electron/main.ts');const start=s.indexOf('private async endMeetingTransition(');const body=s.slice(start,s.indexOf('private ',start+20));const invalidate=body.indexOf('this._meetingGeneration++');const wait=body.indexOf('await this._resumeCapturePromise');assert.ok(invalidate>=0);assert.ok(wait>invalidate,'Stop must await resume after invalidating the meeting');
});

for(const platform of ['darwin','win32']) test(`${platform} native stand-ins: Stop waits for owned capture cleanup, not only recovery body`,async()=>{
 const s=setup(platform,'system',true);
 const recovery=s.app.restartCapturesAfterResume();
 await tick();s.stop();s.gate.resolve({effectiveDenied:false});
 let stopFinished=false;
 const stopJoin=Promise.resolve(s.app._resumeCapturePromise).then(()=>{stopFinished=true});
 try {
  await tick();
  assert.ok(s.calls.some(c=>c.kind==='mic'&&c.op==='destroy'&&c.afterStop));
  assert.equal(stopFinished,false,'Stop must wait while the newly owned microphone is still retiring');
 } finally {s.cleanupGate.resolve();await Promise.all([recovery,stopJoin])}
});
