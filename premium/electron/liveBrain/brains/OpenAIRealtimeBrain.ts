import { bearerRealtimeHeaders } from '../../../../electron/audio/realtimeTransport';
import { DEFAULT_OPENAI_REALTIME_MODEL } from '../../../../src/types/liveBrainSettings';
import { RealtimeBrain, type RealtimeBrainOptions } from './RealtimeBrain';

export class OpenAIRealtimeBrain extends RealtimeBrain {
    constructor(options: RealtimeBrainOptions) {
        super({
            id: 'openai-realtime',
            endpoint: 'wss://api.openai.com/v1/realtime',
            defaultModel: DEFAULT_OPENAI_REALTIME_MODEL,
            headers: bearerRealtimeHeaders,
            output: 'text',
            inputTranscriptionModel: 'whisper-1',
        }, options);
    }
}
