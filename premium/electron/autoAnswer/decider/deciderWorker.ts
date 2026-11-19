/**
 * Worker thread for the local Auto Answer decider (campaign Phase 4.2). Follows routerWorker.ts:
 * onnxruntime-node and transformers.js load inside this thread, never on the main process; the
 * host stops it cooperatively with a 'shutdown' message (onnxWorkerShutdown.ts), never terminate().
 *
 * Messages in:
 *   { type: 'init',   requestId, modelDir, eps: DeciderEp[], threads }
 *   { type: 'decide', requestId, modelDir, eps, threads, req: JudgeRequest }
 *   { type: 'shutdown' }
 * Messages out:
 *   { type: 'status', status: LocalWorkerStatus, ep? }
 *   { type: 'ready' | 'result' | 'error', requestId, ... }
 *
 * The request carries transcript text, in process memory only. Nothing here logs or writes it
 * (campaign rule 1); errors carry messages from the runtime, never the request.
 */
import { parentPort as threadPort } from 'worker_threads';
import path from 'path';
import { getBoundedOnnxSessionOptions } from '../../../../electron/utils/onnxThreadConfig';
import { classifyWorkerFailure } from '../../../../electron/utils/workerStatus';
import { parseDeciderManifest, type DeciderManifest } from './deciderManifest';
import {
    prepareDecider, decideRequest, prepareStudent, decideStudentRequest,
    type PreparedDecider, type PreparedStudent, type StudentInput,
} from './deciderPipeline';
import { ortModuleFor, type DeciderRuntimeId } from './deciderRuntime';
import { adaptTokenizer, specialTokensFromConfig } from './layaTokenizer';
import { ortExecutionProviders, type DeciderEp } from './deciderPlatform';
import type { LayaOnnxBatch } from './layaSequence';

/** Electron's utility-process port (deciderUtilityHost); undefined in a worker thread. */
const utilityPort: any = (process as any).parentPort;

interface Host {
    postMessage(m: unknown): void;
    onMessage(fn: (msg: any) => void): void;
}

/** One message surface for both hosts: a worker thread (q4, ort 1.22) or a utility process (int8, ort 1.24). */
const host: Host | null = threadPort
    ? { postMessage: (m) => threadPort!.postMessage(m), onMessage: (fn) => { threadPort!.on('message', fn); } }
    : utilityPort
        ? { postMessage: (m) => utilityPort.postMessage(m), onMessage: (fn) => utilityPort.on('message', (ev: any) => fn(ev?.data)) }
        : null;
if (!host) throw new Error('deciderWorker must run as a worker thread or an Electron utility process');
const inUtilityProcess = !threadPort;
const parentPort: Host = host;

let session: any = null;
let ortMod: any = null;
let prepared: PreparedDecider | null = null;
let student: PreparedStudent | null = null;
let manifest: DeciderManifest | null = null;
let loadingPromise: Promise<void> | null = null;

async function loadTransformers(): Promise<any> {
    return (new Function('return import("@huggingface/transformers")')()) as any;
}
async function loadOrt(runtime: DeciderRuntimeId): Promise<any> {
    const mod = ortModuleFor(runtime);
    if (mod === 'onnxruntime-node-decider') {
        // 1.24 must never share a process with the app's own 1.22 binding.
        if (!inUtilityProcess) throw new Error('decider: onnxruntime 1.24 only loads in the decider utility process');
        return (new Function('return import("onnxruntime-node-decider")')()) as any;
    }
    return (new Function('return import("onnxruntime-node")')()) as any;
}

