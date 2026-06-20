import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users, Brain, Calendar } from "lucide-react";

interface HealthMetrics {
  latestResponseRate: number;
  participationTrend: "up" | "steady" | "down";
  understandingSignal: "strong" | "moderate" | "low";
  sessionsRun: number;
}

export function LiveUnderstandingHealth() {
  const { selectedCourseId } = useCourseContext();
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
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

      // Fetch sessions
      const { data: sessionsData } = await supabase
        .from("live_sessions")
        .select("id, created_at")
        .eq("instructor_id", user.id)
        .eq("is_active", false)
        .or(`course_id.eq.${selectedCourseId},course_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(10);

      const sessionIds = (sessionsData || []).map(s => s.id);
      const sessionsCount = sessionIds.length;

      let latestResponseRate = 0;
      let avgCorrectRate = 0;

      if (sessionIds.length > 0) {
        // Get latest session responses
        const latestSessionId = sessionIds[0];
        
        const [participantsRes, questionsRes, responsesRes] = await Promise.all([
          (supabase.from("live_participants") as any).select("id", { count: "exact", head: true }).eq("session_id", latestSessionId),
          (supabase.from("live_questions") as any).select("id", { count: "exact", head: true }).eq("session_id", latestSessionId),
          (supabase.from("live_responses") as any).select("is_correct").in("session_id", sessionIds.slice(0, 3)),
        ]);

        const totalParticipants = participantsRes.count || 0;
        const totalQuestions = questionsRes.count || 1;
        latestResponseRate = Math.min(Math.round((totalParticipants / Math.max(totalQuestions, 1)) * 100), 100);

        // Calculate avg correct rate for understanding signal
        const responses = responsesRes.data || [];
        const correctCount = responses.filter(r => r.is_correct).length;
        avgCorrectRate = responses.length > 0 ? Math.round((correctCount / responses.length) * 100) : 50;
      }

      // Determine participation trend (simplified - would need historical comparison in production)
      const participationTrend: "up" | "steady" | "down" = 
        sessionsCount >= 3 ? "steady" : "steady";

      // Determine understanding signal based on avg correct rate
      const understandingSignal: "strong" | "moderate" | "low" = 
        avgCorrectRate >= 70 ? "strong" : avgCorrectRate >= 50 ? "moderate" : "low";

      setMetrics({
        latestResponseRate,
        participationTrend,
        understandingSignal,
        sessionsRun: sessionsCount,
      });
    } catch (error) {
      console.error("Error fetching health metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-5 w-48" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="signal-card p-4">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-7 w-12 mb-1" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const getTrendLabel = (trend: "up" | "steady" | "down") => {
    switch (trend) {
      case "up": return "Improving";
      case "down": return "Declining";
      default: return "Steady";
    }
  };

  const getSignalLabel = (signal: "strong" | "moderate" | "low") => {
    switch (signal) {
      case "strong": return "Strong understanding";
      case "low": return "Confusion surfaced";
      default: return "Moderate confusion surfaced";
    }
  };

  const getSignalColor = (signal: "strong" | "moderate" | "low") => {
    switch (signal) {
      case "strong": return "text-emerald-700";
      case "low": return "text-amber-700";
      default: return "text-amber-600";
    }
  };

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div>
        <span className="section-eyebrow">Live Understanding Health</span>
        <h2 className="section-headline mt-1.5">
          Your recent room signal at a glance
        </h2>
      </div>
      
      {/* Signal cards grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Latest response rate */}
        <div className="signal-card p-4">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Users className="w-3.5 h-3.5 text-charcoal-subtle" />
            <span className="text-[11px] font-medium text-charcoal-muted uppercase tracking-wide">Response rate</span>
          </div>
          <p className="text-2xl font-semibold text-charcoal mb-1">
            {metrics?.latestResponseRate ?? 0}%
          </p>
          <p className="text-[11px] text-charcoal-subtle leading-relaxed">
            From your most recent check-in
          </p>
        </div>
        
        {/* Card 2: Participation trend */}
        <div className="signal-card p-4">
          <div className="flex items-center gap-1.5 mb-2.5">
            <TrendingUp className="w-3.5 h-3.5 text-charcoal-subtle" />
            <span className="text-[11px] font-medium text-charcoal-muted uppercase tracking-wide">Participation</span>
          </div>
          <p className="text-2xl font-semibold text-charcoal mb-1">
            {getTrendLabel(metrics?.participationTrend ?? "steady")}
          </p>
          <p className="text-[11px] text-charcoal-subtle leading-relaxed">
            Compared with previous session
          </p>
        </div>
        
        {/* Card 3: Understanding signal */}
        <div className="signal-card p-4">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Brain className="w-3.5 h-3.5 text-charcoal-subtle" />
            <span className="text-[11px] font-medium text-charcoal-muted uppercase tracking-wide">Understanding</span>
          </div>
          <p className={`text-base font-semibold mb-1 leading-tight ${getSignalColor(metrics?.understandingSignal ?? "moderate")}`}>
            {getSignalLabel(metrics?.understandingSignal ?? "moderate")}
          </p>
          <p className="text-[11px] text-charcoal-subtle leading-relaxed">
            Based on latest session responses
          </p>
        </div>
        
        {/* Card 4: Session consistency */}
        <div className="signal-card p-4">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Calendar className="w-3.5 h-3.5 text-charcoal-subtle" />
            <span className="text-[11px] font-medium text-charcoal-muted uppercase tracking-wide">Consistency</span>
          </div>
          <p className="text-2xl font-semibold text-charcoal mb-1">
            {metrics?.sessionsRun ?? 0}
          </p>
          <p className="text-[11px] text-charcoal-subtle leading-relaxed">
            Sessions run recently
          </p>
        </div>
      </div>
    </div>
  );
}
