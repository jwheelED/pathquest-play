import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MatchResult {
  problemId: string;
  problemText: string;
  finalAnswer: string;
  confidence: number;
  matchedKeywords: string[];
  hasMcq: boolean;
  mcqId?: string;
}

interface UseAnswerKeyMatcherOptions {
  enabled: boolean;
  confidenceThreshold?: number;
  onMatchFound?: (match: MatchResult) => void;
}

export function useAnswerKeyMatcher(options: UseAnswerKeyMatcherOptions) {
  const { enabled, confidenceThreshold = 0.6, onMatchFound } = options;
  const [isMatching, setIsMatching] = useState(false);
  const [lastMatch, setLastMatch] = useState<MatchResult | null>(null);
  const [matchCount, setMatchCount] = useState(0);
  const lastMatchTimeRef = useRef<number>(0);
  const matchCooldownMs = 30000; // 30 seconds between matches

  const checkTranscriptForMatch = useCallback(
    async (transcript: string): Promise<MatchResult | null> => {
      if (!enabled || !transcript || transcript.length < 50) {
        return null;
      }

      // Cooldown check
      const now = Date.now();
      if (now - lastMatchTimeRef.current < matchCooldownMs) {
        return null;
      }

      setIsMatching(true);

      try {
        const { data, error } = await supabase.functions.invoke("match-transcript-to-problem", {
          body: { transcript },
        });

        if (error) {
          console.error("Match error:", error);
          return null;
        }

        if (!data.match || data.confidence < confidenceThreshold) {
          return null;
        }

        const match: MatchResult = {
          problemId: data.match.problem_id,
          problemText: data.match.problem_text,
          finalAnswer: data.match.final_answer,
          confidence: data.confidence,
          matchedKeywords: data.matched_keywords || [],
          hasMcq: data.has_mcq,
          mcqId: data.mcq_id,
        };

        setLastMatch(match);
        setMatchCount((prev) => prev + 1);
        lastMatchTimeRef.current = now;

        if (onMatchFound) {
          onMatchFound(match);
        }

        return match;
      } catch (error) {
        console.error("Answer key match error:", error);
        return null;
      } finally {
        setIsMatching(false);
      }
    },
    [enabled, confidenceThreshold, onMatchFound]
  );

  const resetMatcher = useCallback(() => {
    setLastMatch(null);
    setMatchCount(0);
    lastMatchTimeRef.current = 0;
  }, []);

  return {
    checkTranscriptForMatch,
    isMatching,
    lastMatch,
    matchCount,
    resetMatcher,
  };
}
