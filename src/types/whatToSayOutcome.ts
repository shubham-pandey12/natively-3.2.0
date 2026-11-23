/** Delivery and history must agree whether a What-to-Say run actually answered. */
export interface WhatToSayOutcome {
  status: 'success' | 'failed' | 'cancelled';
  retryable: boolean;
  reason?: string;
}

export interface WhatToSayOutcomeOut {
  value?: WhatToSayOutcome;
}

/** Main's answer to the start of a legacy Cmd/Ctrl+Enter press. */
export interface WhatToSayPressStart {
  /** Newest generation id minted before this press; anything at or below it is an older request. */
  generationFloor: number;
  /** Present when the renderer offered a held screenshot question. */
  source?:
    | { source: 'screenshot'; reason: 'no_newer_speech' | 'newer_speech_not_a_question' }
    | { source: 'speech'; question: string; partial: boolean }
    | { source: 'unidentified'; reason: 'partial_speech_unclear' };
}
