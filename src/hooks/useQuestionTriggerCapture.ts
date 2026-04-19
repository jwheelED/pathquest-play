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
  /\bwhat\s+(is|are|was|were|do|does|did|would|could|should|about|happens|happened|causes|type|kind|percentage|number|part)\b/i,
  /\bwhy\s+(is|are|do|does|did|would|can|could|should)\b/i,
  /\bhow\s+(many|much|do|does|did|is|are|would|could|can|should|long|often|far)\b/i,
  /\bwhen\s+(is|are|do|does|did|would|was|were|can|should)\b/i,
  /\bwhere\s+(is|are|do|does|did|would|was|were|can)\b/i,
  /\bwho\s+(is|are|was|were|does|did|would|can|could|should|discovered|invented|proposed)\b/i,
  /\bwhich\s+(one|of|is|are|type|kind|part|organ|bone|cell|structure|process|method)\b/i,
];

// Leading filler words to strip
const FILLER_PREFIXES = /^(so+|um+|uh+|like|well|okay so|okay|now|and so|but)\s+/i;

interface UseQuestionTriggerCaptureOptions {
  cooldownMs?: number;
  silenceGapMs?: number;
  bufferWindowMs?: number;
  lookbackMs?: number;
  completionTimeoutMs?: number;
  minHoldMs?: number;
  maxBufferChars?: number;
  debug?: boolean;
}

interface BufferChunk {
  text: string;
  timestamp: number;
}

let triggerIdCounter = 0;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Minimal post-processing: merge chunks, deduplicate boundary words,
 * strip filler, ensure trailing ?.  NO paraphrasing.
 */
