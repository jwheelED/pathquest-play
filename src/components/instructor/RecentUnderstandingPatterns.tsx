import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle, TrendingUp, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PatternData {
  mostMissedConcept: string;
  mostMissedSessionCount: number;
  strongestMoment: string;
  strongestCorrectRate: number;
  strongestParticipants: number;
  participationInsight: string;
}

interface RecentUnderstandingPatternsProps {
  onViewPatterns?: () => void;
}

export function RecentUnderstandingPatterns({ onViewPatterns }: RecentUnderstandingPatternsProps) {
  const { selectedCourseId } = useCourseContext();
  const [patterns, setPatterns] = useState<PatternData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedCourseId) {
      setLoading(false);
      return;
    }
    fetchPatterns();
  }, [selectedCourseId]);

  const fetchPatterns = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get recent sessions and their questions
      const { data: sessionsData } = await supabase
        .from("live_sessions")
        .select("id, title, created_at")
        .eq("instructor_id", user.id)
        .eq("is_active", false)
        .or(`course_id.eq.${selectedCourseId},course_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(5);

      if (!sessionsData?.length) {
        setPatterns(null);
        setLoading(false);
        return;
      }

      const sessionIds = sessionsData.map(s => s.id);

      // Get questions and their response rates
      const { data: questionsData } = await supabase
        .from("live_questions")
        .select("id, question_text, session_id")
        .in("session_id", sessionIds);

      const { data: responsesData } = await supabase
        .from("live_responses")
        .select("question_id, is_correct, session_id")
        .in("session_id", sessionIds);

      // Calculate patterns
      const questionStats = new Map<string, { correct: number; total: number; text: string; sessions: Set<string> }>();
      
      questionsData?.forEach(q => {
        if (!questionStats.has(q.id)) {
          questionStats.set(q.id, { correct: 0, total: 0, text: q.question_text || "Check-in question", sessions: new Set() });
        }
        questionStats.get(q.id)!.sessions.add(q.session_id);
      });

      responsesData?.forEach(r => {
        const stats = questionStats.get(r.question_id);
        if (stats) {
          stats.total++;
          if (r.is_correct) stats.correct++;
        }
      });

      // Find most missed and strongest
      let mostMissed = { text: "Understanding check-ins", rate: 1, sessions: 1 };
      let strongest = { text: "Recent check-in", rate: 0, total: 0 };

      questionStats.forEach((stats, _) => {
        if (stats.total > 0) {
          const rate = stats.correct / stats.total;
          if (rate < mostMissed.rate && stats.total >= 3) {
            mostMissed = { text: stats.text, rate, sessions: stats.sessions.size };
          }
          if (rate > strongest.rate && stats.total >= 3) {
            strongest = { text: stats.text, rate, total: stats.total };
          }
        }
      });

      setPatterns({
        mostMissedConcept: mostMissed.text.length > 40 ? mostMissed.text.substring(0, 40) + "..." : mostMissed.text,
        mostMissedSessionCount: mostMissed.sessions,
        strongestMoment: strongest.text.length > 35 ? strongest.text.substring(0, 35) + "..." : strongest.text,
        strongestCorrectRate: Math.round(strongest.rate * 100),
        strongestParticipants: strongest.total,
        participationInsight: "Response rates are highest in the first half of your sessions",
      });
    } catch (error) {
      console.error("Error fetching patterns:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-5 w-56" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="signal-card p-5">
              <Skeleton className="h-3 w-24 mb-3" />
              <Skeleton className="h-5 w-36 mb-2" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!patterns) {
    return null;
  }

  return (
    <div className="space-y-5">
      {/* Section header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="section-eyebrow">Recent Understanding Patterns</span>
          <h2 className="section-headline mt-1.5 mb-1">
            See what's surfacing across sessions
          </h2>
          <p className="text-sm text-charcoal-subtle max-w-lg">
            A quick view of where participants are responding well and where confusion is recurring.
          </p>
        </div>
        {onViewPatterns && (
          <Button
            variant="ghost"
            onClick={onViewPatterns}
            className="shrink-0 rounded-full px-4 h-9 text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 gap-1.5"
          >
            View all check-in patterns
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      {/* Pattern cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Most-missed concept */}
        <div className="signal-card p-5 group">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center border border-amber-100">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <span className="text-xs font-medium text-charcoal-muted">Most-missed concept</span>
          </div>
          <p className="text-base font-semibold text-charcoal mb-1.5 leading-snug">
            {patterns.mostMissedConcept}
          </p>
          <p className="text-xs text-charcoal-subtle">
            Surfaced in {patterns.mostMissedSessionCount} recent session{patterns.mostMissedSessionCount !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Card 2: Strongest response moment */}
        <div className="signal-card p-5 group">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center border border-emerald-100">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <span className="text-xs font-medium text-charcoal-muted">Strongest response moment</span>
          </div>
          <p className="text-base font-semibold text-charcoal mb-1.5 leading-snug">
            {patterns.strongestMoment}
          </p>
          <p className="text-xs text-charcoal-subtle">
            {patterns.strongestCorrectRate}% correct across {patterns.strongestParticipants} participants
          </p>
        </div>

        {/* Card 3: Participation pattern */}
        <div className="signal-card p-5 group">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center border border-sky-100">
              <TrendingUp className="w-3.5 h-3.5 text-sky-600" />
            </div>
            <span className="text-xs font-medium text-charcoal-muted">Participation pattern</span>
          </div>
          <p className="text-base font-semibold text-charcoal mb-1.5 leading-snug">
            {patterns.participationInsight}
          </p>
          <p className="text-xs text-charcoal-subtle">
            Use this to time your next check-in more strategically
          </p>
        </div>
      </div>
    </div>
  );
}
