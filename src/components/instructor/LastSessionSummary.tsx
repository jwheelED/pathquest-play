import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, HelpCircle, Users, ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useCourseContext } from "@/hooks/useCourseContext";
import { format } from "date-fns";

interface LastSession {
  id: string;
  title: string | null;
  created_at: string;
  participantCount: number;
  questionCount: number;
}

interface LastSessionSummaryProps {
  onNavigate?: (tab: string) => void;
}

export function LastSessionSummary({ onNavigate }: LastSessionSummaryProps) {
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

      const [participantsRes, questionsRes] = await Promise.all([
        supabase
          .from("live_participants")
          .select("session_id")
          .eq("session_id", s.id),
        supabase
          .from("live_questions")
          .select("session_id")
          .eq("session_id", s.id),
      ]);

      setSession({
        id: s.id,
        title: s.title,
        created_at: s.created_at,
        participantCount: participantsRes.data?.length || 0,
        questionCount: questionsRes.data?.length || 0,
      });
    } catch (error) {
      console.error("Error fetching last session:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="headspace-card">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <EmptyState
        icon={<Calendar className="w-7 h-7" />}
        title="No sessions yet"
        description="Start your first live session to see a summary here."
        action={onNavigate ? { label: "Start Live Session", onClick: () => onNavigate("live") } : undefined}
      />
    );
  }

  return (
    <Card className="headspace-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Last Session</CardTitle>
          <span className="text-xs text-muted-foreground">
            {format(new Date(session.created_at), "MMM d, yyyy")}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {session.title && (
          <p className="text-sm font-medium text-foreground mb-3">{session.title}</p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <HelpCircle className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{session.questionCount}</p>
              <p className="text-xs text-muted-foreground">Questions asked</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
              <Users className="w-4 h-4 text-success" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{session.participantCount}</p>
              <p className="text-xs text-muted-foreground">Students participated</p>
            </div>
          </div>
        </div>

        {/* Actionable insight */}
        <div className="mt-4 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          {session.questionCount === 0 && session.participantCount === 0
            ? "No questions were sent and no students joined. Try sharing your join code before the next session."
            : session.questionCount === 0
            ? "No questions were sent. Try enabling auto-questions next time."
            : session.participantCount === 0
            ? "No students joined. Verify your join code is shared before the next session."
            : `${session.participantCount} student${session.participantCount !== 1 ? "s" : ""} responded to ${session.questionCount} question${session.questionCount !== 1 ? "s" : ""}.`}
        </div>

        {onNavigate && (
          <button
            onClick={() => onNavigate("live")}
            className="flex items-center gap-1 text-xs text-primary hover:underline mt-3"
          >
            View full summary <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </CardContent>
    </Card>
  );
}
