/** A visible answer can be delivered even when it is incomplete and excluded from history. */
export interface WhatToSayOutcome {
  status: 'success' | 'failed' | 'cancelled';
  retryable: boolean;
  reason?: string;
  delivered?: boolean;
}

export interface WhatToSayOutcomeOut {
  value?: WhatToSayOutcome;
}

/** Main's answer to the start of a legacy Cmd/Ctrl+Enter press. */
export interface WhatToSayPressStart {
  /** Newest generation id minted before this press; anything at or below it is an older request. */
  generationFloor: number;
  /** The legacy spoken-only press can defer to Auto Answer in this meeting. */
  canJoinAutomatic?: boolean;
  /** An existing automatic row a spoken-only press can join. */
  joinableAutomaticGenerationId?: number;
  /** Present when the renderer offered a held screenshot question. */
  source?:
    | { source: 'screenshot'; reason: 'no_newer_speech' | 'newer_speech_not_a_question' }
    | { source: 'speech'; question: string; partial: boolean }
    | { source: 'unidentified'; reason: 'partial_speech_unclear' };
}
