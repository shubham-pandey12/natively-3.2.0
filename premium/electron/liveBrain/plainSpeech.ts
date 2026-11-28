// Live Brain safety net for the D20 live candidate prompt: realtime voice models
// sometimes still say their thinking out loud or reach for dramatic words. This
// swaps those for the plain words a non-native (Indian English) speaker uses.
// Pure and platform-independent. Code spans and control messages are untouched.

const THINKING_OPENER = /^(\s*)(?:(?:so|okay|ok|well),?\s+)?(?:thinking out loud|briefly thinking|let me think(?: about (?:it|that|this))?|let me think out loud)\s*[,:.…-]*\s*/i;

const REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
    [/\bdove into\b/gi, 'looked into'],
    [/\bdived into\b/gi, 'looked into'],
    [/\bdiving into\b/gi, 'looking into'],
    [/\bskyrocketing\b/gi, 'going up a lot'],
    [/\bskyrocketed\b/gi, 'went up a lot'],
    [/\bdramatically\b/gi, 'a lot'],
    [/\bcrucial\b/gi, 'important'],
    [/\babsolutely necessary\b/gi, 'really needed'],
    [/\bleveraged\b/gi, 'used'],
    [/\bleveraging\b/gi, 'using'],
    [/\bleverage\b/gi, 'use'],
    [/\butilized\b/gi, 'used'],
    [/\butilizing\b/gi, 'using'],
    [/\butilize\b/gi, 'use'],
    [/\bensured\b/gi, 'made sure'],
    [/\bensuring\b/gi, 'making sure'],
    [/\bensures\b/gi, 'makes sure'],
    [/\bensure\b/gi, 'make sure'],
    [/\bspearheaded\b/gi, 'led'],
    [/\bseamless(?:ly)?\b/gi, 'smooth'],
];

const CONTROL_MESSAGE = /^\s*(?:(?:\*\*|__)?ask\s*:|\[\[ask\]\]|\[\[no_action\]\]|(?:\*\*|__)?no\s+action\.?(?:\*\*|__)?\s*$)/i;

function matchCase(source: string, replacement: string): string {
    return /^[A-Z]/.test(source) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

function plainProse(text: string, atStart: boolean): string {
    let out = text;
    if (atStart) {
        const stripped = out.replace(THINKING_OPENER, '$1');
        if (stripped.trim() && stripped !== out) {
            const lead = stripped.match(/^\s*/)?.[0] ?? '';
            const rest = stripped.slice(lead.length);
            out = lead + rest[0].toUpperCase() + rest.slice(1);
        }
    }
    for (const [pattern, replacement] of REPLACEMENTS) {
        out = out.replace(pattern, match => matchCase(match, replacement));
    }
    return out;
}

/** Plain-word pass for one finished Live Brain sentence or answer. */
export function plainLiveSpeech(text: string): string {
    if (!text || CONTROL_MESSAGE.test(text)) return text;
    // Leave fenced and inline code exactly as written.
    return text
        .split(/(```[\s\S]*?```|`[^`\n]*`)/)
        .map((part, index) => (index % 2 === 1 ? part : plainProse(part, index === 0)))
        .join('');
}
