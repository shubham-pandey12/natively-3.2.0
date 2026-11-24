// Ctrl+C over highlighted overlay text (responses, transcript).
//
// Windows: the overlay is WS_EX_NOACTIVATE and never focused (see
// windowsFocusPolicy.ts), so Ctrl+C goes to the foreground meeting app and the
// selection is never copied. The overlay reports its selection to main; main
// arms the WH_KEYBOARD_LL hook, which then swallows plain Ctrl+C and delivers it
// tagged SELECTION_COPY_ID (native-module/src/edit_shortcut.rs). Main writes the
// stored text to the clipboard. Unarmed, Ctrl+C stays the foreground app's.
//
// macOS: nothing to do. The Edit menu's copy role handles Cmd+C.
//
// Pure module, platform injected, so both branches are tested from either OS
// (__tests__/selectionCopy.test.mjs).

/** Must match SELECTION_COPY_ID in native-module/src/edit_shortcut.rs. */
export const SELECTION_COPY_ID = 'natively:selection-copy';

/** Larger selections are not armed (the clipboard write would be huge). */
export const MAX_SELECTION_COPY_CHARS = 1_000_000;

/**
 * An armed selection that is never cleared (the user highlighted text, then
 * went back to the meeting app) would keep taking that app's Ctrl+C. Disarm
 * after this long.
 */
export const SELECTION_COPY_ARM_MS = 60_000;

export type SelectionCopyStrategy = 'hook' | 'edit-menu';

export function selectionCopyStrategy(platform: NodeJS.Platform): SelectionCopyStrategy {
  switch (platform) {
    case 'win32':
      return 'hook';
    case 'darwin':
      return 'edit-menu';
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

/** The text to arm with, or null to disarm (empty, whitespace, non-string, too large). */
export function selectionCopyText(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  if (text.trim().length === 0) return null;
  if (text.length > MAX_SELECTION_COPY_CHARS) return null;
  return text;
}
