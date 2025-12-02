import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface LiveSession {
  id: string;
  session_code: string;
  title: string;
  is_active: boolean;
  created_at: string;
  instructor_id: string;
}

interface LiveQuestion {
  id: string;
  session_id: string;
  instructor_id: string;
  question_content: any;
  sent_at: string;
  question_number: number;
}

interface QuestionWithStats extends LiveQuestion {
  stats: {
    responseCount: number;
    correctCount: number;
    correctPercentage: number | null;
    avgResponseTime: number | null;
  };
}

interface ResponseStats {
  responseCount: number;
  correctCount: number;
  correctPercentage: number | null;
  avgResponseTime: number | null;
}

export const usePresenterData = (sessionCode: string | null) => {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<LiveQuestion | null>(null);
  const [recentQuestions, setRecentQuestions] = useState<QuestionWithStats[]>([]);
  const [responseStats, setResponseStats] = useState<ResponseStats>({
    responseCount: 0,
    correctCount: 0,
    correctPercentage: null,
    avgResponseTime: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch session by code
  const fetchSession = useCallback(async () => {
    if (!sessionCode) return;

    const { data, error } = await supabase
      .from("live_sessions")
      .select("*")
      .eq("session_code", sessionCode)
      .eq("is_active", true)
      .single();

    if (error) {
      console.error("Error fetching session:", error);
      setError("Session not found or inactive");
      setLoading(false);
      return;
    }

    setSession(data);
    setLoading(false);
  }, [sessionCode]);

  // Fetch participant count
  const fetchParticipantCount = useCallback(async () => {
    if (!session?.id) return;

    const { count } = await supabase
      .from("live_participants")
      .select("*", { count: "exact", head: true })
      .eq("session_id", session.id);

    setParticipantCount(count || 0);
  }, [session?.id]);

  // Calculate stats for a question
  const calculateQuestionStats = async (questionId: string): Promise<ResponseStats> => {
    const { data: responses } = await supabase
      .from("live_responses")
      .select("*")
      .eq("question_id", questionId);

    if (!responses || responses.length === 0) {
      return {
        responseCount: 0,
        correctCount: 0,
        correctPercentage: null,
        avgResponseTime: null,
      };
    }

    const correctCount = responses.filter((r) => r.is_correct).length;
    const responseTimes = responses
      .map((r) => r.response_time_ms)
      .filter((t): t is number => t !== null);

    const avgResponseTime =
      responseTimes.length > 0
        ? Math.round(responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length)
        : null;

    return {
      responseCount: responses.length,
      correctCount,
      correctPercentage: (correctCount / responses.length) * 100,
      avgResponseTime,
    };
  };

  // Fetch questions
  const fetchQuestions = useCallback(async () => {
    if (!session?.id) return;

    const { data: questions } = await supabase
      .from("live_questions")
      .select("*")
      .eq("session_id", session.id)
      .order("sent_at", { ascending: false })
      .limit(6);

    if (!questions || questions.length === 0) {
      setCurrentQuestion(null);
      setRecentQuestions([]);
      setResponseStats({
        responseCount: 0,
        correctCount: 0,
        correctPercentage: null,
        avgResponseTime: null,
      });
      return;
    }

    // Current question (most recent)
    const current = questions[0];
    setCurrentQuestion(current);

    // Calculate stats for current question
    const currentStats = await calculateQuestionStats(current.id);
    setResponseStats(currentStats);

    // Recent questions (2-6)
    const recent = questions.slice(1, 6);
    const recentWithStats = await Promise.all(
      recent.map(async (q) => ({
        ...q,
        stats: await calculateQuestionStats(q.id),
      }))
    );
    setRecentQuestions(recentWithStats);
  }, [session?.id]);

  // Initial fetch
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  useEffect(() => {
    if (session) {
      fetchParticipantCount();
      fetchQuestions();
    }
  }, [session, fetchParticipantCount, fetchQuestions]);

  // Real-time subscriptions
  useEffect(() => {
    if (!session?.id) return;

    // Subscribe to participant changes
    const participantChannel = supabase
      .channel(`presenter-participants-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_participants",
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          fetchParticipantCount();
        }
      )
      .subscribe();

    // Subscribe to question changes
    const questionChannel = supabase
      .channel(`presenter-questions-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_questions",
          filter: `session_id=eq.${session.id}`,
        },
        () => {
          fetchQuestions();
        }
      )
      .subscribe();

    // Subscribe to response changes
    const responseChannel = supabase
      .channel(`presenter-responses-${session.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_responses",
        },
        async (payload) => {
          const response = payload.new as any;
          
          // Only update if response is for current question
          if (currentQuestion && response.question_id === currentQuestion.id) {
            const stats = await calculateQuestionStats(currentQuestion.id);
            setResponseStats(stats);
          }
          
          // Also refresh recent questions to update their stats
          fetchQuestions();
        }
      )
      .subscribe();

    // Polling fallback every 3 seconds
    const pollInterval = setInterval(() => {
      fetchParticipantCount();
      fetchQuestions();
    }, 3000);

    return () => {
      supabase.removeChannel(participantChannel);
      supabase.removeChannel(questionChannel);
      supabase.removeChannel(responseChannel);
      clearInterval(pollInterval);
    };
  }, [session?.id, currentQuestion, fetchParticipantCount, fetchQuestions]);

  return {
    session,
    participantCount,
    currentQuestion,
    recentQuestions,
    responseStats,
    loading,
    error,
  };
};
