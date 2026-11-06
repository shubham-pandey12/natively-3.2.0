import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ui = fs.readFileSync(path.join(repoRoot, 'premium/src/ModesSettings.tsx'), 'utf8');

test('Modes UI keeps the recovered 2.9.2 labels and safe delete confirmation', () => {
  for (const text of [
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
  ]) {
    assert.ok(ui.includes(text), `ModesSettings.tsx should include recovered copy: ${text}`);
  }
});
