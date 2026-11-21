// Whether a screenshot can leave Natively's windows ON SCREEN and just exclude
// them from the capture, instead of hiding and re-showing them (which makes the
// overlay vanish for the length of the capture and churns focus).
//
// Windows: setContentProtection(true) maps to
// SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) on Windows 10 2004
// (build 19041)+, which removes the window from every capture API while the
// user still sees it. Measured: excluded from our desktop stream within ~80 ms.
// Older builds only support WDA_MONITOR, which captures a black box, so they
// keep the hide path.
//
// macOS: NOT used. NSWindowSharingNone is not honoured by every capture path
// on recent macOS, so macOS keeps hiding windows as before.

export const WDA_EXCLUDEFROMCAPTURE_MIN_BUILD = 19041;

/** Windows build number from os.release() ("10.0.26100" → 26100), or 0. */
export function windowsBuildFromRelease(release: string): number {
  const parts = String(release ?? '').split('.');
  const build = parseInt(parts[2] ?? '', 10);
  return Number.isFinite(build) ? build : 0;
}

export function canExcludeFromCaptureWithoutHiding(platform: NodeJS.Platform, release: string): boolean {
  switch (platform) {
    case 'win32':
      return windowsBuildFromRelease(release) >= WDA_EXCLUDEFROMCAPTURE_MIN_BUILD;
    case 'darwin':
      return false;
    default:
      return false;
  }
}
