const DEFAULT_SCREENSHOT_REQUEST =
  'Analyze the current attached screenshot and answer the question or task shown in it.';

/**
 * Build the text/provenance portion of a Direct Assist What-to-Say request.
 *
 * The triggering interviewer speech is the authoritative request whenever it
 * exists and no screenshot is attached. A dynamic action describes how to
 * shape the answer; it must never replace that speech or relabel it as typed.
 * Screenshot turns answer the attached image. The rolling speech window can
 * belong to a previous turn and must not become authoritative current-turn speech.
 */
export function buildDirectWhatToSayPayload({
  interviewerRequest,
  dynamicPromptInstruction,
  hasScreenshots,
}) {
  const speech = typeof interviewerRequest === 'string' ? interviewerRequest.trim() : '';
  const instruction = typeof dynamicPromptInstruction === 'string'
    && dynamicPromptInstruction.trim().length > 0
    ? dynamicPromptInstruction
    : '';

  if (hasScreenshots) {
    return {
      source: 'screenshot',
      currentRequest: instruction || DEFAULT_SCREENSHOT_REQUEST,
      transcript: undefined,
    };
  }

  if (speech) {
    return {
      source: 'stt',
      currentRequest: instruction
        ? `${speech}\n\nANSWER/OUTPUT INSTRUCTION:\n${instruction}`
        : speech,
      transcript: undefined,
    };
  }

  return {
    source: 'typed',
    currentRequest: instruction || 'What should I say?',
    transcript: undefined,
  };
}

export function speechAfterCapture({ speech, captureRevisions, explicitCapture }) {
  if (explicitCapture || !speech || !captureRevisions.length) return undefined;
  return captureRevisions.every(revision => revision !== undefined && revision < speech.revision)
    ? speech.text : undefined;
}
