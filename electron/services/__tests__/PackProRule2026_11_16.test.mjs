import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isPackLicence, packProBlock, packHoursCount, restoreAfterPackStandDown } = require('../../../dist-electron/electron/services/packs/packProRule.js');

test('pack rules distinguish pack licence and Natively AI/STT selection', () => {
  assert.equal(isPackLicence('natively_api', 'pack_light'), true);
  assert.equal(isPackLicence('dodo', 'pack_light'), false);
  assert.equal(packProBlock({ licenceProvider: 'natively_api', licencePlan: 'pack_heavy', defaultModel: 'openai', sttProvider: 'deepgram' }), 'both');
  assert.equal(packHoursCount('natively', 'natively'), true);
  assert.equal(packHoursCount('natively', 'deepgram'), false);
});

test('pack stand-down restoration leaves missing mode untouched', async () => {
  let cleared = false;
  const result = await restoreAfterPackStandDown({ proActive: () => true, knowledgeSetting: () => false, knowledgeSwitchedOn: () => false, setKnowledge: () => {}, savedModeId: () => 'missing', clearSavedModeId: () => { cleared = true; }, packLicence: () => true, activeModeId: () => null, modeExists: () => false, applyMode: async () => ({ success: true }) });
  assert.deepEqual(result, { knowledge: false, modeId: null });
  assert.equal(cleared, true);
});

test('pack restoration re-enables saved knowledge and existing mode', async () => {
  let knowledge = false;
  let mode = null;
  const result = await restoreAfterPackStandDown({
    proActive: () => true, knowledgeSetting: () => true, knowledgeSwitchedOn: () => knowledge,
    setKnowledge: (on) => { knowledge = on; }, savedModeId: () => 'mode-1', clearSavedModeId: () => {},
    packLicence: () => true, activeModeId: () => null, modeExists: (id) => id === 'mode-1',
    applyMode: async (id) => { mode = id; return { success: true }; },
  });
  assert.deepEqual(result, { knowledge: true, modeId: 'mode-1' });
  assert.equal(mode, 'mode-1');
});
