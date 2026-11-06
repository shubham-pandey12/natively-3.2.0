// electron/services/__tests__/ModesManagerRecoveredAudit2026_11_06.test.mjs
//
// Parity and contract verification against recovered source:
// 1. All 9 template types are defined and valid.
// 2. Preload and electron.d.ts parity for Modes and Context Intelligence.
// 3. ModesSettings accessibility attributes and listeners are present.
// 4. Source contract builder and answer policy IPC bindings.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../');

describe('Modes Manager Recovered Source Audit Parity', () => {
  test('A. All 9 template types are present in BUILTIN_MODE_LABELS and VALID_TEMPLATE_TYPES', async () => {
    const builtinPath = path.join(repoRoot, 'electron/services/builtinModes.ts');
    const generatorPath = path.join(repoRoot, 'electron/services/ModeGenerator.ts');

    const builtinContent = fs.readFileSync(builtinPath, 'utf8');
    const generatorContent = fs.readFileSync(generatorPath, 'utf8');

    const expectedTemplates = [
      'general',
      'sales',
      'recruiting',
      'team-meet',
      'looking-for-work',
      'technical-interview',
      'lecture',
      'seminar',
      'call-center'
    ];

    for (const tpl of expectedTemplates) {
      assert.ok(
        builtinContent.includes(`'${tpl}':`),
        `builtinModes.ts must define '${tpl}' in BUILTIN_MODE_LABELS`
      );
      assert.ok(
        generatorContent.includes(`'${tpl}'`),
        `ModeGenerator.ts must include '${tpl}' in ModeTemplateType or VALID_TEMPLATE_TYPES`
      );
    }
  });

  test('B. ModeReferenceFileIngestion and SafeDocumentTextExtractor are intact', () => {
    const ingestPath = path.join(repoRoot, 'electron/services/ModeReferenceFileIngestion.ts');
    const extractPath = path.join(repoRoot, 'electron/services/SafeDocumentTextExtractor.ts');

    assert.ok(fs.existsSync(ingestPath), 'ModeReferenceFileIngestion.ts must exist');
    assert.ok(fs.existsSync(extractPath), 'SafeDocumentTextExtractor.ts must exist');

    const ingestContent = fs.readFileSync(ingestPath, 'utf8');
    const extractContent = fs.readFileSync(extractPath, 'utf8');

    assert.match(extractContent, /SAFE_DOCUMENT_MAX_BYTES\s*=\s*50\s*\*\s*1024\s*\*\s*1024/);
    assert.match(ingestContent, /MODE_REFERENCE_FILE_MAX_BYTES\s*=\s*SAFE_DOCUMENT_MAX_BYTES/);
    assert.match(ingestContent, /crypto\.createHash\('sha256'\)/);
  });

  test('C. ModeHybridRetriever contains resilient stand-in check and resume-prefix loading', () => {
    const hybridPath = path.join(repoRoot, 'electron/services/modes/ModeHybridRetriever.ts');
    const content = fs.readFileSync(hybridPath, 'utf8');

    assert.match(content, /isKeptForPrimary/, 'ModeHybridRetriever must protect primary vectors during stand-in execution');
    assert.match(content, /loadResumablePrefix/, 'ModeHybridRetriever must support resuming chunk embeddings');
  });

  test('D. Turn path binds getActiveModeInfo and protects reference_files_only source isolation', () => {
    const ipcPath = path.join(repoRoot, 'electron/ipcHandlers.ts');
    const content = fs.readFileSync(ipcPath, 'utf8');

    assert.match(content, /ModesManager\.getInstance\(\)\.getActiveModeInfo\(\)/);
    assert.match(content, /buildRetrievedActiveModeContextBlock/);
    assert.match(content, /reference_files_only/);
  });

  test('E. Preload and electron.d.ts parity for modes and answer policy contracts', () => {
    const dtsPath = path.join(repoRoot, 'src/types/electron.d.ts');
    const preloadPath = path.join(repoRoot, 'electron/preload.ts');

    const dtsContent = fs.readFileSync(dtsPath, 'utf8');
    const preloadContent = fs.readFileSync(preloadPath, 'utf8');

    const requiredMethods = [
      'modesGetAll',
      'modesGetActive',
      'modesCreate',
      'modesGenerateFromBrief',
      'modesUpdate',
      'modesGetSourceContract',
      'modesBuildUserSourceContract',
      'modesDelete',
      'modesSetActive',
      'modesGetReferenceFiles',
      'modesUploadReferenceFile',
      'modesDeleteReferenceFile',
      'modesGetReferenceFileStatus',
      'modesGetNoteSections',
      'modesAddNoteSection',
      'modesUpdateNoteSection',
      'modesDeleteNoteSection',
      'modesRemoveAllNoteSections',
      'answerPolicyGet',
      'answerPolicySet',
      'onModesActiveCleared',
      'onModeChanged',
    ];

    for (const method of requiredMethods) {
      assert.ok(
        dtsContent.includes(method),
        `src/types/electron.d.ts must declare ${method}`
      );
      assert.ok(
        preloadContent.includes(`${method}:`),
        `electron/preload.ts must export ${method}`
      );
    }
  });

  test('F. ModesSettings accessibility attributes and event listeners are wired', () => {
    const uiPath = path.join(repoRoot, 'premium/src/ModesSettings.tsx');
    const content = fs.readFileSync(uiPath, 'utf8');

    assert.match(content, /aria-label="Real-time prompt instructions"/);
    assert.match(content, /aria-label="Section title"/);
    assert.match(content, /aria-label="Instructions for Natively"/);
    assert.match(content, /aria-label="Mode options"/);
    assert.match(content, /aria-label="Close"/);
    assert.match(content, /onModeChanged/);
    assert.match(content, /onModesActiveCleared/);
  });
});
