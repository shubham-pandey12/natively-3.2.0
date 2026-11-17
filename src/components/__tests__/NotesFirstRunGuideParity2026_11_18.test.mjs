import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../NotesWindow.tsx', import.meta.url), 'utf8');

test('notepad guide uses recovered 3.2.0 pill copy and guarded actions', () => {
  for (const text of [
    'Write while you talk.', 'Click “Write notes” at the top of the page and type a line.',
    'Ask about the meeting.', 'Click Ask anything. It knows everything said so far.',
    'Try a recipe.', 'Recipes are ready-made asks. Pick one, or type / to see them all.',
    'Stop the meeting when you’re ready.', 'Press the stop button ■ in the bar at the bottom. Natively writes up your notes.',
  ]) assert.ok(source.includes(text), `missing ${text}`);
  assert.match(source, /phase === 'live' && stopsAt === null && notesGuide\.node/);
  assert.match(source, /liveRef\.current === 'notepad'/);
  assert.match(source, /liveRef\.current === 'ask'/);
  assert.match(source, /liveRef\.current === 'recipe'/);
  assert.doesNotMatch(source, /FirstRunGuideCard/);
});
