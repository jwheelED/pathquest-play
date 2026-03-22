import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Users, HelpCircle, CheckCircle, AlertCircle, ArrowRight, FileText, ListChecks, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface LastSession {
  id: string;
  title: string | null;
  created_at: string;
  participantCount: number;
  questionCount: number;
  avgCorrectRate: number;
  confusionPoints: number;
}

interface LastSessionCardProps {
  onNavigate?: (tab: string) => void;
}

export function LastSessionCard({ onNavigate }: LastSessionCardProps) {
  const [session, setSession] = useState<LastSession | null>(null);
  const [loading, setLoading] = useState(true);
  const { selectedCourseId } = useCourseContext();

  useEffect(() => {
    fetchLastSession();
  }, [selectedCourseId]);

  const fetchLastSession = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("live_sessions")
        .select("id, session_code, title, created_at, ends_at, course_id")
        .eq("instructor_id", user.id)
        .eq("is_active", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (selectedCourseId) {
        query = query.or(`course_id.eq.${selectedCourseId},course_id.is.null`);
      }

      const { data: sessions } = await query;
      if (!sessions?.length) {
        setSession(null);
        setLoading(false);
        return;
      }

      const s = sessions[0];

      const [participantsRes, questionsRes, responsesRes] = await Promise.all([
        supabase
          .from("live_participants")
          .select("session_id")
          .eq("session_id", s.id),
        supabase
          .from("live_questions")
          .select("session_id")
          .eq("session_id", s.id),
        supabase
          .from("live_responses")
          .select("is_correct")
          .eq("session_id", s.id),
      ]);

      const responses = responsesRes.data || [];
      const correctCount = responses.filter(r => r.is_correct).length;
      const avgCorrect = responses.length > 0 ? Math.round((correctCount / responses.length) * 100) : 0;

      // Estimate confusion points based on low correct rate questions
      const confusionEstimate = avgCorrect < 60 ? 1 : 0;

      setSession({
        id: s.id,
        title: s.title,
        created_at: s.created_at,
        participantCount: participantsRes.data?.length || 0,
        questionCount: questionsRes.data?.length || 0,
        avgCorrectRate: avgCorrect,
        confusionPoints: confusionEstimate,
      });
    } catch (error) {
      console.error("Error fetching last session:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="command-card p-6">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="command-card p-6">
        <span className="section-eyebrow">Last Session</span>
        <h2 className="section-headline mt-2 mb-3">No sessions yet</h2>
        <p className="text-sm text-charcoal-muted leading-relaxed mb-5">
          Run your first live session to see insights and summaries here.
        </p>
        {onNavigate && (
          <Button 
            onClick={() => onNavigate("live")}
            variant="outline"
            className="rounded-full px-4 h-9 text-sm font-medium border-slate-200 hover:bg-slate-50"
          >
            Start your first session
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="command-card p-6">
      {/* Eyebrow */}
      <span className="section-eyebrow">Last Session</span>
      
      {/* Headline */}
      <h2 className="section-headline mt-2 mb-2">
        What the room told you last time
      </h2>
      
      {/* Metadata line */}
      <p className="text-sm text-charcoal-subtle mb-5">
        {format(new Date(session.created_at), "MMM d, yyyy")}
        {session.title && <span> · {session.title}</span>}
      </p>
      
      {/* Summary stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="flex items-center gap-2.5 text-sm">
          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
            <HelpCircle className="w-4 h-4 text-charcoal-muted" />
          </div>
          <div>
            <p className="font-semibold text-charcoal">{session.questionCount}</p>
            <p className="text-xs text-charcoal-subtle">check-ins sent</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2.5 text-sm">
          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-charcoal-muted" />
          </div>
          <div>
            <p className="font-semibold text-charcoal">{session.participantCount}</p>
            <p className="text-xs text-charcoal-subtle">responded</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2.5 text-sm">
          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-charcoal">{session.avgCorrectRate}%</p>
            <p className="text-xs text-charcoal-subtle">avg correct</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2.5 text-sm">
          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-charcoal">{session.confusionPoints}</p>
            <p className="text-xs text-charcoal-subtle">confusion point{session.confusionPoints !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>
      
      {/* Insight summary */}
      <div className="bg-slate-50 rounded-xl p-4 mb-5 border border-slate-100">
        <p className="text-sm text-charcoal-muted leading-relaxed">
          {session.avgCorrectRate >= 70 
            ? "Most participants followed the overall explanation well. Strong understanding across the session."
            : session.avgCorrectRate >= 50
            ? "Most participants followed the overall explanation, but some confusion surfaced in certain areas."
            : "Significant confusion was detected. Consider revisiting key concepts in your next session."
          }
        </p>
        
        {session.confusionPoints > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <p className="text-xs text-charcoal-subtle uppercase tracking-wide font-medium mb-1">
              Most confused concept
            </p>
            <p className="text-sm font-medium text-charcoal">
              Questions with lower response accuracy
            </p>
          </div>
        )}
      </div>
      
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button 
          variant="outline"
          onClick={() => onNavigate?.("summaries")}
          className={cn(
            "rounded-full px-4 h-9 gap-1.5 text-sm font-medium",
            "border-slate-200 text-charcoal hover:bg-slate-50 hover:border-slate-300"
          )}
        >
          <FileText className="w-3.5 h-3.5" />
          View full summary
        </Button>
        
        <Button 
          variant="ghost"
          onClick={() => onNavigate?.("live")}
          className={cn(
            "rounded-full px-4 h-9 gap-1.5 text-sm font-medium",
            "text-charcoal-muted hover:text-charcoal hover:bg-slate-50"
          )}
        >
          <ListChecks className="w-3.5 h-3.5" />
          Review check-ins
        </Button>
        
        <Button 
          variant="ghost"
          onClick={() => onNavigate?.("live")}
          className={cn(
            "rounded-full px-4 h-9 gap-1.5 text-sm font-medium",
            "text-charcoal-muted hover:text-charcoal hover:bg-slate-50"
          )}
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open session
        </Button>
      </div>
    </div>
  );
}
