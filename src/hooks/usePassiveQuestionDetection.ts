import { useRef, useCallback, useState } from 'react';

export interface PassiveQuestionCandidate {
  text: string;
  detectedAt: number;
}

interface UsePassiveQuestionDetectionOptions {
  enabled?: boolean;
  cooldownMs?: number;
  minWordCount?: number;
  autoDismissMs?: number;
  /** Timestamp of the last question sent (any method) — skip detection if recent */
  lastQuestionSentTime?: number;
  debug?: boolean;
}

// Rhetorical / filler questions to ignore (normalized lowercase, no trailing ?)
const RHETORICAL_BLOCKLIST = [
  'right',
  'okay',
  'ok',
  'understand',
  'got it',
  'you know',
  'see what i mean',
  "isn't it",
  "aren't they",
  "don't you think",
  'does that make sense',
  'make sense',
  'with me so far',
  'any questions',
  'everyone with me',
  'following along',
  'clear',
  'is that clear',
  'yes',
  'no',
  'huh',
  'correct',
  'true',
  "isn't that right",
  'see',
  'you see',
  'you follow',
  'shall we',
  'shall i',
  'ready',
  'are we good',
  'good so far',
  'sound good',
  'sounds good',
  'know what i mean',
  'fair enough',
  'yeah',
  'everyone got that',
  'all good',
  'is it not',
  "wouldn't you say",
  "can you see",
  "can everyone see",
  "can you hear me",
  "can everyone hear me",
];

// Greeting patterns that should never be treated as audience checks
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

/**
 * Extracts question segments from a transcript utterance.
 * Handles normal sentence punctuation and edge cases where text contains `?`
 * but doesn't strictly end with it.
 */
function extractQuestions(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized.includes('?') && !normalized.includes('？')) return [];

  // Primary path: capture segments that end with question marks
  const matches = normalized.match(/[^?？]*[?？]/g);
  if (matches?.length) {
    return matches.map(segment => segment.trim()).filter(Boolean);
  }

  // Fallback: if punctuation exists but pattern split fails, treat full text as candidate
  return [normalized];
}

function isRhetorical(question: string): boolean {
  // Strip trailing ? and normalize
  const normalized = question
    .replace(/[?？]+$/, '')
    .trim()
    .toLowerCase();

  // Check greeting patterns FIRST — these override WH-question bypass
  // e.g. "How's everyone doing today?" starts with "how" but is a greeting
  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }

  // Substantive WH-questions should not be blocked (after greeting check)
  if (/^(what|how|why|when|where|who|which)\b/.test(normalized)) {
    return false;
  }

  // Direct match against blocklist
  for (const phrase of RHETORICAL_BLOCKLIST) {
    if (normalized === phrase) return true;
    // Also check if the question is just filler + these phrases
    const stripped = normalized
      .replace(/^(so|and|but|well|now|or|um|uh|like)\s+/i, '')
      .trim();
    if (stripped === phrase) return true;
  }

  return false;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function usePassiveQuestionDetection(options: UsePassiveQuestionDetectionOptions = {}) {
  const {
    enabled = true,
    cooldownMs = 30000,
    minWordCount = 5,
    autoDismissMs = 15000,
    lastQuestionSentTime = 0,
    debug = true,
  } = options;

  const lastDetectionTimeRef = useRef<number>(0);
  const [candidate, setCandidate] = useState<PassiveQuestionCandidate | null>(null);
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoDismiss = useCallback(() => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
  }, []);

  const dismissCandidate = useCallback(() => {
    clearAutoDismiss();
    setCandidate(null);
  }, [clearAutoDismiss]);

  /**
   * Process a final transcript utterance. Call this for every `is_final` chunk.
   */
  const checkUtterance = useCallback((text: string) => {
    if (!enabled || !text) return;

    const now = Date.now();

    if (debug) console.log('🔍 [passive] checking utterance:', text.substring(0, 80));

    // Respect cooldown
    if (now - lastDetectionTimeRef.current < cooldownMs) {
      if (debug) console.log('🔍 [passive] skipped — cooldown active');
      return;
    }

    // Skip if a question was just sent recently (any method)
    if (lastQuestionSentTime && now - lastQuestionSentTime < cooldownMs) {
      if (debug) console.log('🔍 [passive] skipped — recent question sent');
      return;
    }

    const questions = extractQuestions(text);
    if (debug) console.log('🔍 [passive] extracted questions:', questions);
    if (questions.length === 0) return;

    // Find the first substantive question
    for (const q of questions) {
      const wc = wordCount(q);
      if (wc < minWordCount) {
        if (debug) console.log(`🔍 [passive] skipped "${q}" — too short (${wc} words < ${minWordCount})`);
        continue;
      }
      if (isRhetorical(q)) {
        if (debug) console.log(`🔍 [passive] skipped "${q}" — rhetorical`);
        continue;
      }

      // We have a candidate!
      console.log('🔍 Passive question detected:', q);
      lastDetectionTimeRef.current = now;

      // Clear any existing auto-dismiss
      clearAutoDismiss();

      const newCandidate: PassiveQuestionCandidate = { text: q, detectedAt: now };
      setCandidate(newCandidate);

      // Auto-dismiss after timeout
      autoDismissTimerRef.current = setTimeout(() => {
        setCandidate(current => {
          // Only dismiss if it's the same candidate
          if (current?.detectedAt === now) return null;
          return current;
        });
      }, autoDismissMs);

      return; // Only surface one candidate per utterance
    }
  }, [enabled, cooldownMs, minWordCount, autoDismissMs, lastQuestionSentTime, clearAutoDismiss, debug]);

  const resetDetection = useCallback(() => {
    lastDetectionTimeRef.current = 0;
    clearAutoDismiss();
    setCandidate(null);
  }, [clearAutoDismiss]);

  return {
    candidate,
    checkUtterance,
    dismissCandidate,
    resetDetection,
  };
}
