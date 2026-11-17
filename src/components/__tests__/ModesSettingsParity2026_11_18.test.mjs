import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../../premium/src/ModesSettings.tsx', import.meta.url), 'utf8');

test('3.2.0 knowledge panel exports only a pack with cards and exposes grouped cards', () => {
  assert.match(source, /pack && \(pack\.cards\?\.length \?\? 0\) > 0 && <button onClick=\{onExport\}/);
  assert.match(source, /title="Export OKF bundle"/);
  assert.match(source, /\[\.\.\.groups\.entries\(\)\]\.map/);
  assert.match(source, /expandedCardId === card\.id/);
  assert.match(source, /No knowledge pack generated yet\./);
});

test('3.2.0 notes menu uses the shared catalog and supports keyboard selection', () => {
  assert.match(source, /NOTE_TEMPLATE_GROUPS\.map/);
  assert.match(source, /NOTE_TEMPLATES\.filter\(template => template\.group === group\)/);
  assert.match(source, /row\(MODE_DEFAULT_NOTE_TEMPLATE_ID/);
  for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) assert.ok(source.includes(`event.key === '${key}'`));
  assert.match(source, /role="menuitemradio" aria-checked=\{selected\}/);
});

test('3.2.0 built-in template selector uses the recovered listbox without extra contract writes', () => {
  assert.match(source, /function TemplateTypeSelect\(/);
  assert.match(source, /role="listbox" className="mm-tp-menu"/);
  assert.match(source, /role="option" aria-selected=\{selected\}/);
  const subtitle = source.slice(source.indexOf('Powered by Natively'), source.indexOf('intelligence.', source.indexOf('Powered by Natively')));
  assert.match(subtitle, /<TemplateTypeSelect/);
  assert.doesNotMatch(subtitle, /modesGetSourceContract|loadAnswerPolicy|Built-in template/);
});

test('3.2.0 knowledge review and file status use recovered messages and transitions', () => {
  assert.match(source, /Failed to approve card\./);
  assert.match(source, /Failed to reject card\./);
  assert.match(source, /\[ModesSettings\] uploadFile returned failure:/);
  assert.match(source, /indexing complete, semantic search ready/);
  assert.doesNotMatch(source, /ocr_required: \{ label: 'OCR REQUIRED'/);
  assert.doesNotMatch(source, /Creating custom modes requires Natively Pro\./);
});
