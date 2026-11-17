import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { builtinSectionInstruction, sectionGuidance } = require('../../../../dist-electron/electron/services/meeting/sectionInstructions.js');

test('shipped section guidance wins only for an exact built-in section', () => {
  assert.match(builtinSectionInstruction('Decisions', 'Confirmed decisions only. Do not include options that were merely discussed.'), /participants confirmed/);
  assert.equal(builtinSectionInstruction('Decisions', 'My custom decisions'), undefined);
  assert.equal(sectionGuidance({ title: 'Decisions', description: 'My custom decisions', compiledPrompt: 'Keep my instructions.' }), 'Keep my instructions.');
});

test('the V2 fallback notes prompt uses the same section guidance as the chunk prompt (3.2.0 buildV2FallbackPrompts)', () => {
  const { buildV2FallbackPrompts } = require('../../../../dist-electron/electron/services/meeting/v2FallbackNotes.js');
  const { summaryPrompt } = buildV2FallbackPrompts({
    modeNoteSections: [
      { title: 'Decisions', description: 'Confirmed decisions only. Do not include options that were merely discussed.' },
      { title: 'Custom', description: 'My description', compiledPrompt: 'Compiled custom instruction.' },
      { title: 'Bare' },
    ],
  });
  assert.match(summaryPrompt, /- "Decisions": .*participants confirmed/);
  assert.match(summaryPrompt, /- "Custom": Compiled custom instruction\./);
  assert.match(summaryPrompt, /- "Bare": Capture content for "Bare", grounded only in this transcript\./);
});
