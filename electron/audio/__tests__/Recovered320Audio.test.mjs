import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { MissingKeySTT } = require('../../../dist-electron/electron/audio/MissingKeySTT.js');
const { MicEchoGuard } = require('../../../dist-electron/electron/audio/micEchoGuard.js');

test('missing key reports once per active start and never after stop', async () => {
  const stt = new MissingKeySTT('deepgram');
  const errors = [];
  stt.on('error', error => errors.push(error));
  stt.start(); stt.stop();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors.length, 0);
  stt.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'stt_key_missing');
  assert.equal(errors[0].terminal, true);
});

test('mic guard suppresses recent interviewer echo only', () => {
  const guard = new MicEchoGuard();
  guard.noteInterviewer('How would you design this system?', true, 1000);
  assert.equal(guard.isEcho('How would you design this system?', 1500), true);
  assert.equal(guard.isEcho('I would start with the data model', 1500), false);
  assert.equal(guard.isEcho('How would you design this system?', 10000), false);
});

test('all missing-key and unknown providers stay off; echo still reaches display and Auto Answer', () => {
  const main = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
  const create = main.slice(main.indexOf('private createSTTProvider('), main.indexOf('    // Wire Transcript Events.', main.indexOf('private createSTTProvider(')));
  assert.match(create, /sttProvider === 'groq' \|\| sttProvider === 'azure' \|\| sttProvider === 'ibmwatson'[\s\S]*?stt = new MissingKeySTT\(sttProvider\)/);
  assert.match(create, /sttProvider === 'google'\) \{\s*stt = new GoogleSTT\(speaker\);\s*\} else \{[\s\S]*?stt = new MissingKeySTT\(sttProvider\)/);
  assert.match(create, /stt instanceof MissingKeySTT \? 'none'/);
  const segment = main.slice(main.indexOf('const onSegment = (segment:'), main.indexOf('    this._sttFailover[gapSource]?.stop()', main.indexOf('const onSegment = (segment:')));
  assert.match(segment, /if \(!micEcho\) \{?\s*this\.intelligenceManager\.handleTranscript/);
  assert.match(segment, /segment\.isFinal && this\.ragManager && !micEcho/);
  assert.match(segment, /this\.simpleAutoAnswer\.ingest/);
  assert.match(segment, /this\.sendThrottledTranscript\(payload\)/);
});
