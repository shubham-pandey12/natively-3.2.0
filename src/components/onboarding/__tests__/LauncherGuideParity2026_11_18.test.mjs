import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const launcher = fs.readFileSync(new URL('../LauncherGuide.tsx', import.meta.url), 'utf8');
const shared = fs.readFileSync(new URL('../useRecoveredGuide.ts', import.meta.url), 'utf8');

test('3.2.0 launcher guide has anchored tips and a visible-anchor fallback', () => {
  for (const step of ['start', 'notes', 'start2', 'notes2', 'surface', 'plans', 'keys']) {
    assert.match(launcher, new RegExp(`stepId="${step}"`));
  }
  assert.match(launcher, /notesStep && !endedId \? 20_000 : 1200/);
  assert.match(launcher, /data-guide-card="continue"/);
  assert.match(launcher, /onMeetingStateChanged/);
  assert.match(launcher, /onTrialAutoStart/);
});

test('3.2.0 guide hook delays normal transitions and highlights the anchor', () => {
  assert.match(shared, /setTimeout\(finish, 1000\)/);
  assert.match(shared, /setTimeout\(finish, 160\)/);
  assert.match(shared, /data-guide-leaving/);
  assert.match(shared, /data-guide-lit/);
});
