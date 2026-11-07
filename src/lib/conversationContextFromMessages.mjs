/** Displayed failures and incomplete streams are not completed assistant replies. */
export function conversationContextFromMessages(items) {
  return items
    .filter(m => !m.failure && !m.isStreaming && !m.hint
      && (!m.answerOutcome || m.answerOutcome === 'success')
      && !['stopped', 'superseded', 'noneYet'].includes(m.note?.kind)
      && !(m.role === 'user' && (m.hasScreenshot || m.isQuickActionLabel)))
    .map(m => `${m.role === 'interviewer' ? 'Interviewer' : m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`)
    .slice(-20).join('\n');
}
