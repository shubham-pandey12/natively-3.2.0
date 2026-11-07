/** Delivery and history must agree whether a What-to-Say run actually answered. */
export interface WhatToSayOutcome {
  status: 'success' | 'failed' | 'cancelled';
  retryable: boolean;
  reason?: string;
}

export interface WhatToSayOutcomeOut {
  value?: WhatToSayOutcome;
}
