import { useRef, useCallback, useState, useEffect } from 'react';
import {
  extractQuestions,
  hasInterrogativeTrigger,
  isRhetorical,
  wordCount,
  MIN_WORD_COUNT,
  RHETORICAL_BLOCKLIST,
  GREETING_PATTERNS,
  TRIGGER_PATTERNS,
} from '../../supabase/functions/_shared/questionDetection';

// Re-export the canonical detection helpers so existing imports keep working
// and tests can exercise them via the hook module path.
export {
  extractQuestions,
  hasInterrogativeTrigger,
  isRhetorical,
  wordCount,
  RHETORICAL_BLOCKLIST,
  GREETING_PATTERNS,
  TRIGGER_PATTERNS,
};

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
  /** Hard cap on how long a pending candidate may wait before being force-promoted. */
  maxPendingMs?: number;
  debug?: boolean;
}

let candidateIdCounter = 0;

export function usePassiveQuestionDetection(options: UsePassiveQuestionDetectionOptions = {}) {
  const {
    enabled = true,
    cooldownMs = 15000,
    minWordCount = MIN_WORD_COUNT,
    autoDismissMs = 30000,
    lastQuestionSentTime = 0,
    minTranscriptConfidence = 0.8,
    trailingSilenceMs = 1200,
    maxPendingMs = 4000,
    debug = true,
  } = options;

  const lastDetectionTimeRef = useRef<number>(0);
  const lastQuestionSentTimeRef = useRef<number>(lastQuestionSentTime);
  const [candidate, setCandidate] = useState<PassiveQuestionCandidate | null>(null);
  const candidateRef = useRef<PassiveQuestionCandidate | null>(null);
  const [candidateHistory, setCandidateHistory] = useState<PassiveQuestionCandidate[]>([]);
  const autoDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pending candidate — waiting for trailing silence before being promoted
  const pendingRef = useRef<PassiveQuestionCandidate | null>(null);
  const pendingStartedAtRef = useRef<number>(0);
  const [pendingCandidate, setPendingCandidate] = useState<PassiveQuestionCandidate | null>(null);
  const [pendingStartedAt, setPendingStartedAt] = useState<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  lastQuestionSentTimeRef.current = lastQuestionSentTime;

  useEffect(() => {
    candidateRef.current = candidate;
  }, [candidate]);

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
    pendingStartedAtRef.current = 0;
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
   *
   * If the pending candidate has been waiting longer than maxPendingMs, force-promote
   * instead of resetting — otherwise a continuously-talking instructor would let a
   * stale question sit indefinitely.
   */
  const notifySpeech = useCallback(() => {
    if (!pendingRef.current) return;
    const age = Date.now() - pendingStartedAtRef.current;
    if (age >= maxPendingMs) {
      if (debug) console.log(`🔂 [passive] pending exceeded maxPendingMs (${age}ms ≥ ${maxPendingMs}) — force-promoting`);
      promotePending();
      return;
    }
    if (debug) console.log('🔄 [passive] speech detected, resetting trailing-silence timer');
    armSilenceTimer();
  }, [armSilenceTimer, debug, maxPendingMs, promotePending]);

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

    // Cooldown only applies if there's actually a visible candidate on screen.
    // If the prior candidate was dismissed or auto-expired, a fresh question
    // should be allowed to surface immediately — otherwise we drop the question
    // the instructor actually wants answered.
    if (
      candidateRef.current &&
      now - lastDetectionTimeRef.current < cooldownMs
    ) {
      if (debug) console.log('🔍 [passive] skipped — cooldown active and candidate visible');
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
      pendingStartedAtRef.current = now;
      setPendingCandidate(newCandidate);
      setPendingStartedAt(now);
      armSilenceTimer();

      return;
    }
  }, [enabled, cooldownMs, minWordCount, minTranscriptConfidence, armSilenceTimer, debug]);

  const resetDetection = useCallback(() => {
    lastDetectionTimeRef.current = 0;
    clearAutoDismiss();
    clearSilenceTimer();
    pendingRef.current = null;
    pendingStartedAtRef.current = 0;
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
    notifySpeech,
    dismissCandidate,
    removeFromHistory,
    resetDetection,
  };
}
