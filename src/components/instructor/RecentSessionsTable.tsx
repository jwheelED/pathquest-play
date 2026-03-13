import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCourseContext } from "@/hooks/useCourseContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar, Users, HelpCircle, ArrowRight, Radio } from "lucide-react";
import { format } from "date-fns";

interface SessionRow {
  id: string;
  title: string | null;
  created_at: string;
  participantCount: number;
  questionCount: number;
}

interface RecentSessionsTableProps {
  onNavigate: (tab: string) => void;
}

export function RecentSessionsTable({ onNavigate }: RecentSessionsTableProps) {
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

      const [participantsRes, questionsRes] = await Promise.all([
        supabase.from("live_participants").select("session_id").in("session_id", sessionIds),
        supabase.from("live_questions").select("session_id").in("session_id", sessionIds),
      ]);

      const pMap = new Map<string, number>();
      const qMap = new Map<string, number>();
      participantsRes.data?.forEach(p => pMap.set(p.session_id, (pMap.get(p.session_id) || 0) + 1));
      questionsRes.data?.forEach(q => qMap.set(q.session_id, (qMap.get(q.session_id) || 0) + 1));

      setSessions(sessionsData.map(s => ({
        id: s.id,
        title: s.title || `Session ${s.session_code}`,
        created_at: s.created_at,
        participantCount: pMap.get(s.id) || 0,
        questionCount: qMap.get(s.id) || 0,
      })));
    } catch (error) {
      console.error("Error fetching recent sessions:", error);
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
        <CardContent className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<Calendar className="w-7 h-7" />}
        title="No past sessions"
        description="Your recent live session history will appear here after your first session."
        action={{ label: "Start Live Session", onClick: () => onNavigate("live") }}
      />
    );
  }

  return (
    <Card className="headspace-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Recent Sessions</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-primary hover:underline gap-1"
            onClick={() => onNavigate("live")}
          >
            View all sessions <ArrowRight className="w-3 h-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead className="w-[90px] text-center">Participants</TableHead>
              <TableHead className="w-[90px] text-center">Questions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map(s => (
              <TableRow key={s.id} className="cursor-pointer" onClick={() => onNavigate("live")}>
                <TableCell className="font-medium truncate max-w-[200px]">
                  {s.title}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {format(new Date(s.created_at), "MMM d, yyyy")}
                </TableCell>
                <TableCell className="text-center">
                  <span className="inline-flex items-center gap-1 text-sm">
                    <Users className="w-3 h-3 text-muted-foreground" />
                    {s.participantCount}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="inline-flex items-center gap-1 text-sm">
                    <HelpCircle className="w-3 h-3 text-muted-foreground" />
                    {s.questionCount}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
