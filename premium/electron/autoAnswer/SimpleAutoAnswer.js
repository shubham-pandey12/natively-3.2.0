"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// premium/electron/autoAnswer/SimpleAutoAnswer.ts
var SimpleAutoAnswer_exports = {};
__export(SimpleAutoAnswer_exports, {
  ANSWER_FLOOR: () => ANSWER_FLOOR,
  DUPLICATE_FINAL_MS: () => DUPLICATE_FINAL_MS,
  EARLY_JUDGE_MS: () => EARLY_JUDGE_MS,
  ENDPOINT_CONFIRM_MS: () => ENDPOINT_CONFIRM_MS,
  FALLBACK_INTERROGATIVE: () => FALLBACK_INTERROGATIVE,
  FEEDBACK_WINDOW_MS: () => FEEDBACK_WINDOW_MS,
  HELD_MAX_AGE_MS: () => HELD_MAX_AGE_MS,
  INERT_MAX_TOTAL_WORDS: () => INERT_MAX_TOTAL_WORDS,
  INERT_MAX_WORDS: () => INERT_MAX_WORDS,
  MERGED_ASK_GAP_MS: () => MERGED_ASK_GAP_MS,
  MIN_NEW_WORDS: () => MIN_NEW_WORDS,
  PENDING_MAX_AGE_MS: () => PENDING_MAX_AGE_MS,
  PREFETCH_MIN_INTERVAL_MS: () => PREFETCH_MIN_INTERVAL_MS,
  PUNCTUATING_MIN_FINALS: () => PUNCTUATING_MIN_FINALS,
  PUNCTUATING_SHARE: () => PUNCTUATING_SHARE,
  QUESTION_JUDGE_DEADLINE_MS: () => QUESTION_JUDGE_DEADLINE_MS,
  REPORT_SHAPED: () => REPORT_SHAPED,
  RETRY_MS: () => RETRY_MS,
  RETRY_TTL_MS: () => RETRY_TTL_MS,
  RULED_OUT_CONTAINMENT: () => RULED_OUT_CONTAINMENT,
  SPECULATION_HOLDS_QUESTION: () => SPECULATION_HOLDS_QUESTION,
  STABILITY_MS: () => STABILITY_MS,
  STALL_ANSWERED_TTL_MS: () => STALL_ANSWERED_TTL_MS,
  STALL_PROMOTE_MS: () => STALL_PROMOTE_MS,
  STRUCTURE_GRACE_MS: () => STRUCTURE_GRACE_MS,
  SimpleAutoAnswerEngine: () => SimpleAutoAnswerEngine,
  USER_BACKCHANNEL: () => USER_BACKCHANNEL,
  acceptsLocalSpeechEndHint: () => acceptsLocalSpeechEndHint,
  awaitsStructure: () => awaitsStructure,
  endsOnDeclarativeAsk: () => endsOnDeclarativeAsk,
  isBareTransition: () => isBareTransition,
  isCutOffEnding: () => isCutOffEnding,
  isInertUtterance: () => isInertUtterance,
  isQuestionShaped: () => isQuestionShaped,
  isReportShaped: () => isReportShaped,
  isSameUtterance: () => isSameUtterance,
  sentencesOf: () => sentencesOf,
  withMergedEarlierAsk: () => withMergedEarlierAsk
});
module.exports = __toCommonJS(SimpleAutoAnswer_exports);

// premium/electron/autoAnswer/AutoAnswerClock.ts
var systemClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (timer) => clearTimeout(timer)
};

// premium/electron/autoAnswer/AutoAnswerText.ts
function normalizeForCompare(s) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function tokenContainment(needle, haystack) {
  const nq = normalizeForCompare(needle).split(" ").filter(Boolean);
  if (nq.length === 0) return 0;
  const have = new Set(normalizeForCompare(haystack).split(" ").filter(Boolean));
  let hit = 0;
  for (const t of nq) if (have.has(t)) hit++;
  return hit / nq.length;
}
function isMidWordCut(finalText, latestInterim) {
  if (!finalText || !latestInterim) return false;
  if (latestInterim.length <= finalText.length) return false;
  if (!latestInterim.startsWith(finalText)) return false;
  const before = finalText[finalText.length - 1];
  const after = latestInterim[finalText.length];
  const word = (c) => /\w/.test(c);
  const apos = (c) => c === "'" || c === "\u2019";
  if (apos(before) && apos(after)) return false;
  return (word(before) || apos(before)) && (word(after) || apos(after));
}
function joinTranscriptParts(parts) {
  let out = "";
  for (let i = 0; i < parts.length; i++) {
    if (i === 0) {
      out = parts[i].text;
      continue;
    }
    out += (parts[i - 1].glueNext ? "" : " ") + parts[i].text;
  }
  return out.replace(/\s+/g, " ").trim();
}

// premium/electron/autoAnswer/AutoAnswerJudge.ts
var JUDGE_DEADLINE_MS = 2500;
var JUDGE_CONTAINMENT_MIN = 0.65;
var JUDGE_CONTEXT_TURNS = 8;
var JUDGE_TURN_CHAR_CAP = 400;
var JUDGE_CANDIDATE_CHAR_CAP = 1e3;
var JUDGE_ANSWERED_CHAR_CAP = 250;
var JUDGE_PROMPT_MAX_VARIABLE_CHARS = JUDGE_CONTEXT_TURNS * JUDGE_TURN_CHAR_CAP + JUDGE_CANDIDATE_CHAR_CAP + JUDGE_ANSWERED_CHAR_CAP;
var NOT_A_NAME = /* @__PURE__ */ new Set([
  "and",
  "all",
  "but",
  "the",
  "how",
  "why",
  "what",
  "who",
  "can",
  "could",
  "okay",
  "yes",
  "yeah",
  "right",
  "great",
  "good",
  "thanks",
  "now",
  "well",
  "also",
  "then",
  "that",
  "this",
  "just",
  "even",
  "ever",
  "over",
  "alright",
  "before",
  "after",
  "one",
  "let's",
  "hey",
  "morning",
  "any",
  "are",
  "did",
  "does",
  "will",
  "would"
]);
var NOT_A_VOCATIVE = /* @__PURE__ */ new Set([
  ...NOT_A_NAME,
  "yes",
  "yep",
  "no",
  "nope",
  "ok",
  "so",
  "sure",
  "cool",
  "nice",
  "perfect",
  "awesome",
  "excellent",
  "first",
  "second",
  "third",
  "hmm",
  "um",
  "uh",
  "oh",
  "ah",
  "like",
  "sorry",
  "hi",
  "hello",
  "please",
  "interesting",
  "today",
  "tomorrow",
  "yesterday",
  "instead",
  "otherwise",
  "meanwhile",
  "again",
  "anyway",
  "however",
  "sir",
  "madam",
  "ma'am",
  "guys",
  "everyone",
  "everybody",
  "folks",
  "team",
  "all",
  "fine",
  "wow",
  "there",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
]);
var JUDGE_ACTS = {
  question: "general_question",
  follow_up: "follow_up_question",
  coding_task: "coding_question",
  behavioral: "behavioral_question",
  technical: "technical_question",
  rhetorical: "rhetorical",
  statement: "statement",
  social: "social",
  incomplete: "incomplete"
};
function isSpokenTurn(turn) {
  return turn.role !== "assistant" && turn.typed !== true;
}
function parseJudgeVerdict(raw, candidateText) {
  if (!raw) return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const isAsk = obj.is_ask;
  const directed = obj.directed_at_user;
  const complete = obj.complete;
  if (typeof isAsk !== "boolean" || typeof directed !== "boolean" || typeof complete !== "boolean") return null;
  const rawAns = obj.answerability;
  if (typeof rawAns !== "number" || Number.isNaN(rawAns)) return null;
  const answerability = Math.max(0, Math.min(1, rawAns));
  const act = JUDGE_ACTS[String(obj.act)] ?? (isAsk ? "general_question" : "statement");
  let questionText = null;
  if (typeof obj.question_text === "string" && obj.question_text.trim()) {
    const grounded = tokenContainment(obj.question_text, candidateText) >= JUDGE_CONTAINMENT_MIN;
    questionText = grounded ? obj.question_text.trim() : null;
  }
  const rawAction = String(obj.action ?? "").toLowerCase();
  const action = rawAction === "answer" || rawAction === "offer" ? "answer" : rawAction === "silent" ? "silent" : !isAsk || !directed ? "silent" : "answer";
  return { isAsk, directedAtUser: directed, complete, act, answerability, questionText, action };
}
function routeForVerdict(v) {
  if (!v.complete || v.act === "incomplete") return { route: "wait_incomplete" };
  if (!v.isAsk) return { route: "ignore", reason: "not_question" };
  if (v.act === "rhetorical") return { route: "ignore", reason: "rhetorical" };
  if (!v.directedAtUser) return { route: "ignore", reason: "not_question" };
  if (v.action === "silent") return { route: "ignore", reason: "low_answerability" };
  return { route: "evaluate", action: v.action, answerability: v.answerability, act: v.act, questionText: v.questionText };
}

