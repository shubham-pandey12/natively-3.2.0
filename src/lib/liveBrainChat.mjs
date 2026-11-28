// src/lib/liveBrainChat.mjs
//
// D14 (2026-11-26): Live Brain shows the overlay as a chat. The interviewer's
// words stream into an interviewer row, and the answer appears directly below
// it. Pure; no DOM, no platform branches.

/** Row id of a Live Brain answer (matches NativelyInterface). */
export const liveBrainAnswerRowId = (generationId) => `live-brain-text-${generationId}`;
/** Row id of a Live Brain interviewer bubble. */
export const liveBrainQuestionRowId = (questionId) => `live-brain-q-${questionId}`;

/**
 * D21: a discard that keeps the streamed partial on screen, sealed, instead of
 * deleting the row. A correction and a Live Brain writer cut off by the
 * interviewer both keep it, so the replacement answer can reuse that row, and a
 * turn that needs no answer leaves the partial visible rather than nothing.
 */
export const keepsPartialOnDiscard = (reason) =>
  reason === 'answer_corrected' || reason === 'interviewer_interrupted';

/**
 * Adds or updates the interviewer row for `question`. When the question is
 * linked to an answer that is already on screen (a transcript that arrived
 * after its answer started), the row is moved directly above that answer.
 * Returns `messages` itself when nothing changes.
 */
export function placeLiveBrainQuestion(messages, question) {
  const id = liveBrainQuestionRowId(question.questionId);
  if (question.discard) return messages.filter((message) => message.id !== id);
  const patch = { text: question.text, isStreaming: !question.done };
  const index = messages.findIndex((message) => message.id === id);
  let next;
  if (index >= 0) {
    const existing = messages[index];
    next = existing.text === patch.text && Boolean(existing.isStreaming) === patch.isStreaming
      ? messages
      : messages.map((message, i) => (i === index ? { ...message, ...patch } : message));
  } else {
    next = [...messages, { id, role: 'interviewer', ...patch }];
  }
  if (question.generationId === undefined) return next;
  const answerIndex = next.findIndex((message) => message.id === liveBrainAnswerRowId(question.generationId)
    || message.whatToAnswerGeneration === question.generationId);
  const rowIndex = next.findIndex((message) => message.id === id);
  if (answerIndex < 0 || rowIndex < answerIndex) return next;
  const row = next[rowIndex];
  const without = next.filter((_, i) => i !== rowIndex);
  return [...without.slice(0, answerIndex), row, ...without.slice(answerIndex)];
}

/** Rebind the display slot. The generation still identifies each independent stream. */
export function replaceLiveBrainAnswer(messages, generationId, replacement) {
  const { previousGenerationId, previousAskId, askId, writer, pipelineQuestion, restore } = replacement;
  const old = messages.find(message => message.whatToAnswerGeneration === previousGenerationId
    || (previousAskId && (message.liveBrainAskId === previousAskId || message.id === `live-brain-ask-${previousAskId}`)));
  if (!old) return messages;
  const previousQuestionId = `interviewer-answer-${previousGenerationId}`;
  const nextQuestionId = `interviewer-answer-${generationId}`;
  const oldQuestion = messages.find(message => message.id === previousQuestionId);
  return messages.flatMap(message => {
    if (pipelineQuestion && oldQuestion && message.id === nextQuestionId) return [];
    if (pipelineQuestion && message === oldQuestion) {
      return [{ ...message, text: `${message.text} ${pipelineQuestion}`, answerPending: false }];
    }
    if (message !== old) return [message];
    if (restore) {
      const backup = message.liveBrainReplacementBackup;
      return backup ? [{ ...backup, whatToAnswerGeneration: generationId }] : [message];
    }
    return [{
      ...message, text: '', isStreaming: true, whatToAnswerGeneration: generationId,
      kind: askId ? 'ask' : undefined, liveBrainAskId: askId, liveBrainText: !writer,
      updated: true, outdated: false, interviewerSpeaking: false, failure: undefined,
      liveBrainReplacementBackup: writer ? undefined : { ...message, liveBrainReplacementBackup: undefined },
    }];
  });
}
