import type { LiveBrain, LiveBrainId } from './types';
import { GeminiLiveBrain, type GeminiLiveOptions } from './brains/GeminiLiveBrain';

export class LiveBrainNotImplementedError extends Error {
    constructor(readonly id: LiveBrainId) {
        super(`Live brain not implemented: ${id}`);
        this.name = 'LiveBrainNotImplementedError';
    }
}

export function createLiveBrain(id: LiveBrainId | 'gemini', deps: GeminiLiveOptions): LiveBrain {
    switch (id) {
        case 'gemini':
        case 'gemini-live':
            return new GeminiLiveBrain(deps);
        case 'openai-realtime':
        case 'elevenlabs-realtime':
        case 'pipeline':
            throw new LiveBrainNotImplementedError(id);
        default: {
            const unsupported: never = id;
            throw new Error(`Unsupported live brain: ${String(unsupported)}`);
        }
    }
}
