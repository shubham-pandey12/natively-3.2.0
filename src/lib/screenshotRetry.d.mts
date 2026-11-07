export interface ScreenshotRetryEntry<T> { id: number; snapshot: T; lease?: string }
export function createScreenshotRetry<T extends { audioRevision: number }>(release?: (lease: string) => unknown): {
  begin(snapshot: T | null, reuseFailed?: boolean): { id: number; lease?: string };
  attachLease(id: number, lease: string): boolean;
  pending(audioRevision: number, explicit?: boolean): ScreenshotRetryEntry<T> | null;
  settle(id: number, status: 'success' | 'failed' | 'cancelled'): boolean;
  clear(): void;
  isCurrent(id: number): boolean;
};
