// Regression for transcript and endpoint callbacks left on a retired
// Deepgram connection after restartStream() replaces it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.resolve(dirname, '../DeepgramStreamingSTT.ts'), 'utf8');
const connect = source.slice(source.indexOf('private connect(): void {'), source.indexOf('private scheduleReconnect(): void {'));

test('retired Deepgram connections cannot emit transcript or utterance-end events', () => {
  const transcript = connect.slice(connect.indexOf("live.on(LiveTranscriptionEvents.Transcript"), connect.indexOf('// UtteranceEnd'));
  const utteranceEnd = connect.slice(connect.indexOf('this.live.on(LiveTranscriptionEvents.UtteranceEnd'), connect.indexOf('this.live.on(LiveTranscriptionEvents.Error'));

  assert.match(transcript, /live !== this\.live\) return/, 'transcript callback must ignore events from replaced connections');
  assert.match(utteranceEnd, /live !== this\.live\) return/, 'endpoint callback must ignore events from replaced connections');
});
