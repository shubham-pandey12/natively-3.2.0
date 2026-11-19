/**
 * One candidate through the decider model, end to end, with the ONNX run injected. PURE apart from
 * the injected runner: the local worker passes onnxruntime-node, tests pass fixture logits, and the
 * hosted tier (Phase 5) can run the same steps server-side so both runtimes see identical input.
 *
 *   JudgeRequest → §4 fields (deciderState) → fit into the state room (exact token counts)
 *     → Laya sequence (layaSequence) → batch of one → run → decode with the fitted temperatures
 */
import type { JudgeRequest } from '../AutoAnswerJudge';
import type { BackendDecision, DeciderLabel } from './DecisionBackend';
import {
    DECIDER_QUESTION, buildDeciderStateFields, fitDeciderState, modeIdForName,
    type DeciderStateFields,
} from './deciderState';
import {
    type LayaCalibration, type LayaChoiceQuestion, type LayaHead, type LayaOnnxBatch, type LayaTokenizer,
    DEFAULT_MAX_LEN, buildHead, buildSequence, collate, countStateTokens, decodeChoice, stateRoom, toInternalChoice,
} from './layaSequence';

/** What a model artifact ships beside its graph (manifest.json, Phase 3.5), as the pipeline needs it. */
export interface DeciderModelConfig {
    maxLen: number;
    headMaxLen: number;
    calibration: LayaCalibration;
}

/** Runs one collated batch; resolves the `logits` row for item 0 (at least k values). */
export type DeciderRunner = (batch: LayaOnnxBatch) => Promise<ArrayLike<number>>;

export interface PreparedDecider {
    tok: LayaTokenizer;
    q: LayaChoiceQuestion;
    head: LayaHead;
    room: number;
    cfg: DeciderModelConfig;
}

/** Everything that depends only on the tokenizer and config, built once per model load. */
export function prepareDecider(tok: LayaTokenizer, cfg: DeciderModelConfig): PreparedDecider {
    const q = toInternalChoice(DECIDER_QUESTION as any);
    const head = buildHead(tok, q, cfg.headMaxLen);
    return { tok, q, head, room: stateRoom(head, cfg.maxLen ?? DEFAULT_MAX_LEN), cfg };
}

/** The engine's request as §4 fields: the same builder the bench and the data engine use. */
export function fieldsForRequest(req: JudgeRequest): DeciderStateFields {
    return buildDeciderStateFields({
        candidateText: req.candidateText,
        recentTurns: req.recentTurns ?? [],
        speakers: req.speakers,
        modeId: modeIdForName(req.modeName ?? null),
        lastAnsweredText: req.lastAnsweredText ?? null,
        userName: req.userName ?? null,
        transcriptLagging: !!req.transcriptLagging,
    });
}

/** Fields → decision. `ms` is left 0; the caller times the whole call. */
export async function decideFields(p: PreparedDecider, fields: DeciderStateFields, run: DeciderRunner): Promise<BackendDecision> {
    const fit = fitDeciderState(fields, (s) => countStateTokens(p.tok, s), p.room);
    const seq = buildSequence(p.tok, fit.serialized, p.head, p.cfg.maxLen);
    const batch = collate([seq], p.tok.padTokenId);
    const k = seq.markers.length;
    const row = await run(batch);
    if (!row || row.length < k) throw new Error(`decider graph returned ${row?.length ?? 0} logits for ${k} options`);
    const a = decodeChoice(row, p.q, k, p.cfg.calibration);
    const probabilities = { answer: a.probabilities.answer ?? 0, silent: a.probabilities.silent ?? 0, wait: a.probabilities.wait ?? 0 };
    return {
        choice: a.choice as DeciderLabel,
        probabilities,
        answerConfidence: a.answerConfidence,
        entropyConfidence: a.confidence,
        // The fit gives ground before the model would cut; any right-truncation left means the
        // candidate itself may be cut, and a cut candidate is never trusted (gateDecision).
        truncated: seq.truncation.truncated,
        ms: 0,
    };
}

export function decideRequest(p: PreparedDecider, req: JudgeRequest, run: DeciderRunner): Promise<BackendDecision> {
    return decideFields(p, fieldsForRequest(req), run);
}

/** seq-cls (student) models: a plain sequence classifier over [CLS] state [SEP]. */
export interface StudentModelConfig {
    maxLen: number;
    stateRoom: number;
    labels: DeciderLabel[];
}

export interface PreparedStudent {
    tok: LayaTokenizer;
    cfg: StudentModelConfig;
}

export interface StudentInput {
    inputIds: BigInt64Array;
    attentionMask: BigInt64Array;
    length: number;
    truncated: boolean;
}

export type StudentRunner = (input: StudentInput) => Promise<ArrayLike<number>>;

export function prepareStudent(tok: LayaTokenizer, cfg: StudentModelConfig): PreparedStudent {
    return { tok, cfg };
}

/** Keeps the tail of the state when it does not fit (the candidate is last). */
export function encodeStudentInput(tok: LayaTokenizer, serialized: string, maxLen: number): StudentInput {
    const ids = tok.encode(serialized);
    const room = maxLen - 2;
    const kept = ids.length > room ? ids.slice(ids.length - room) : ids;
    const all = [tok.clsTokenId, ...kept, tok.sepTokenId];
    const inputIds = new BigInt64Array(all.length);
    const attentionMask = new BigInt64Array(all.length);
    for (let i = 0; i < all.length; i++) {
        inputIds[i] = BigInt(all[i]);
        attentionMask[i] = 1n;
    }
    return { inputIds, attentionMask, length: all.length, truncated: ids.length > room };
}

export function softmax(logits: ArrayLike<number>): number[] {
    let m = -Infinity;
    for (let i = 0; i < logits.length; i++) m = Math.max(m, Number(logits[i]));
    const e = Array.from(logits, (x) => Math.exp(Number(x) - m));
    const s = e.reduce((a, b) => a + b, 0);
    return e.map((x) => x / s);
}

export async function decideStudentFields(p: PreparedStudent, fields: DeciderStateFields, run: StudentRunner): Promise<BackendDecision> {
    const fit = fitDeciderState(fields, (s) => countStateTokens(p.tok, s), p.cfg.stateRoom);
    const input = encodeStudentInput(p.tok, fit.serialized, p.cfg.maxLen);
    const row = await run(input);
    const k = p.cfg.labels.length;
    if (!row || row.length < k) throw new Error(`decider graph returned ${row?.length ?? 0} logits for ${k} labels`);
    const probs = softmax(Array.from(row).slice(0, k));
    const probabilities: Record<DeciderLabel, number> = { answer: 0, silent: 0, wait: 0 };
    p.cfg.labels.forEach((l, i) => { probabilities[l] = probs[i]; });
    let best = 0;
    for (let i = 1; i < k; i++) if (probs[i] > probs[best]) best = i;
    const entropy = -probs.reduce((a, q) => a + (q > 0 ? q * Math.log(q) : 0), 0);
    return {
        choice: p.cfg.labels[best],
        probabilities,
        answerConfidence: probs[best],
        entropyConfidence: 1 - entropy / Math.log(k),
        truncated: input.truncated,
        ms: 0,
    };
}

export function decideStudentRequest(p: PreparedStudent, req: JudgeRequest, run: StudentRunner): Promise<BackendDecision> {
    return decideStudentFields(p, fieldsForRequest(req), run);
}
