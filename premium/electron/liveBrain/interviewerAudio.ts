import { resampleToF32 } from '../../../electron/audio/whisper/audioResampler';

/** Normalize interleaved PCM16LE from the capture boundary to Gemini's wire format. */
export function toPcm16kMono(pcm: Buffer, sampleRate: number, channels: number): Buffer {
    if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isInteger(channels) || channels < 1) return Buffer.alloc(0);
    const frames = Math.floor(pcm.length / (channels * 2));
    let mono = pcm.subarray(0, frames * 2);
    if (channels > 1) {
        mono = Buffer.allocUnsafe(frames * 2);
        for (let frame = 0; frame < frames; frame++) {
            let sum = 0;
            for (let channel = 0; channel < channels; channel++) sum += pcm.readInt16LE((frame * channels + channel) * 2);
            mono.writeInt16LE(Math.round(sum / channels), frame * 2);
        }
    }
    if (sampleRate === 16_000) return mono;
    const samples = resampleToF32(mono, sampleRate);
    const output = Buffer.allocUnsafe(samples.length * 2);
    for (let i = 0; i < samples.length; i++) output.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32768))), i * 2);
    return output;
}
