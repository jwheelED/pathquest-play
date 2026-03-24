import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, CheckCircle, AlertCircle, ArrowRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface LastSignalData {
  insight: string;
  responseCount: number;
  avgCorrectRate: number;
  confusionPoints: number;
  sessionDate: string;
}

interface LastLiveSignalProps {
  onViewSummary?: () => void;
}

export function LastLiveSignal({ onViewSummary }: LastLiveSignalProps) {
  const { selectedCourseId } = useCourseContext();
  const [signal, setSignal] = useState<LastSignalData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedCourseId) {
      setLoading(false);
      return;
    }
    fetchLastSignal();
  }, [selectedCourseId]);

  const fetchLastSignal = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: sessions } = await supabase
        .from("live_sessions")
        .select("id, created_at, title")
        .eq("instructor_id", user.id)
        .eq("is_active", false)
        .or(`course_id.eq.${selectedCourseId},course_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!sessions?.length) {
        setSignal(null);
        setLoading(false);
        return;
      }

      const session = sessions[0];

      const responsesRes = await (supabase
        .from("live_responses")
        .select("is_correct")
        .eq("session_id", session.id) as any);
      const questionsRes = await (supabase
        .from("live_questions")
        .select("id")
        .eq("session_id", session.id) as any);

      const responses = responsesRes.data || [];
      const correctCount = responses.filter(r => r.is_correct).length;
      const avgCorrect = responses.length > 0 ? Math.round((correctCount / responses.length) * 100) : 0;
      const confusionPoints = avgCorrect < 60 ? 1 : 0;

      // Generate insight based on data
      let insight = "Last session completed successfully.";
      if (avgCorrect < 50) {
        insight = "Last session surfaced significant confusion that may need follow-up.";
      } else if (avgCorrect < 70) {
        insight = "Last session surfaced some areas of confusion worth revisiting.";
      } else {
        insight = "Last session showed strong understanding across the room.";
      }

      setSignal({
        insight,
        responseCount: responses.length,
        avgCorrectRate: avgCorrect,
        confusionPoints,
        sessionDate: session.created_at,
      });
    } catch (error) {
      console.error("Error fetching last signal:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="command-card p-5">
        <Skeleton className="h-3 w-24 mb-3" />
        <Skeleton className="h-5 w-48 mb-3" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  // Empty state
  if (!signal) {
    return (
      <div className="command-card p-5">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-charcoal-subtle/70">
          Last Live Signal
        </span>
        
        <h3 className="text-base font-semibold text-charcoal mt-2 mb-2">
          No live signal yet
        </h3>
        
        <p className="text-sm text-charcoal-muted leading-relaxed">
          Send your first live check-in to start surfacing understanding patterns here.
        </p>
      </div>
    );
  }

  return (
    <div className="command-card p-5">
      {/* Eyebrow */}
      <span className="text-[10px] font-semibold uppercase tracking-widest text-charcoal-subtle/70">
        Last Live Signal
      </span>

      {/* Headline */}
      <h3 className="text-base font-semibold text-charcoal mt-2 mb-2">
        Your most recent room insight
      </h3>

      {/* Primary body */}
      <p className="text-sm text-charcoal-muted leading-relaxed mb-4">
        {signal.insight}
      </p>

      {/* Supporting stats */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-charcoal-subtle">
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" />
          <span>{signal.responseCount} responses last session</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
          <span>{signal.avgCorrectRate}% average correct</span>
        </div>
        {signal.confusionPoints > 0 && (
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
            <span>{signal.confusionPoints} confusion point{signal.confusionPoints !== 1 ? "s" : ""} surfaced</span>
          </div>
        )}
      </div>

      {/* CTA */}
      {onViewSummary && (
        <Button
          variant="ghost"
          onClick={onViewSummary}
          className="rounded-full h-8 px-4 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 gap-1.5 -ml-2"
        >
          View last session summary
          <ArrowRight className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
