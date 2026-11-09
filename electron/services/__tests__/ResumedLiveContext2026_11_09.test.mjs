import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {loadMethods,read} from './liveInterviewTestUtils.mjs';
const require=createRequire(path.join(process.cwd(),'package.json'));
const dist=name=>require(path.join(process.cwd(),'dist-electron/electron',name));
const {SessionTracker}=dist('SessionTracker.js');
const { LiveRAGIndexer } = dist('rag/LiveRAGIndexer.js');
const {mergeResumedMeeting}=dist('services/meeting/meetingResume.js');
const {createLiveTranscriptRetrievalPort}=dist('context-intelligence/retrieval/live-transcript-port.js');
const {decide}=dist('context-intelligence/orchestration/orchestrator.js');
const oldAt=Date.now()-4*60*60*1000;
const saved=[{speaker:'interviewer',text:'The project codename is OAKRIDGE and the rollout owner is Mira.',timestamp:oldAt,final:true,origin:'stt'}];
function restored(){const s=new SessionTracker();assert.equal(typeof s.restoreTranscriptForResume,'function');s.restoreTranscriptForResume(saved);return s}
test('Resume restores old spoken evidence with its timestamp and marker for context and judge',()=>{const s=restored();const line=s.getRetrievalTranscript()[0];assert.equal(line.timestamp,oldAt);assert.equal(line.marker,'restored');assert.ok(s.getContext().some(x=>x.text===saved[0].text));assert.ok(s.getDurableContext().some(x=>x.text===saved[0].text));assert.equal(s.getPersistableTranscript().length,0)});
test('a live follow-up retrieves the restored project referent',async()=>{const s=restored();const port=createLiveTranscriptRetrievalPort({segments:s.getRetrievalTranscript(),userId:'local',sessionId:'resume'});assert.ok(port);const question='What is the project codename and who owns the rollout?';const decision=decide({requestId:'resume-q',requestSequence:1,surface:'what-to-answer',modeId:'team-meet',scope:{userId:'local',sessionId:'resume'},sessionId:'resume',transcriptQuestion:question});const result=await port.retrieve({decision});assert.ok(result.evidence.some(e=>e.content.includes('OAKRIDGE')))});
test('restoring spoken history does not replay transcript ingestion, recaps, or automatic-question hooks',()=>{const s=new SessionTracker();let ingested=0,handled=0,recaps=0;s.addTranscript=()=>{ingested++};s.handleTranscript=()=>{handled++};s.setRecapLLM({generate:()=>{recaps++;return Promise.resolve('')}});assert.equal(typeof s.restoreTranscriptForResume,'function');s.restoreTranscriptForResume(saved);assert.equal(ingested,0);assert.equal(handled,0);assert.equal(recaps,0);assert.equal(s.getRetrievalTranscript().length,1)});
test('beginLiveMeeting restores the explicit saved meeting before the next live question',()=>{
 const Class=loadMethods('electron/MeetingPersistence.ts','MeetingPersistence',name=>name==='beginLiveMeeting',{LIVE_USER_NOTES_MAX_CHARS:100000,crypto:{randomUUID:()=> 'fresh'},DatabaseManager:{getInstance:()=>({appendLiveUsageOverflow(){}})}});
 const s=new SessionTracker();const mp=new Class();Object.assign(mp,{session:s,liveJournal:{begin(){}},claimWriter(){}});mp.beginLiveMeeting(Date.now(),{resume:{meetingId:'saved',transcript:saved,usage:[],userNotes:'',surface:'overlay'}});assert.equal(s.getRetrievalTranscript().length,1);assert.equal(s.getRetrievalTranscript()[0].marker,'restored');assert.equal(s.getPersistableTranscript().length,0)
});
test('Stop merges the saved part once, with only new live speech appended',()=>{const s=restored();s.addTranscript({speaker:'interviewer',text:'New live turn.',timestamp:Date.now(),final:true,origin:'stt'});const merged=mergeResumedMeeting({transcript:saved,usage:[],startTime:oldAt,durationMs:1000},{transcript:s.getPersistableTranscript(),usage:[],durationMs:500});assert.equal(merged.transcript.length,2);assert.equal(merged.transcript.filter(x=>x.timestamp===oldAt).length,1);assert.equal(merged.durationMs,1500)});
function indexer(lastIndex = null) {
  const Class = loadMethods('electron/rag/RAGManager.ts', 'RAGManager',
    name => name === 'startLiveIndexing' || name === 'getLiveMeetingId' || /retained/i.test(name));
  const calls = [];
  const rag = new Class();
  Object.assign(rag, {
    embeddingPipeline: { isReady: () => true },
    deleteMeetingData: id => calls.push(['purge', id]),
    db: {
      prepare: sql => ({
        run() {},
        get(id) {
          assert.match(sql, /MAX\(chunk_index\).*WHERE meeting_id = \?/);
          calls.push(['read-offset', id]);
          return { lastIndex };
        },
      }),
    },
    liveIndexer: { start: (id, offset) => calls.push(['start', id, offset]) },
  });
  return { rag, calls };
}
test('resumed semantic index preserves saved chunks and exposes its saved meeting id before new chunks',()=>{const {rag,calls}=indexer();rag.startLiveIndexing('saved',{preserveExisting:true});assert.ok(!calls.some(x=>x[0]==='purge'));assert.equal(rag.getLiveMeetingId(),'saved')});
test('fresh live index still purges disposable prior-session chunks',()=>{const {rag,calls}=indexer();rag.startLiveIndexing('live-meeting-current');assert.ok(calls.some(x=>x[0]==='purge'))});
test('resume appends new indexed speech after the highest saved chunk position', async () => {
  const { rag, calls } = indexer(7);
  const stored = [];
  const live = new LiveRAGIndexer({
    saveChunks(chunks) {
      stored.push(...chunks);
      return chunks.map((_, index) => index + 1);
    },
  }, { isReady: () => false });
  rag.liveIndexer = live;
  rag.startLiveIndexing('saved', { preserveExisting: true });
  assert.deepEqual(calls, [['read-offset', 'saved']]);
  live.feedSegments([{ speaker: 'interviewer', text: 'We will check the rollout after the restart.', timestamp: Date.now() }]);
  await live.stop();
  assert.deepEqual(stored.map(chunk => [chunk.meetingId, chunk.chunkIndex]), [['saved', 8]]);
});
test('main starts the resumed index under the saved id and opts into preserving it',()=>{const src=read('electron/main.ts');const at=src.indexOf('liveIndexingStartedByInit = true');const context=src.slice(at-600,at);assert.match(context,/startLiveIndexing\(/);assert.match(context,/resumeBase/);assert.match(context,/preserveExisting/)});
