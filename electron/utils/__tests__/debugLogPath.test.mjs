import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { resolveDebugLogPath, DEBUG_LOG_FILENAME } from '../debugLogPath.mjs';

const DOCS = path.join(path.sep, 'home', 'someone', 'Documents');
const AGENT = path.join(path.sep, 'repo', '.agent', 'userdata');

describe('resolveDebugLogPath', () => {
  test('a dev agent instance logs inside its own userData, never Documents', () => {
    // Every launch truncates or rotates the log it opens; sharing Documents let
    // an agent instance wipe another running instance's log.
    let documentsRead = false;
    const p = resolveDebugLogPath({
      isPackaged: false,
      userDataDir: AGENT,
      documentsDir: () => { documentsRead = true; return DOCS; },
    });
    assert.equal(p, path.join(AGENT, DEBUG_LOG_FILENAME));
    assert.equal(documentsRead, false, 'the agent branch must not need app.getPath("documents")');
  });

  test('a packaged build ignores the variable and keeps the user log in Documents', () => {
    const p = resolveDebugLogPath({ isPackaged: true, userDataDir: AGENT, documentsDir: () => DOCS });
    assert.equal(p, path.join(DOCS, DEBUG_LOG_FILENAME));
  });

  test('a standard dev launch logs in the separate development profile', () => {
    const userDataDir = path.join(path.sep, 'profiles', 'natively-local');
    const p = resolveDebugLogPath({ isPackaged: false, userDataDir, documentsDir: () => DOCS });
    assert.equal(p, path.join(userDataDir, DEBUG_LOG_FILENAME));
  });

  test('the file name is the one users are told to send', () => {
    assert.equal(DEBUG_LOG_FILENAME, 'natively_debug.log');
  });
});
