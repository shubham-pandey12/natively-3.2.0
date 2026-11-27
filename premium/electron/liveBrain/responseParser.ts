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
    { token: 'no action', kind: 'wait', finishOnly: true },
] as const;

const PREFIX_CHAR = /[\s*_`"'“”‘’>]/u;
const PREFIX_LIMIT = 64;
const SENTINEL_LIMIT = 17;
const WAIT_SUFFIX_LIMIT = 64;
const MARKDOWN_PREFIX = /^(?:#{1,6}|[-*]|\d+\.)[ \t]/u;
const PARTIAL_MARKDOWN_PREFIX = /^(?:#{1,6}|[-*]|\d+\.?)$/u;
const WAIT_SUFFIX = /^[.!…\s*_`"'”’>]*$/u;
const CLOSING_QUOTES: Record<string, string> = { '“': '”', '‘': '’' };

/** Classify the prefix once and stream all subsequent text without scanning it. */
export function createResponseParser() {
    let kind: ResponseKind | undefined;
    let buffered = '';
    let prefixLength = 0;
    let wrappers = '';
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
        while (prefixLength < Math.min(buffered.length, PREFIX_LIMIT)) {
            const leading = buffered.slice(prefixLength, PREFIX_LIMIT + 1);
            const marker = MARKDOWN_PREFIX.exec(leading);
            if (marker && prefixLength + marker[0].length <= PREFIX_LIMIT) {
                prefixLength += marker[0].length;
                continue;
            }
            if (!atEnd && buffered.length <= PREFIX_LIMIT && PARTIAL_MARKDOWN_PREFIX.test(leading)) return [];
            const char = buffered[prefixLength];
            if (!PREFIX_CHAR.test(char)) break;
            if (!/[\s>]/u.test(char)) wrappers += char;
            prefixLength++;
        }

        const prefix = buffered.slice(prefixLength, prefixLength + SENTINEL_LIMIT).toLowerCase();
        const match = SENTINELS.find(sentinel => prefix.startsWith(sentinel.token));
        if (match && 'finishOnly' in match) {
            const suffixStart = prefixLength + match.token.length;
            const suffixLength = buffered.length - suffixStart;
            const possibleWait = suffixLength <= WAIT_SUFFIX_LIMIT && WAIT_SUFFIX.test(buffered.slice(suffixStart));
            if (!possibleWait) return classifyAnswer();
            if (!atEnd) return [];
        }
        if (match) {
            kind = match.kind;
            const events: ResponseParserEvent[] = [{ type: 'kind', kind }];
            if (kind === 'ask') {
                askPrefix = Array.from(wrappers).reverse().map(char => CLOSING_QUOTES[char] ?? char).join('');
                buffered = buffered.slice(prefixLength + match.token.length);
                events.push(...flushAsk());
            } else {
                buffered = '';
            }
            return events;
        }
        if (!atEnd && buffered.length - prefixLength < SENTINEL_LIMIT
            && SENTINELS.some(({ token }) => token.startsWith(prefix))) return [];

        return classifyAnswer();
    }

    function classifyAnswer(): ResponseParserEvent[] {
        const text = buffered;
        buffered = '';
        if (!text.trim()) {
            prefixLength = 0;
            wrappers = '';
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