function postProcess(text: string): string {
  if (!text) return '';

  let merged = text.trim();

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
    cooldownMs = 15000,
    silenceGapMs = 2500,
    bufferWindowMs = 12000,
    lookbackMs = 8000,
    completionTimeoutMs = 4500,
    minHoldMs = 800,
    maxBufferChars = 2000,
    debug = true,
  } = options;

  // Persistent rolling buffer — never cleared on trigger, only trimmed by age/size
  const bufferRef = useRef<BufferChunk[]>([]);
  const lastTriggerTimeRef = useRef<number>(0);

  // Pending trigger state (decoupled from "capturing")
  const pendingTriggerRef = useRef<{
    triggerTs: number;
    triggerWord: string;
    armedAt: number;
  } | null>(null);

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
   * Get a slice of buffer text from [centerTs - lookback, now], with sentence-boundary trimming.
   */
  const getSliceAroundTrigger = useCallback((triggerTs: number, now: number): string => {
    const startCutoff = triggerTs - lookbackMs;
    const relevantChunks = bufferRef.current.filter(
      c => c.timestamp >= startCutoff && c.timestamp <= now
    );

    if (relevantChunks.length === 0) return '';

    let combined = relevantChunks.map(c => c.text).join(' ').trim();

    // Find the start of the current sentence: look for the last sentence-ending
    // punctuation BEFORE the trigger word position. We need to find roughly where
    // the trigger was in the combined text.
    // Strategy: locate the trigger word in the combined text, then look backwards
    // for the most recent .!? before it. Slice from there.
    const lower = combined.toLowerCase();

    // Find position of any trigger pattern match
    let triggerPos = -1;
    for (const pattern of TRIGGER_PATTERNS) {
      const m = lower.match(pattern);
      if (m && m.index !== undefined) {
        triggerPos = m.index;
        break;
      }
    }

    if (triggerPos > 0) {
      // Look backwards from trigger for sentence boundary
      const beforeTrigger = combined.substring(0, triggerPos);
      const lastBoundary = Math.max(
        beforeTrigger.lastIndexOf('.'),
        beforeTrigger.lastIndexOf('?'),
        beforeTrigger.lastIndexOf('!')
      );
      if (lastBoundary >= 0) {
        // Slice from after the boundary — keeps current sentence only
        combined = combined.substring(lastBoundary + 1).trim();
      }
      // Otherwise: keep full combined (entire buffer is one running sentence)
    }

    return combined;
  }, [lookbackMs]);

  const finalizeCapture = useCallback((now: number) => {
    const pending = pendingTriggerRef.current;
    if (!pending) {
      clearCompletionTimer();
      setIsCapturing(false);
      return;
    }

    const sliceText = getSliceAroundTrigger(pending.triggerTs, now);
    const elapsedSinceTrigger = now - pending.triggerTs;
    const lookbackUsed = Math.min(lookbackMs, pending.triggerTs - (bufferRef.current[0]?.timestamp ?? pending.triggerTs));

    if (debug) {
      console.log(`🎯 [slice] lookback≈${lookbackUsed}ms lookahead≈${elapsedSinceTrigger}ms text="${sliceText.substring(0, 120)}"`);
    }

    // Reset pending state
    pendingTriggerRef.current = null;
    clearCompletionTimer();
    setIsCapturing(false);

    if (!sliceText) {
      if (debug) console.log('🎯 [trigger-capture] empty slice, abort');
      return;
    }

    const question = postProcess(sliceText);

    if (isRhetoricalOrGreeting(question)) {
      if (debug) console.log('🎯 [trigger-capture] blocked — rhetorical/greeting');
      return;
    }

    if (wordCount(question) < 5) {
      if (debug) console.log('🎯 [trigger-capture] blocked — too short');
      return;
    }

    const candidate: PassiveQuestionCandidate = {
      text: question,
      detectedAt: Date.now(),
      id: `tq-${++triggerIdCounter}`,
    };

    if (debug) console.log('🎯 [trigger-capture] FINAL:', question);
    onCaptureCompleteRef.current?.(candidate);
  }, [getSliceAroundTrigger, clearCompletionTimer, lookbackMs, debug]);

  /**
   * Feed a transcript chunk into the trigger capture system.
   * Returns `true` if the system has armed/pending capture (caller should skip passive detection).
   */
  const feedChunk = useCallback((text: string, timestamp?: number): boolean => {
    const now = timestamp ?? Date.now();

    // Always push into rolling buffer + trim
    bufferRef.current.push({ text, timestamp: now });
    trimBuffer(now);

    if (debug) {
      const oldestAge = bufferRef.current[0] ? now - bufferRef.current[0].timestamp : 0;
      const totalChars = bufferRef.current.reduce((s, c) => s + c.text.length, 0);
      console.log(`🎯 [buffer] chunks=${bufferRef.current.length} chars=${totalChars} oldestAge=${oldestAge}ms`);
    }

    // If a trigger is already armed, check for sentence-end finalization
    if (pendingTriggerRef.current) {
      const pending = pendingTriggerRef.current;
      const heldFor = now - pending.armedAt;
      const hasSentenceEnd = /[.!?]\s*$/.test(text.trim());

      if (hasSentenceEnd && heldFor >= minHoldMs) {
        if (debug) console.log(`🎯 [trigger-capture] sentence-end after ${heldFor}ms hold, finalizing`);
        finalizeCapture(now);
        return false;
      }

      // Otherwise keep waiting for completion timer
      return true;
    }

    // Cooldown check
    if (now - lastTriggerTimeRef.current < cooldownMs) {
      return false;
    }

    // Scan combined buffer for trigger
    const combined = bufferRef.current.map(c => c.text).join(' ').trim();
    const lower = combined.toLowerCase().replace(FILLER_PREFIXES, '').trim();

    for (const pattern of TRIGGER_PATTERNS) {
      const match = lower.match(pattern);
      if (match && match.index !== undefined) {
        const triggerWord = match[0];

        // Arm the trigger — do NOT slice yet
        lastTriggerTimeRef.current = now;
        pendingTriggerRef.current = {
          triggerTs: now,
          triggerWord,
          armedAt: now,
        };
        setIsCapturing(true);

        if (debug) {
          const totalChars = combined.length;
          console.log(`🎯 [trigger-armed] word="${triggerWord}" bufferChars=${totalChars}`);
        }

        // Schedule completion
        clearCompletionTimer();
        completionTimerRef.current = setTimeout(() => {
          if (debug) console.log(`🎯 [trigger-capture] completion timer fired (${completionTimeoutMs}ms)`);
          finalizeCapture(Date.now());
        }, completionTimeoutMs);

        return true;
      }
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
    clearCompletionTimer();
    setIsCapturing(false);
    lastTriggerTimeRef.current = 0;
  }, [clearCompletionTimer]);

  return {
    feedChunk,
    isCapturing,
    resetCapture,
    setOnCaptureComplete,
  };
}
