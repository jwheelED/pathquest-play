import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, HelpCircle, CheckCircle, AlertCircle, FileText, ListChecks } from "lucide-react";
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
    <div className="command-card p-5 lg:p-6 h-full flex flex-col">
      {/* Eyebrow */}
      <span className="section-eyebrow">Last Session</span>
      
      {/* Headline */}
      <h2 className="section-headline mt-2 mb-1.5">
        What the room told you last time
      </h2>
      
      {/* Metadata line */}
      <p className="text-sm text-charcoal-subtle mb-4">
        {format(new Date(session.created_at), "MMM d, yyyy")}
        {session.title && <span className="text-charcoal-muted"> · {session.title}</span>}
      </p>
      
      {/* Summary stats grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="flex items-center gap-2 text-sm">
          <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100">
            <HelpCircle className="w-3.5 h-3.5 text-charcoal-muted" />
          </div>
          <div>
            <p className="font-semibold text-charcoal text-base leading-none">{session.questionCount}</p>
            <p className="text-[11px] text-charcoal-subtle">check-ins</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100">
            <Users className="w-3.5 h-3.5 text-charcoal-muted" />
          </div>
          <div>
            <p className="font-semibold text-charcoal text-base leading-none">{session.participantCount}</p>
            <p className="text-[11px] text-charcoal-subtle">responded</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-100">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-charcoal text-base leading-none">{session.avgCorrectRate}%</p>
            <p className="text-[11px] text-charcoal-subtle">avg correct</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 border border-amber-100">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-charcoal text-base leading-none">{session.confusionPoints}</p>
            <p className="text-[11px] text-charcoal-subtle">confusion</p>
          </div>
        </div>
      </div>
      
      {/* Insight summary */}
      <div className="bg-slate-50/80 rounded-xl p-3.5 mb-4 border border-slate-100 flex-1">
        <p className="text-[13px] text-charcoal-muted leading-relaxed">
          {session.avgCorrectRate >= 70 
            ? "Strong understanding across the session. Most participants followed the explanation well."
            : session.avgCorrectRate >= 50
            ? "Most participants followed along, but some confusion surfaced in certain areas."
            : "Significant confusion detected. Consider revisiting key concepts next session."
          }
        </p>
        
        {session.confusionPoints > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-200/80">
            <p className="text-[10px] text-charcoal-subtle uppercase tracking-wide font-medium mb-0.5">
              Most confused concept
            </p>
            <p className="text-[13px] font-medium text-charcoal">
              Questions with lower response accuracy
            </p>
          </div>
        )}
      </div>
      
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 mt-auto pt-1">
        <Button 
          variant="outline"
          onClick={() => onNavigate?.("summaries")}
          className={cn(
            "rounded-full px-3.5 h-8 gap-1.5 text-xs font-medium",
            "border-slate-200 text-charcoal hover:bg-slate-50 hover:border-slate-300"
          )}
        >
          <FileText className="w-3 h-3" />
          View summary
        </Button>
        
        <Button 
          variant="ghost"
          onClick={() => onNavigate?.("live")}
          className={cn(
            "rounded-full px-3 h-8 gap-1.5 text-xs font-medium",
            "text-charcoal-muted hover:text-charcoal hover:bg-slate-50"
          )}
        >
          <ListChecks className="w-3 h-3" />
          Check-ins
        </Button>
      </div>
    </div>
  );
}
