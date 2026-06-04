import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfWeek, subWeeks, format } from "date-fns";
import type { AdminFilters } from "@/hooks/useAdminFilters";
import { getDateRangeBounds } from "@/hooks/useAdminFilters";

export interface AggregateMetrics {
  sessionsUsed: number;
  checksPerSession: number;
  responseRate: number;
  activeStudents7d: number;
  /** Deltas vs prior equal-length window (percentage points or absolute count) */
  responseRateDelta: number;
  activeStudents7dDelta: number;
  sessionsUsedDelta: number;
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
  courseName?: string;
}

export interface ConfidenceIssue {
  questionText: string;
  confidentWrongCount: number;
  courseName?: string;
}

export interface AdminDashboardData {
  metrics: AggregateMetrics;
  weeklyUsage: WeeklyUsage[];
  misconceptions: MisconceptionItem[];
  confidenceIssues: ConfidenceIssue[];
  /** True if these instructors have ANY historical sessions (data source is connected). */
  hasAnyData: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const EMPTY_METRICS: AggregateMetrics = {
  sessionsUsed: 0,
  checksPerSession: 0,
  responseRate: 0,
  activeStudents7d: 0,
  responseRateDelta: 0,
  activeStudents7dDelta: 0,
  sessionsUsedDelta: 0,
};

export function useAdminDashboardData(
  instructorIds: string[],
  filters?: AdminFilters,
): AdminDashboardData {
  const [metrics, setMetrics] = useState<AggregateMetrics>(EMPTY_METRICS);
  const [weeklyUsage, setWeeklyUsage] = useState<WeeklyUsage[]>([]);
  const [misconceptions, setMisconceptions] = useState<MisconceptionItem[]>([]);
  const [confidenceIssues, setConfidenceIssues] = useState<ConfidenceIssue[]>([]);
  const [hasAnyData, setHasAnyData] = useState(false);
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
        setMetrics(EMPTY_METRICS);
        setWeeklyUsage([]);
        setMisconceptions([]);
        setConfidenceIssues([]);
        setHasAnyData(false);
        setLoading(false);
        return;
      }

      // "Connected" check: does ANY historical session exist for these instructors?
      const { count: anyCount } = await supabase
        .from("live_sessions")
        .select("id", { count: "exact", head: true })
        .in("instructor_id", scopedInstructorIds);
      const connected = (anyCount ?? 0) > 0;
      setHasAnyData(connected);

      // Date range: prefer filter range, fall back to last 4 weeks
      const { from: rangeFrom, to: rangeTo } = filters
        ? getDateRangeBounds(filters.dateRange, filters.fromDate, filters.toDate)
        : { from: subWeeks(new Date(), 4), to: new Date() };

      // Prior equal-length window for deltas
      const windowMs = rangeTo.getTime() - rangeFrom.getTime();
      const priorFrom = new Date(rangeFrom.getTime() - windowMs);
      const priorTo = rangeFrom;

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

      // Prior window sessions (for delta)
      const { data: priorSessions } = await supabase
        .from("live_sessions")
        .select("id, course_id")
        .in("instructor_id", scopedInstructorIds)
        .gte("created_at", priorFrom.toISOString())
        .lt("created_at", priorTo.toISOString());

      const sessionIds = sessions?.map((s) => s.id) || [];
      const sessionsCount = sessionIds.length;
      const priorSessionIds = priorSessions?.map((s) => s.id) || [];

      // Course names for the sessions in range
      const courseIds = [
        ...new Set((sessions || []).map((s) => s.course_id).filter(Boolean) as string[]),
      ];
      const courseNameById = new Map<string, string>();
      if (courseIds.length > 0) {
        const { data: courses } = await supabase
          .from("courses")
          .select("id, name")
          .in("id", courseIds);
        courses?.forEach((c: any) => courseNameById.set(c.id, c.name || "Course"));
      }
      const courseBySession = new Map<string, string>();
      sessions?.forEach((s) => {
        if (s.course_id) courseBySession.set(s.id, courseNameById.get(s.course_id) || "");
      });

