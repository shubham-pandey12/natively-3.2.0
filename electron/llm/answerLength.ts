export const ANSWER_LENGTHS = ['shorter', 'smart', 'longer'] as const;
export type AnswerLength = typeof ANSWER_LENGTHS[number];
export const DEFAULT_ANSWER_LENGTH: AnswerLength = 'smart';
export function isAnswerLength(value: unknown): value is AnswerLength {
  return value === 'shorter' || value === 'smart' || value === 'longer';
}
export function normalizeAnswerLength(value: unknown): AnswerLength {
  return isAnswerLength(value) ? value : DEFAULT_ANSWER_LENGTH;
}
const PROVIDER_SLOT = '__nativelyAnswerLengthProviderV1';
type Slot = typeof globalThis & { [PROVIDER_SLOT]?: () => unknown };
export function registerAnswerLengthProvider(provider: (() => unknown) | null): void { (globalThis as Slot)[PROVIDER_SLOT] = provider ?? undefined; }
export function getRegisteredAnswerLength(): AnswerLength {
  const provider = (globalThis as Slot)[PROVIDER_SLOT];
  if (typeof provider !== 'function') return DEFAULT_ANSWER_LENGTH;
  try {
    return normalizeAnswerLength(provider());
  } catch {
    return DEFAULT_ANSWER_LENGTH;
  }
}
export function effectiveAnswerLength(stored: unknown, proActive: boolean): AnswerLength {
  const length = normalizeAnswerLength(stored);
  return length === 'smart' || proActive ? length : 'smart';
}
export function profileAnswerWordCap(answerStyle: string | undefined, length: AnswerLength): number {
  if (answerStyle === 'detailed') return length === 'longer' ? 200 : 180;
  if (length === 'shorter') return 50;
  if (length === 'longer') return 200;
  return 90;
}
