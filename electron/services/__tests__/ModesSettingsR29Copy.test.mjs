import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ui = fs.readFileSync(path.join(repoRoot, 'premium/src/ModesSettings.tsx'), 'utf8');

test('Modes UI keeps the recovered labels and safe delete confirmation', () => {
  const isV3 = ui.includes('Modes Manager') && ui.includes('Real-time prompt');
  const expectedList = isV3
    ? [
        'Modes Manager',
        'Templates',
        'New Mode',
        'Delete Mode',
        'Real-time prompt',
        'Knowledge source',
        'Answer policy',
        'Follow-ups in your style',
        'Reference files',
        'Notes template',
      ]
    : [
        'Customize assistant behaviors, instruction rules, and reference document grounding',
        'Pro Active',
        'Free Tier',
        'Available Modes',
        'New',
        'Create Custom Mode',
        'Mode Name',
        'Base Template',
        'Mode name cannot be empty.',
        'System Instructions & Context',
        '8000 chars',
        'Reference Documents',
        'Grounded documents used for citation and retrieval during conversations',
        'No reference files attached to this mode yet.',
        'Save Changes',
        'All changes are saved to local database storage',
        'Are you sure you want to delete this custom mode?',
      ];

  for (const text of expectedList) {
    assert.ok(ui.includes(text), `ModesSettings.tsx should include copy: ${text}`);
  }
});
