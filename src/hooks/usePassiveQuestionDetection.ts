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

/**
 * Extracts question sentences (ending in ?) from a transcript utterance.
 * Returns only the question portion.
 */
function extractQuestions(text: string): string[] {
  // Split on sentence boundaries — look for text ending in ?
  // Handle multiple sentences in one utterance
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences
    .map(s => s.trim())
    .filter(s => s.endsWith('?'));
}

function isRhetorical(question: string): boolean {
  // Strip trailing ? and normalize
  const normalized = question
    .replace(/\?+$/, '')
    .trim()
    .toLowerCase();

  // Direct match against blocklist
  for (const phrase of RHETORICAL_BLOCKLIST) {
    if (normalized === phrase) return true;
    // Also check if the question is just filler + these phrases
    // e.g., "so does that make sense" or "and right"
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
    minWordCount = 8,
    autoDismissMs = 15000,
    lastQuestionSentTime = 0,
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

    // Respect cooldown
    if (now - lastDetectionTimeRef.current < cooldownMs) return;

    // Skip if a question was just sent recently (any method)
    if (lastQuestionSentTime && now - lastQuestionSentTime < cooldownMs) return;

    const questions = extractQuestions(text);
    if (questions.length === 0) return;

    // Find the first substantive question
    for (const q of questions) {
      if (wordCount(q) < minWordCount) continue;
      if (isRhetorical(q)) continue;

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
  }, [enabled, cooldownMs, minWordCount, autoDismissMs, lastQuestionSentTime, clearAutoDismiss]);

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
