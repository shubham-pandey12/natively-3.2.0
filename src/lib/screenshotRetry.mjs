/**
 * Keeps the latest screenshot question, independently of the attachment tray.
 *
 * A failed attempt is always kept (for the explicit "Retry screenshot" banner
 * and for Direct Assist's same-audio retry). An attempt begun with
 * `keepOnSuccess` — the legacy Cmd/Ctrl+Enter answer — is also kept after it
 * succeeds, because the screenshot stays the newest question until something
 * replaces it: a later press can then answer it again with the same image.
 * The kept entry holds a lease on its files until it is replaced or cleared.
 */
export function createScreenshotRetry(release = () => {}) {
  let sequence = 0;
  let active = null;
  let kept = null;
  const releaseLease = entry => {
    if (entry?.lease) Promise.resolve(release(entry.lease)).catch(() => {});
  };
  return {
    begin(snapshot, reuseKept = false, options = {}) {
      const lease = reuseKept ? kept?.lease : undefined;
      if (reuseKept) kept = null;
      releaseLease(active);
      releaseLease(kept);
      kept = null;
      const id = ++sequence;
      active = snapshot ? { id, snapshot, lease, keepOnSuccess: Boolean(options.keepOnSuccess) } : null;
      return { id, lease };
    },
    attachLease(id, lease) {
      if (active?.id !== id) { releaseLease({ lease }); return false; }
      if (active.lease && active.lease !== lease) releaseLease(active);
      active.lease = lease;
      return true;
    },
    /** The kept FAILED attempt: any time when explicit, otherwise only while no new audio arrived. */
    pending(audioRevision, explicit = false) {
      return kept?.status === 'failed' && (explicit || kept.snapshot.audioRevision === audioRevision) ? kept : null;
    },
    /** The kept attempt, failed or succeeded: the screenshot question still standing. */
    latest() {
      return kept;
    },
    settle(id, status) {
      if (active?.id !== id) return false;
      if (status === 'failed' || (status === 'success' && active.keepOnSuccess)) {
        kept = { id: active.id, snapshot: active.snapshot, lease: active.lease, status: status === 'failed' ? 'failed' : 'succeeded' };
      } else releaseLease(active);
      active = null;
      return true;
    },
    clear() {
      sequence++;
      releaseLease(active);
      releaseLease(kept);
      active = kept = null;
    },
    isCurrent(id) { return id === sequence; },
  };
}
