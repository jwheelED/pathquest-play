import { useRef, useCallback, useState, useEffect } from 'react';

export interface PassiveQuestionCandidate {
  text: string;
  detectedAt: number;
  id: string;
  /** Optional teaching prose that came BEFORE the question — used to resolve pronouns downstream */
  priorContext?: string;
}

export interface CheckUtteranceOptions {
  confidence?: number;
  recentTranscript?: string;
}

interface UsePassiveQuestionDetectionOptions {
  enabled?: boolean;
  cooldownMs?: number;
  minWordCount?: number;
  autoDismissMs?: number;
  /** Timestamp of the last question sent (any method) — skip detection if recent */
  lastQuestionSentTime?: number;
  /** Minimum Deepgram transcript confidence (0-1) required to consider a candidate. */
  minTranscriptConfidence?: number;
  /** Trailing silence (ms) required after question before promoting pending -> visible candidate. */
  trailingSilenceMs?: number;
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
  'make sense to you',
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
  'you get it',
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
  'what do you think',
  'what do you guys think',
  'what do you all think',
  'what do you say',
  'what say you',
  'how about that',
  'how does that sound',
  'how about',
  'how so',
  'where were we',
  'where was i',
  'what was i saying',
  'where was i going',
  'who knows',
  'who can tell me',
  'who would have thought',
  'what just happened',
  'what about that',
  'what about it',
  'what would you do',
  'what would you say',
  'how are we doing',
  'how are you doing',
  'how is everyone doing',
  'how is everybody doing',
  'how are we looking',
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

// Interrogative trigger patterns — broadened to fire on any word following the
// WH-word. Rhetorical/greeting blocklists + minWordCount continue to filter
// out conversational filler.
const TRIGGER_PATTERNS = [
  /\bwhat\s+\w+/i,
  /\bwhy\s+\w+/i,
  /\bhow\s+\w+/i,
  /\bwhen\s+\w+/i,
  /\bwhere\s+\w+/i,
  /\bwho\s+\w+/i,
  /\bwhich\s+\w+/i,
  /\btell\s+me\s+(what|why|how|when|where|who|which|about|if)\b/i,
  /\b(anyone|anybody|someone|somebody)\s+(know|tell|explain|guess|say|remember|recall)\b/i,
  /\b(can|could|would)\s+(someone|anyone|anybody|somebody)\s+(tell|explain|describe|say|name|identify|guess)\b/i,
  /\bdo\s+you\s+(know|think|see|understand|remember|recall|recognize)\b/i,
  /\bwhat\s+would\s+happen\b/i,
  /\bsuppose\s+that\b/i,
  // Subject-aux inversion (yes/no & A-or-B questions)
  /\b(is|are|was|were|am)\s+(it|this|that|these|those|there|he|she|they|we|you|i|any|all|both|either|neither|some|most|more|less|fewer|every|each|no|one|two|three)\b/i,
  /\b(do|does|did)\s+(it|this|that|these|those|he|she|they|we|you|i|any|all|both|either|neither|some|most|every|each)\b/i,
  /\b(can|could|would|should|will|shall|may|might|must)\s+(it|this|that|these|those|he|she|they|we|you|i|any|all|both|either|neither|some|most|every|each|anyone|anybody|someone|somebody|everyone|everybody)\b/i,
  /\b(has|have|had)\s+(it|this|that|these|those|he|she|they|we|you|i|any|all|both|either|neither|anyone|anybody|someone|somebody|everyone|everybody)\b/i,
];

function hasInterrogativeTrigger(text: string): boolean {
  return TRIGGER_PATTERNS.some(p => p.test(text));
}

function extractQuestions(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized.includes('?') && !normalized.includes('？')) return [];

  const sentences = normalized.split(/[.!;:]\s+/);

  const questions: string[] = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.includes('?') || trimmed.includes('？')) {
      const matches = trimmed.match(/[^?？]*[?？]/g);
      if (matches) {
        questions.push(...matches.map(s => s.trim()).filter(Boolean));
      } else {
        questions.push(trimmed);
      }
    }
  }

  return questions;
}

