import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { createRequire } from 'node:module';
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
async function probe({ apiKey, model, wav, mode, autoVad, decider, answerInstructions, bargeIn }) {
    const start = performance.now();
    let speechEnd;
    let firstText = false;
    let setupReady = false;
    let text = '';
    let audioBytesSent = 0;
    let bargeAt;
    let bargeStarted;
    let turn = 1;
    let firstChunkAt;
    let interrupted = false;
    const controller = new AbortController();
    const log = (event, detail) => console.log(JSON.stringify({
        mode,
        ...(decider ? { model, probe: 'decide' } : {}),
        ...(answerInstructions ? { model, probe: 'answer', turn, at: new Date().toISOString() } : {}),
        vad: autoVad ? 'auto' : 'manual',
        event,
        msSinceConnectStart: Math.round(performance.now() - start),
        ...(speechEnd !== undefined ? { msSinceSpeechEnd: Math.round(performance.now() - speechEnd) } : {}),
        ...detail,
    }).replaceAll(apiKey, '[redacted]').replaceAll(JSON.stringify(apiKey).slice(1, -1), '[redacted]'));
    const socket = new WebSocket(endpoint, {
        headers: { 'x-goog-api-key': apiKey },
        handshakeTimeout: 15_000,
    });
    const send = (message) => new Promise((resolve, reject) => {
        socket.send(JSON.stringify(message), (error) => error ? reject(error) : resolve());
    });
    const sendAudio = (data, sampleRate) => send({ realtimeInput: { audio: {
        data: data.toString('base64'),
        mimeType: `audio/pcm;rate=${sampleRate}`,
    } } });
    const streamWav = async (input, utterance) => {
        const audio = createReadStream(input.path, {
            start: input.start,
            end: input.start + input.length - 1,
            highWaterMark: Math.max(2, Math.round(input.sampleRate * 0.04) * 2),
            signal: controller.signal,
        });
        const audioStart = performance.now();
        let bytes = 0;
        for await (const chunk of audio) {
            audioBytesSent += chunk.length;
            bytes += chunk.length;
            await sendAudio(chunk, input.sampleRate);
            const nextChunkAt = audioStart + bytes / (input.sampleRate * 2) * 1000;
            await delay(Math.max(0, nextChunkAt - performance.now()), undefined, { signal: controller.signal });
        }
        speechEnd = performance.now();
        log('speech_end', answerInstructions ? { utterance } : undefined);
    };
    const streamSilence = async (sampleRate, chunks, stop = () => false) => {
        const silence = Buffer.alloc(Math.round(sampleRate * 0.1) * 2);
        for (let sent = 0; sent < chunks && !stop(); sent++) {
            await sendAudio(silence, sampleRate);
            await delay(100, undefined, { signal: controller.signal });
        }
    };
    const stream = async () => {
        if (!autoVad) await send({ realtimeInput: { activityStart: {} } });
        await streamWav(wav, 1);
        if (!autoVad) {
            await send({ realtimeInput: { activityEnd: {} } });
            return;
        }
        // Automatic VAD needs to hear the silence after the question, in real time.
        if (!bargeIn) return streamSilence(wav.sampleRate, 30);
        await streamSilence(wav.sampleRate, 120, () => bargeAt !== undefined && performance.now() >= bargeAt);
        if (bargeAt === undefined || interrupted || !firstChunkAt) return;
        bargeStarted = performance.now();
        log('barge_in_start', { msSinceFirstChunk: Math.round(bargeStarted - firstChunkAt) });
        speechEnd = undefined;
        await streamWav(bargeIn, 2);
        await streamSilence(bargeIn.sampleRate, 30);
    };

    let timeout;
    let observationTimeout;
    try {
        return await new Promise((resolve) => {
            let streamFinished = false;
            let validPostSpeechDecision = false;
            let pendingToolResponses = 0;
            const finishDecisionProbe = () => {
                if (controller.signal.aborted || !streamFinished || !validPostSpeechDecision || pendingToolResponses) return;
                log('done', { receivedDecision: true });
                controller.abort();
                resolve(true);
            };
            const fail = (event, detail) => {
                if (controller.signal.aborted) return;
                log(event, detail);
                controller.abort();
                resolve(false);
            };
            const durationMs = (input) => input.length / (input.sampleRate * 2) * 1000;
            timeout = setTimeout(() => fail('timeout'), (answerInstructions ? 120_000 : decider ? 25_000 : 45_000)
                + durationMs(wav) + (bargeIn ? durationMs(bargeIn) : 0));
            socket.on('error', () => fail('websocket_error'));
            socket.on('close', (code, reason) => fail('closed_before_done', {
                code,
                reason: String(reason ?? '').replaceAll(apiKey, '[redacted]').slice(0, 200),
                setupReady,
            }));
            socket.on('open', () => {
                void send({ setup: {
                    model: `models/${model}`,
                    generationConfig: { responseModalities: [mode] },
                    ...(autoVad ? {} : { realtimeInputConfig: { automaticActivityDetection: { disabled: true } } }),
                    ...(decider
                        ? {
                            inputAudioTranscription: {},
                            systemInstruction: { parts: [{ text: decider.instructions }] },
                            tools: [decider.tool],
                        }
                        : mode === 'AUDIO' ? { outputAudioTranscription: {} } : {}),
                    ...(answerInstructions ? {
                        inputAudioTranscription: {},
                        systemInstruction: { parts: [{ text: answerInstructions }] },
                    } : {}),
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
                    void stream().then(() => {
                        streamFinished = true;
                        if (decider) finishDecisionProbe();
                        if (answerInstructions && !firstChunkAt) {
                            observationTimeout = setTimeout(() => {
                                if (!firstChunkAt) fail('no_transcription_observed', { bargeInStarted: bargeStarted !== undefined });
                            }, Math.max(0, 12_000 - (performance.now() - speechEnd)));
                        }
                    }).catch(() => fail('audio_stream_error'));
                }
                if (decider) {
                    const calls = message.toolCall?.functionCalls;
                    if (!Array.isArray(calls) || calls.length === 0) return;
                    const functionResponses = calls.flatMap(({ id, name, args }) => {
                        const decision = name === decider.tool.functionDeclarations[0].name ? decider.parseArgs(args) : null;
                        log('tool_call', {
                            name, args, decision,
                            audioMsSent: Math.round(audioBytesSent / (wav.sampleRate * 2) * 1000),
                        });
                        if (!id || !name) return [];
                        if (decision && speechEnd !== undefined) validPostSpeechDecision = true;
                        return [{ id, name, response: decision ? { ok: true } : { error: 'Invalid decision' } }];
                    });
                    if (!functionResponses.length) return;
                    pendingToolResponses++;
                    void send({ toolResponse: { functionResponses } }).then(() => {
                        pendingToolResponses--;
                        finishDecisionProbe();
                    }).catch(() => fail('tool_response_send_error'));
                    return;
                }
                const content = message.serverContent;
                if (!content) return;
                if (answerInstructions) {
                    const input = content.inputTranscription;
                    if (input?.text !== undefined) log('input_transcription', { text: input.text, finished: input.finished });
                    const output = content.outputTranscription;
                    if (typeof output?.text === 'string') {
                        text += output.text;
                        log('output_transcription', { text: output.text, chars: output.text.length });
                        if (output.text.trim() && firstChunkAt === undefined) {
                            firstChunkAt = performance.now();
                            if (bargeIn && bargeStarted === undefined && speechEnd !== undefined) {
                                bargeAt = firstChunkAt + 300;
                            }
                        }
                    }
                    if (content.interrupted) {
                        interrupted = true;
                        log('interrupted', bargeStarted === undefined ? undefined : {
                            msSinceBargeInStart: Math.round(performance.now() - bargeStarted),
                        });
                    }
                    if (content.turnComplete) {
                        log('turn_complete', {
                            words: text.trim().split(/\s+/u).filter(Boolean).length,
                            wasInterrupted: interrupted,
                            interactionStatus: content.interactionStatus,
                        });
                        if (speechEnd !== undefined && firstChunkAt >= speechEnd && !interrupted
                            && content.interactionStatus !== 'IN_PROGRESS' && (!bargeIn || bargeStarted !== undefined)) {
                            controller.abort();
                            resolve(true);
                        }
                        turn++;
                        text = '';
                        firstChunkAt = undefined;
                        interrupted = false;
                        bargeAt = undefined;
                    }
                    return;
                }
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
        clearTimeout(observationTimeout);
        controller.abort();
        socket.terminate();
    }
}

function buildSpokenAnswerInstructions() {
    const require = createRequire(import.meta.url);
    const { UNIVERSAL_WHAT_TO_ANSWER_PROMPT, MODE_TECHNICAL_INTERVIEW_PROMPT } =
        require('../../dist-electron/electron/llm/prompts.js');
    return [
        'You are listening to a live technical interview. Audio is the interviewer. Text lines beginning “Candidate said:” are the candidate.',
        UNIVERSAL_WHAT_TO_ANSWER_PROMPT.trim(),
        MODE_TECHNICAL_INTERVIEW_PROMPT.trim(),
        `Live spoken output protocol. Speak only what the candidate should say next, without reading any formatting aloud.
For filler, small talk, or an unfinished interviewer question, say nothing or say exactly "No action."
For a clarification, start with "Ask:" and say only one short question. Ask only if the missing information materially changes the answer. Never repeat a clarification or ask for information already provided. If the interviewer moves on without clarifying, answer with a stated assumption.
Otherwise, speak the answer directly without a sentinel. The newest interviewer instruction overrides earlier requirements.
Follow this live spoken protocol if anything above conflicts with it.`,
        'Interview mode: Technical Interview',
    ].join('\n\n');
}

async function main() {
    const args = process.argv.slice(2);
    const decide = args.includes('--decide');
    const answer = args.includes('--answer');
    const autoVad = decide || answer || args.includes('--auto-vad');
    const bargeIndex = args.indexOf('--barge-in');
    const bargeFile = bargeIndex === -1 ? undefined : args.splice(bargeIndex, 2)[1];
    const [file, model = defaultModel, extra] = args.filter(arg => !['--auto-vad', '--decide', '--answer'].includes(arg));
    if (!file || extra || (decide && answer) || (bargeIndex !== -1 && (!answer || !bargeFile))
        || !/^[a-z0-9][a-z0-9.-]*$/.test(model)) {
        console.error('Usage: node scripts/spikes/gemini-live.mjs <mono 16-bit PCM WAV> [model-id] [--auto-vad | --decide | --answer [--barge-in <second WAV>]]');
        return 1;
    }
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
        console.error('Set GEMINI_API_KEY in the environment before running this spike.');
        return 1;
    }
    let wav, bargeIn;
    try {
        wav = await readWav(file);
        if (bargeFile) bargeIn = await readWav(bargeFile);
    } catch {
        console.error('Could not read the WAV. Use a readable, uncompressed mono 16-bit PCM RIFF/WAVE file.');
        return 1;
    }
    if (answer) {
        let answerInstructions;
        try { answerInstructions = buildSpokenAnswerInstructions(); } catch {
            console.error('Run npm run build:electron before using --answer.');
            return 1;
        }
        const completed = await probe({ apiKey, model, wav, mode: 'AUDIO', autoVad, answerInstructions, bargeIn });
        return completed ? 0 : 1;
    }
    if (decide) {
        const require = createRequire(import.meta.url);
        let instructions, tool, parseArgs;
        try {
            const dist = '../../dist-electron/premium/electron/liveBrain/';
            const { buildDeciderInstructions } = require(`${dist}instructions.js`);
            const { toGeminiDecideTurnTool, parseDecideTurnArgs } = require(`${dist}decideTurnTool.js`);
            instructions = buildDeciderInstructions({});
            tool = toGeminiDecideTurnTool();
            parseArgs = parseDecideTurnArgs;
        } catch {
            console.error('Run npm run build:electron before using --decide.');
            return 1;
        }
        const received = await probe({ apiKey, model, wav, mode: 'AUDIO', autoVad, decider: { instructions, tool, parseArgs } });
        return received ? 0 : 1;
    }
    let bothProducedText = true;
    for (const mode of ['TEXT', 'AUDIO']) {
        const receivedText = await probe({ apiKey, model, wav, mode, autoVad });
        bothProducedText &&= receivedText;
    }
    return bothProducedText ? 0 : 1;
}

// Unexpected exceptions can carry request details. Print a fixed error.
process.exitCode = await main().catch(() => {
    console.error('Gemini Live spike failed.');
    return 1;
});
