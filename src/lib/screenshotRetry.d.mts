export interface ScreenshotRetryEntry<T> { id: number; snapshot: T; lease?: string; status: 'failed' | 'succeeded' }
export function createScreenshotRetry<T extends { audioRevision: number }>(release?: (lease: string) => unknown): {
  begin(snapshot: T | null, reuseKept?: boolean, options?: { keepOnSuccess?: boolean }): { id: number; lease?: string };
  attachLease(id: number, lease: string): boolean;
  pending(audioRevision: number, explicit?: boolean): ScreenshotRetryEntry<T> | null;
  latest(): ScreenshotRetryEntry<T> | null;
  settle(id: number, status: 'success' | 'failed' | 'cancelled'): boolean;
  clear(): void;
  isCurrent(id: number): boolean;
};