function isRhetorical(question: string): boolean {
  const normalized = question
    .replace(/[?？]+$/, '')
    .trim()
    .toLowerCase();

  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }

  for (const phrase of RHETORICAL_BLOCKLIST) {
    if (normalized === phrase) return true;
    const stripped = normalized
      .replace(/^(so|and|but|well|now|or|um|uh|like)\s+/i, '')
      .trim();
    if (stripped === phrase) return true;
  }

  if (/^(what|how|why|when|where|who|which)\b/.test(normalized)) {
    return false;
  }

  return false;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

let candidateIdCounter = 0;

export function usePassiveQuestionDetection(options: UsePassiveQuestionDetectionOptions = {}) {
  const {
    enabled = true,
    cooldownMs = 15000,
    minWordCount = 6,
    autoDismissMs = 30000,
    lastQuestionSentTime = 0,
    minTranscriptConfidence = 0.8,
    trailingSilenceMs = 700,
    debug = true,
  } = options;

  const lastDetectionTimeRef = useRef<number>(0);
  const lastQuestionSentTimeRef = useRef<number>(lastQuestionSentTime);
  const [candidate, setCandidate] = useState<PassiveQuestionCandidate | null>(null);
  const [candidateHistory, setCandidateHistory] = useState<PassiveQuestionCandidate[]>([]);
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pending candidate — waiting for trailing silence before being promoted
  const pendingRef = useRef<PassiveQuestionCandidate | null>(null);
  const [pendingCandidate, setPendingCandidate] = useState<PassiveQuestionCandidate | null>(null);
  const [pendingStartedAt, setPendingStartedAt] = useState<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  lastQuestionSentTimeRef.current = lastQuestionSentTime;

  const clearAutoDismiss = useCallback(() => {
    if (autoDismissTimerRef.current) {
      clearTimeout(autoDismissTimerRef.current);
      autoDismissTimerRef.current = null;
    }
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const dismissCandidate = useCallback(() => {
    clearAutoDismiss();
    setCandidate(null);
  }, [clearAutoDismiss]);

  const removeFromHistory = useCallback((id: string) => {
    setCandidateHistory(prev => prev.filter(c => c.id !== id));
  }, []);

  // Promote pending -> visible candidate after trailing silence elapses
  const promotePending = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    setPendingCandidate(null);
    setPendingStartedAt(0);

    const now = Date.now();
    lastDetectionTimeRef.current = now;

    clearAutoDismiss();

    setCandidate(current => {
      if (current) {
        setCandidateHistory(prev => [current, ...prev]);
      }
      return p;
    });

    autoDismissTimerRef.current = setTimeout(() => {
      setCandidate(current => {
        if (current?.id === p.id) {
          setCandidateHistory(prev => [current, ...prev]);
          return null;
        }
        return current;
      });
    }, autoDismissMs);

    if (debug) console.log('✅ [passive] promoted pending → candidate:', p.text);
  }, [autoDismissMs, clearAutoDismiss, debug]);

  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      promotePending();
    }, trailingSilenceMs);
  }, [clearSilenceTimer, promotePending, trailingSilenceMs]);

  /**
   * Notify the detector that the instructor is currently speaking (a new transcript chunk
   * arrived). If we have a pending candidate waiting on trailing silence, this resets
   * the silence timer — preventing premature promotion when the instructor keeps talking.
   */
  const notifySpeech = useCallback(() => {
    if (!pendingRef.current) return;
    if (debug) console.log('🔄 [passive] speech detected, resetting trailing-silence timer');
    armSilenceTimer();
  }, [armSilenceTimer, debug]);

  const checkUtterance = useCallback((
    text: string,
    optsOrRecentTranscript?: string | CheckUtteranceOptions,
  ) => {
    if (!enabled || !text) return;

    // Backward-compat: accept string OR options object
    let confidence: number | undefined;
    let recentTranscript: string | undefined;
    if (typeof optsOrRecentTranscript === 'string') {
      recentTranscript = optsOrRecentTranscript;
    } else if (optsOrRecentTranscript) {
      confidence = optsOrRecentTranscript.confidence;
      recentTranscript = optsOrRecentTranscript.recentTranscript;
    }

    const now = Date.now();

    if (debug) console.log('🔍 [passive] checking utterance:', text.substring(0, 80), { confidence });

    if (now - lastDetectionTimeRef.current < cooldownMs) {
      if (debug) console.log('🔍 [passive] skipped — cooldown active');
      return;
    }

    const recentSentTime = lastQuestionSentTimeRef.current;
    if (recentSentTime && now - recentSentTime < cooldownMs) {
      if (debug) console.log('🔍 [passive] skipped — recent question sent');
      return;
    }

    // Confidence floor — reject low-confidence Deepgram output
    if (typeof confidence === 'number' && confidence < minTranscriptConfidence) {
      if (debug) console.log(`🔍 [passive] skipped — low confidence (${confidence.toFixed(2)} < ${minTranscriptConfidence})`);
      return;
    }

    const questions = extractQuestions(text);
    if (debug) console.log('🔍 [passive] extracted questions:', questions);
    if (questions.length === 0) return;

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
      // Stricter trigger requirement — must contain a real interrogative pattern,
      // not just a "?" Deepgram guessed from intonation.
      if (!hasInterrogativeTrigger(q)) {
        if (debug) console.log(`🔍 [passive] skipped "${q}" — no interrogative trigger`);
        continue;
      }

      console.log('🔍 Passive question candidate (pending trailing silence):', q);

      const newCandidate: PassiveQuestionCandidate = {
        text: q,
        detectedAt: now,
        id: `pq-${++candidateIdCounter}`,
        priorContext: recentTranscript || undefined,
      };

      // Replace any existing pending candidate with the newer/longer one and re-arm timer
      pendingRef.current = newCandidate;
      setPendingCandidate(newCandidate);
      setPendingStartedAt(now);
      armSilenceTimer();

      return;
    }
  }, [enabled, cooldownMs, minWordCount, minTranscriptConfidence, armSilenceTimer, debug]);

  /**
   * Promote a fully-vetted candidate (e.g. from useQuestionTriggerCapture) straight
   * into the pending → visible pipeline. Skips the narrow allow-list and cooldown
   * checks because the trigger-capture hook has its own broader trigger detection,
   * semantic completeness gate, rhetorical/greeting filter, and 12s cooldown.
   * Still respects trailingSilenceMs for consistent on-deck behavior.
   */
  const acceptVettedCandidate = useCallback(
    (text: string, priorContext?: string) => {
      if (!enabled || !text) return;
      const now = Date.now();
      const newCandidate: PassiveQuestionCandidate = {
        text,
        detectedAt: now,
        id: `tq-${++candidateIdCounter}`,
        priorContext: priorContext || undefined,
      };
      if (debug) console.log('✅ [passive] accepted vetted candidate:', text);
      pendingRef.current = newCandidate;
      setPendingCandidate(newCandidate);
      setPendingStartedAt(now);
      armSilenceTimer();
    },
    [enabled, armSilenceTimer, debug]
  );

  const resetDetection = useCallback(() => {
    lastDetectionTimeRef.current = 0;
    clearAutoDismiss();
    clearSilenceTimer();
    pendingRef.current = null;
    setPendingCandidate(null);
    setPendingStartedAt(0);
    setCandidate(null);
    setCandidateHistory([]);
  }, [clearAutoDismiss, clearSilenceTimer]);

  useEffect(() => {
    return () => {
      clearAutoDismiss();
      clearSilenceTimer();
    };
  }, [clearAutoDismiss, clearSilenceTimer]);

  return {
    candidate,
    candidateHistory,
    pendingCandidate,
    pendingStartedAt,
    trailingSilenceMs,
    checkUtterance,
    acceptVettedCandidate,
    notifySpeech,
    dismissCandidate,
    removeFromHistory,
    resetDetection,
  };
}