async function ensureLoaded(msg: any): Promise<void> {
    if (session) return;
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
        const fs = await import('fs');
        const dir: string = msg.modelDir;
        manifest = parseDeciderManifest(JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')));
        const tdir = path.join(dir, manifest.tokenizerDir);
        const tokJson = JSON.parse(fs.readFileSync(path.join(tdir, 'tokenizer.json'), 'utf8'));
        const tokCfg = JSON.parse(fs.readFileSync(path.join(tdir, 'tokenizer_config.json'), 'utf8'));
        ortMod = await loadOrt(manifest.runtime);
        const T = await loadTransformers();
        const tok = adaptTokenizer(new T.PreTrainedTokenizer(tokJson, tokCfg), specialTokensFromConfig(tokCfg));
        if (manifest.kind === 'seq-cls') {
            student = prepareStudent(tok, { maxLen: manifest.config.maxLen, stateRoom: manifest.stateRoom, labels: manifest.labels });
        } else {
            prepared = prepareDecider(tok, manifest.config);
        }
        // The WHOLE bounds object (executionMode, memory arena) as routerWorker does, with the
        // decider's own thread count: Laya-large at the app's MiniLM default of 1 thread is
        // several times slower (deciderPlatform.ts).
        const bounds = { ...getBoundedOnnxSessionOptions(), intraOpNumThreads: msg.threads };
        const eps: DeciderEp[] = Array.isArray(msg.eps) && msg.eps.length ? msg.eps : ['cpu'];
        const graph = path.join(dir, manifest.graph);
        let lastErr: unknown = null;
        // An accelerator that fails to initialise falls back to the rest of the list; CPU is last.
        for (let i = 0; i < eps.length && !session; i++) {
            try {
                session = await ortMod.InferenceSession.create(graph, { ...bounds, executionProviders: ortExecutionProviders(eps.slice(i)) });
                parentPort.postMessage({ type: 'status', status: { type: 'ready', backend: 'onnx', modelPath: dir }, ep: eps[i] });
            } catch (e) { lastErr = e; }
        }
        if (!session) throw lastErr ?? new Error('decider session not created');
    })();
    try {
        await loadingPromise;
    } catch (e) {
        loadingPromise = null; session = null; prepared = null; student = null; manifest = null;
        const f = classifyWorkerFailure(e);
        parentPort.postMessage({
            type: 'status',
            status: { type: f.recoverable ? 'degraded' : 'failed', backend: 'none', reason: f.reason, message: f.message, recoverable: f.recoverable },
        });
        throw e;
    }
}

async function run(b: LayaOnnxBatch): Promise<ArrayLike<number>> {
    const T = ortMod.Tensor;
    const out = await session.run({
        input_ids: new T('int64', b.inputIds, [b.n, b.length]),
        attention_mask: new T('int64', b.attentionMask, [b.n, b.length]),
        marker_pos: new T('int64', b.markerPos, [b.n, b.markerCols]),
        marker_mask: new T('bool', b.markerMask, [b.n, b.markerCols]),
        qtype: new T('int64', b.qtype, [b.n]),
    });
    const logits = out.logits;
    if (!logits) throw new Error(`decider graph has no 'logits' output; outputs were [${Object.keys(out).join(', ')}]`);
    return Array.from(logits.data as ArrayLike<number>).slice(0, b.markerCols);
}

async function runStudent(x: StudentInput): Promise<ArrayLike<number>> {
    const T = ortMod.Tensor;
    const out = await session.run({
        input_ids: new T('int64', x.inputIds, [1, x.length]),
        attention_mask: new T('int64', x.attentionMask, [1, x.length]),
    });
    const logits = out.logits;
    if (!logits) throw new Error(`decider graph has no 'logits' output; outputs were [${Object.keys(out).join(', ')}]`);
    return Array.from(logits.data as ArrayLike<number>);
}

parentPort.onMessage(async (msg: any) => {
    if (msg?.type === 'shutdown') {
        // Cooperative stop (onnxWorkerShutdown.ts): a message arrives only when this thread is
        // idle, so no native call is in flight.
        process.exit(0);
    }
    try {
        if (msg.type === 'init') {
            await ensureLoaded(msg);
            parentPort.postMessage({ type: 'ready', requestId: msg.requestId, thresholds: manifest!.thresholds, modelVersion: manifest!.version });
            return;
        }
        if (msg.type === 'decide') {
            await ensureLoaded(msg);
            const t0 = Date.now();
            const decision = student ? await decideStudentRequest(student, msg.req, runStudent) : await decideRequest(prepared!, msg.req, run);
            parentPort.postMessage({ type: 'result', requestId: msg.requestId, result: { ...decision, ms: Date.now() - t0 } });
            return;
        }
    } catch (e) {
        parentPort.postMessage({ type: 'error', requestId: msg?.requestId, error: e instanceof Error ? e.message : String(e) });
    }
});

// The utility host queues messages until this arrives (deciderUtilityHost).
parentPort.postMessage({ type: 'hello' });