      // Fetch questions for these sessions
      const { data: questions } = sessionIds.length
        ? await supabase
            .from("live_questions")
            .select("id, session_id, question_content")
            .in("session_id", sessionIds)
        : { data: [] as any[] };

      const questionsCount = questions?.length || 0;
      const questionIds = questions?.map((q) => q.id) || [];

      // Prior questions count
      const { count: priorQuestionsCount } = priorSessionIds.length
        ? await supabase
            .from("live_questions")
            .select("id", { count: "exact", head: true })
            .in("session_id", priorSessionIds)
        : { count: 0 };

      // Participants
      const { data: participants } = sessionIds.length
        ? await supabase
            .from("live_participants")
            .select("id, session_id")
            .in("session_id", sessionIds)
        : { data: [] as any[] };

      // Responses
      const { data: responses } = questionIds.length
        ? await supabase
            .from("live_responses")
            .select("id, question_id, is_correct, confidence_level")
            .in("question_id", questionIds)
        : { data: [] as any[] };

      const responsesCount = responses?.length || 0;

      // Active students last 7d (and prior 7d for delta) — based on live_responses participant activity
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const { data: recentActive } = await supabase
        .from("live_responses")
        .select("participant_id, responded_at")
        .gte("responded_at", fourteenDaysAgo.toISOString())
        .in("question_id", questionIds.length ? questionIds : ["00000000-0000-0000-0000-000000000000"]);

      const active7d = new Set<string>();
      const activePrior7d = new Set<string>();
      recentActive?.forEach((r: any) => {
        const t = new Date(r.responded_at).getTime();
        if (t >= sevenDaysAgo.getTime()) active7d.add(r.participant_id);
        else if (t >= fourteenDaysAgo.getTime()) activePrior7d.add(r.participant_id);
      });

      // Metrics
      const checksPerSession = sessionsCount > 0 ? questionsCount / sessionsCount : 0;

      const participantsBySession = new Map<string, Set<string>>();
      participants?.forEach((p) => {
        if (!participantsBySession.has(p.session_id))
          participantsBySession.set(p.session_id, new Set());
        participantsBySession.get(p.session_id)!.add(p.id);
      });
      let expectedResponses = 0;
      questions?.forEach((q) => {
        expectedResponses += participantsBySession.get(q.session_id)?.size || 0;
      });
      const responseRate = expectedResponses > 0 ? (responsesCount / expectedResponses) * 100 : 0;

      // Prior window response rate (approximate; uses prior questions+participants)
      let priorResponseRate = 0;
      if (priorSessionIds.length > 0) {
        const { data: priorQs } = await supabase
          .from("live_questions")
          .select("id, session_id")
          .in("session_id", priorSessionIds);
        const priorQIds = priorQs?.map((q) => q.id) || [];
        const { data: priorParts } = await supabase
          .from("live_participants")
          .select("id, session_id")
          .in("session_id", priorSessionIds);
        const { count: priorRespCount } = priorQIds.length
          ? await supabase
              .from("live_responses")
              .select("id", { count: "exact", head: true })
              .in("question_id", priorQIds)
          : { count: 0 };
        const priorPartsBySession = new Map<string, Set<string>>();
        priorParts?.forEach((p: any) => {
          if (!priorPartsBySession.has(p.session_id))
            priorPartsBySession.set(p.session_id, new Set());
          priorPartsBySession.get(p.session_id)!.add(p.id);
        });
        let priorExpected = 0;
        priorQs?.forEach((q: any) => {
          priorExpected += priorPartsBySession.get(q.session_id)?.size || 0;
        });
        priorResponseRate =
          priorExpected > 0 ? ((priorRespCount || 0) / priorExpected) * 100 : 0;
      }

