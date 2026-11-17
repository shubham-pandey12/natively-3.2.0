const LEAD = String.raw`^(?:(?:so|and|okay|ok|well|hey|hi|alright|great|um+|uh+)[,\s]+)*`;
const TAIL = String.raw`(?:[\s,]+(?:today|this (?:morning|afternoon|evening)|okay|ok|alright|all right|fine|now|then|guys|everyone|everybody|all|there|so far|again|good (?:morning|afternoon|evening)|morning|hi|hello|hey|welcome|thanks|thank you))*[\s?.!,]*$`;
const CORES = [
  String.raw`(?:hi|hello|hey|good (?:morning|afternoon|evening)|morning|afternoon|welcome(?: (?:everyone|everybody|aboard|back))?|thanks?(?: you)?(?: (?:so much|for (?:joining|coming|having me|your time)))?|nice (?:to )?(?:meet|see) you|great to (?:meet|see) you|pleasure to meet you)`,
  String.raw`how(?: are|['’]re) (?:you|things|we|you all|y['’]?all)(?: doing| going)?`,
  String.raw`how(?:['’]s| is| has) (?:it going|your (?:day|morning|week|weekend)(?: going| been)?|everything|the weather|life)`,
  String.raw`(?:did|do) you (?:find (?:the|this|our) (?:place|office|room|link|building)|have (?:a )?(?:good|nice|great) (?:weekend|trip|day|morning))`,
  String.raw`(?:can|could) (?:you|everyone|everybody|y['’]?all) (?:hear|see) (?:me|us|my (?:screen|audio|video)|the screen|this|that|it)(?: (?:alright|all right|clearly|well))?`,
  String.raw`am i (?:audible|on mute|muted|coming through|breaking up|frozen)`,
  String.raw`(?:is|was) (?:my|the) (?:audio|mic|microphone|sound|video|screen|connection|camera) (?:okay|ok|working|clear|better|good|coming through)`,
  String.raw`(?:is|was) (?:that|this|it) (?:better|clearer|okay|ok)`,
  String.raw`(?:shall|should|can) we (?:start|begin|get started|kick (?:it )?off)`,
  String.raw`are (?:you|we|everyone|everybody) (?:ready|all set|good to go|here|there)`,
  String.raw`are we (?:recording|live)`,
];
const SMALL_TALK_SENTENCE = new RegExp(`${LEAD}(?:${CORES.join('|')})${TAIL}`, 'i');
const FILLER_ONLY = /^(?:ok(?:ay)?|right|great|cool|good|perfect|awesome|alright|so|yeah|yes|sure|um+|uh+|hmm+|mm+)[\s,.!]*$/i;
export function isOnlySmallTalk(text: string | null | undefined): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  const sentences = t.split(/(?<=[.?!])\s+|,\s+(?=(?:and |so )?(?:did|do|can|could|are|is|how|shall|should|am)\b)/i)
    .map(s => s.replace(/^(?:and|so|okay|ok|well|oh)[,\s]+/i, '').trim()).filter(Boolean);
  if (!sentences.length) return false;
  let sawSmallTalk = false;
  for (const s of sentences) {
    if (FILLER_ONLY.test(s)) continue;
    if (!SMALL_TALK_SENTENCE.test(s)) return false;
    sawSmallTalk = true;
  }
  return sawSmallTalk;
}
