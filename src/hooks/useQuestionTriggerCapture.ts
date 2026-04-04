import { useRef, useCallback, useState } from 'react';
import { type PassiveQuestionCandidate } from './usePassiveQuestionDetection';

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

// Interrogative trigger patterns — must appear at the start of an utterance
const TRIGGER_PATTERNS = [
  /^what\s+(is|are|was|were|do|does|did|would|could|should|about|happens|happened|causes|type|kind|percentage|number|part)/i,
  /^why\s+(is|are|do|does|did|would|can|could|should)/i,
  /^how\s+(many|much|do|does|did|is|are|would|could|can|should|long|often|far)/i,
  /^when\s+(is|are|do|does|did|would|was|were|can|should)/i,
  /^where\s+(is|are|do|does|did|would|was|were|can)/i,
  /^who\s+(is|are|was|were|does|did|would|can|could|should|discovered|invented|proposed)/i,
  /^which\s+(one|of|is|are|type|kind|part|organ|bone|cell|structure|process|method)/i,
];

// Leading filler words to strip
const FILLER_PREFIXES = /^(so+|um+|uh+|like|well|okay so|okay|now|and so|but)\s+/i;

interface UseQuestionTriggerCaptureOptions {
  cooldownMs?: number;
  silenceGapMs?: number;
  maxWords?: number;
  maxDurationMs?: number;
  debug?: boolean;
}

interface RecentChunk {
  text: string;
  timestamp: number;
}

const MAX_WINDOW_CHUNKS = 5;
const MAX_WINDOW_CHARS = 500;

interface CaptureState {
  isCapturing: boolean;
  buffer: string[];
  triggerTime: number;
  lastChunkTime: number;
}

let triggerIdCounter = 0;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Minimal post-processing: merge chunks, deduplicate boundary words,
 * strip filler, ensure trailing ?.  NO paraphrasing.
 */
