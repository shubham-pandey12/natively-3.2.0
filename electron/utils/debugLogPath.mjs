// electron/utils/debugLogPath.mjs
//
// Where natively_debug.log lives. Kept pure and free of Electron so both
// branches are exercised on any OS.

import path from 'node:path';

export const DEBUG_LOG_FILENAME = 'natively_debug.log';

/**
 * A development instance keeps its log inside its own userData. Every launch
 * truncates or rotates its log, so sharing the installed app's log can erase
 * that app's diagnostics mid-session.
 *
 * A packaged build keeps its log in Documents.
 *
 * `documentsDir` is a function because app.getPath('documents') can throw
 * before app.ready; development never needs it.
 *
 * @param {{ isPackaged: boolean, userDataDir: string, documentsDir: () => string }} opts
 * @returns {string}
 */
export function resolveDebugLogPath({ isPackaged, userDataDir, documentsDir }) {
  return path.join(isPackaged ? documentsDir() : userDataDir, DEBUG_LOG_FILENAME);
}
