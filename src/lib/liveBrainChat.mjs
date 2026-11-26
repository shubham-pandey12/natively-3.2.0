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
 * Adds or updates the interviewer row for `question`. When the question is
 * linked to an answer that is already on screen (a transcript that arrived
 * after its answer started), the row is moved directly above that answer.
 * Returns `messages` itself when nothing changes.
 */
export function placeLiveBrainQuestion(messages, question) {
  const id = liveBrainQuestionRowId(question.questionId);
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
  const answerIndex = next.findIndex((message) => message.id === liveBrainAnswerRowId(question.generationId));
  const rowIndex = next.findIndex((message) => message.id === id);
  if (answerIndex < 0 || rowIndex < answerIndex) return next;
  const row = next[rowIndex];
  const without = next.filter((_, i) => i !== rowIndex);
  return [...without.slice(0, answerIndex), row, ...without.slice(answerIndex)];
}
