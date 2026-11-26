import type WebSocket from 'ws';
import { streamingStttWsOptions } from './dnsHelpers';

export const WS_SAMPLE_RATE = 24_000;

export function bearerRealtimeHeaders(apiKey: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
}

export function realtimeSocketOptions(headers: Record<string, string>): WebSocket.ClientOptions {
    return streamingStttWsOptions({ headers }) as WebSocket.ClientOptions;
}

export function realtimeReconnectDelay(attempt: number): number {
    return Math.min(1_000 * Math.pow(2, attempt), 30_000);
}

/**
 * WebSocket audio batching: 24 kHz samples per append (100 ms). It was 250 ms,
 * which held every chunk back by up to a quarter second — and during the native
 * keepalive cadence (20 ms of audio per 100 ms) took ~1.25 s to fill, delaying
 * the very silence the server VAD waits for. Ten appends a second is well
 * inside what the Realtime API takes.
 */
export const SEND_THRESHOLD_SAMPLES = 2400;

/**
 * The terminal error for a refused realtime handshake, or null when the
 * refusal may pass (5xx, a plain 429 rate limit): those keep the normal
 * retry and model fallback. 401 bad key, 403 region or project access, and a
 * 429 whose body says insufficient_quota (no credits) are final for every
 * model and for the REST fallback, which use the same key.
 */
export function openAiHandshakeVerdict(status: number, body: string): Error | null {
    let message = '';
    let type = '';
    try {
        const parsed = JSON.parse(body);
        message = String(parsed?.error?.message ?? '').trim();
        type = String(parsed?.error?.code || parsed?.error?.type || '').trim();
    } catch {
        message = body.trim().slice(0, 200);
    }
    const outOfCredits = /insufficient_quota|credit_balance_exhausted/i.test(`${type} ${body}`);
    if (status === 429 && outOfCredits) {
        return Object.assign(new Error(`insufficient_quota: ${message || 'OpenAI account has no credits left'}`), {
            code: 'insufficient_quota', httpStatus: 429, terminal: true,
        });
    }
    if (status !== 401 && status !== 403) return null;
    const what = status === 401 ? 'OpenAI rejected the API key (invalid API key)' : 'OpenAI refused access';
    return Object.assign(new Error(message ? `${what}: ${message}` : what), {
        code: type || `openai_${status}`, httpStatus: status, terminal: true,
    });
}

/**
 * Convert raw PCM buffer from the capture pipeline into 16-bit PCM at the given target rate.
 * The pipeline outputs Int16LE PCM, potentially at a higher sample rate (e.g. 48kHz).
 */
export function resampleRealtimePcm16(chunk: Buffer, inputSampleRate: number, numChannels: number, targetRate: number): Buffer {
    // Safe read from unaligned memory
    const numSamples = chunk.length / 2;
    const inputS16 = new Int16Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        inputS16[i] = chunk.readInt16LE(i * 2);
    }

    if (inputSampleRate === targetRate && numChannels === 1) {
        return Buffer.from(inputS16.buffer);
    }

    // Mix down multi-channel to mono first, then downsample
    let monoS16: Int16Array;
    if (numChannels > 1) {
        const monoLength = Math.floor(inputS16.length / numChannels);
        monoS16 = new Int16Array(monoLength);
        for (let i = 0; i < monoLength; i++) {
            let sum = 0;
            for (let c = 0; c < numChannels; c++) {
                sum += inputS16[i * numChannels + c];
            }
            monoS16[i] = Math.round(sum / numChannels);
        }
    } else {
        monoS16 = inputS16;
    }

    // Downsample
    if (inputSampleRate === targetRate) {
        return Buffer.from(monoS16.buffer);
    }

    // Linear interpolation, as audioResampler.ts does for local Whisper.
    // The native capture delivers 16 kHz, so for the 24 kHz socket this
    // UPSAMPLES: taking the nearest sample repeated every third one, which
    // left distortion only 10-13 dB below speech at 2-3 kHz (22-29 dB now).
    // Whole-number ratios (48 → 24 kHz, 48 → 16 kHz) land on frac 0 and
    // come out exactly as before. Output length is unchanged.
    const factor       = inputSampleRate / targetRate;
    const outputLength = Math.floor(monoS16.length / factor);
    const outputS16    = new Int16Array(outputLength);
    const lastIndex    = monoS16.length - 1;
    for (let i = 0; i < outputLength; i++) {
        const pos  = i * factor;
        const k    = Math.floor(pos);
        const a    = monoS16[k];
        const b    = monoS16[Math.min(k + 1, lastIndex)];
        outputS16[i] = Math.round(a + (b - a) * (pos - k));
    }
    return Buffer.from(outputS16.buffer);
}
