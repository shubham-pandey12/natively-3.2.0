export const ANSWER_LENGTHS = ['shorter', 'smart', 'longer'] as const;
export type AnswerLength = typeof ANSWER_LENGTHS[number];
export const DEFAULT_ANSWER_LENGTH: AnswerLength = 'smart';
export const isAnswerLength = (value: unknown): value is AnswerLength => ANSWER_LENGTHS.includes(value as AnswerLength);
export const normalizeAnswerLength = (value: unknown): AnswerLength => isAnswerLength(value) ? value : DEFAULT_ANSWER_LENGTH;
const PROVIDER_SLOT = '__nativelyAnswerLengthProviderV1';
type Slot = typeof globalThis & { [PROVIDER_SLOT]?: () => unknown };
export function registerAnswerLengthProvider(provider: (() => unknown) | null): void { (globalThis as Slot)[PROVIDER_SLOT] = provider ?? undefined; }
export function getRegisteredAnswerLength(): AnswerLength {
  const provider = (globalThis as Slot)[PROVIDER_SLOT];
  try { return normalizeAnswerLength(provider?.()); } catch { return DEFAULT_ANSWER_LENGTH; }
}
export function effectiveAnswerLength(stored: unknown, proActive: boolean): AnswerLength {
  const length = normalizeAnswerLength(stored);
  return length === 'smart' || proActive ? length : 'smart';
}
export function profileAnswerWordCap(answerStyle: string | undefined, length: AnswerLength, registeredInstructionsSetLength = false, liveSurface = true): number | null {
  if (registeredInstructionsSetLength) return null;
  if (!liveSurface) length = 'smart';
  if (answerStyle === 'detailed') return length === 'longer' ? 200 : 180;
  return length === 'shorter' ? 50 : length === 'longer' ? 200 : 90;
}
