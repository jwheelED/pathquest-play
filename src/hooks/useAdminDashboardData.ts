import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, subWeeks, format } from "date-fns";
import type { AdminFilters } from "@/hooks/useAdminFilters";
import { getDateRangeBounds } from "@/hooks/useAdminFilters";

export interface AggregateMetrics {
  sessionsUsed: number;
  checksPerSession: number;
  responseRate: number;
}

export interface WeeklyUsage {
  week: string;
  sessions: number;
  questions: number;
}

export interface MisconceptionItem {
  questionText: string;
  correctRate: number;
  totalResponses: number;
}

export interface ConfidenceIssue {
  questionText: string;
  confidentWrongCount: number;
}

export interface AdminDashboardData {
  metrics: AggregateMetrics;
  weeklyUsage: WeeklyUsage[];
  misconceptions: MisconceptionItem[];
  confidenceIssues: ConfidenceIssue[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAdminDashboardData(
  instructorIds: string[],
  filters?: AdminFilters,
): AdminDashboardData {
  const [metrics, setMetrics] = useState<AggregateMetrics>({
    sessionsUsed: 0,
    checksPerSession: 0,
    responseRate: 0,
  });
  const [weeklyUsage, setWeeklyUsage] = useState<WeeklyUsage[]>([]);
  const [misconceptions, setMisconceptions] = useState<MisconceptionItem[]>([]);
  const [confidenceIssues, setConfidenceIssues] = useState<ConfidenceIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (instructorIds.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Scope instructors by filter (if provided)
      const scopedInstructorIds =
        filters && filters.instructorIds.length > 0
          ? instructorIds.filter((id) => filters.instructorIds.includes(id))
          : instructorIds;

      if (scopedInstructorIds.length === 0) {
        setMetrics({ sessionsUsed: 0, checksPerSession: 0, responseRate: 0 });
        setWeeklyUsage([]);
        setMisconceptions([]);
        setConfidenceIssues([]);
        setLoading(false);
        return;
      }

      // Date range: prefer filter range, fall back to last 4 weeks
      const { from: rangeFrom } = filters
        ? getDateRangeBounds(filters.dateRange, filters.fromDate, filters.toDate)
        : { from: subWeeks(new Date(), 4) };

      // Fetch sessions within date range
      let sessionQuery = supabase
        .from("live_sessions")
        .select("id, created_at, course_id")
        .in("instructor_id", scopedInstructorIds)
        .gte("created_at", rangeFrom.toISOString());

      if (filters && filters.courseIds.length > 0) {
        sessionQuery = sessionQuery.in("course_id", filters.courseIds);
      }

      const { data: sessions, error: sessionsError } = await sessionQuery;

      if (sessionsError) throw sessionsError;

      const sessionIds = sessions?.map((s) => s.id) || [];
      const sessionsCount = sessionIds.length;

      // Fetch questions for these sessions
      const { data: questions, error: questionsError } = await supabase
        .from("live_questions")
        .select("id, session_id, question_content")
        .in("session_id", sessionIds);

      if (questionsError) throw questionsError;

      const questionsCount = questions?.length || 0;
      const questionIds = questions?.map((q) => q.id) || [];

      // Fetch participants for these sessions
      const { data: participants, error: participantsError } = await supabase
        .from("live_participants")
        .select("id, session_id")
        .in("session_id", sessionIds);

      if (participantsError) throw participantsError;

      // Fetch responses for these questions
      const { data: responses, error: responsesError } = await supabase
        .from("live_responses")
        .select("id, question_id, is_correct, confidence_level")
        .in("question_id", questionIds);

      if (responsesError) throw responsesError;

      const responsesCount = responses?.length || 0;

      // Calculate metrics
      const checksPerSession = sessionsCount > 0 ? questionsCount / sessionsCount : 0;

      // Calculate expected responses: questions × unique participants per session
      const participantsBySession = new Map<string, Set<string>>();
      participants?.forEach((p) => {
        if (!participantsBySession.has(p.session_id)) {
          participantsBySession.set(p.session_id, new Set());
        }
        participantsBySession.get(p.session_id)!.add(p.id);
      });

      let expectedResponses = 0;
      questions?.forEach((q) => {
        const sessionParticipants = participantsBySession.get(q.session_id);
        expectedResponses += sessionParticipants?.size || 0;
      });

      const responseRate = expectedResponses > 0 ? (responsesCount / expectedResponses) * 100 : 0;

      setMetrics({
        sessionsUsed: sessionsCount,
        checksPerSession: Math.round(checksPerSession * 10) / 10,
        responseRate: Math.round(responseRate),
      });

      // Calculate weekly usage
      const weeklyData: Map<string, { sessions: Set<string>; questions: number }> = new Map();
      
      for (let i = 3; i >= 0; i--) {
        const weekStart = startOfWeek(subWeeks(new Date(), i));
        const weekLabel = format(weekStart, "MMM d");
        weeklyData.set(weekLabel, { sessions: new Set(), questions: 0 });
      }

      sessions?.forEach((s) => {
        const sessionWeek = startOfWeek(new Date(s.created_at));
        const weekLabel = format(sessionWeek, "MMM d");
        if (weeklyData.has(weekLabel)) {
          weeklyData.get(weekLabel)!.sessions.add(s.id);
        }
      });

      questions?.forEach((q) => {
        const session = sessions?.find((s) => s.id === q.session_id);
        if (session) {
          const sessionWeek = startOfWeek(new Date(session.created_at));
          const weekLabel = format(sessionWeek, "MMM d");
          if (weeklyData.has(weekLabel)) {
            weeklyData.get(weekLabel)!.questions++;
          }
        }
      });

      const weeklyUsageArray: WeeklyUsage[] = [];
      weeklyData.forEach((data, week) => {
        weeklyUsageArray.push({
          week,
          sessions: data.sessions.size,
          questions: data.questions,
        });
      });
      setWeeklyUsage(weeklyUsageArray);

      // Calculate misconceptions (questions with low correct rate)
      const questionStats = new Map<string, { correct: number; total: number; content: string }>();
      
      questions?.forEach((q) => {
        const content = typeof q.question_content === 'object' 
          ? (q.question_content as any)?.question || (q.question_content as any)?.text || 'Unknown question'
          : String(q.question_content);
        questionStats.set(q.id, { correct: 0, total: 0, content });
      });

      responses?.forEach((r) => {
        const stats = questionStats.get(r.question_id);
        if (stats) {
          stats.total++;
          if (r.is_correct) {
            stats.correct++;
          }
        }
      });

      const misconceptionsList: MisconceptionItem[] = [];
      questionStats.forEach((stats, _questionId) => {
        if (stats.total >= 3) {
          const correctRate = (stats.correct / stats.total) * 100;
          if (correctRate < 50) {
            misconceptionsList.push({
              questionText: stats.content.substring(0, 80) + (stats.content.length > 80 ? '...' : ''),
              correctRate: Math.round(correctRate),
              totalResponses: stats.total,
            });
          }
        }
      });

      misconceptionsList.sort((a, b) => a.correctRate - b.correctRate);
      setMisconceptions(misconceptionsList.slice(0, 5));

      // Calculate confidence issues (confidently wrong)
      const confidentWrongByQuestion = new Map<string, number>();
      
      responses?.forEach((r) => {
        if (!r.is_correct && (r.confidence_level === 'high' || r.confidence_level === 'very_high')) {
          const current = confidentWrongByQuestion.get(r.question_id) || 0;
          confidentWrongByQuestion.set(r.question_id, current + 1);
        }
      });

      const confidenceIssuesList: ConfidenceIssue[] = [];
      confidentWrongByQuestion.forEach((count, questionId) => {
        const questionData = questions?.find((q) => q.id === questionId);
        if (questionData && count >= 2) {
          const content = typeof questionData.question_content === 'object'
            ? (questionData.question_content as any)?.question || (questionData.question_content as any)?.text || 'Unknown question'
            : String(questionData.question_content);
          confidenceIssuesList.push({
            questionText: content.substring(0, 80) + (content.length > 80 ? '...' : ''),
            confidentWrongCount: count,
          });
        }
      });

      confidenceIssuesList.sort((a, b) => b.confidentWrongCount - a.confidentWrongCount);
      setConfidenceIssues(confidenceIssuesList.slice(0, 5));

    } catch (err: any) {
      setError(err.message || "Failed to fetch dashboard data");
    } finally {
      setLoading(false);
    }
  }, [instructorIds, JSON.stringify(filters)]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    metrics,
    weeklyUsage,
    misconceptions,
    confidenceIssues,
    loading,
    error,
    refetch: fetchData,
  };
}
