// electron/llm/responseCleanup.ts
//
// Shared plain-English response cleanup entry point across Auto Answer, text
// replies, and Live Brain. Pure, deterministic, platform-independent (no Electron
// imports), and control-message / code / math / fact preserving.

import type { AnswerType } from './AnswerPlanner';
import {
  humanizeSpokenAnswer,
  shouldHumanizeOutput,
  type HumanizeSpokenAnswerOptions,
} from './humanLikeness';

export type ResponseCleanupMode = 'spoken' | 'text';

export interface ResponseCleanupInput {
  text: string;
  mode: ResponseCleanupMode;
  answerType?: AnswerType;
  speaker?: HumanizeSpokenAnswerOptions['speaker'];
}

export interface ResponseCleanupResult {
  text: string;
  changed: boolean;
}

const CONTROL_MESSAGE_RE = /^(?:ask\s*:|\[\[ask\]\]|\[\[no_action\]\]|no\s+action\.?$)/i;

/**
 * Shared rule-based plain-English cleanup for spoken and written responses.
 * Preserves control messages (`Ask:`, `No action.`, bracket sentinels),
 * code/formulas/numeric ranges, and structured answer types.
 */
export function cleanupResponse(input: ResponseCleanupInput): ResponseCleanupResult {
  const { text, mode, answerType, speaker } = input;
  if (!text || typeof text !== 'string') {
    return { text, changed: false };
  }
  const trimmed = text.trim();
  if (!trimmed || CONTROL_MESSAGE_RE.test(trimmed)) {
    return { text, changed: false };
  }
  if (answerType !== undefined && !shouldHumanizeOutput(answerType)) {
    return { text, changed: false };
  }

  const out = humanizeSpokenAnswer(text, {
    mode,
    ...(answerType !== undefined ? { answerType } : {}),
    ...(speaker !== undefined ? { speaker } : {}),
  });
  return { text: out, changed: out !== text };
}
