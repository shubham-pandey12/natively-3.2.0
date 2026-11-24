export const DEBUG_LOG_FILENAME: string;
export function resolveDebugLogPath(opts: {
  isPackaged: boolean;
  userDataDir: string;
  documentsDir: () => string;
}): string;
