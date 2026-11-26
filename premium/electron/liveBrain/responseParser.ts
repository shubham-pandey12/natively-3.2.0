import { NO_ACTION_SENTINEL } from '../../../electron/llm/promptSystemV2';

export { NO_ACTION_SENTINEL };
export const ASK_SENTINEL = '[[ASK]]';

export type ResponseKind = 'wait' | 'ask' | 'answer';
export type ResponseParserEvent =
    | { type: 'kind'; kind: ResponseKind }
    | { type: 'text'; text: string };

const SENTINELS = [
    { token: NO_ACTION_SENTINEL.toLowerCase(), kind: 'wait' },
    { token: ASK_SENTINEL.toLowerCase(), kind: 'ask' },
    { token: 'ask:', kind: 'ask' },
    { token: 'ask :', kind: 'ask' },
    { token: 'ask：', kind: 'ask' },
    { token: 'ask ：', kind: 'ask' },
    { token: 'no action', kind: 'wait', wordBoundary: true },
] as const;

const PREFIX_CHAR = /[\s*_`"'“”‘’>]/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const PREFIX_LIMIT = 17; // Includes up to four wrapper characters around [[NO_ACTION]].
const CLOSING_QUOTES: Record<string, string> = { '“': '”', '‘': '’' };

/** Classify the prefix once and stream all subsequent text without scanning it. */
export function createResponseParser() {
    let kind: ResponseKind | undefined;
    let buffered = '';
    let prefixLength = 0;
    let askPrefix: string | undefined;
    let finished = false;

    const emitText = (text: string): ResponseParserEvent[] => text ? [{ type: 'text', text }] : [];

    const flushAsk = (atEnd = false): ResponseParserEvent[] => {
        const text = buffered.trimStart();
        // Only strip a closing wrapper when its opening wrapper surrounded the sentinel.
        // Standalone markup at the start of a clarification is part of its text.
        if (askPrefix && askPrefix.startsWith(text) && text.length < askPrefix.length) {
            if (atEnd) buffered = '';
            return [];
        }
        const content = askPrefix && text.startsWith(askPrefix) ? text.slice(askPrefix.length).trimStart() : text;
        buffered = '';
        if (!content) {
            askPrefix = '';
            return [];
        }
        askPrefix = undefined;
        return emitText(content);
    };

    function classify(atEnd = false): ResponseParserEvent[] {
        const limit = Math.min(buffered.length, PREFIX_LIMIT);
        while (prefixLength < limit && PREFIX_CHAR.test(buffered[prefixLength])) prefixLength++;
        const prefix = buffered.slice(prefixLength, limit).toLowerCase();
        const match = SENTINELS.find(sentinel => {
            if (!prefix.startsWith(sentinel.token)) return false;
            if (!('wordBoundary' in sentinel)) return true;
            const next = prefix[sentinel.token.length];
            return next === undefined ? atEnd : !WORD_CHAR.test(next);
        });
        if (match) {
            kind = match.kind;
            const events: ResponseParserEvent[] = [{ type: 'kind', kind }];
            if (kind === 'ask') {
                askPrefix = Array.from(buffered.slice(0, prefixLength).replace(/[\s>]/gu, ''))
                    .reverse().map(char => CLOSING_QUOTES[char] ?? char).join('');
                buffered = buffered.slice(prefixLength + match.token.length);
                events.push(...flushAsk());
            } else {
                buffered = '';
            }
            return events;
        }
        if (!atEnd && buffered.length < PREFIX_LIMIT && SENTINELS.some(({ token }) => token.startsWith(prefix))) return [];

        const text = buffered;
        buffered = '';
        if (!text.trim()) {
            prefixLength = 0;
            return [];
        }
        kind = 'answer';
        return [{ type: 'kind', kind }, ...emitText(text)];
    }

    function push(chunk: string): ResponseParserEvent[] {
        if (finished || !chunk || kind === 'wait') return [];
        if (kind === 'answer' || (kind === 'ask' && askPrefix === undefined)) return emitText(chunk);
        buffered += chunk;
        return kind === 'ask' ? flushAsk() : classify();
    }

    function finish(): ResponseParserEvent[] {
        if (finished) return [];
        finished = true;
        if (kind === 'ask' && askPrefix !== undefined) return flushAsk(true);
        return kind === undefined ? classify(true) : [];
    }

    return { push, finish };
}
