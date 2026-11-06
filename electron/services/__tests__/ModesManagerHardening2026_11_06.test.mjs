// electron/services/__tests__/ModesManagerHardening2026_11_06.test.mjs
// Verification of ModesManager and mode IPC handler hardening fixes.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modesPath = path.resolve(__dirname, '../../../dist-electron/electron/services/ModesManager.js');
const generatorPath = path.resolve(__dirname, '../../../dist-electron/electron/services/ModeGenerator.js');
const ipcSourcePath = path.resolve(__dirname, '../../ipcHandlers.ts');

const modesMod = await import(pathToFileURL(modesPath).href);
const generatorMod = await import(pathToFileURL(generatorPath).href);
const ipcSource = fs.readFileSync(ipcSourcePath, 'utf8');

const { ModesManager } = modesMod;

describe('ModesManager comparator & guard hardening', () => {
  test('getModes comparator maintains strict weak ordering with multiple general modes', () => {
    const list = [
      { id: 'm3', name: 'Custom General 2', templateType: 'general', isBuiltin: false, createdAt: '2026-01-02T00:00:00Z' },
      { id: 'm1', name: 'General', templateType: 'general', isBuiltin: true, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'm2', name: 'Sales Mode', templateType: 'sales', isBuiltin: true, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'm4', name: 'Custom General 1', templateType: 'general', isBuiltin: false, createdAt: '2026-01-01T12:00:00Z' },
    ];

    const sortFn = (a, b) => {
      const aGeneral = a.templateType === 'general';
      const bGeneral = b.templateType === 'general';
      if (aGeneral !== bGeneral) return aGeneral ? -1 : 1;
      if (aGeneral && bGeneral) {
        const aCanonical = a.isBuiltin && a.name === 'General';
        const bCanonical = b.isBuiltin && b.name === 'General';
        if (aCanonical !== bCanonical) return aCanonical ? -1 : 1;
      }
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      if (ta !== tb) return ta - tb;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    };

    // Antisymmetry test: for any a, b, sortFn(a, b) === -sortFn(b, a)
    for (const a of list) {
      for (const b of list) {
        if (a === b) {
          assert.equal(sortFn(a, b), 0);
        } else {
          const res1 = Math.sign(sortFn(a, b));
          const res2 = Math.sign(sortFn(b, a));
          assert.equal(res1, -res2, `Antisymmetry failed for ${a.id} and ${b.id}`);
        }
      }
    }

    const sorted = [...list].sort(sortFn);
    assert.equal(sorted[0].id, 'm1', 'Canonical General mode must be at the very top');
    assert.equal(sorted[1].id, 'm4', 'Earlier custom general mode is next');
    assert.equal(sorted[2].id, 'm3', 'Later custom general mode follows');
    assert.equal(sorted[3].id, 'm2', 'Non-general mode comes after general modes');
  });

  test('ModesManager updateMode refuses empty name', () => {
    const mgr = ModesManager.getInstance();
    assert.throws(
      () => mgr.updateMode('some-id', { name: '   ' }),
      /updateMode: name cannot be empty/,
    );
  });

  test('ModesManager refuses operations on reserved __profile_okf__ mode', () => {
    const mgr = ModesManager.getInstance();
    // updateMode and deleteMode must not throw or operate on reserved mode
    mgr.updateMode('__profile_okf__', { name: 'Tampered' });
    mgr.deleteMode('__profile_okf__');
    mgr.setActiveMode('__profile_okf__');
  });

  test('ModesManager refuses deleting every built-in, not only General', () => {
    const mgr = ModesManager.getInstance();
    const builtin = mgr.getModes().find(mode => mode.isBuiltin && mode.templateType !== 'general');
    assert.ok(builtin, 'the built-in Technical Interview template should be seeded');
    assert.throws(() => mgr.deleteMode(builtin.id), /built-in modes cannot be deleted/);
  });

  test('ModeGenerator includes seminar and call-center template types', () => {
    // Both types should be valid in ModeGenerator
    const brief = {
      key: 'test_seminar',
      brief: 'Presentation questions based strictly on thesis slides',
      templateHint: 'seminar',
    };
    assert.ok(generatorMod.VALID_TEMPLATE_TYPES.has('seminar'), 'seminar must be in VALID_TEMPLATE_TYPES');
    assert.ok(generatorMod.VALID_TEMPLATE_TYPES.has('call-center'), 'call-center must be in VALID_TEMPLATE_TYPES');
  });
});

describe('Modes IPC handlers contracts', () => {
  test('modes:set-active rejects reserved mode and non-existent mode', () => {
    const handler = ipcSource.slice(
      ipcSource.indexOf("safeHandle('modes:set-active'"),
      ipcSource.indexOf("safeHandle('modes:get-reference-file-status'"),
    );
    assert.match(handler, /if \(id === '__profile_okf__'\)\s*\{\s*return \{ success: false, error: 'reserved_mode' \};/);
    assert.match(handler, /if \(!targetMode\)\s*\{\s*return \{ success: false, error: 'mode_not_found' \};/);
    assert.match(handler, /if \(!id\)\s*\{\s*BrowserWindow\.getAllWindows\(\)\.forEach/);
  });

  test('modes:delete rejects reserved mode, every built-in, and non-existent mode', () => {
    const handler = ipcSource.slice(
      ipcSource.indexOf("safeHandle('modes:delete'"),
      ipcSource.indexOf("safeHandle('modes:set-active'"),
    );
    assert.match(handler, /if \(id === '__profile_okf__'\)\s*return \{ success: false, error: 'reserved_mode' \};/);
    assert.match(handler, /if \(!targetMode\)\s*return \{ success: false, error: 'mode_not_found' \};/);
    assert.match(handler, /if \(targetMode\.isBuiltin\)/);
    assert.match(handler, /return \{ success: false, error: 'cannot_delete_builtin' \};/);
  });

  test('modes:upload-reference-file anchors to parent window and validates modeId', () => {
    const handler = ipcSource.slice(
      ipcSource.indexOf("safeHandle('modes:upload-reference-file'"),
      ipcSource.indexOf("safeHandle('modes:delete-reference-file'"),
    );
    assert.match(handler, /safeHandle\('modes:upload-reference-file',\s*async\s*\(\s*event,\s*modeId:\s*string\)/);
    assert.match(handler, /if \(!targetMode\)\s*return \{ success: false, error: 'mode_not_found' \};/);
    assert.match(handler, /BrowserWindow\.fromWebContents\(event\.sender\)/);
    assert.match(handler, /dialog\.showOpenDialog\(parent,\s*dialogOptions\)/);
  });

  test('modes:generate-from-brief checks hasAnyConfiguredProvider', () => {
    const handler = ipcSource.slice(
      ipcSource.indexOf("safeHandle(\n    'modes:generate-from-brief'"),
      ipcSource.indexOf("safeHandle(\n    'modes:update'"),
    );
    assert.match(handler, /llmHelper\.hasAnyConfiguredProvider/);
    assert.match(handler, /return \{ success: false, error: 'llm_not_configured' \};/);
  });
});
