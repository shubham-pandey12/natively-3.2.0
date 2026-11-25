import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

const endpoint = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const defaultModel = 'gemini-3.8-live';

async function readWav(path) {
    const file = await open(path, 'r');
    try {
        const size = (await file.stat()).size;
        const read = async (length, offset) => {
            const buffer = Buffer.alloc(length);
            if ((await file.read(buffer, 0, length, offset)).bytesRead !== length) throw new Error('Truncated WAV header.');
            return buffer;
        };
        const header = await read(12, 0);
        if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE') {
            throw new Error('Expected a RIFF/WAVE file.');
        }
        const end = header.readUInt32LE(4) + 8;
        if (end > size) throw new Error('Truncated WAV file.');
        let sampleRate;
        let data;
        for (let offset = 12; offset + 8 <= end;) {
            const chunk = await read(8, offset);
            const length = chunk.readUInt32LE(4);
            const start = offset + 8;
            if (start + length > end) throw new Error('Truncated WAV chunk.');
            if (chunk.toString('ascii', 0, 4) === 'fmt ') {
                if (length < 16) throw new Error('Invalid WAV format chunk.');
                const format = await read(16, start);
                if (format.readUInt16LE(0) !== 1 || format.readUInt16LE(2) !== 1
                    || format.readUInt16LE(12) !== 2 || format.readUInt16LE(14) !== 16) {
                    throw new Error('Expected mono, signed 16-bit PCM WAV.');
                }
                sampleRate = format.readUInt32LE(4);
            } else if (chunk.toString('ascii', 0, 4) === 'data') {
                data = { start, length };
            }
            if (sampleRate && data) break;
            offset = start + length + (length % 2);
        }
        if (!sampleRate || !data?.length || data.length % 2 !== 0) {
            throw new Error('WAV must contain whole mono PCM samples.');
        }
        return { path, sampleRate, ...data };
    } finally {
        await file.close();
    }
}

