import { useRef, useCallback, useState } from 'react';
import { type PassiveQuestionCandidate, hasInterrogativeTrigger } from './usePassiveQuestionDetection';

// Re-use the same blocklists from passive detection
const GREETING_PATTERNS = [
  /^how('?s| is) everyone/i,
  /^how('?s| is) everybody/i,
  /^how('?s| are) (you|y'all|ya'll|yall) (all )?(doing|today|this|feeling)/i,
  /^how are (we|you|you guys|y'all|everyone|everybody) (doing|today|this|feeling)/i,
  /^how('?s| is) it going/i,
  /^what('?s| is) up/i,
  /^how('?s| is| are) (your|the) (day|morning|afternoon|evening)/i,
  /^how('?s| is| are) (you|everyone|everybody|you guys) feeling/i,
  /^(good )?(morning|afternoon|evening|hey|hello|hi|welcome)/i,
  /^(is )?everyone (here|ready|good|doing)/i,
  /^(are )?we (all )?(here|ready|good|set)/i,
  /^can (you|everyone|everybody) hear me/i,
  /^can (you|everyone|everybody) see (me|this|the screen|my screen)/i,
];

const RHETORICAL_BLOCKLIST = [
  'right', 'okay', 'ok', 'understand', 'got it', 'you know',
  'see what i mean', "isn't it", "aren't they", "don't you think",
  'does that make sense', 'make sense', 'with me so far', 'any questions',
  'everyone with me', 'following along', 'clear', 'is that clear',
  'what do you think', 'what do you guys think', 'what do you all think',
  'how about that', 'how does that sound', 'where were we', 'where was i',
  'who knows', 'who can tell me', 'who would have thought',
  'how are we doing', 'how are you doing', 'how is everyone doing',
];

// Interrogative trigger patterns. WH-words and yes/no-inversion auxiliaries
// MUST sit at the START of a clause — either the start of the buffer or
// immediately after a hard sentence terminator / em-dash. A bare comma is
// NOT a hard boundary: "…how they stain, how they interact, and how X…"
// is a declarative enumeration, not three questions. The only comma path
// that arms a WH-trigger is when the pre-comma clause is an explicit
// PREMISE clause ("Given what we just said about X, why does Y…").
const CLAUSE_START = '(?:^|[.?!;\\u2014\\u2013]\\s+|\\s[\\u2014\\u2013]\\s+)';
// Discourse markers that can sit between a clause boundary and the real WH-word
// ("…flattens out. So why does it stop…", "…okay, now what happens…").
// They are stripped later by FILLER_PREFIXES / postProcess.
const DISCOURSE_MARKERS = '(?:(?:so|now|and|but|well|okay|ok|or|then|also|and so|but so)\\s+)*';
// Subordinators that introduce a premise clause preceding the interrogative
// (e.g., "If a cell has X, what happens?"). Used both as a regex source for
// the premise-comma trigger pattern AND by the premise-rescue logic in
// getSliceAroundTrigger.
const PREMISE_SUBORDINATOR_SOURCE =
  'if|when|whenever|suppose|supposing|given|assuming|provided|since|because|once|unless|although|though|while|as|considering';
const PREMISE_SUBORDINATORS = new RegExp(`^(${PREMISE_SUBORDINATOR_SOURCE})\\b`, 'i');
// Premise-comma start: a hard sentence boundary (or buffer start), then a
// subordinator-led clause, then a comma. Implemented as a lookbehind so the
// match index lands on the WH-word — the premise is preserved in the buffer
// and recovered by the premise-rescue logic in getSliceAroundTrigger.
const PREMISE_COMMA_LOOKBEHIND =
  `(?<=(?:^|[.?!;]\\s+)(?:${PREMISE_SUBORDINATOR_SOURCE})\\b[^.?!;]{0,400}?,\\s+)`;
const WH_WORDS = '(what|why|how|when|where|who|whom|whose|which)';
// Inverted auxiliaries that confirm a true interrogative clause shape
// (e.g. "what advantage DOES…", "why ARE these…", "how CAN we…").
const INVERSION_AUX = '(do|does|did|is|are|was|were|am|can|could|would|should|will|shall|may|might|must|has|have|had)';
const TRIGGER_PATTERNS = [
  // Classic WH questions — hard clause-start anchored, optional discourse markers.
  new RegExp(`${CLAUSE_START}${DISCOURSE_MARKERS}${WH_WORDS}\\b\\s+\\S+`, 'i'),
  // Premise-led WH questions — comma path only when the pre-comma clause
  // starts with a subordinator ("Given…, why…" / "Considering…, how…").
  new RegExp(`${PREMISE_COMMA_LOOKBEHIND}${DISCOURSE_MARKERS}${WH_WORDS}\\b\\s+\\S+`, 'i'),
  // Comma-WH with subject-aux inversion — catches cross-chunk premise/WH
  // splits like "…ratio, what advantage does that give it?" even when the
  // pre-comma clause doesn't sit at a hard sentence boundary in the buffer
  // (very common: Deepgram rarely emits a "." before a premise clause).
  // Requires an inverted auxiliary (does/is/are/can/…) within the next
  // ~4 tokens after the WH-word, which reliably distinguishes a real
  // question from a declarative enumeration ("…how they stain, how they
  // interact, and how X…" has no inverted aux after the WH).
  new RegExp(`,\\s+${DISCOURSE_MARKERS}${WH_WORDS}\\b(?:\\s+\\S+){1,4}\\s+${INVERSION_AUX}\\b`, 'i'),
  // Embedded / conversational interrogatives
  /\btell\s+me\s+(what|why|how|when|where|who|which|about|if)\b/i,
  /\b(anyone|anybody|someone|somebody)\s+(know|tell|explain|guess|say|remember|recall)\b/i,
  /\b(can|could|would)\s+(someone|anyone|anybody|somebody)\s+(tell|explain|describe|say|name|identify|guess)\b/i,
  /\bdo\s+you\s+(know|think|see|understand|remember|recall|recognize)\b/i,
  /\bwhat\s+would\s+happen\b/i,
  // NOTE: "suppose that" is intentionally NOT a trigger — it's a PREMISE
  // subordinator (handled below), not a question stem. The real question
  // follows ("Suppose X, what would Y do?").
  // Subject-aux inversion (yes/no & A-or-B questions) — clause-start anchored.
  new RegExp(`${CLAUSE_START}(is|are|was|were|am)\\s+(it|this|that|these|those|there|he|she|they|we|you|i|any|all|both|either|neither|some|most|more|less|fewer|every|each|no|one|two|three)\\b`, 'i'),
  new RegExp(`${CLAUSE_START}(do|does|did)\\s+(it|this|that|these|those|he|she|they|we|you|i|any|all|both|either|neither|some|most|every|each)\\b`, 'i'),
  new RegExp(`${CLAUSE_START}(can|could|would|should|will|shall|may|might|must)\\s+(it|this|that|these|those|he|she|they|we|you|i|any|all|both|either|neither|some|most|every|each|anyone|anybody|someone|somebody|everyone|everybody)\\b`, 'i'),
  new RegExp(`${CLAUSE_START}(has|have|had)\\s+(it|this|that|these|those|he|she|they|we|you|i|any|all|both|either|neither|anyone|anybody|someone|somebody|everyone|everybody)\\b`, 'i'),
];

// (PREMISE_SUBORDINATORS is declared above alongside the trigger patterns so
// the premise-comma WH regex can share its source.)

// Topic-shift markers — when scanning back for context, stop at these.
const TOPIC_SHIFT_MARKERS = [
  /\b(alright|okay|ok|so|now)\s+(let'?s|let us|moving|next|switching|turning)\b/i,
  /\b(next|moving on to|let'?s talk about|switching gears|on to)\b/i,
  /\bnew topic\b/i,
];

// Chunks separated by more than this gap belong to a different breath/topic.
const CHUNK_GAP_BOUNDARY_MS = 4000;

// Leading filler words to strip
const FILLER_PREFIXES = /^(so+|um+|uh+|like|well|okay so|okay|now|and so|but)\s+/i;

// ===== Semantic completion gate constants =====
const DANGLING_TAIL_TOKENS = new Set([
  'of', 'to', 'for', 'with', 'in', 'on', 'between', 'about', 'at', 'by', 'from', 'into', 'onto', 'upon',
  'the', 'a', 'an',
  'and', 'or', 'but', 'nor', 'yet', 'so',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did',
  'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might', 'must',
  'has', 'have', 'had',
]);

const COMPARATIVE_TAIL_TOKENS = new Set([
  'than', 'as', 'like', 'versus', 'vs', 'compared',
]);

const TRAILING_FILLER_PATTERNS = [
  /\bum+$/i, /\buh+$/i, /\blike$/i, /\byou know$/i, /\bsort of$/i, /\bkind of$/i,
];

const STOPWORDS_AFTER_TRIGGER = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'do', 'does', 'did', 'has', 'have', 'had',
  'of', 'to', 'for', 'with', 'in', 'on', 'at', 'by', 'from',
  'and', 'or', 'but', 'so', 'this', 'that', 'these', 'those',
  'my', 'your', 'our', 'their', 'his', 'her', 'its',
  'about', 'into', 'than', 'as', 'like',
]);

type GateStatus = 'pass' | 'hold' | 'reject';
interface GateVerdict {
  status: GateStatus;
  reason: string;
}

function evaluateCompleteness(
  text: string,
  opts: { minWords: number; elapsedMs: number; softCompleteMs: number }
): GateVerdict {
  const cleaned = text.trim().replace(/[?.!,;:]+$/, '').trim();
  if (!cleaned) return { status: 'reject', reason: 'empty' };

  const words = cleaned.split(/\s+/).filter(Boolean);
  const lower = cleaned.toLowerCase();

  // 1. Minimum word count
  if (words.length < opts.minWords) {
    return { status: 'reject', reason: `too short (${words.length} words)` };
  }

  // 6. Repetition / stutter — same trigram 3+ times
  if (words.length >= 9) {
    const trigrams = new Map<string, number>();
    for (let i = 0; i <= words.length - 3; i++) {
      const tg = words.slice(i, i + 3).join(' ').toLowerCase();
      trigrams.set(tg, (trigrams.get(tg) ?? 0) + 1);
    }
    for (const [tg, count] of trigrams) {
      if (count >= 3) return { status: 'reject', reason: `stutter "${tg}" x${count}` };
    }
  }

  const lastWord = words[words.length - 1].toLowerCase().replace(/[^a-z']/g, '');

  // 7. Trailing filler
  for (const pat of TRAILING_FILLER_PATTERNS) {
    if (pat.test(lower)) return { status: 'hold', reason: `trailing filler` };
  }

  // 2. Trailing dangling token (preposition / conjunction / article / aux)
  if (DANGLING_TAIL_TOKENS.has(lastWord)) {
    return { status: 'hold', reason: `trailing dangling token: "${lastWord}"` };
  }

  // 5. Comparative / relational dangler
  if (COMPARATIVE_TAIL_TOKENS.has(lastWord)) {
    return { status: 'hold', reason: `trailing comparative: "${lastWord}"` };
  }

  // 3. Hanging interrogative — trigger word at or near the end
  let triggerIdx = -1;
  for (const pattern of TRIGGER_PATTERNS) {
    const m = lower.match(pattern);
    if (m && m.index !== undefined) {
      // approximate word index of trigger
      const before = lower.substring(0, m.index);
      triggerIdx = before.split(/\s+/).filter(Boolean).length;
      break;
    }
  }
  if (triggerIdx >= 0 && triggerIdx >= words.length - 3) {
    return { status: 'hold', reason: `hanging interrogative (trigger near end)` };
  }

  // 4. Subject-verb presence — at least one substantive word (≥4 chars, non-stopword) after trigger
  if (triggerIdx >= 0) {
    const afterTrigger = words.slice(triggerIdx + 1);
    const hasSubstantive = afterTrigger.some(w => {
      const clean = w.toLowerCase().replace(/[^a-z']/g, '');
      return clean.length >= 4 && !STOPWORDS_AFTER_TRIGGER.has(clean);
    });
    if (!hasSubstantive) {
      return { status: 'hold', reason: 'no substantive content after trigger' };
    }
  }

  // 8. Punctuation sanity — no terminal punct AND too soon
  const hasTerminalPunct = /[.?!]/.test(text);
  if (!hasTerminalPunct && opts.elapsedMs < opts.softCompleteMs) {
    return { status: 'hold', reason: `no punctuation yet (elapsed ${opts.elapsedMs}ms)` };
  }

  return { status: 'pass', reason: `${words.length} words` };
}

interface UseQuestionTriggerCaptureOptions {
  cooldownMs?: number;
  silenceGapMs?: number;
  bufferWindowMs?: number;
  lookbackMs?: number;
  completionTimeoutMs?: number;
  minHoldMs?: number;
  maxBufferChars?: number;
  enableCompletionGate?: boolean;
  extensionMs?: number;
  maxExtensions?: number;
  minCompleteWords?: number;
  softCompleteMs?: number;
  minSilenceMs?: number;
  debug?: boolean;
}

interface BufferChunk {
  text: string;
  timestamp: number;
}

interface TriggerMatch {
  index: number;
  text: string;
}

let triggerIdCounter = 0;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function findFirstTriggerMatch(text: string): TriggerMatch | null {
  const lower = text.toLowerCase().replace(FILLER_PREFIXES, '').trim();
  for (const pattern of TRIGGER_PATTERNS) {
    const match = lower.match(pattern);
    if (match && match.index !== undefined) {
      return { index: match.index, text: match[0] };
    }
  }
  return null;
}

function getRecentSpeechSegment(chunks: BufferChunk[], now: number): string {
  const recent: BufferChunk[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    const chunk = chunks[i];
    if (now - chunk.timestamp > CHUNK_GAP_BOUNDARY_MS) break;
    if (recent.length > 0) {
      const nextNewer = recent[0];
      if (nextNewer.timestamp - chunk.timestamp > CHUNK_GAP_BOUNDARY_MS) break;
    }
    recent.unshift(chunk);
    if (recent.length >= 5) break;
  }
  return recent.map(c => c.text).join(' ').trim();
}

/**
 * Minimal post-processing: merge chunks, deduplicate boundary words,
 * strip filler, ensure trailing ?.  NO paraphrasing.
 */
function postProcess(text: string): string {
  if (!text) return '';

  let merged = text.trim();

  // Strip leading punctuation/dashes left over from the slice split
  // (e.g. "— which algorithm…", ", how did…").
  merged = merged.replace(/^[\s.,;:!?\-\u2014\u2013]+/, '').trim();

  // Strip leading filler (multiple passes)
  merged = merged.replace(FILLER_PREFIXES, '').trim();
  merged = merged.replace(FILLER_PREFIXES, '').trim();

  // Ensure trailing ?
  merged = merged.replace(/[.!,;:]+$/, '').trim();
  if (!merged.endsWith('?')) {
    merged += '?';
  }

  // Capitalize first letter
  if (merged.length > 0) {
    merged = merged.charAt(0).toUpperCase() + merged.slice(1);
  }

  return merged;
}

function isRhetoricalOrGreeting(text: string): boolean {
  const normalized = text.replace(/[?？]+$/, '').trim().toLowerCase();

  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }

  for (const phrase of RHETORICAL_BLOCKLIST) {
    if (normalized === phrase) return true;
    const stripped = normalized.replace(/^(so|and|but|well|now|or|um|uh|like)\s+/i, '').trim();
    if (stripped === phrase) return true;
  }

  return false;
}

export function useQuestionTriggerCapture(options: UseQuestionTriggerCaptureOptions = {}) {
  const {
    cooldownMs = 12000,
    silenceGapMs = 1500,
    bufferWindowMs = 90000,
    lookbackMs = 45000,
    completionTimeoutMs = 2000,
    minHoldMs = 400,
    maxBufferChars = 10000,
    enableCompletionGate = true,
    extensionMs = 800,
    maxExtensions = 1,
    minCompleteWords = 6,
    softCompleteMs = 2500,
    minSilenceMs = 700,
    debug = true,
  } = options;

  // Persistent rolling buffer — never cleared on trigger, only trimmed by age/size
  const bufferRef = useRef<BufferChunk[]>([]);
  const lastTriggerTimeRef = useRef<number>(0);
  // Cooldown lock — only set on successful PASS to prevent re-trigger on same utterance
  const lastSuccessTimeRef = useRef<number>(0);
  // Track most recent chunk arrival to enforce min-silence before finalize
  const lastChunkTimeRef = useRef<number>(0);
  // Concurrency guard against timer + sentence-end races
  const isFinalizingRef = useRef<boolean>(false);

  // Pending trigger state (decoupled from "capturing")
  const pendingTriggerRef = useRef<{
    triggerTs: number;
    triggerWord: string;
    armedAt: number;
  } | null>(null);

  const extensionsUsedRef = useRef<number>(0);
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const onCaptureCompleteRef = useRef<((candidate: PassiveQuestionCandidate) => void) | null>(null);

  const setOnCaptureComplete = useCallback((cb: (candidate: PassiveQuestionCandidate) => void) => {
    onCaptureCompleteRef.current = cb;
  }, []);

  const clearCompletionTimer = useCallback(() => {
    if (completionTimerRef.current) {
      clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
  }, []);

  /**
   * Trim buffer: drop chunks older than bufferWindowMs, then cap total chars.
   */
  const trimBuffer = useCallback((now: number) => {
    const cutoff = now - bufferWindowMs;
    bufferRef.current = bufferRef.current.filter(c => c.timestamp >= cutoff);

    let totalChars = bufferRef.current.reduce((s, c) => s + c.text.length, 0);
    while (totalChars > maxBufferChars && bufferRef.current.length > 1) {
      const dropped = bufferRef.current.shift();
      totalChars -= dropped?.text.length ?? 0;
    }
  }, [bufferWindowMs, maxBufferChars]);

  /**
   * Get a structured slice of the buffer around the trigger:
   *  - `question`: text from the trigger word forward.
   *  - `context`:  teaching prose preceding the question, walking back from the
   *               trigger and stopping at (a) a chunk-time gap > CHUNK_GAP_BOUNDARY_MS
   *               (a real pause in speech) or (b) a topic-shift marker. Punctuation
   *               from Deepgram is unreliable mid-lecture so we no longer rely on it
   *               as the primary boundary — pauses are far more reliable signals of
   *               where one teaching segment ends and another begins.
   */
  const getSliceAroundTrigger = useCallback((triggerTs: number, now: number): { question: string; context: string } => {
    const startCutoff = triggerTs - lookbackMs;
    const relevantChunks = bufferRef.current.filter(
      c => c.timestamp >= startCutoff && c.timestamp <= now
    );

    if (relevantChunks.length === 0) return { question: '', context: '' };

    const combined = relevantChunks.map(c => c.text).join(' ').trim();
    const lower = combined.toLowerCase();

    // 1. Anchor slicing to the chunk that actually armed capture instead of
    // re-scanning the entire 45s lookback. Re-scanning the full buffer can match
    // an old WH phrase still inside the rolling window, then append the current
    // premise to the end of the question.
    let triggerChunkIdx = relevantChunks.findIndex(c => c.timestamp >= triggerTs);
    if (triggerChunkIdx < 0) triggerChunkIdx = relevantChunks.length - 1;

    // 3. Walk back from the trigger chunk to find the topic-segment start:
    //    stop at a chunk gap > CHUNK_GAP_BOUNDARY_MS or at a topic-shift marker.
    let contextStartIdx = 0;
    for (let i = triggerChunkIdx; i > 0; i--) {
      const gap = relevantChunks[i].timestamp - relevantChunks[i - 1].timestamp;
      if (gap > CHUNK_GAP_BOUNDARY_MS) {
        contextStartIdx = i;
        break;
      }
      if (TOPIC_SHIFT_MARKERS.some(p => p.test(relevantChunks[i - 1].text))) {
        contextStartIdx = i;
        break;
      }
    }

    const contextChunks = relevantChunks.slice(contextStartIdx, triggerChunkIdx);
    const triggerOnwardChunks = relevantChunks.slice(triggerChunkIdx);

    // 4. Within the trigger chunk + onward, the question starts at triggerPos.
    //    Anything BEFORE the trigger word in that same chunk is part of the same
    //    breath, so it counts as context.
    const triggerOnwardText = triggerOnwardChunks.map(c => c.text).join(' ').trim();
    let question = triggerOnwardText;
    let triggerChunkPrefix = '';

    const triggerMatch = findFirstTriggerMatch(triggerOnwardText);
    if (triggerMatch) {
      triggerChunkPrefix = triggerOnwardText.substring(0, triggerMatch.index).trim();
      question = triggerOnwardText.substring(triggerMatch.index).trim();
    }

    const contextParts = [contextChunks.map(c => c.text).join(' ').trim(), triggerChunkPrefix]
      .filter(Boolean);
    let context = contextParts.join(' ').trim();

    // Premise-clause rescue: if the tail of `context` is a subordinate clause
    // belonging to the same question (e.g. "If a cell has high SA:V ratio,"
    // immediately before "what advantage..."), promote it into `question`.
    //
    // Conditions:
    //  - The "premise tail" is the text after the last sentence-terminator
    //    (./?/!) in context. If there is none, the whole context is the tail.
    //  - The tail must either (a) end with a comma OR (b) start with a known
    //    subordinator (if/when/given/...).
    //  - The chunk immediately before the trigger must be within
    //    CHUNK_GAP_BOUNDARY_MS of the trigger chunk (same breath).
    if (context && triggerChunkIdx > 0) {
      const gapToTrigger =
        relevantChunks[triggerChunkIdx].timestamp - relevantChunks[triggerChunkIdx - 1].timestamp;
      if (gapToTrigger <= CHUNK_GAP_BOUNDARY_MS) {
        const lastTerm = Math.max(
          context.lastIndexOf('.'),
          context.lastIndexOf('?'),
          context.lastIndexOf('!'),
        );
        const tail = (lastTerm >= 0 ? context.slice(lastTerm + 1) : context).trim();
        const tailEndsWithComma = /,\s*$/.test(tail);
        const tailStartsWithSubordinator = PREMISE_SUBORDINATORS.test(tail);

        // Only promote the prior clause into the question when it's an
        // explicit subordinator-led premise (e.g. "If a cell has X, …").
        // A bare trailing comma is NOT enough — that catches generic preambles
        // like "…everything I said, why does this stop…" and produces run-ons.
        if (tail && tailStartsWithSubordinator) {
          const newContext = (lastTerm >= 0 ? context.slice(0, lastTerm + 1) : '').trim();
          const premise = tail.replace(/[,;:]+$/, '') + ',';
          question = `${premise} ${question}`.replace(/\s+/g, ' ').trim();
          context = newContext;
        }
      }
    }

    return { question: question || combined, context };
  }, [lookbackMs]);

  const finalizeCapture = useCallback((now: number, isForced = false) => {
    const pending = pendingTriggerRef.current;
    if (!pending) {
      clearCompletionTimer();
      setIsCapturing(false);
      return;
    }

    // Concurrency guard — prevent timer + sentence-end races
    if (isFinalizingRef.current) {
      if (debug) console.log('🔒 [finalize-lock] already finalizing, skip');
      return;
    }

    // Min-silence check — defer if Deepgram is still emitting chunks
    const silenceElapsed = now - (lastChunkTimeRef.current || pending.armedAt);
    if (!isForced && silenceElapsed < minSilenceMs && extensionsUsedRef.current < maxExtensions) {
      const waitMs = Math.max(300, minSilenceMs - silenceElapsed);
      extensionsUsedRef.current += 1;
      if (debug) {
        console.log(`🤫 [silence-wait] lastChunk=${silenceElapsed}ms ago, deferring finalize +${waitMs}ms (ext ${extensionsUsedRef.current}/${maxExtensions})`);
      }
      clearCompletionTimer();
      const isFinalExtension = extensionsUsedRef.current >= maxExtensions;
      completionTimerRef.current = setTimeout(() => {
        finalizeCapture(Date.now(), isFinalExtension);
      }, waitMs);
      return;
    }

    isFinalizingRef.current = true;

    try {
      const slice = getSliceAroundTrigger(pending.triggerTs, now);
      const elapsedSinceTrigger = now - pending.triggerTs;
      const lookbackUsed = Math.min(lookbackMs, pending.triggerTs - (bufferRef.current[0]?.timestamp ?? pending.triggerTs));

      if (debug) {
        console.log(`🎯 [slice-split] question="${slice.question.substring(0, 100)}" context="${slice.context.substring(0, 100)}" (${lookbackUsed}ms lookback)`);
      }

      if (!slice.question) {
        if (debug) console.log('🎯 [trigger-capture] empty slice, abort');
        pendingTriggerRef.current = null;
        extensionsUsedRef.current = 0;
        clearCompletionTimer();
        setIsCapturing(false);
        return;
      }

      const question = postProcess(slice.question);

      // ===== Semantic completion gate =====
      if (enableCompletionGate) {
        const verdict = evaluateCompleteness(question, {
          minWords: minCompleteWords,
          elapsedMs: elapsedSinceTrigger,
          softCompleteMs,
        });

        if (verdict.status === 'hold' && !isForced && extensionsUsedRef.current < maxExtensions) {
          extensionsUsedRef.current += 1;
          if (debug) {
            console.log(`🚦 [gate-hold] reason="${verdict.reason}" extension=${extensionsUsedRef.current}/${maxExtensions}`);
          }
          clearCompletionTimer();
          const isFinalExtension = extensionsUsedRef.current >= maxExtensions;
          completionTimerRef.current = setTimeout(() => {
            if (debug) console.log(`🚦 [gate-extend] timer fired (+${extensionMs}ms)`);
            finalizeCapture(Date.now(), isFinalExtension);
          }, extensionMs);
          return;
        }

        if (verdict.status === 'reject' || (verdict.status === 'hold' && (isForced || extensionsUsedRef.current >= maxExtensions))) {
          if (debug) {
            const tag = verdict.status === 'reject' ? 'gate-reject' : 'gate-reject (max-ext)';
            console.log(`🚦 [${tag}] reason="${verdict.reason}" — cooldown NOT set, retry allowed`);
          }
          pendingTriggerRef.current = null;
          extensionsUsedRef.current = 0;
          clearCompletionTimer();
          setIsCapturing(false);
          return;
        }

        if (debug) console.log(`🚦 [gate-pass] ${verdict.reason}`);
      }

      // Reset pending state — passing the gate
      pendingTriggerRef.current = null;
      extensionsUsedRef.current = 0;
      clearCompletionTimer();
      setIsCapturing(false);

      if (isRhetoricalOrGreeting(question)) {
        if (debug) console.log('🎯 [trigger-capture] blocked — rhetorical/greeting (no cooldown)');
        return;
      }

      if (wordCount(question) < 5) {
        if (debug) console.log('🎯 [trigger-capture] blocked — too short (no cooldown)');
        return;
      }

      // Final trigger check on the cleaned question text — defends against
      // declaratives where the buffer scan matched a subject-aux earlier in
      // the segment but the slice produced a non-interrogative final string
      // (e.g. "Today, we'll be talking about osmosis?").
      let finalQuestion = question;
      if (!hasInterrogativeTrigger(finalQuestion)) {
        // Rescue: the slice may start mid-clause because Deepgram split the
        // sentence at an awkward point (e.g. "area to volume ratio, what
        // advantage does that give the cell?"). Try slicing from the last
        // WH-word onward and re-check.
        const whMatch = finalQuestion.match(/[,;:\-—]\s*(what|why|how|when|where|who|whom|whose|which)\b[\s\S]*$/i);
        if (whMatch && whMatch.index !== undefined) {
          const rescued = finalQuestion.slice(whMatch.index).replace(/^[,;:\-—\s]+/, '').trim();
          if (hasInterrogativeTrigger(rescued) && wordCount(rescued) >= 5) {
            if (debug) console.log('🎯 [trigger-rescue] sliced to WH-clause:', rescued);
            finalQuestion = rescued;
          }
        }
      }
      if (!hasInterrogativeTrigger(finalQuestion)) {
        if (debug) console.log('🎯 [trigger-capture] blocked — no interrogative trigger in final question:', question);
        return;
      }

      // Light cleanup of priorContext: strip leading filler, cap at ~3000 chars.
      // Keep both head and tail when truncating so antecedents earlier in the
      // segment aren't lost (most pronoun referents live in the head).
      let priorContext = (slice.context || '').trim();
      priorContext = priorContext.replace(FILLER_PREFIXES, '').trim();
      if (priorContext.length > 3000) {
        const head = priorContext.slice(0, 1200).trim();
        const tail = priorContext.slice(-1700).trim();
        priorContext = `${head} […] ${tail}`;
      }

      const candidate: PassiveQuestionCandidate = {
        text: finalQuestion,
        detectedAt: Date.now(),
        id: `tq-${++triggerIdCounter}`,
        priorContext: priorContext || undefined,
      };

      // Set post-success cooldown ONLY now (after pass)
      lastSuccessTimeRef.current = Date.now();

      if (debug) console.log(`🎯 [trigger-capture] FINAL (cooldown ${cooldownMs}ms armed) priorCtx=${priorContext.length}chars:`, finalQuestion);
      onCaptureCompleteRef.current?.(candidate);
    } finally {
      isFinalizingRef.current = false;
    }
  }, [
    getSliceAroundTrigger,
    clearCompletionTimer,
    lookbackMs,
    debug,
    enableCompletionGate,
    minCompleteWords,
    softCompleteMs,
    maxExtensions,
    extensionMs,
    minSilenceMs,
    cooldownMs,
  ]);

  /**
   * Feed a transcript chunk into the trigger capture system.
   * Returns `true` if the system has armed/pending capture (caller should skip passive detection).
   */
  const feedChunk = useCallback((text: string, timestamp?: number): boolean => {
    const now = timestamp ?? Date.now();

    // Always push into rolling buffer + trim, and record arrival time
    bufferRef.current.push({ text, timestamp: now });
    lastChunkTimeRef.current = now;
    trimBuffer(now);

    if (debug) {
      const oldestAge = bufferRef.current[0] ? now - bufferRef.current[0].timestamp : 0;
      const totalChars = bufferRef.current.reduce((s, c) => s + c.text.length, 0);
      console.log(`🎯 [buffer] chunks=${bufferRef.current.length} chars=${totalChars} oldestAge=${oldestAge}ms`);
    }

    // If a trigger is already armed — HARD lock against re-arming on same utterance
    if (pendingTriggerRef.current) {
      const pending = pendingTriggerRef.current;
      const heldFor = now - pending.armedAt;
      const hasQuestionMark = /\?\s*$/.test(text.trim());
      const hasSentenceEnd = /[.!?]\s*$/.test(text.trim());

      // Fast path for "?" — but ONLY when we have evidence this is a real
      // finished question, not Deepgram's intonation-driven "?" mid-sentence.
      // Require both: (a) we've held long enough that this isn't the first
      // chunk after arming, and (b) the buffer has a substantial question
      // shape after the trigger (≥8 words). Otherwise fall through to the
      // normal sentence-end path so the completeness gate can hold.
      if (hasQuestionMark && !isFinalizingRef.current) {
        const recentBuffer = getRecentSpeechSegment(bufferRef.current, now);
        const lowerBuffer = recentBuffer.toLowerCase().replace(FILLER_PREFIXES, '').trim();
        let postTriggerWords = 0;
        for (const pattern of TRIGGER_PATTERNS) {
          const m = lowerBuffer.match(pattern);
          if (m && m.index !== undefined) {
            const after = lowerBuffer.slice(m.index + m[0].length).trim();
            postTriggerWords = after.split(/\s+/).filter(Boolean).length;
            break;
          }
        }
        const strongShape = heldFor >= minHoldMs && postTriggerWords >= 8;

        if (strongShape) {
          if (debug) console.log(`🎯 [trigger-capture] "?" + strong shape (held=${heldFor}ms postTrigger=${postTriggerWords}w), fast-finalize`);
          finalizeCapture(now, true);
          return false;
        }
        if (debug) console.log(`🎯 [trigger-capture] "?" but weak shape (held=${heldFor}ms postTrigger=${postTriggerWords}w) — treating as normal sentence-end, gate may hold`);
        if (heldFor >= minHoldMs) {
          finalizeCapture(now);
          return false;
        }
        return true;
      }

      if (hasSentenceEnd && heldFor >= minHoldMs && !isFinalizingRef.current) {
        if (debug) console.log(`🎯 [trigger-capture] sentence-end after ${heldFor}ms hold, finalizing`);
        finalizeCapture(now);
        return false;
      }

      // Otherwise keep waiting for completion timer
      return true;
    }

    // Post-success cooldown lock (only set when a candidate actually passed)
    const sinceSuccess = now - lastSuccessTimeRef.current;
    if (lastSuccessTimeRef.current > 0 && sinceSuccess < cooldownMs) {
      if (debug) {
        console.log(`🚦 [cooldown-block] remaining=${cooldownMs - sinceSuccess}ms`);
      }
      return false;
    }

    // Scan only the current breath/short tail, not the full rolling buffer.
    // Old questions can remain in the buffer for context, but they must not
    // re-arm capture when the instructor starts a new non-question premise.
    const recentSegment = getRecentSpeechSegment(bufferRef.current, now);
    const triggerMatch = findFirstTriggerMatch(recentSegment);

    if (triggerMatch) {
        const triggerWord = triggerMatch.text;

        // Arm the trigger — do NOT set cooldown yet (only on successful pass)
        lastTriggerTimeRef.current = now;
        pendingTriggerRef.current = {
          triggerTs: now,
          triggerWord,
          armedAt: now,
        };
        extensionsUsedRef.current = 0;
        setIsCapturing(true);

        if (debug) {
          console.log(`🎯 [trigger-armed] word="${triggerWord}" bufferChars=${recentSegment.length}`);
        }

        // Schedule completion
        clearCompletionTimer();
        completionTimerRef.current = setTimeout(() => {
          if (debug) console.log(`🎯 [trigger-capture] completion timer fired (${completionTimeoutMs}ms)`);
          finalizeCapture(Date.now());
        }, completionTimeoutMs);

        return true;
    }

    return false;
  }, [
    cooldownMs,
    minHoldMs,
    completionTimeoutMs,
    trimBuffer,
    finalizeCapture,
    clearCompletionTimer,
    debug,
  ]);

  const resetCapture = useCallback(() => {
    bufferRef.current = [];
    pendingTriggerRef.current = null;
    extensionsUsedRef.current = 0;
    isFinalizingRef.current = false;
    clearCompletionTimer();
    setIsCapturing(false);
    lastTriggerTimeRef.current = 0;
    lastSuccessTimeRef.current = 0;
    lastChunkTimeRef.current = 0;
  }, [clearCompletionTimer]);

  return {
    feedChunk,
    isCapturing,
    resetCapture,
    setOnCaptureComplete,
  };
}
