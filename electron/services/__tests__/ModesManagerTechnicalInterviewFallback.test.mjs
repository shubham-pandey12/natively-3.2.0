import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modesPath = path.resolve(__dirname, '../../../dist-electron/electron/services/ModesManager.js');
const { ModesManager } = await import(pathToFileURL(modesPath).href);

test('missing active mode restores Technical Interview and persists it as active', () => {
  const manager = ModesManager.getInstance();
  const prior = manager.getActiveMode();
  try {
    manager.setActiveMode(null);
    const fallback = manager.getActiveMode();
    assert.equal(fallback?.templateType, 'technical-interview');
    assert.equal(fallback?.isActive, true);
    assert.equal(manager.getActiveMode()?.id, fallback?.id);
  } finally {
    if (prior) manager.setActiveMode(prior.id);
  }
});

test('missing Technical Interview mode is created and marked built-in', () => {
  const manager = ModesManager.getInstance();
  const originalModes = manager.getModes;
  const originalCreate = manager.createMode;
  manager.getModes = () => [];
  manager.createMode = ({ name, templateType }) => ({
    id: 'fallback-created', name, templateType, customContext: '', isActive: false,
    createdAt: new Date().toISOString(), isBuiltin: false,
  });
  try {
    const fallback = manager.getBuiltinTechnicalInterviewMode();
    assert.equal(fallback?.templateType, 'technical-interview');
    assert.equal(fallback?.isBuiltin, true);
  } finally {
    manager.getModes = originalModes;
    manager.createMode = originalCreate;
  }
});
