import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { Users, HelpCircle, BarChart3, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface Metrics {
  totalStudents: number;
  questionsAsked: number;
  avgResponseRate: number;
  sessionsRun: number;
}

export function QuickMetricsGrid() {
  const { selectedCourseId } = useCourseContext();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedCourseId) {
      setLoading(false);
      return;
    }
    fetchMetrics();
  }, [selectedCourseId]);

  const fetchMetrics = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [studentsRes, sessionsRes] = await Promise.all([
        supabase
          .from("instructor_students")
          .select("id", { count: "exact", head: true })
          .eq("instructor_id", user.id)
          .or(`course_id.eq.${selectedCourseId},course_id.is.null`),
        supabase
          .from("live_sessions")
          .select("id")
          .eq("instructor_id", user.id)
          .eq("is_active", false)
          .or(`course_id.eq.${selectedCourseId},course_id.is.null`),
      ]);

      const sessionIds = (sessionsRes.data || []).map(s => s.id);
      let questionsCount = 0;
      if (sessionIds.length > 0) {
        const { count } = await supabase
          .from("live_questions")
          .select("id", { count: "exact", head: true })
          .in("session_id", sessionIds);
        questionsCount = count || 0;
      }

      const sessionsCount = sessionsRes.data?.length || 0;
      const questionsCount = questionsRes.data?.length || 0;

      // Compute avg response rate from recent sessions
      let avgRate = 0;
      if (sessionsCount > 0) {
        const recentSessionIds = (sessionsRes.data || []).slice(0, 10).map(s => s.id);
        if (recentSessionIds.length > 0) {
          const [participantsRes, responsesRes] = await Promise.all([
            supabase
              .from("live_participants")
              .select("id", { count: "exact", head: true })
              .in("session_id", recentSessionIds),
            supabase
              .from("live_responses")
              .select("id", { count: "exact", head: true })
              .in("session_id", recentSessionIds),
          ]);
          const totalP = participantsRes.count || 0;
          const totalR = responsesRes.count || 0;
          avgRate = totalP > 0 ? Math.round((totalR / totalP) * 100) : 0;
        }
      }

      setMetrics({
        totalStudents: studentsRes.count || 0,
        questionsAsked: questionsCount,
        avgResponseRate: Math.min(avgRate, 100),
        sessionsRun: sessionsCount,
      });
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-2xl border border-border/50 p-4 space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      <MetricCard
        icon={<Users className="w-4 h-4" />}
        label="Total Students"
        value={metrics.totalStudents}
        size="sm"
        variant="primary"
      />
      <MetricCard
        icon={<HelpCircle className="w-4 h-4" />}
        label="Questions Asked"
        value={metrics.questionsAsked}
        size="sm"
        variant="default"
      />
      <MetricCard
        icon={<BarChart3 className="w-4 h-4" />}
        label="Avg Response Rate"
        value={`${metrics.avgResponseRate}%`}
        size="sm"
        variant={metrics.avgResponseRate >= 50 ? "success" : "warning"}
      />
      <MetricCard
        icon={<Calendar className="w-4 h-4" />}
        label="Sessions Run"
        value={metrics.sessionsRun}
        size="sm"
        variant="default"
      />
    </div>
  );
}
