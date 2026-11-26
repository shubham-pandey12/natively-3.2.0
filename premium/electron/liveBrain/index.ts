import type { LiveBrain, LiveBrainId } from './types';
import { GeminiLiveBrain, type GeminiLiveOptions } from './brains/GeminiLiveBrain';
import { PipelineBrain } from './brains/PipelineBrain';
import { OpenAIRealtimeBrain } from './brains/OpenAIRealtimeBrain';
import { ElevenLabsRealtimeBrain } from './brains/ElevenLabsRealtimeBrain';
import { DeepgramVoiceAgentBrain, type DeepgramVoiceAgentOptions } from './brains/DeepgramVoiceAgentBrain';
import { DeepgramFluxBrain, type DeepgramFluxOptions } from './brains/DeepgramFluxBrain';

export function createLiveBrain(
    id: LiveBrainId | 'gemini',
    deps: GeminiLiveOptions & DeepgramVoiceAgentOptions & DeepgramFluxOptions & { cancelPipeline?: () => void },
): LiveBrain {
    switch (id) {
        case 'gemini':
        case 'gemini-live':
            return new GeminiLiveBrain(deps);
        case 'openai-realtime':
            return new OpenAIRealtimeBrain(deps);
        case 'elevenlabs-realtime':
            return new ElevenLabsRealtimeBrain(deps);
        case 'deepgram-voice-agent':
            return new DeepgramVoiceAgentBrain(deps);
        case 'deepgram-flux':
            return new DeepgramFluxBrain(deps);
        case 'pipeline':
            return new PipelineBrain(deps.cancelPipeline ?? (() => {}));
        default: {
            const unsupported: never = id;
            throw new Error(`Unsupported live brain: ${String(unsupported)}`);
        }
    }
}
