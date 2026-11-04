import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, HelpCircle, BarChart3, ArrowRight, FileText } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface SessionRow {
  id: string;
  title: string | null;
  created_at: string;
  participantCount: number;
  questionCount: number;
  avgResponseRate: number;
}

interface RecentSessionsListProps {
  onNavigate: (tab: string) => void;
}

export function RecentSessionsList({ onNavigate }: RecentSessionsListProps) {
  const { selectedCourseId } = useCourseContext();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSessions();
  }, [selectedCourseId]);

  const fetchSessions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("live_sessions")
        .select("id, title, session_code, created_at")
        .eq("instructor_id", user.id)
        .eq("is_active", false)
        .order("created_at", { ascending: false })
        .limit(5);

      if (selectedCourseId) {
        query = query.or(`course_id.eq.${selectedCourseId},course_id.is.null`);
      }

      const { data: sessionsData } = await query;
      if (!sessionsData?.length) {
        setSessions([]);
        setLoading(false);
        return;
      }

      const sessionIds = sessionsData.map(s => s.id);

      const [participantsRes, questionsRes, responsesRes] = await Promise.all([
        (supabase.from("live_participants") as any).select("session_id").in("session_id", sessionIds),
        (supabase.from("live_questions") as any).select("session_id, id").in("session_id", sessionIds),
        (supabase.from("live_responses") as any).select("session_id, is_correct").in("session_id", sessionIds),
      ]);

      const pMap = new Map<string, number>();
      const qMap = new Map<string, number>();
      const rMap = new Map<string, { total: number; correct: number }>();

      participantsRes.data?.forEach(p => pMap.set(p.session_id, (pMap.get(p.session_id) || 0) + 1));
      questionsRes.data?.forEach(q => qMap.set(q.session_id, (qMap.get(q.session_id) || 0) + 1));
      responsesRes.data?.forEach(r => {
        const existing = rMap.get(r.session_id) || { total: 0, correct: 0 };
        existing.total++;
        if (r.is_correct) existing.correct++;
        rMap.set(r.session_id, existing);
      });

      setSessions(sessionsData.map(s => {
        const responses = rMap.get(s.id) || { total: 0, correct: 0 };
        const avgRate = responses.total > 0 ? Math.round((responses.correct / responses.total) * 100) : 0;
        return {
          id: s.id,
          title: s.title || `Session ${s.session_code}`,
          created_at: s.created_at,
          participantCount: pMap.get(s.id) || 0,
          questionCount: qMap.get(s.id) || 0,
          avgResponseRate: avgRate,
        };
      }));
    } catch (error) {
      console.error("Error fetching recent sessions:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="section-eyebrow opacity-70">Recent Sessions</span>
          <h2 className="text-lg font-semibold text-charcoal mt-1 mb-0.5">
            Recent live sessions
          </h2>
          <p className="text-sm text-charcoal-subtle">
            Return to previous sessions, review summaries, or compare activity over time.
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() => onNavigate("live")}
          className="shrink-0 rounded-full px-4 h-9 text-sm font-medium text-charcoal-muted hover:text-charcoal hover:bg-slate-100 gap-1.5"
        >
          View all sessions
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Sessions table */}
      <div className="border border-slate-150 rounded-xl overflow-hidden bg-white" style={{ borderColor: 'hsl(220 15% 93%)' }}>
        {/* Header */}
        <div className="hidden md:grid grid-cols-[1fr_100px_110px_100px_110px_100px] gap-3 px-4 py-2.5 bg-slate-50 border-b text-xs font-medium text-charcoal-muted uppercase tracking-wide" style={{ borderColor: 'hsl(220 15% 93%)' }}>
          <span>Session</span>
          <span>Date</span>
          <span>Participants</span>
          <span>Check-ins</span>
          <span>Avg. response</span>
          <span></span>
        </div>

        {/* Rows */}
        <div className="divide-y" style={{ borderColor: 'hsl(220 15% 94%)' }}>
          {sessions.map((session, idx) => (
            <div
              key={session.id}
              className={cn(
                "grid grid-cols-1 md:grid-cols-[1fr_100px_110px_100px_110px_100px] gap-2 md:gap-3 px-4 py-3 md:py-2.5 items-center",
                "hover:bg-slate-50/50 transition-colors cursor-pointer group"
              )}
              onClick={() => onNavigate("live")}
            >
              {/* Session name */}
              <div className="font-medium text-charcoal text-sm truncate">
                {session.title}
              </div>

              {/* Date */}
              <div className="text-sm text-charcoal-muted">
                <span className="md:hidden text-xs text-charcoal-subtle mr-1">Date:</span>
                {format(new Date(session.created_at), "MMM d, yyyy")}
              </div>

              {/* Participants */}
              <div className="text-sm text-charcoal-muted flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-charcoal-subtle md:hidden" />
                <span className="md:hidden text-xs text-charcoal-subtle mr-1">Participants:</span>
                {session.participantCount}
                <span className="hidden md:inline text-charcoal-subtle">participants</span>
              </div>

              {/* Check-ins */}
              <div className="text-sm text-charcoal-muted flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-charcoal-subtle md:hidden" />
                <span className="md:hidden text-xs text-charcoal-subtle mr-1">Check-ins:</span>
                {session.questionCount}
                <span className="hidden md:inline text-charcoal-subtle">sent</span>
              </div>

              {/* Avg response */}
              <div className="text-sm text-charcoal-muted flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-charcoal-subtle md:hidden" />
                <span className="md:hidden text-xs text-charcoal-subtle mr-1">Avg:</span>
                <span className={cn(
                  session.avgResponseRate >= 60 ? "text-emerald-600" : 
                  session.avgResponseRate >= 40 ? "text-amber-600" : "text-charcoal-muted"
                )}>
                  {session.avgResponseRate}%
                </span>
                <span className="hidden md:inline text-charcoal-subtle">avg</span>
              </div>

              {/* Action */}
              <div className="md:text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full h-7 px-3 text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate("summaries");
                  }}
                >
                  <FileText className="w-3 h-3" />
                  View Summary
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
