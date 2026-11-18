import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { emptyGuideState, reduceGuide, normalizeGuideState } = require('../../../src/lib/onboarding/firstRunGuide.mjs');

test('guide starts only for an eligible new user, advances, and can be skipped', () => {
  const now = 1_000;
  const facts = { hasOwnAiKey: false, hasMeetings: false, launchCount: 1 };
  const start = reduceGuide(emptyGuideState(), { type: 'plans_closed', facts }, now);
  assert.equal(start.status, 'active');
  assert.equal(reduceGuide(emptyGuideState(), { type: 'plans_closed', facts: { ...facts, hasMeetings: true } }, now).status, 'idle');
  assert.equal(reduceGuide(start, { type: 'meeting_started', surface: 'overlay' }, now + 1).step, 'overlay');
  assert.equal(reduceGuide(start, { type: 'skip' }, now + 2).status, 'skipped');
  assert.equal(normalizeGuideState({ status: 'active', step: 'invalid' }, now).status, 'idle');
});

test('changing to the notepad surface advances the guide after the setting saves', () => {
  const ipc = readFileSync(new URL('../../ipcHandlers.ts', import.meta.url), 'utf8');
  const setter = ipc.slice(ipc.indexOf("safeHandle('meeting-surface:set'"), ipc.indexOf("safeHandle('live-notes:get-state'"));
  assert.match(setter, /SettingsManager\.getInstance\(\)\.set\('meetingSurface', surface\)[\s\S]*guideSurfaceSet\(surface\)/);
  assert.ok(setter.indexOf('funnelTelemetry.meetingSurfaceSet(before, surface)') < setter.indexOf('guideSurfaceSet(surface)'));
});
