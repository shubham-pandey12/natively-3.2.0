import { DEFAULT_ELEVENLABS_REALTIME_MODEL } from '../../../../src/types/liveBrainSettings';
import { RealtimeBrain, type RealtimeBrainOptions } from './RealtimeBrain';

export class ElevenLabsRealtimeBrain extends RealtimeBrain {
    constructor(options: RealtimeBrainOptions) {
        super({
            id: 'elevenlabs-realtime',
            endpoint: 'wss://api.elevenlabs.io/v1/convai/realtime',
            defaultModel: DEFAULT_ELEVENLABS_REALTIME_MODEL,
            headers: key => ({ 'xi-api-key': key }),
            output: 'audio',
            voice: 'brian',
            updateOnOpen: true,
        }, options);
    }
}
