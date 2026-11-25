import type { LiveBrain, LiveBrainId } from './types';

export class LiveBrainNotImplementedError extends Error {
    constructor(readonly id: LiveBrainId) {
        super(`Live brain not implemented: ${id}`);
        this.name = 'LiveBrainNotImplementedError';
    }
}

export function createLiveBrain(id: LiveBrainId, _deps: unknown): LiveBrain {
    switch (id) {
        case 'gemini-live':
        case 'openai-realtime':
        case 'pipeline':
            throw new LiveBrainNotImplementedError(id);
        default: {
            const unsupported: never = id;
            throw new Error(`Unsupported live brain: ${String(unsupported)}`);
        }
    }
}