      setMetrics({
        sessionsUsed: sessionsCount,
        checksPerSession: Math.round(checksPerSession * 10) / 10,
        responseRate: Math.round(responseRate),
        activeStudents7d: active7d.size,
        responseRateDelta: Math.round(responseRate - priorResponseRate),
        activeStudents7dDelta: active7d.size - activePrior7d.size,
        sessionsUsedDelta: sessionsCount - priorSessionIds.length,
      });

      // Weekly usage (last 4 weeks, calendar-aligned)
      const weeklyData: Map<string, { sessions: Set<string>; questions: number }> = new Map();
      for (let i = 3; i >= 0; i--) {
        const weekStart = startOfWeek(subWeeks(new Date(), i));
        weeklyData.set(format(weekStart, "MMM d"), { sessions: new Set(), questions: 0 });
      }
      sessions?.forEach((s) => {
        const label = format(startOfWeek(new Date(s.created_at)), "MMM d");
        weeklyData.get(label)?.sessions.add(s.id);
      });
      questions?.forEach((q) => {
        const session = sessions?.find((s) => s.id === q.session_id);
        if (!session) return;
        const label = format(startOfWeek(new Date(session.created_at)), "MMM d");
        const bucket = weeklyData.get(label);
        if (bucket) bucket.questions++;
      });
      const weeklyUsageArray: WeeklyUsage[] = [];
      weeklyData.forEach((d, week) =>
        weeklyUsageArray.push({ week, sessions: d.sessions.size, questions: d.questions }),
      );
      setWeeklyUsage(weeklyUsageArray);

      // Misconceptions
      const questionStats = new Map<
        string,
        { correct: number; total: number; content: string; sessionId: string }
      >();
      questions?.forEach((q) => {
        const content =
          typeof q.question_content === "object"
            ? (q.question_content as any)?.question ||
              (q.question_content as any)?.text ||
              "Unknown question"
            : String(q.question_content);
        questionStats.set(q.id, {
          correct: 0,
          total: 0,
          content,
          sessionId: q.session_id,
        });
      });
      responses?.forEach((r) => {
        const stats = questionStats.get(r.question_id);
        if (!stats) return;
        stats.total++;
        if (r.is_correct) stats.correct++;
      });

      const misconceptionsList: MisconceptionItem[] = [];
      questionStats.forEach((stats) => {
        if (stats.total >= 3) {
          const correctRate = (stats.correct / stats.total) * 100;
          if (correctRate < 50) {
            misconceptionsList.push({
              questionText:
                stats.content.substring(0, 80) + (stats.content.length > 80 ? "..." : ""),
              correctRate: Math.round(correctRate),
              totalResponses: stats.total,
              courseName: courseBySession.get(stats.sessionId) || undefined,
            });
          }
        }
      });
      misconceptionsList.sort((a, b) => a.correctRate - b.correctRate);
      setMisconceptions(misconceptionsList.slice(0, 5));

      // Confidence issues
      const confidentWrongByQuestion = new Map<string, number>();
      responses?.forEach((r) => {
        if (
          !r.is_correct &&
          (r.confidence_level === "high" || r.confidence_level === "very_high")
        ) {
          confidentWrongByQuestion.set(
            r.question_id,
            (confidentWrongByQuestion.get(r.question_id) || 0) + 1,
          );
        }
      });
      const confidenceIssuesList: ConfidenceIssue[] = [];
      confidentWrongByQuestion.forEach((count, qid) => {
        const stats = questionStats.get(qid);
        if (stats && count >= 2) {
          confidenceIssuesList.push({
            questionText:
              stats.content.substring(0, 80) + (stats.content.length > 80 ? "..." : ""),
            confidentWrongCount: count,
            courseName: courseBySession.get(stats.sessionId) || undefined,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instructorIds, JSON.stringify(filters)]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    metrics,
    weeklyUsage,
    misconceptions,
    confidenceIssues,
    hasAnyData,
    loading,
    error,
    refetch: fetchData,
  };
}
