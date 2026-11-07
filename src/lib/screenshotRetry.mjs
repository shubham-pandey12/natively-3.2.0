/** Keeps one failed screenshot request, independently of the attachment tray. */
export function createScreenshotRetry(release = () => {}) {
  let sequence = 0;
  let active = null;
  let failed = null;
  const releaseLease = entry => {
    if (entry?.lease) Promise.resolve(release(entry.lease)).catch(() => {});
  };
  return {
    begin(snapshot, reuseFailed = false) {
      const lease = reuseFailed ? failed?.lease : undefined;
      if (reuseFailed) failed = null;
      releaseLease(active);
      releaseLease(failed);
      failed = null;
      const id = ++sequence;
      active = snapshot ? { id, snapshot, lease } : null;
      return { id, lease };
    },
    attachLease(id, lease) {
      if (active?.id !== id) { releaseLease({ lease }); return false; }
      if (active.lease && active.lease !== lease) releaseLease(active);
      active.lease = lease;
      return true;
    },
    pending(audioRevision, explicit = false) {
      return failed && (explicit || failed.snapshot.audioRevision === audioRevision) ? failed : null;
    },
    settle(id, status) {
      if (active?.id !== id) return false;
      if (status === 'failed') failed = active;
      else releaseLease(active);
      active = null;
      return true;
    },
    clear() {
      sequence++;
      releaseLease(active);
      releaseLease(failed);
      active = failed = null;
    },
    isCurrent(id) { return id === sequence; },
  };
}
