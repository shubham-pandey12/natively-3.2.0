import { NO_ACTION_SENTINEL } from '../../../electron/llm/promptSystemV2';

export { NO_ACTION_SENTINEL };
export const ASK_SENTINEL = '[[ASK]]';

export type ResponseKind = 'wait' | 'ask' | 'answer';
export type ResponseParserEvent =
    | { type: 'kind'; kind: ResponseKind }
    | { type: 'text'; text: string };

const SENTINELS = [
    { token: NO_ACTION_SENTINEL, kind: 'wait' },
    { token: ASK_SENTINEL, kind: 'ask' },
] as const;

const PREFIX_CHAR = /[\s*_`"'“”‘’>]/u;
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

    function push(chunk: string): ResponseParserEvent[] {
        if (finished || !chunk || kind === 'wait') return [];
        if (kind === 'answer' || (kind === 'ask' && askPrefix === undefined)) return emitText(chunk);
        buffered += chunk;
        if (kind === 'ask') return flushAsk();

        // Inspect at most one sentinel's worth of meaningful characters.
        // Keep tentative leading formatting verbatim for an ordinary answer.
        while (prefixLength < buffered.length && PREFIX_CHAR.test(buffered[prefixLength])) prefixLength++;
        const prefix = buffered.slice(prefixLength, prefixLength + NO_ACTION_SENTINEL.length);
        const match = SENTINELS.find(({ token }) => prefix.startsWith(token));
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
        if (SENTINELS.some(({ token }) => token.startsWith(prefix))) return [];

        kind = 'answer';
        const text = buffered;
        buffered = '';
        return [{ type: 'kind', kind }, ...emitText(text)];
    }

    function finish(): ResponseParserEvent[] {
        if (finished) return [];
        finished = true;
        if (kind === 'ask' && askPrefix !== undefined) return flushAsk(true);
        const text = buffered;
        buffered = '';
        if (kind !== undefined || !text.trim()) return [];
        return [{ type: 'kind', kind: 'answer' }, ...emitText(text)];
    }

    return { push, finish };
}