// Google Live API WebSocket reference and manual VAD guide:
// https://aistudio.google.com/api-reference/live/bidi-generate-content
// https://aistudio.google.com/docs/live-api/capabilities#voice-activity-detection-vad
// autoVad: let Gemini's automatic activity detection decide the end of the turn
// (what the product does) instead of explicit activityStart/activityEnd. The
// measured time then includes Gemini's own end-of-turn wait.
async function probe({ apiKey, model, wav, mode, autoVad }) {
    const start = performance.now();
    let speechEnd;
    let firstText = false;
    let setupReady = false;
    let text = '';
    const controller = new AbortController();
    const log = (event, detail) => console.log(JSON.stringify({
        mode,
        vad: autoVad ? 'auto' : 'manual',
        event,
        msSinceConnectStart: Math.round(performance.now() - start),
        ...(speechEnd !== undefined ? { msSinceSpeechEnd: Math.round(performance.now() - speechEnd) } : {}),
        ...detail,
    }));
    const socket = new WebSocket(endpoint, {
        headers: { 'x-goog-api-key': apiKey },
        handshakeTimeout: 15_000,
    });
    const send = (message) => new Promise((resolve, reject) => {
        socket.send(JSON.stringify(message), (error) => error ? reject(error) : resolve());
    });
    const stream = async () => {
        if (!autoVad) await send({ realtimeInput: { activityStart: {} } });
        const audio = createReadStream(wav.path, {
            start: wav.start,
            end: wav.start + wav.length - 1,
            highWaterMark: Math.max(2, Math.round(wav.sampleRate * 0.04) * 2),
            signal: controller.signal,
        });
        const audioStart = performance.now();
        let bytesSent = 0;
        for await (const chunk of audio) {
            await send({ realtimeInput: { audio: {
                data: chunk.toString('base64'),
                mimeType: `audio/pcm;rate=${wav.sampleRate}`,
            } } });
            bytesSent += chunk.length;
            const nextChunkAt = audioStart + bytesSent / (wav.sampleRate * 2) * 1000;
            await delay(Math.max(0, nextChunkAt - performance.now()), undefined, { signal: controller.signal });
        }
        speechEnd = performance.now();
        log('speech_end');
        if (!autoVad) {
            await send({ realtimeInput: { activityEnd: {} } });
            return;
        }
        // Automatic VAD needs to hear the silence after the question, in real time.
        const silence = Buffer.alloc(Math.round(wav.sampleRate * 0.1) * 2).toString('base64');
        for (let sent = 0; sent < 30 && !controller.signal.aborted; sent++) {
            await send({ realtimeInput: { audio: { data: silence, mimeType: `audio/pcm;rate=${wav.sampleRate}` } } });
            await delay(100, undefined, { signal: controller.signal });
        }
    };

    let timeout;
    try {
        return await new Promise((resolve) => {
            const fail = (event, detail) => {
                if (controller.signal.aborted) return;
                log(event, detail);
                controller.abort();
                resolve(false);
            };
            timeout = setTimeout(() => fail('timeout'), 45_000 + wav.length / (wav.sampleRate * 2) * 1000);
            socket.on('error', () => fail('websocket_error'));
            // The close reason is Google's error text (e.g. invalid key, unknown model);
            // it never contains the key. Truncated so a long reason stays readable.
            socket.on('close', (code, reason) => fail('closed_before_done', { code, reason: String(reason ?? '').slice(0, 200), setupReady }));
            socket.on('open', () => {
                void send({ setup: {
                    model: `models/${model}`,
                    generationConfig: { responseModalities: [mode] },
                    ...(autoVad ? {} : { realtimeInputConfig: { automaticActivityDetection: { disabled: true } } }),
                    ...(mode === 'AUDIO' ? { outputAudioTranscription: {} } : {}),
                } }).catch(() => fail('setup_send_error'));
            });
            socket.on('message', (data) => {
                if (controller.signal.aborted) return;
                let message;
                try { message = JSON.parse(data.toString()); } catch { fail('invalid_server_message'); return; }
                if (message.error) {
                    const code = message.error.code;
                    fail('server_error', { code: typeof code === 'number' ? code : undefined, setupReady });
                    return;
                }
                if (!setupReady && message.setupComplete !== undefined) {
                    setupReady = true;
                    log('setup_ready');
                    void stream().catch(() => fail('audio_stream_error'));
                }
                const content = message.serverContent;
                if (!content) return;
                // Only inspect the chosen text signal. Audio parts are discarded.
                const delta = mode === 'AUDIO'
                    ? (content.outputTranscription?.text ?? '')
                    : (content.modelTurn?.parts ?? []).filter(part => !part.thought && part.text).map(part => part.text).join('');
                text += delta;
                const hasText = Boolean(delta.trim());
                if (hasText && !firstText) {
                    firstText = true;
                    log('first_text');
                }
                if (content.turnComplete && content.interactionStatus !== 'IN_PROGRESS') {
                    log('done', { receivedText: firstText, chars: text.length, text: text.trim().slice(0, 600) });
                    controller.abort();
                    resolve(firstText);
                }
            });
        });
    } finally {
        clearTimeout(timeout);
        controller.abort();
        socket.terminate();
    }
}

async function main() {
    const args = process.argv.slice(2);
    const autoVad = args.includes('--auto-vad');
    const [file, model = defaultModel, extra] = args.filter((arg) => arg !== '--auto-vad');
    if (!file || extra || !/^[a-z0-9][a-z0-9.-]*$/.test(model)) {
        console.error('Usage: node scripts/spikes/gemini-live.mjs <mono 16-bit PCM WAV> [model-id] [--auto-vad]');
        return 1;
    }
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
        console.error('Set GEMINI_API_KEY in the environment before running this spike.');
        return 1;
    }
    let wav;
    try { wav = await readWav(file); } catch {
        console.error('Could not read the WAV. Use a readable, uncompressed mono 16-bit PCM RIFF/WAVE file.');
        return 1;
    }
    let bothProducedText = true;
    for (const mode of ['TEXT', 'AUDIO']) {
        const receivedText = await probe({ apiKey, model, wav, mode, autoVad });
        bothProducedText &&= receivedText;
    }
    return bothProducedText ? 0 : 1;
}

// Avoid printing SDK/network errors, server close reasons, or credentials.
process.exitCode = await main().catch(() => {
    console.error('Gemini Live spike failed.');
    return 1;
});