function postProcess(chunks: string[]): string {
  if (chunks.length === 0) return '';

  // 1. Merge with overlap deduplication
  let merged = chunks[0];
  for (let i = 1; i < chunks.length; i++) {
    const prev = merged.split(/\s+/);
    const curr = chunks[i].split(/\s+/);

    // Find overlap: check if last N words of prev match first N words of curr
    let overlapLen = 0;
    const maxOverlap = Math.min(prev.length, curr.length, 6);
    for (let n = maxOverlap; n >= 1; n--) {
      const prevTail = prev.slice(-n).map(w => w.toLowerCase());
      const currHead = curr.slice(0, n).map(w => w.toLowerCase());
      if (prevTail.join(' ') === currHead.join(' ')) {
        overlapLen = n;
        break;
      }
    }

    if (overlapLen > 0) {
      merged += ' ' + curr.slice(overlapLen).join(' ');
    } else {
      merged += ' ' + chunks[i];
    }
  }

  // 2. Strip leading filler
  merged = merged.replace(FILLER_PREFIXES, '').trim();
  // May need multiple passes
  merged = merged.replace(FILLER_PREFIXES, '').trim();

  // 3. Ensure trailing ?
  merged = merged.replace(/[.!,;:]+$/, '').trim();
  if (!merged.endsWith('?')) {
    merged += '?';
  }

  // 4. Capitalize first letter
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
    cooldownMs = 15000,
    silenceGapMs = 1500,
    maxWords = 200,
    maxDurationMs = 15000,
    debug = true,
  } = options;

  const captureRef = useRef<CaptureState>({
    isCapturing: false,
    buffer: [],
    triggerTime: 0,
    lastChunkTime: 0,
  });
  const lastTriggerTimeRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Callback when a full question is captured
  const onCaptureCompleteRef = useRef<((candidate: PassiveQuestionCandidate) => void) | null>(null);

  const setOnCaptureComplete = useCallback((cb: (candidate: PassiveQuestionCandidate) => void) => {
    onCaptureCompleteRef.current = cb;
  }, []);

  const clearTimeout_ = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const finishCapture = useCallback(() => {
    const state = captureRef.current;
    if (!state.isCapturing || state.buffer.length === 0) {
      captureRef.current.isCapturing = false;
      setIsCapturing(false);
      clearTimeout_();
      return;
    }

    const question = postProcess(state.buffer);
    if (debug) console.log('🎯 [trigger-capture] finished:', question);

    // Reset state
    captureRef.current = { isCapturing: false, buffer: [], triggerTime: 0, lastChunkTime: 0 };
    setIsCapturing(false);
    clearTimeout_();

    // Filter rhetorical / greeting
    if (isRhetoricalOrGreeting(question)) {
      if (debug) console.log('🎯 [trigger-capture] blocked — rhetorical/greeting');
      return;
    }

    // Min word check (the question should be substantive)
    if (wordCount(question) < 5) {
      if (debug) console.log('🎯 [trigger-capture] blocked — too short');
      return;
    }

    const candidate: PassiveQuestionCandidate = {
      text: question,
      detectedAt: Date.now(),
      id: `tq-${++triggerIdCounter}`,
    };

    onCaptureCompleteRef.current?.(candidate);
  }, [clearTimeout_, debug]);

  /**
   * Feed a transcript chunk into the trigger capture system.
   * Returns `true` if the system is currently capturing (caller should skip passive detection).
   */
  const feedChunk = useCallback((text: string, timestamp?: number): boolean => {
    const now = timestamp ?? Date.now();
    const state = captureRef.current;

    // If currently capturing, accumulate
    if (state.isCapturing) {
      // Check silence gap
      if (state.lastChunkTime > 0 && (now - state.lastChunkTime) > silenceGapMs) {
        if (debug) console.log('🎯 [trigger-capture] silence gap detected, finishing');
        // Add this last chunk then finish
        state.buffer.push(text);
        state.lastChunkTime = now;
        finishCapture();
        return false; // capture done, caller can proceed
      }

      // Check sentence-ending punctuation
      const hasSentenceEnd = /[.!?]\s*$/.test(text.trim());

      state.buffer.push(text);
      state.lastChunkTime = now;

      // Check termination conditions
      const totalWords = state.buffer.reduce((sum, chunk) => sum + wordCount(chunk), 0);
      const elapsed = now - state.triggerTime;

      if (hasSentenceEnd || totalWords >= maxWords || elapsed >= maxDurationMs) {
        if (debug) console.log(`🎯 [trigger-capture] boundary hit (sentenceEnd=${hasSentenceEnd}, words=${totalWords}, elapsed=${elapsed}ms)`);
        finishCapture();
        return false;
      }

      // Reset safety timeout
      clearTimeout_();
      timeoutRef.current = setTimeout(() => {
        if (debug) console.log('🎯 [trigger-capture] safety timeout, finishing');
        finishCapture();
      }, silenceGapMs + 500);

      return true; // still capturing
    }

    // Not capturing — check if this chunk starts a trigger
    if (now - lastTriggerTimeRef.current < cooldownMs) {
      return false;
    }

    const normalized = text.trim().toLowerCase();

    // Strip leading filler before checking trigger
    const stripped = normalized.replace(FILLER_PREFIXES, '').trim();

    for (const pattern of TRIGGER_PATTERNS) {
      if (pattern.test(stripped)) {
        if (debug) console.log(`🎯 [trigger-capture] TRIGGER detected: "${text.substring(0, 80)}"`);

        // Check if the chunk itself already contains a sentence-ending boundary
        // (single-chunk question)
        const hasSentenceEnd = /[.!?]\s*$/.test(text.trim());

        lastTriggerTimeRef.current = now;
        captureRef.current = {
          isCapturing: true,
          buffer: [text],
          triggerTime: now,
          lastChunkTime: now,
        };
        setIsCapturing(true);

        if (hasSentenceEnd) {
          // Complete question in one chunk
          if (debug) console.log('🎯 [trigger-capture] single-chunk question, finishing immediately');
          finishCapture();
          return false;
        }

        // Set safety timeout
        timeoutRef.current = setTimeout(() => {
          if (debug) console.log('🎯 [trigger-capture] safety timeout, finishing');
          finishCapture();
        }, maxDurationMs);

        return true; // capturing started
      }
    }

    return false;
  }, [cooldownMs, silenceGapMs, maxWords, maxDurationMs, finishCapture, clearTimeout_, debug]);

  const resetCapture = useCallback(() => {
    captureRef.current = { isCapturing: false, buffer: [], triggerTime: 0, lastChunkTime: 0 };
    setIsCapturing(false);
    clearTimeout_();
    lastTriggerTimeRef.current = 0;
  }, [clearTimeout_]);

  return {
    feedChunk,
    isCapturing,
    resetCapture,
    setOnCaptureComplete,
  };
}
