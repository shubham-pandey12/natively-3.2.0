import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../guide/NotesGuide.tsx', import.meta.url), 'utf8');
const windowSource = readFileSync(new URL('../NotesWindow.tsx', import.meta.url), 'utf8');

test('notepad guide uses its own pill copy and guarded actions', () => {
  for (const text of [
    'Write while you talk.', 'Click “Write notes” at the top of the page and type a line.',
    'Ask about the meeting.', 'Click Ask anything. It knows everything said so far.',
    'Try a recipe.', 'Recipes are ready-made asks. Pick one, or type / to see them all.',
    'Stop the meeting when you’re ready.', 'Press the stop button ■ in the bar at the bottom. Natively writes up your notes.',
  ]) assert.ok(source.includes(text), `missing ${text}`);
  assert.match(windowSource, /phase === 'live' && stopsAt === null && notesGuide\.node/);
  for (const step of ['notepad', 'ask', 'recipe']) {
    assert.match(source, new RegExp(`if \\(liveRef\\.current !== '${step}'`));
  }
  assert.doesNotMatch(source, /FirstRunGuideCard/);
});
