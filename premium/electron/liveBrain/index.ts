import type { LiveBrain, LiveBrainId } from './types';
import { GeminiLiveBrain, type GeminiLiveOptions } from './brains/GeminiLiveBrain';
import { PipelineBrain } from './brains/PipelineBrain';

export class LiveBrainNotImplementedError extends Error {
    constructor(readonly id: LiveBrainId) {
        super(`Live brain not implemented: ${id}`);
        this.name = 'LiveBrainNotImplementedError';
    }
}

export function createLiveBrain(id: LiveBrainId | 'gemini', deps: GeminiLiveOptions & { cancelPipeline?: () => void }): LiveBrain {
    switch (id) {
        case 'gemini':
        case 'gemini-live':
            return new GeminiLiveBrain(deps);
        case 'openai-realtime':
        case 'elevenlabs-realtime':
            throw new LiveBrainNotImplementedError(id);
        case 'pipeline':
            return new PipelineBrain(deps.cancelPipeline ?? (() => {}));
        default: {
            const unsupported: never = id;
            throw new Error(`Unsupported live brain: ${String(unsupported)}`);
        }
    }
}
