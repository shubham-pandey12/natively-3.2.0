/**
 * The decider model directory's manifest.json (campaign Phase 3.5). PURE: parse and validate only;
 * the download and sha256 verification belong to Phase 6.
 *
 *   <modelDir>/manifest.json
 *   <modelDir>/<graph>                        e.g. laya.int8.onnx
 *   <modelDir>/tokenizer/tokenizer.json, tokenizer_config.json
 *
 * Written by the export step from the fine-tuned checkpoint: its temperatures, and the per-label
 * thresholds fitted on calib (decision D1). A manifest without valid thresholds parses with
 * ESCALATE_ALL, so a model can be shadow-tested before anyone lets it decide.
 */
import { type DeciderThresholds, ESCALATE_ALL } from './DecisionBackend';
import type { DeciderModelConfig } from './deciderPipeline';
import type { DeciderRuntimeId } from './deciderRuntime';

export const DECIDER_MANIFEST_SCHEMA = 1;

/** `laya`: the LAYA head over its token sequence; `seq-cls`: a sequence classifier over packed state. */
export type DeciderModelKind = 'laya' | 'seq-cls';
export type DeciderLabel = 'answer' | 'silent' | 'wait';

/** Another build of the same model for another runtime (deciderRuntime picks which one runs). */
export interface DeciderVariantEntry {
    graph: string;
    sha256: string;
    bytes: number;
    runtime: DeciderRuntimeId;
}

export interface DeciderManifest {
    kind: DeciderModelKind;
    /** The model's three output labels, in logit order. */
    labels: DeciderLabel[];
    /** seq-cls only: the tokens reserved for the state block (0 for laya). */
    stateRoom: number;
    id: string;
    version: string;
    graph: string;
    tokenizerDir: string;
    config: DeciderModelConfig;
    thresholds: DeciderThresholds;
    files: Array<{ path: string; sha256: string; bytes: number }>;
    /** The runtime the main graph was exported for. */
    runtime: DeciderRuntimeId;
    variants: Record<string, DeciderVariantEntry>;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
/** A relative path inside the model directory: no absolute paths, no `..`, either separator. */
const safeRel = (p: unknown): p is string =>
    typeof p === 'string' && p.length > 0 && !/^([a-zA-Z]:)?[\\/]/.test(p) && !p.split(/[\\/]/).includes('..');

function thresholdsOf(raw: any): DeciderThresholds {
    if (!raw || typeof raw !== 'object') return ESCALATE_ALL;
    const one = (v: unknown) => (isNum(v) && v > 0 && v <= 1 ? v : Infinity);
    return { answer: one(raw.answer), silent: one(raw.silent), wait: one(raw.wait) };
}

/** Throws with a reason on anything the worker could not load safely. */
export function parseDeciderManifest(json: unknown): DeciderManifest {
    const m = json as any;
    if (!m || typeof m !== 'object') throw new Error('manifest: not an object');
    if (m.schema !== DECIDER_MANIFEST_SCHEMA) throw new Error(`manifest: schema ${m.schema} (want ${DECIDER_MANIFEST_SCHEMA})`);
    if (typeof m.id !== 'string' || typeof m.version !== 'string') throw new Error('manifest: id/version');
    const kind: DeciderModelKind = m.kind ?? 'laya';
    if (kind !== 'laya' && kind !== 'seq-cls') throw new Error(`manifest: kind ${String(m.kind)}`);
    const labels: DeciderLabel[] = m.labels ?? ['answer', 'silent', 'wait'];
    if (!Array.isArray(labels) || labels.length !== 3 || new Set(labels).size !== 3
        || !labels.every((l) => l === 'answer' || l === 'silent' || l === 'wait')) throw new Error('manifest: labels');
    const stateRoom: number = m.state_room ?? 0;
    if (kind === 'seq-cls' && !(Number.isInteger(stateRoom) && stateRoom > 0)) throw new Error('manifest: state_room');
    if (!safeRel(m.graph)) throw new Error('manifest: graph path');
    const tokenizerDir = m.tokenizer ?? 'tokenizer';
    if (!safeRel(tokenizerDir)) throw new Error('manifest: tokenizer path');
    const maxLen = m.max_len ?? 512;
    const headMaxLen = m.head_max_len ?? 192;
    if (!isNum(maxLen) || !isNum(headMaxLen) || headMaxLen >= maxLen) throw new Error('manifest: max_len/head_max_len');
    const cal = m.calibration ?? {};
    const temperature = Array.isArray(cal.temperature) && cal.temperature.every(isNum) ? cal.temperature : [1, 1, 1];
    const byOpt: Record<string, number> = {};
    for (const [k, v] of Object.entries(cal.temperature_by_options ?? {})) if (isNum(v)) byOpt[k] = v;
    const files = Array.isArray(m.files) ? m.files : [];
    for (const f of files) {
        if (!safeRel(f?.path) || typeof f.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(f.sha256) || !isNum(f.bytes)) {
            throw new Error('manifest: files entry');
        }
    }
    if (kind === 'seq-cls' && stateRoom > maxLen - 2) throw new Error('manifest: state_room exceeds max_len');
    const isRuntime = (r: unknown): r is DeciderRuntimeId => r === 'ort-1.22' || r === 'ort-1.24';
    const runtime = m.runtime ?? 'ort-1.22';
    if (!isRuntime(runtime)) throw new Error('manifest: runtime');
    const variants: Record<string, DeciderVariantEntry> = {};
    for (const [name, v] of Object.entries<any>(m.variants ?? {})) {
        if (!/^[a-z0-9]{2,12}$/.test(name) || !safeRel(v?.graph) || typeof v.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(v.sha256)
            || !(Number.isInteger(v.bytes) && v.bytes > 0) || !isRuntime(v.runtime)) throw new Error(`manifest: variant ${name}`);
        variants[name] = { graph: v.graph, sha256: v.sha256, bytes: v.bytes, runtime: v.runtime };
    }
    return {
        kind, labels, stateRoom,
        id: m.id, version: m.version, graph: m.graph, tokenizerDir,
        config: { maxLen, headMaxLen, calibration: { temperature, temperatureByOptions: byOpt } },
        thresholds: thresholdsOf(m.thresholds),
        files,
        runtime,
        variants,
    };
}
