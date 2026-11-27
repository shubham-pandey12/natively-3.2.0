export function computeSentenceBoundaryWaitMs(chunks) {
  let waitMs = 0;
  let joined = '';
  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) waitMs += chunk.delayMs;
    joined += chunk.text;
    // Wait for whitespace or end of input. A chunk can end mid-number.
    if (/[.!?]\s/.test(joined)) break;
  }
  return waitMs;
}
