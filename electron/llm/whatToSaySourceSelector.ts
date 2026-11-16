// Cmd/Ctrl+Enter "What should I say?" — which question is the newest one?
//
// A screenshot question (n) stays answerable after its press, whether that
// press failed or succeeded. A later bare press must answer it again unless
// the interviewer has since asked something new (n+1), possibly still only as
// a partial transcript. Unrelated audio — the candidate's own "umm", the
// interviewer's "take your time" — must not displace the screenshot.
//
// The decision is made here, in main, because main owns the transcript, the
// current partial and the question extractor. It reuses the extractor's own
// confidence (its 0.6 grounding gate) per turn instead of a second classifier.
// It is platform-independent: no OS integration is involved.

import { extractLatestQuestion } from './transcriptQuestionExtractor';
import type { TranscriptTurn } from './transcriptCleaner';
import { resolvePressInterimInjection, INTERIM_STALE_MS } from './interimInjectionGuard';
import { SOCIAL_PLEASANTRY, WAIT_IDIOM } from './questionShapes';

/** The extractor's grounding gate: at or above it, a turn is a real question. */
export const SPEECH_QUESTION_CONFIDENCE = 0.6;
/** The extractor's answerability floor: at or below it, a turn has no question shape. */
const NO_QUESTION_SHAPE_CONFIDENCE = 0.3;
/** Fewer words than this is an aside ("take your time"), not a new topic. */
const MIN_UNCLEAR_WORDS = 4;
/** A partial ending on a connective or function word stops mid-clause. */
const MID_CLAUSE_END = /\b(?:and|or|but|so|because|the|a|an|about|to|of|with|for|in|on|at|from|is|are|was|were|how|what|which|why|when|where|your|you|if|that|this)$/i;

export interface SourceSelectionItem {
  role: 'interviewer' | 'user' | 'assistant';
  text: string;
  timestamp: number;
  punctuationSource?: TranscriptTurn['punctuationSource'];
}

export interface SourceSelectionInput {
  /** When the screenshot question was first asked (its first press). */
  askedAt: number;
  /** The session context window, oldest -> newest (finals and answers). */
  contextItems: ReadonlyArray<SourceSelectionItem>;
  /** The interviewer's current un-finalized partial, if any. */
  interim: { text: string; timestamp: number; punctuationSource?: TranscriptTurn['punctuationSource'] } | null;
  now: number;
}

export type WhatToSaySourceDecision =
  | { source: 'screenshot'; reason: 'no_newer_speech' | 'newer_speech_not_a_question' }
  | { source: 'speech'; question: string; partial: boolean }
  | { source: 'unidentified'; reason: 'partial_speech_unclear' };

const scoreTurn = (turn: TranscriptTurn) => extractLatestQuestion([turn], 1);

export function selectWhatToSaySource(input: SourceSelectionInput): WhatToSaySourceDecision {
  const items = input.contextItems;
  const newer: Array<TranscriptTurn & { partial: boolean }> = items
    .filter((item) => item.role === 'interviewer' && item.timestamp > input.askedAt && item.text.trim())
    .map((item) => ({ role: 'interviewer', text: item.text, timestamp: item.timestamp, punctuationSource: item.punctuationSource, partial: false }));

  const interim = input.interim;
  if (interim && interim.text.trim() && interim.timestamp > input.askedAt) {
    const verdict = resolvePressInterimInjection({
      interim,
      recentInterviewerFinals: items.filter((item) => item.role === 'interviewer'),
      lastContextItem: items[items.length - 1] ?? null,
      now: input.now,
    });
    if (verdict.action === 'inject') {
      newer.push({ role: 'interviewer', text: verdict.text, timestamp: interim.timestamp, punctuationSource: interim.punctuationSource, partial: true });
    }
  }

  if (newer.length === 0) return { source: 'screenshot', reason: 'no_newer_speech' };

  // Newest first: the newest real question wins. A filler line said after it
  // ("take your time") does not hide it.
  for (let i = newer.length - 1; i >= 0; i--) {
    const scored = scoreTurn(newer[i]);
    if (scored.latestQuestion && scored.confidence >= SPEECH_QUESTION_CONFIDENCE) {
      // The question the press answers, locked here: the whole utterance that
      // ends on this turn, as a normal spoken press would take it, but not
      // the filler said after it ("... Take your time.").
      const joined = extractLatestQuestion(newer.slice(0, i + 1), undefined, { joinUtterance: true });
      const question = joined.latestQuestion && joined.confidence >= SPEECH_QUESTION_CONFIDENCE
        && joined.latestQuestion.includes(scored.latestQuestion)
        ? joined.latestQuestion : scored.latestQuestion;
      return { source: 'speech', question, partial: newer[i].partial };
    }
  }

  // The interviewer is still mid-sentence on something new: the live partial
  // either has some question shape below the gate, or visibly stops mid-clause
  // ("...about the cache layer and"). Answering the screenshot could answer an
  // outdated question; answering the fragment could answer nothing. Say so —
  // the next press, once the sentence ends, resolves it. Short asides and
  // wait/pleasantry idioms ("take your time", "give me a sec") never qualify.
  const newest = newer[newer.length - 1];
  if (newest.partial && interim && input.now - interim.timestamp <= INTERIM_STALE_MS) {
    const text = newest.text.trim();
    const scored = scoreTurn(newest);
    const weakShape = Boolean(scored.latestQuestion) && scored.confidence > NO_QUESTION_SHAPE_CONFIDENCE;
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words >= MIN_UNCLEAR_WORDS && !WAIT_IDIOM.test(text) && !SOCIAL_PLEASANTRY.test(text)
      && (weakShape || MID_CLAUSE_END.test(text))) {
      return { source: 'unidentified', reason: 'partial_speech_unclear' };
    }
  }
  return { source: 'screenshot', reason: 'newer_speech_not_a_question' };
}
