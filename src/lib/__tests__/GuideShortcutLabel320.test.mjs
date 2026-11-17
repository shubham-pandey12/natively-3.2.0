import test from 'node:test';
import assert from 'node:assert/strict';
import { guideShortcutLabel } from '../guideShortcutLabel.ts';

test('guide shortcut labels name the platform modifiers', () => {
  assert.equal(guideShortcutLabel('darwin', 'H'), '⌘⌥⇧⌃ + H');
  assert.equal(guideShortcutLabel('win32', 'H'), 'Ctrl/Alt/Shift/Win + H');
});