// premium/electron/autoAnswer/AutoAnswerPolicy.ts
var DEFAULT_THRESHOLDS = {
  autoThreshold: 0.88,
  offerThreshold: 0.65,
  speculationThreshold: 0.82
};

// premium/electron/autoAnswer/SimpleAutoAnswer.ts
var USER_BACKCHANNEL = /^(?:(?:yeah|yes|yep|yup|ya|mm-?hm+|mhm+|uh-?huh|ok(?:ay)?|right|sure|cool|got it|i see|nice|great|perfect|exactly|interesting|makes sense|sounds good|true|correct|wow|oh|ah|hm+|haha+|alright|of course|fair enough|no problem|totally|absolutely|definitely|indeed|good|fine)[\s,.!?-]*){1,4}$/i;
var STABILITY_MS = 900;
var EARLY_JUDGE_MS = 120;
var PUNCTUATING_MIN_FINALS = 4;
var PUNCTUATING_SHARE = 0.4;
var ENDPOINT_CONFIRM_MS = 350;
var MIN_NEW_WORDS = 4;
var ANSWER_FLOOR = 0.3;
var FALLBACK_INTERROGATIVE = /^(?:(?:ok(?:ay)?|so|and|now|alright|well)[,.!\s]+)*(?:how|what|why|when|where|which|who|whose|can|could|would|should|do|does|did|are|is|will|have you|tell me|tell us|walk me|walk us|explain|describe)\b/i;
var PREFETCH_MIN_INTERVAL_MS = 25e3;
function acceptsLocalSpeechEndHint(sttProvider) {
  return !["none", "groq", "azure", "ibmwatson", "openai", "local-whisper"].includes(sttProvider);
}
function sentencesOf(text) {
  return text.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
}
function isQuestionShaped(candidate) {
  return sentencesOf(candidate).some((s) => /\?\s*$/.test(s) || FALLBACK_INTERROGATIVE.test(s));
}
var REPORT_SHAPED = /\b(?:i (?:just )?noticed|i see that|our (?:biggest |main |real )?(?:pain|problem|issue|challenge|concern|bottleneck)s? (?:is|are)|(?:can'?t|cannot|couldn'?t|won'?t|doesn'?t|isn'?t|aren'?t|not able to) (?:log|work|load|connect|sign|access|see|find|open|get)|error|it says|now says|keeps? (?:failing|crashing|timing out)|stopped working|(?:is|are) broken|went down)\b/i;
var HANGING_END = /\b(?:that|and|but|so|because|is|are|was|the|a|an|to|of|with|when|if|which)\s*[,.-]*\s*$/i;
function isReportShaped(candidate) {
  const t = candidate.trim();
  return REPORT_SHAPED.test(t) && !HANGING_END.test(t);
}
var DECLARATIVE_ASK = /^(?:(?:ok(?:ay)?|so|and|now|alright|all right|well|great|next|please)[,.!\s]+)*(?:(?:please|go ahead and|i(?:['’]d| would) like you to|i want you to|your (?:task|job|challenge) (?:is|will be) to)\s+)?(?:walk (?:me|us) through|talk (?:me|us) through|tell (?:me|us) (?:about|how|why|what|when|where|which|who|a (?:bit|little)|more)|explain|describe|elaborate|give (?:me|us) (?:an? |some )?(?:example|overview|rundown|summary|sense)|(?:write|implement|design|build|code(?: up)?|create|solve|compare|define|sketch|draw|estimate|optimi[sz]e|refactor|debug) (?:a|an|the|me|us|some|your|this|that|these|those|it|how|what))\b/i;
function endsOnDeclarativeAsk(text, punctuated) {
  const sentences = sentencesOf((text ?? "").trim());
  let i = sentences.length - 1;
  while (i >= 0 && isInertUtterance(sentences[i], true)) i--;
  if (i < 0) return false;
  const s = sentences[i];
  if (!DECLARATIVE_ASK.test(s) || isCutOffEnding(s) || HANGING_END.test(s)) return false;
  return !punctuated || /[.?!]["'”’)\]]*$/.test(s);
}
var INERT_MAX_WORDS = 6;
var QUESTION_JUDGE_DEADLINE_MS = 1900;
var INERT_MAX_TOTAL_WORDS = 12;
var FILLER = /^(?:u+h+|u+m+|e+r+m*|a+h+|h+m+|m+)(?:[\s,.!-]+(?:u+h+|u+m+|e+r+m*|a+h+|h+m+|m+))*[\s,.!-]*$/i;
var CONTINUATION_LEAD = /^(?:and|or|but|also|plus|then|so|because|cause|which|where|when|while|including|with|without|in|on|for|using|like|especially|except|unless|if|whether|that(?!['’])|to|as|how|what|why|who|first(?:ly)?|second(?:ly)?|third(?:ly)?|fourth|fifth|next|finally|lastly|last|another|additionally|bonus|step|part|one|two|three|four|five)\b/i;
var ARTICLE_LEAD = /^(?:a|an|the)\b/i;
var TASK_LEAD = /^(?:(?:ok(?:ay)?|now|alright|so|well|please|just)[,.!\s]+)*(?:write|implement|code|design|build|create|make|explain|describe|tell|walk|show|give|list|name|compare|contrast|solve|calculate|compute|draw|sketch|share|summari[sz]e|define|optimi[sz]e|refactor|debug|fix|prove|estimate|talk|elaborate|expand|clarify|try|start|continue|go|use|assume|imagine|suppose|consider|think|let['’]?s|now|answer|pick|choose)\b/i;
function isInertUtterance(text, final) {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (USER_BACKCHANNEL.test(t) || FILLER.test(t)) return true;
  if (t.includes("?") || /\d/.test(t)) return false;
  if (t.split(/\s+/).filter(Boolean).length > INERT_MAX_WORDS) return false;
  if (CONTINUATION_LEAD.test(t) || TASK_LEAD.test(t) || FALLBACK_INTERROGATIVE.test(t) || REPORT_SHAPED.test(t)) return false;
  if (final && !/[.!]["'”’)\]]*$/.test(t)) return false;
  if (final && ARTICLE_LEAD.test(t)) return false;
  return true;
}
function isCutOffEnding(text) {
  const t = (text ?? "").trim();
  if (/(?:—|–|-|\.\.\.|…|,)\s*$/.test(t)) return true;
  return !/[.?!]["'”’)\]]*$/.test(t) && HANGING_END.test(t);
}
var STRUCTURE_GRACE_MS = 4e3;
var COUNT_WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, couple: 2 };
var ANNOUNCED = /\b(?:(two|three|four|five|six|[2-6]|a couple of|a few|several|some|these|the following|following)\s+(?:\w+\s+){0,2}?(operations?|things|parts|questions|steps|requirements|methods|functions|cases|constraints|points|items|features|tasks|scenarios|pieces|components|endpoints|apis|rules))(?:\s+(?:that|which|i|we|you|to|for|here|today|now)\b[^.?!:,]{0,40})?\s*[.:]?\s*$/i;
var RECAP = /\b(?:just|only|all|those|that['’]?s|above|so far|again)\b/i;
var ORDINAL_LEAD = /^(?:and\s+|then\s+|okay[,.]?\s+|so\s+)?(?:first(?:ly)?|second(?:ly)?|third(?:ly)?|fourth|fifth|sixth|next|then|finally|lastly|last|number (?:one|two|three|four|five|\d)|one|two|three|four|five)\b/i;
var CLOSING_LEAD = /^(?:and\s+)?(?:finally|lastly|last)\b/i;
var SCENE_LEAD = /^(?:(?:ok(?:ay)?|so|now|alright|well|hmm+)[,.!\s]+)*(?:say|let['’]?s say|suppose|imagine|assume|picture|consider(?: this| the case)?|let['’]?s imagine|let['’]?s assume|here['’]?s (?:the|a) (?:scenario|situation|setup|problem)|scenario)\b/i;
function awaitsStructure(text) {
  const sentences = sentencesOf((text ?? "").trim());
  if (sentences.length === 0) return false;
  const last = sentences[sentences.length - 1];
  if (SCENE_LEAD.test(last) && !last.includes("?") && !/\b(?:how|what|why|which|where|who|can you|could you|would you|tell me|walk me|explain|describe)\b/i.test(last)) return true;
  let at = -1;
  let m = null;
  for (let i = sentences.length - 1; i >= 0; i--) {
    const hit = RECAP.test(sentences[i]) ? null : sentences[i].match(ANNOUNCED);
    if (hit) {
      at = i;
      m = hit;
      break;
    }
  }
  if (at < 0 || !m) return false;
  const after = sentences.slice(at + 1);
  if (after.some((x) => !ORDINAL_LEAD.test(x))) return false;
  if (after.some((x) => CLOSING_LEAD.test(x))) return false;
  const q = m[1].toLowerCase().replace(/^a couple of$/, "couple");
  const want = COUNT_WORDS[q];
  return after.length < (want ?? 2);
}
var TRANSITION = /^(?:(?:ok(?:ay)?|alright|all right|so|now|great|good|cool|right|well|nice|perfect|awesome)[,.!\s]+)*(?:(?:let['’]?s|let us|we['’]?ll|we will|we can|i['’]?d like to|i want to|shall we|time to|we['’]?re going to|i['’]?m going to)\s+(?:now\s+|just\s+)?(?:move on|move to|move into|switch gears|shift gears|change gears|transition|jump (?:in)?to|dive in(?:to)?|get started|get into|begin|start with|turn to|go to the next)|moving on|next up)\b/i;
var CARRIES_ASK = /\?|\b(?:how|what|why|which|who|explain|describe|tell|walk)\b/i;
function isBareTransition(text) {
  const sentences = sentencesOf((text ?? "").trim());
  if (sentences.length === 0) return false;
  const last = sentences[sentences.length - 1];
  if (!TRANSITION.test(last) || CARRIES_ASK.test(last) || !/[.!]["'”’)\]]*$/.test(last)) return false;
  return !sentences.slice(0, -1).some((x) => isQuestionShaped(x) || isReportShaped(x));
}
function endsFinishedSentence(text) {
  const t = (text ?? "").trim();
  return /[.?!]["'”’)\]]*$/.test(t) && !isCutOffEnding(t) && !HANGING_END.test(t);
}
var FEEDBACK_WINDOW_MS = 2e4;
var HELD_MAX_AGE_MS = 15e3;
var RETRY_MS = 500;
var RETRY_TTL_MS = 8e3;
var PENDING_MAX_AGE_MS = 9e4;
var STALL_PROMOTE_MS = 2e3;
var STALL_SAME_CONTAINMENT = 0.9;
var STALL_TAIL_WORDS = 2;
var STALL_ANSWERED_TTL_MS = 3e4;
function isSameUtterance(interim, final) {
  const i = normalizeForCompare(interim).split(" ").filter(Boolean);
  const f = normalizeForCompare(final).split(" ").filter(Boolean);
  if (i.length === 0 || f.length === 0) return false;
  if (f.length > i.length + STALL_TAIL_WORDS) return false;
  const head = i.length > 1 ? i.slice(0, -1).join(" ") : i.join(" ");
  return tokenContainment(head, final) >= STALL_SAME_CONTAINMENT;
}
var DUPLICATE_FINAL_MS = 5e3;
var RULED_OUT_CONTAINMENT = 0.9;
var SPECULATION_HOLDS_QUESTION = 0.9;
var MERGED_ASK_GAP_MS = 1500;
var LOGISTICS_ASK = /\b(?:can|could) (?:you|everyone|everybody|y['’]?all) (?:hear|see) (?:me|us|my|this|that|the|it)\b|\b(?:are|is) (?:you|everyone|everybody|we) (?:ready|there|able to (?:hear|see)|good to go|all set)\b|\bam i (?:audible|on mute|muted|coming through|breaking up)\b|\b(?:is|was) (?:my|the) (?:audio|mic|microphone|sound|video|screen|connection|camera)\b|\b(?:shall|should|can) we (?:start|begin|get started|kick off)\b|\bhow are you\b|\bhow(?:['’]s| is) (?:it going|your day|everything|the weather)\b|\bdid you find\b|\b(?:is|was) (?:that|this|it) (?:better|clearer|okay|ok)\b|\bcan (?:i|you) (?:share|present)\b|\bare we (?:good|recording|live)\b|\b(?:any|got any) questions (?:for me|before)\b/i;
function isStandaloneAsk(sentence, punctuated) {
  const t = sentence.trim();
  if (!t || isCutOffEnding(t) || HANGING_END.test(t) || LOGISTICS_ASK.test(t)) return false;
  if (punctuated && !/[.?!]["'”’)\]]*$/.test(t)) return false;
  return /\?["'”’)\]]*$/.test(t) || FALLBACK_INTERROGATIVE.test(t) || DECLARATIVE_ASK.test(t);
}
function withMergedEarlierAsk(parts, questionText, punctuated, lastAnswered) {
  const covered = (p) => tokenContainment(p.text, questionText) >= 0.5;
  const c = parts.findIndex(covered);
  if (c <= 0) return questionText;
  let start = c;
  while (start > 0) {
    const next = parts[start];
    const prev = parts[start - 1];
    if (prev.provisional || prev.glueNext || covered(prev)) break;
    if ((next.startedAt ?? next.at) - prev.at > MERGED_ASK_GAP_MS) break;
    start--;
  }
  if (start === c) return questionText;
  const sentences = sentencesOf(joinTranscriptParts(parts.slice(start, c)));
  let from = sentences.length;
  while (from > 0 && isStandaloneAsk(sentences[from - 1], punctuated)) from--;
  if (from === sentences.length) return questionText;
  const earlier = sentences.slice(from).join(" ");
  if (lastAnswered && tokenContainment(earlier, lastAnswered) >= RULED_OUT_CONTAINMENT) return questionText;
  return `${earlier} ${questionText}`;
}
var SimpleAutoAnswerEngine = class {
  constructor(host, clock = systemClock, thresholds = DEFAULT_THRESHOLDS) {
    this.host = host;
    this.clock = clock;
    this.thresholds = thresholds;
  }
  host;
  clock;
  /** `provisional`: a stalled interim standing in for its final (STALL_PROMOTE_MS); only ever the LAST part. */
  pending = [];
  /**
   * How many leading `pending` finals a verdict has already ruled NOT an ask
   * (a statement, a rhetorical question, logistics). They stay in the
   * candidate — the judge needs them as context — but a question's SHAPE is
   * only read from the finals after them: otherwise "Great. So I'm Sarah…"
   * is the lead of every later candidate, the prefetch never gets its head
   * start, and a judge failure has no question to fall back on.
   */
  judgedParts = 0;
  /** Latest interviewer interim — the evidence for whether a final cut a word in half. */
  lastInterviewerInterim = "";
  /** When the latest utterance's first interim arrived: a voice-detector stop before it belongs to an earlier pause. */
  utteranceStartAt = 0;
  /** When the local voice detector last saw the interviewer stop; 0 once they speak again. */
  localStopAt = 0;
  /** Fires STALL_PROMOTE_MS after the interim froze. */
  stallTimer = null;
  /** A promoted interim that was answered, so its late final is not answered twice. */
  stallAnswered = null;
  /** The interim last promoted: one stand-in per frozen interim, however many stops follow. */
  promotedInterim = null;
  /**
   * Whether the voice detector's speech STARTS reach this engine (main wires
   * the native speech_edge). With them, a stop stays current until the next
   * start. Without them, only a stop after the utterance's first interim
   * counts, so a stale stop from an earlier pause never promotes mid-speech.
   */
  speechStartsSeen = false;
  /**
   * The voice detector reported a stop on a provider whose final comes only
   * after the speech ended (REST, local whisper), and the interviewer has not
   * started again since. A final that lands now closes the turn.
   */
  stopAwaitsFinal = false;
  /** speakerId per interviewer final, when the STT diarizes. Keyed by normalized text. */
  speakerByTurn = /* @__PURE__ */ new Map();
  timer = null;
  /** Fires EARLY_JUDGE_MS after the interviewer's last word: asks, never commits. */
  earlyTimer = null;
  /** Last interviewer text event of any kind — the commit clock. */
  lastInterviewerAt = 0;
  retryTimer = null;
  judgeSeq = 0;
  /** Aborts the judge call in flight; nulled when it settles or is superseded. */
  judgeAbort = null;
  sequence = 0;
  lastJudgedKey = "";
  lastAnsweredText = null;
  /** The automatic answer currently inside its feedback window. */
  feedbackPending = null;
  feedbackTimer = null;
  /** When the last prefetch fired, for PREFETCH_MIN_INTERVAL_MS pacing. */
  lastPrefetchAt = null;
  /** A dispatch waiting on a busy engine, so onEngineIdle can wake it immediately. */
  parkedAttempt = null;
  /** A positive verdict superseded by still-arriving transcript — see HELD_MAX_AGE_MS. */
  held = null;
  /** The judge call in flight and the finals it is ruling on (see INERT_MAX_WORDS). */
  inFlight = null;
  /** A stoppage skipped its own call because this in-flight one covers the grown text. */
  coveredBy = null;
  /** Interviewer finals seen, and how many ended in . ? ! — a session that punctuates marks its cut-offs by omission. */
  finalsSeen = 0;
  finalsTerminated = 0;
  /** The candidate the structure guard already waited STRUCTURE_GRACE_MS on: judge it as it stands. */
  graceKey = "";
  /** The finals the latest verdict ruled NOT an ask: inert growth after them is not re-judged. */
  settledNegative = null;
  /** Punctuation provenance of the latest interviewer final ('provider' family = a missing '?' means something). */
  punctuationGuaranteed = false;
  /** What last bumped judgeSeq, so a discarded verdict can say what killed it. */
  judgeSeqCause = null;
  thresholds;
  setThresholds(t) {
    this.thresholds = t;
  }
  /** Every supersede goes through here so the telemetry can name the cause. */
  bumpJudgeSeq(cause, keepCall = false) {
    this.judgeSeq++;
    this.judgeSeqCause = cause;
    if (keepCall) return;
    if (this.judgeAbort) {
      try {
        this.judgeAbort.abort();
      } catch {
      }
      this.judgeAbort = null;
    }
  }
  /** The pending finals are exactly `parts` plus inert finals after a finished sentence. */
  isInertExtension(parts) {
    if (!parts || parts.length === 0 || this.pending.length <= parts.length) return false;
    for (let i = 0; i < parts.length; i++) if (this.pending[i] !== parts[i]) return false;
    if (parts[parts.length - 1].glueNext || !endsFinishedSentence(joinTranscriptParts(parts))) return false;
    const growth = this.pending.slice(parts.length);
    let words = 0;
    for (const g of growth) {
      if (g.provisional || !isInertUtterance(g.text, true)) return false;
      words += g.text.split(/\s+/).filter(Boolean).length;
    }
    return words <= INERT_MAX_TOTAL_WORDS;
  }
  /** An interim that cannot change the ask the call in flight is ruling on. */
  interimKeepsCall(interim) {
    const f = this.inFlight;
    if (!f || !f.askShaped || !this.isInertExtensionOrSame(f.parts)) return false;
    return isInertUtterance(interim, false);
  }
  isInertExtensionOrSame(parts) {
    if (this.pending.length === parts.length) {
      for (let i = 0; i < parts.length; i++) if (this.pending[i] !== parts[i]) return false;
      return !parts[parts.length - 1].glueNext && endsFinishedSentence(joinTranscriptParts(parts));
    }
    return this.isInertExtension(parts);
  }
  onMeetingStart() {
    this.reset();
  }
  /**
   * The meeting's mode changed mid-meeting. Speech held for the next
   * candidate belongs to the old mode's conversation: drop it, and any
   * verdict still out on it, so the new mode's first question is not
   * prefixed with it (pipeline forensics 2026-11-13, F-CTX-03: a greeting
   * ruled silent rode into the Orion question 7.7 s later, after a switch).
   * Ids keep counting (a reset would reuse them within the meeting).
   */
  onModeChanged() {
    this.disarm();
    this.dropParked();
    this.pending = [];
    this.judgedParts = 0;
    this.held = null;
    this.inFlight = null;
    this.graceKey = "";
    this.lastJudgedKey = "";
    this.coveredBy = null;
    this.settledNegative = null;
    this.promotedInterim = null;
    this.stopAwaitsFinal = false;
    this.bumpJudgeSeq("meeting_reset");
  }
  onMeetingStop() {
    this.reset();
  }
  /**
   * The engine went idle. A dispatch parked behind it should go NOW rather
   * than wait out the rest of its 500 ms poll — measured on a real interview,
   * the poll was adding most of a second on top of an already 6-second wait.
   */
  onEngineIdle() {
    const parked = this.parkedAttempt;
    if (!parked) return;
    this.clearRetry();
    parked();
  }
  /** Provider says the interviewer's turn ended: confirm the stop sooner. */
  onProviderEndpoint() {
    if (!this.host.isEnabled() || this.pending.length === 0) return;
    this.arm(ENDPOINT_CONFIRM_MS);
  }
  /**
   * The LOCAL VAD (native capture, 150-200 ms hangover) saw the interviewer
   * stop. Only four STT providers emit their own end-of-turn event; the rest
   * waited the full STABILITY_MS after the last final even though the
   * capture layer already knew. Treat the local stop like a provider
   * endpoint — with one guard: a dangling interim means the final for the
   * last words has not landed yet, and committing now would judge half a
   * turn. That final re-arms the window itself when it arrives.
   */
  onLocalSpeechEnd() {
    if (!this.host.isEnabled()) return;
    this.localStopAt = this.clock.now();
    this.host.log?.(`[AutoAnswer:simple] voice stop (${this.lastInterviewerInterim ? "words in flight" : "transcript caught up"}, ${this.pending.length} pending)`);
    if (this.lastInterviewerInterim) {
      this.armStallCap();
      this.warmNextCandidate();
      return;
    }
    if (this.pending.length === 0) return;
    this.arm(ENDPOINT_CONFIRM_MS);
  }
  /**
   * The local voice detector saw the interviewer stop, on a provider that
   * transcribes a segment only after it ends (REST uploads, local whisper;
   * see acceptsLocalSpeechEndHint). The stop precedes the final, so it must
   * not commit what is pending now (that would judge the turn without its
   * last words). It confirms the final that FOLLOWS it instead: that final
   * arms ENDPOINT_CONFIRM_MS rather than STABILITY_MS, as long as the
   * interviewer has not started talking again (onLocalSpeechStart). Without
   * voice-detector starts a resumption would be invisible, so the hint is
   * not used. Pipeline forensics 2026-11-13, F-LAT-07.
   */
  onLocalSpeechEndBeforeFinal() {
    if (!this.host.isEnabled()) return;
    this.stopAwaitsFinal = true;
    this.host.log?.(`[AutoAnswer:simple] voice stop before its final (${this.speechStartsSeen ? "the next final closes the turn" : "no speech starts seen: not used"})`);
  }
  /**
   * The local voice detector saw the interviewer start talking again. A stop
   * the stall cap was counting on is over: frozen text now means a slow
   * transcriber mid-speech, not a finished speaker. Only the stall cap reads this.
   */
  onLocalSpeechStart() {
    this.speechStartsSeen = true;
    this.stopAwaitsFinal = false;
    this.localStopAt = 0;
    this.clearStallCap();
  }
  ingest(segment) {
    if (!this.host.isEnabled() || !this.host.isMeetingActive()) return;
    const text = (segment.text ?? "").trim();
    const now = this.clock.now();
    if (segment.speaker === "interviewer") {
      if (!segment.final) {
        if (this.pending.length > 0 || text) {
          if (text) {
            this.dropProvisional();
            this.promotedInterim = null;
            this.bumpJudgeSeq("interim", this.interimKeepsCall(text));
            if (!this.lastInterviewerInterim) this.utteranceStartAt = now;
            this.lastInterviewerAt = now;
            this.lastInterviewerInterim = text;
            this.armStallCap();
          }
          this.arm(STABILITY_MS);
        }
        return;
      }
      if (!text) return;
      this.punctuationGuaranteed = segment.punctuationSource === "provider" || segment.punctuationSource === "provider_final";
      const speaker = segment.speakerId;
      if (speaker) {
        this.speakerByTurn.set(normalizeForCompare(text), speaker);
        if (this.speakerByTurn.size > 64) {
          const oldest = this.speakerByTurn.keys().next().value;
          if (oldest !== void 0) this.speakerByTurn.delete(oldest);
        }
      }
      this.clearStallCap();
      this.promotedInterim = null;
      if (this.absorbStalledFinal(text, now, speaker)) return;
      const prev = this.pending[this.pending.length - 1];
      if (prev && !prev.provisional && now - prev.at <= DUPLICATE_FINAL_MS && normalizeForCompare(prev.text) === normalizeForCompare(text)) {
        this.lastInterviewerInterim = "";
        this.host.log?.("[AutoAnswer:simple] duplicate final dropped");
        return;
      }
      const glueNext = isMidWordCut(text, this.lastInterviewerInterim);
      const startedAt = this.lastInterviewerInterim ? this.utteranceStartAt : now;
      this.finalsSeen++;
      if (/[.?!]["'”’)\]]*$/.test(text)) this.finalsTerminated++;
      this.lastInterviewerInterim = "";
      this.pending.push({ text, at: now, startedAt, speaker, glueNext });
      this.bumpJudgeSeq("final", !!this.inFlight && this.isInertExtension(this.inFlight.parts));
      this.lastInterviewerAt = now;
      this.arm(this.stopAwaitsFinal && this.speechStartsSeen ? ENDPOINT_CONFIRM_MS : STABILITY_MS);
      return;
    }
  }
  // ── the stoppage ──────────────────────────────────────────────────────
  arm(ms) {
    this.disarm();
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      this.onStoppage(false);
    }, ms);
    const early = Math.min(EARLY_JUDGE_MS, ms);
    this.earlyTimer = this.clock.setTimeout(() => {
      this.earlyTimer = null;
      this.onStoppage(true);
    }, early);
  }
  disarm() {
    if (this.timer !== null) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.earlyTimer !== null) {
      this.clock.clearTimeout(this.earlyTimer);
      this.earlyTimer = null;
    }
  }
  onStoppage(early) {
    if (!this.host.isEnabled() || !this.host.isMeetingActive()) return;
    const now = this.clock.now();
    const before = this.pending.length;
    this.pending = this.pending.filter((p) => now - p.at <= PENDING_MAX_AGE_MS);
    this.judgedParts = Math.max(0, this.judgedParts - (before - this.pending.length));
    if (this.pending.length === 0) return;
    const candidate = joinTranscriptParts(this.pending);
    const key = normalizeForCompare(candidate);
    const words = candidate.split(/\s+/).filter(Boolean).length;
    const heldReady = this.applicableHeld(key, now);
    if (heldReady) {
      this.held = null;
      this.lastJudgedKey = key;
      this.emit({
        name: "auto_answer_judged",
        questionId: heldReady.id,
        judgeOutcome: "held_applied",
        judgeMs: now - heldReady.at,
        dialogueAct: heldReady.act,
        answerability: heldReady.answerability
      });
      this.host.log?.(`[AutoAnswer:simple] applying the deferred verdict for ${heldReady.id}`);
      this.host.logContent?.(`deferred verdict applied ${heldReady.id} (a=${heldReady.answerability})`, heldReady.text);
      this.deliver(heldReady.id, heldReady.text, heldReady.answerability, heldReady.act, now);
      return;
    }
    if (key === this.lastJudgedKey) return;
    if (this.inFlight && this.isInertExtension(this.inFlight.parts)) {
      this.lastJudgedKey = key;
      this.coveredBy = this.inFlight.id;
      this.host.log?.(`[AutoAnswer:simple] inert growth: waiting on the verdict in flight for ${this.inFlight.id}`);
      return;
    }
    if (this.isInertExtension(this.settledNegative)) {
      this.lastJudgedKey = key;
      this.host.log?.("[AutoAnswer:simple] inert growth after a silent verdict: not re-judged");
      return;
    }
    const last = this.pending[this.pending.length - 1];
    const punctuates = this.finalsTerminated >= PUNCTUATING_MIN_FINALS && this.finalsTerminated / this.finalsSeen >= PUNCTUATING_SHARE;
    const unterminated = punctuates && !/[.?!]["'”’)\]]*$/.test(last.text);
    if (early && (last.glueNext || isCutOffEnding(last.text) || unterminated)) {
      this.host.log?.("[AutoAnswer:simple] early ask skipped: the final stops mid-sentence");
      return;
    }
    const tooShort = words < MIN_NEW_WORDS && !candidate.includes("?") && !FALLBACK_INTERROGATIVE.test(candidate);
    if (tooShort) {
      this.emit({ name: "auto_answer_ignored", skipReason: "incomplete", candidateWordCount: words });
      return;
    }
    if (USER_BACKCHANNEL.test(candidate)) {
      this.emit({ name: "auto_answer_ignored", skipReason: "backchannel", candidateWordCount: words });
      return;
    }
    if (this.lastAnsweredText && normalizeForCompare(this.lastAnsweredText) === key) {
      this.emit({ name: "auto_answer_ignored", skipReason: "duplicate" });
      return;
    }
    if (isBareTransition(this.unjudgedText())) {
      if (!early) {
        this.host.log?.("[AutoAnswer:simple] bare transition: nothing asked yet");
        this.emit({ name: "auto_answer_ignored", skipReason: "not_question", candidateWordCount: words });
      }
      return;
    }
    if (key !== this.graceKey && awaitsStructure(this.unjudgedText())) {
      if (!early) {
        const wait = Math.max(0, STRUCTURE_GRACE_MS - (now - this.lastInterviewerAt));
        this.host.log?.(`[AutoAnswer:simple] structure guard: more is announced, waiting up to ${wait}ms`);
        this.emit({ name: "auto_answer_ignored", skipReason: "incomplete", candidateWordCount: words });
        this.timer = this.clock.setTimeout(() => {
          this.timer = null;
          this.graceKey = key;
          this.onStoppage(false);
        }, wait);
      }
      return;
    }
    const id = `${this.host.meetingGeneration()}-q${++this.sequence}`;
    this.emit({
      name: "auto_answer_candidate",
      questionId: id,
      candidateWordCount: words,
      endpointSource: this.pending.some((p) => p.provisional) ? "stt_stall" : "quiet_window"
    });
    this.lastJudgedKey = key;
    this.host.logContent?.(`judging ${id} (${words}w, user name ${this.host.userName?.() ? "known" : "unknown"})`, candidate);
    this.host.noteCandidate?.(id, this.sequence);
    this.maybePrefetch(id, candidate, this.unjudgedText(), now);
    void this.consult(id, candidate, now, early);
  }
  /** The finals no verdict has ruled on yet — where a new ask's shape is read. */
  unjudgedText() {
    return joinTranscriptParts(this.pending.slice(Math.min(this.judgedParts, this.pending.length)));
  }
  /**
   * The held verdict, if it still applies to this candidate: same text, or
   * the same text plus a little more speech. Anything else (a revision that
   * broke the prefix, a long continuation, an old verdict) is dropped here
   * so the stoppage judges afresh.
   */
  applicableHeld(key, now) {
    const h = this.held;
    if (!h) return null;
    if (now - h.at > HELD_MAX_AGE_MS) {
      this.held = null;
      return null;
    }
    if (key !== h.key && !this.isInertExtension(h.parts)) {
      this.held = null;
      return null;
    }
    return h;
  }
  /**
   * Start the answer while the judge is still deciding. Rationed by time, so
   * a declarative task gets the same head start as a question mark — see
   * PREFETCH_MIN_INTERVAL_MS. The engine applies its own guards on top (idle
   * only, never over a live stream or an existing speculation), so this can
   * be optimistic without stacking generations.
   */
  maybePrefetch(id, candidate, unjudged, now) {
    if (!this.host.prefetchAnswer) return;
    const rationed = this.lastPrefetchAt !== null && now - this.lastPrefetchAt < PREFETCH_MIN_INTERVAL_MS;
    if (rationed && !isQuestionShaped(unjudged) && !isReportShaped(unjudged)) return;
    this.lastPrefetchAt = now;
    try {
      this.host.prefetchAnswer(id, unjudged || candidate);
    } catch {
    }
  }
  async consult(id, candidate, committedAt, early = false) {
    const seq = this.judgeSeq;
    const generation = this.host.meetingGeneration();
    let timer = null;
    let timedOut = false;
    const turns = this.turnsBefore(committedAt);
    const parts = this.pending.map((p) => ({ speaker: p.speaker, text: p.text }));
    const partsAtConsult = this.pending.length;
    const snapshot = this.pending.slice();
    const unjudgedParts = this.pending.slice(Math.min(this.judgedParts, this.pending.length));
    const unjudged = this.unjudgedText();
    const ruledOut = joinTranscriptParts(this.pending.slice(0, Math.min(this.judgedParts, this.pending.length)));
    const onStandIn = this.pending.some((p) => p.provisional);
    const standInReplaced = () => onStandIn && !this.pending.some((p) => p.provisional);
    let raw = null;
    let outcome = "verdict";
    if (!this.host.judgeCandidate) {
      outcome = "absent";
    } else {
      const abort = new AbortController();
      this.judgeAbort = abort;
      this.inFlight = { id, parts: snapshot, askShaped: isQuestionShaped(unjudged) || isReportShaped(unjudged) };
      this.settledNegative = null;
      try {
        raw = await Promise.race([
          this.host.judgeCandidate({
            candidateText: candidate,
            recentTurns: turns,
            speakers: turns.map((t) => t.role === "interviewer" ? this.speakerByTurn.get(normalizeForCompare(t.text)) : void 0),
            candidateParts: parts,
            modeName: this.host.modeName?.() ?? null,
            questionId: id,
            lastAnsweredText: this.lastAnsweredText,
            userName: this.host.userName?.() ?? null,
            ...this.pending.some((p) => p.provisional) ? { transcriptLagging: true } : {}
          }, abort.signal),
          new Promise((resolve) => {
            const asked = /\?\s*$/.test(candidate) || sentencesOf(unjudged).some((x) => /\?\s*$/.test(x));
            timer = this.clock.setTimeout(() => {
              timedOut = true;
              resolve(null);
            }, asked ? QUESTION_JUDGE_DEADLINE_MS : JUDGE_DEADLINE_MS);
          })
        ]);
        if (timedOut) {
          outcome = "timeout";
          try {
            abort.abort();
          } catch {
          }
        }
      } catch {
        outcome = "error";
      } finally {
        if (timer !== null) this.clock.clearTimeout(timer);
        if (this.judgeAbort === abort) this.judgeAbort = null;
        if (this.inFlight?.id === id) this.inFlight = null;
      }
    }
    const judgeMs = this.clock.now() - committedAt;
    const verdict = outcome === "verdict" ? parseJudgeVerdict(raw, candidate) : null;
    if (seq !== this.judgeSeq || !this.host.isMeetingActive() || this.host.meetingGeneration() !== generation) {
      this.emit({
        name: "auto_answer_judged",
        questionId: id,
        judgeOutcome: "stale",
        judgeMs,
        supersededBy: !this.host.isMeetingActive() ? "meeting_ended" : this.host.meetingGeneration() !== generation ? "meeting_reset" : this.judgeSeqCause ?? void 0,
        ...verdict ? {
          judgeIsAsk: verdict.isAsk,
          judgeDirectedAtUser: verdict.directedAtUser,
          dialogueAct: verdict.act,
          answerability: verdict.answerability
        } : {}
      });
      this.host.logContent?.(
        `superseded ${id} by ${this.judgeSeqCause ?? "unknown"} after ${judgeMs}ms` + (verdict ? ` \u2014 it had said ${verdict.isAsk ? "ASK" : "not-ask"} a=${verdict.answerability}` : ""),
        candidate
      );
      const covered = this.coveredBy === id;
      if (covered) this.coveredBy = null;
      let settled = false;
      if (verdict && this.host.isMeetingActive() && this.host.meetingGeneration() === generation) {
        const superseded = routeForVerdict(verdict);
        if (superseded.route === "evaluate" && superseded.action === "answer" && superseded.answerability > ANSWER_FLOOR) {
          this.held = {
            id,
            key: normalizeForCompare(candidate),
            text: superseded.questionText ? withMergedEarlierAsk(unjudgedParts, superseded.questionText, this.punctuationGuaranteed, this.lastAnsweredText) : candidate,
            answerability: superseded.answerability,
            act: superseded.act,
            at: this.clock.now(),
            parts: snapshot
          };
          settled = true;
        } else if (superseded.route !== "wait_incomplete" && this.isInertExtension(snapshot)) {
          this.settledNegative = snapshot;
          this.judgedParts = partsAtConsult;
          settled = true;
        }
      }
      if (!this.host.isMeetingActive() || this.host.meetingGeneration() !== generation) return;
      const quiet = this.timer === null && this.earlyTimer === null;
      if (covered && !settled) {
        this.lastJudgedKey = "";
        if (quiet) this.arm(ENDPOINT_CONFIRM_MS);
      } else if (this.held?.id === id && quiet) {
        this.onStoppage(false);
      }
      return;
    }
    if (!verdict) {
      if (outcome === "verdict") outcome = "unparseable";
      if (outcome !== "absent") this.emit({ name: "auto_answer_judged", questionId: id, judgeOutcome: outcome, judgeMs });
      this.lastJudgedKey = "";
      if (standInReplaced()) {
        this.arm(ENDPOINT_CONFIRM_MS);
        return;
      }
      const fresh = sentencesOf(unjudged);
      const asked = /\?\s*$/.test(candidate) || fresh.some((s) => /\?\s*$/.test(s));
      const interrogative = fresh.some((s) => FALLBACK_INTERROGATIVE.test(s));
      const declarative = endsOnDeclarativeAsk(unjudged || candidate, this.punctuationGuaranteed);
      if (asked || !this.punctuationGuaranteed && interrogative || declarative) {
        this.host.log?.(`[AutoAnswer:simple] judge ${outcome} \u2014 fallback dispatch`);
        this.deliver(id, candidate, 0.9, "general_question", committedAt);
      }
      return;
    }
    this.emit({
      name: "auto_answer_judged",
      questionId: id,
      judgeOutcome: "verdict",
      judgeMs,
      judgeIsAsk: verdict.isAsk,
      judgeDirectedAtUser: verdict.directedAtUser,
      dialogueAct: verdict.act,
      answerability: verdict.answerability
    });
    const route = routeForVerdict(verdict);
    this.host.logContent?.(
      `verdict ${id} \u2192 ${route.route === "evaluate" ? route.action : route.route} (${verdict.act}, a=${verdict.answerability}, ${judgeMs}ms)`,
      route.route === "evaluate" ? route.questionText ?? candidate : candidate
    );
    if (route.route !== "evaluate") {
      const reason = route.route === "wait_incomplete" ? "incomplete" : route.reason;
      this.emit({ name: "auto_answer_ignored", questionId: id, skipReason: reason, dialogueAct: verdict.act, answerability: verdict.answerability });
      if (route.route === "wait_incomplete") {
        if (standInReplaced()) {
          this.lastJudgedKey = "";
          this.arm(ENDPOINT_CONFIRM_MS);
        }
      } else {
        this.judgedParts = partsAtConsult;
        this.settledNegative = snapshot;
      }
      return;
    }
    if (route.action === "answer" && route.questionText && ruledOut && tokenContainment(route.questionText, ruledOut) >= RULED_OUT_CONTAINMENT && tokenContainment(route.questionText, unjudged) < RULED_OUT_CONTAINMENT) {
      this.host.logContent?.(`ruled-out ask resurfaced ${id}`, route.questionText);
      this.emit({ name: "auto_answer_ignored", questionId: id, skipReason: "already_ruled_out", answerability: route.answerability });
      this.judgedParts = partsAtConsult;
      return;
    }
    const text = route.questionText ? withMergedEarlierAsk(unjudgedParts, route.questionText, this.punctuationGuaranteed, this.lastAnsweredText) : unjudged || candidate;
    if (route.action === "answer" && route.answerability > ANSWER_FLOOR) {
      if (early && this.timer !== null && this.clock.now() - this.lastInterviewerAt < STABILITY_MS) {
        this.held = { id, key: normalizeForCompare(candidate), text, answerability: route.answerability, act: route.act, at: this.clock.now(), parts: snapshot };
        return;
      }
      this.deliver(id, text, route.answerability, route.act, committedAt);
    } else {
      this.emit({ name: "auto_answer_ignored", questionId: id, skipReason: "low_answerability", answerability: route.answerability });
      this.judgedParts = partsAtConsult;
      this.settledNegative = snapshot;
    }
  }
  /** Dispatch now, or retry while the engine is busy — woken early by onEngineIdle. */
  deliver(id, text, answerability, act, committedAt) {
    const deadline = this.clock.now() + RETRY_TTL_MS;
    const seqAtDeliver = this.judgeSeq;
    const attempt = () => {
      if (!this.host.isMeetingActive() || this.judgeSeq !== seqAtDeliver) {
        const wasParked = this.parkedAttempt === attempt;
        if (wasParked) this.parkedAttempt = null;
        if (wasParked) {
          const reason = this.host.isMeetingActive() ? "superseded_while_parked" : "meeting_inactive";
          this.host.log?.(`[AutoAnswer:simple] parked dispatch for ${id} dropped: ${reason}${reason === "superseded_while_parked" ? ` (by ${this.judgeSeqCause ?? "unknown"})` : ""}`);
          this.emit({ name: "auto_answer_ignored", questionId: id, skipReason: reason, answerability });
        }
        return;
      }
      if (!this.host.engineAccepting()) {
        if (this.clock.now() >= deadline) {
          this.parkedAttempt = null;
          this.emit({ name: "auto_answer_ignored", questionId: id, skipReason: "engine_busy_or_cooling" });
          return;
        }
        this.parkedAttempt = attempt;
        this.retryTimer = this.clock.setTimeout(attempt, RETRY_MS);
        return;
      }
      this.parkedAttempt = null;
      const q = this.question(id, text, answerability, act, committedAt);
      const snapshot = this.host.speculativeSnapshot?.();
      const reuseSpeculative = Boolean(snapshot && snapshot.questionId === id && snapshot.text && tokenContainment(text, snapshot.text) >= SPECULATION_HOLDS_QUESTION);
      if (snapshot && snapshot.questionId === id && snapshot.text && !reuseSpeculative) {
        this.host.log?.(`[AutoAnswer:simple] the prefetched answer for ${id} was drafted for other words: starting over on the question`);
      }
      this.lastAnsweredText = text;
      const promoted = this.pending.find((p) => p.provisional);
      this.stallAnswered = promoted ? { text: promoted.text, at: this.clock.now() } : null;
      this.pending = [];
      this.judgedParts = 0;
      this.lastJudgedKey = "";
      this.emit({ name: "auto_answer_decision", questionId: id, action: "auto", answerability });
      if (reuseSpeculative) this.host.log?.(`[AutoAnswer:simple] reusing the prefetched answer for ${id}`);
      this.armFeedback(id, act, answerability);
      void this.host.dispatch(q, { reuseSpeculative });
    };
    attempt();
  }
  question(id, text, answerability, act, committedAt) {
    const now = this.clock.now();
    return {
      id,
      text,
      confidence: answerability,
      answerability,
      completionConfidence: 1,
      dialogueAct: act,
      isFollowUp: act === "follow_up_question",
      followUpTarget: "",
      startedAt: this.pending[0]?.at ?? committedAt,
      lastUpdatedAt: now,
      committedAt,
      endpointSource: "quiet_window",
      sourceSegments: this.pending.map((p) => p.at),
      candidateGeneration: this.sequence,
      meetingGeneration: this.host.meetingGeneration()
    };
  }
  turnsBefore(cutoff) {
    const pendingSet = new Set(this.pending.map((p) => normalizeForCompare(p.text)));
    return this.host.recentTurns().filter((t) => isSpokenTurn(t) && !(t.role === "interviewer" && pendingSet.has(normalizeForCompare(t.text)))).slice(-JUDGE_CONTEXT_TURNS);
  }
  /**
   * A manual What-to-Answer started. Inside the feedback window that is the
   * user telling us the automatic answer missed; the offer card (if any) is
   * committed either way.
   */
  onManualAnswerStarted() {
    const pending = this.feedbackPending;
    if (!pending) return;
    this.clearFeedback();
    const feedbackMs = this.clock.now() - pending.at;
    this.emit({
      name: "auto_answer_feedback",
      questionId: pending.id,
      feedback: "superseded",
      feedbackMs,
      dialogueAct: pending.act,
      answerability: pending.answerability
    });
    this.host.log?.(`[AutoAnswer:simple] superseded by a manual answer after ${feedbackMs}ms`);
  }
  armFeedback(id, act, answerability) {
    this.clearFeedback();
    this.feedbackPending = { id, at: this.clock.now(), act, answerability };
    this.feedbackTimer = this.clock.setTimeout(() => {
      const pending = this.feedbackPending;
      this.feedbackTimer = null;
      this.feedbackPending = null;
      if (!pending) return;
      this.emit({
        name: "auto_answer_feedback",
        questionId: pending.id,
        feedback: "kept",
        dialogueAct: pending.act,
        answerability: pending.answerability
      });
    }, FEEDBACK_WINDOW_MS);
  }
  clearFeedback() {
    if (this.feedbackTimer !== null) {
      this.clock.clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
    this.feedbackPending = null;
  }
  clearRetry() {
    if (this.retryTimer !== null) {
      this.clock.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
  dropParked() {
    this.parkedAttempt = null;
    this.clearRetry();
  }
  /**
   * Hand the host the candidate-to-be: the pending finals plus the interim
   * whose final is still in flight. The final usually adds one word to it, so
   * work keyed on this text (the query embedding) is reusable ~0.7 s early.
   */
  warmNextCandidate() {
    if (!this.host.warmQuery || !this.host.isMeetingActive()) return;
    try {
      const parts = [...this.pending.filter((p) => !p.provisional), { text: this.lastInterviewerInterim }];
      this.host.warmQuery(joinTranscriptParts(parts));
    } catch {
    }
  }
  // ── the stall cap (STALL_PROMOTE_MS) ─────────────────────────────────
  clearStallCap() {
    if (this.stallTimer !== null) {
      this.clock.clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }
  armStallCap() {
    this.clearStallCap();
    const from = Math.max(this.lastInterviewerAt, this.localStopAt);
    const wait = Math.max(0, from + STALL_PROMOTE_MS - this.clock.now());
    this.stallTimer = this.clock.setTimeout(() => {
      this.stallTimer = null;
      this.promoteStalledInterim();
    }, wait);
  }
  /**
   * The interim has been frozen STALL_PROMOTE_MS after the speaker stopped:
   * judge it as if it were the final. Never while they are still talking
   * (no voice-detector stop since this utterance began, or a start after it).
   */
  promoteStalledInterim() {
    if (!this.host.isEnabled() || !this.host.isMeetingActive()) return;
    const interim = this.lastInterviewerInterim;
    if (!interim || interim === this.promotedInterim || this.pending.some((p) => p.provisional)) return;
    if (this.localStopAt === 0) return;
    if (!this.speechStartsSeen && this.localStopAt < this.utteranceStartAt) return;
    const now = this.clock.now();
    const frozenFor = now - Math.max(this.lastInterviewerAt, this.localStopAt);
    if (frozenFor < STALL_PROMOTE_MS) {
      this.armStallCap();
      return;
    }
    this.pending.push({ text: interim, at: this.lastInterviewerAt, provisional: true });
    this.promotedInterim = interim;
    this.host.log?.(`[AutoAnswer:simple] transcript stalled ${now - this.lastInterviewerAt}ms after the speaker stopped: judging the last interim`);
    this.host.logContent?.("stalled interim promoted", interim);
    this.disarm();
    this.onStoppage(false);
  }
  /** Take the stand-in out of the candidate (the transcript moved, or the final said something else). */
  dropProvisional() {
    const i = this.pending.findIndex((p) => p.provisional);
    if (i < 0) return;
    this.pending.splice(i, 1);
    this.judgedParts = Math.min(this.judgedParts, this.pending.length);
  }
  /**
   * A final arrived after its interim was promoted. If it is the same
   * utterance, it takes the stand-in's place without superseding the verdict
   * already given or in flight (that verdict was about these words), and if
   * the stand-in was already answered, it is not answered twice. Returns true
   * when the final was absorbed.
   */
  absorbStalledFinal(text, now, speaker) {
    const answered = this.stallAnswered;
    this.stallAnswered = null;
    const i = this.pending.findIndex((p) => p.provisional);
    if (i >= 0) {
      if (!isSameUtterance(this.pending[i].text, text)) {
        this.dropProvisional();
        return false;
      }
      const before = normalizeForCompare(joinTranscriptParts(this.pending));
      this.pending[i] = { text, at: this.pending[i].at, speaker };
      const after = normalizeForCompare(joinTranscriptParts(this.pending));
      this.lastInterviewerInterim = "";
      if (this.held?.key === before) this.held.key = after;
      if (this.lastJudgedKey === before) this.lastJudgedKey = after;
      else this.arm(ENDPOINT_CONFIRM_MS);
      this.host.log?.("[AutoAnswer:simple] the stalled final arrived: it replaces the promoted interim");
      return true;
    }
    if (answered && now - answered.at <= STALL_ANSWERED_TTL_MS && isSameUtterance(answered.text, text)) {
      this.lastInterviewerInterim = "";
      this.host.log?.("[AutoAnswer:simple] the stalled final arrived after its interim was answered: not answering it again");
      return true;
    }
    return false;
  }
  reset() {
    this.disarm();
    this.dropParked();
    this.clearFeedback();
    this.pending = [];
    this.judgedParts = 0;
    this.lastInterviewerInterim = "";
    this.lastInterviewerAt = 0;
    this.utteranceStartAt = 0;
    this.localStopAt = 0;
    this.clearStallCap();
    this.stallAnswered = null;
    this.promotedInterim = null;
    this.speechStartsSeen = false;
    this.stopAwaitsFinal = false;
    this.speakerByTurn.clear();
    this.lastJudgedKey = "";
    this.lastAnsweredText = null;
    this.lastPrefetchAt = null;
    this.held = null;
    this.inFlight = null;
    this.finalsSeen = 0;
    this.finalsTerminated = 0;
    this.graceKey = "";
    this.coveredBy = null;
    this.settledNegative = null;
    this.bumpJudgeSeq("meeting_reset");
    this.sequence = 0;
  }
  emit(event) {
    try {
      this.host.telemetry?.({ ...event, meetingGeneration: this.host.meetingGeneration() });
    } catch {
    }
    if (event.name === "auto_answer_ignored") this.host.log?.(`[AutoAnswer:simple] skipped: ${event.skipReason}${event.questionId ? ` (${event.questionId})` : ""}`);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ANSWER_FLOOR,
  DUPLICATE_FINAL_MS,
  EARLY_JUDGE_MS,
  ENDPOINT_CONFIRM_MS,
  FALLBACK_INTERROGATIVE,
  FEEDBACK_WINDOW_MS,
  HELD_MAX_AGE_MS,
  INERT_MAX_TOTAL_WORDS,
  INERT_MAX_WORDS,
  MERGED_ASK_GAP_MS,
  MIN_NEW_WORDS,
  PENDING_MAX_AGE_MS,
  PREFETCH_MIN_INTERVAL_MS,
  PUNCTUATING_MIN_FINALS,
  PUNCTUATING_SHARE,
  QUESTION_JUDGE_DEADLINE_MS,
  REPORT_SHAPED,
  RETRY_MS,
  RETRY_TTL_MS,
  RULED_OUT_CONTAINMENT,
  SPECULATION_HOLDS_QUESTION,
  STABILITY_MS,
  STALL_ANSWERED_TTL_MS,
  STALL_PROMOTE_MS,
  STRUCTURE_GRACE_MS,
  SimpleAutoAnswerEngine,
  USER_BACKCHANNEL,
  acceptsLocalSpeechEndHint,
  awaitsStructure,
  endsOnDeclarativeAsk,
  isBareTransition,
  isCutOffEnding,
  isInertUtterance,
  isQuestionShaped,
  isReportShaped,
  isSameUtterance,
  sentencesOf,
  withMergedEarlierAsk
});
