// The full setup & demo film on the Natively YouTube channel (8:57). Kept free
// of renderer globals so the main process can open it for the first-run guide.
export const DEMO_VIDEO_URL = 'https://youtu.be/Ha_ZiwG5Kwc';
export const GUIDE_SILENT_DEMO_DELAY_MS = 8_000;
export const GUIDE_AUTO_ANSWER_DELAY_MS = 15_000;

/**
 * shell.openExternal options for the first-run guide's demo film. On macOS the
 * browser opens behind the app (activate: false) so the overlay stays in view;
 * Windows has no such option.
 */
export function demoFilmOpenOptions(platform: NodeJS.Platform): { activate?: boolean } {
  switch (platform) {
    case 'darwin':
      return { activate: false };
    case 'win32':
      return {};
    default:
      return {};
  }
}
