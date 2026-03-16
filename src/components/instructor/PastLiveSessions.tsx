import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { History, ChevronDown, ChevronUp, Calendar, Users } from "lucide-react";
import { LiveSessionResults } from "./LiveSessionResults";
import { useCourseContext } from "@/hooks/useCourseContext";

interface PastSession {
  id: string;
  session_code: string;
  title: string | null;
  created_at: string;
  ends_at: string | null;
  course_id: string | null;
  participantCount: number;
  questionCount: number;
}

export const PastLiveSessions = () => {
  const [sessions, setSessions] = useState<PastSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const { selectedCourseId } = useCourseContext();

  const fetchPastSessions = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let query = supabase
      .from("live_sessions")
      .select("id, session_code, title, created_at, ends_at, course_id, is_active")
      .eq("instructor_id", user.id)
      .eq("is_active", false)
      .order("created_at", { ascending: false })
      .limit(20);

    if (selectedCourseId) {
      // Include sessions with matching course_id OR null course_id (legacy)
      query = query.or(`course_id.eq.${selectedCourseId},course_id.is.null`);
    }

    const { data: sessionRows, error } = await query;

    if (error || !sessionRows?.length) {
      setSessions([]);
      setLoading(false);
      return;
    }

    const sessionIds = sessionRows.map((s) => s.id);

    // Fetch participant and question counts in parallel
    const [participantsRes, questionsRes] = await Promise.all([
      supabase
        .from("live_participants")
        .select("session_id")
        .in("session_id", sessionIds),
      supabase
        .from("live_questions")
        .select("session_id")
        .in("session_id", sessionIds),
    ]);

    const participantCounts = new Map<string, number>();
    participantsRes.data?.forEach((p) => {
      participantCounts.set(p.session_id, (participantCounts.get(p.session_id) || 0) + 1);
    });

    const questionCounts = new Map<string, number>();
    questionsRes.data?.forEach((q) => {
      questionCounts.set(q.session_id, (questionCounts.get(q.session_id) || 0) + 1);
    });

    setSessions(
      sessionRows.map((s) => ({
        id: s.id,
        session_code: s.session_code,
        title: s.title,
        created_at: s.created_at,
        ends_at: s.ends_at,
        course_id: s.course_id,
        participantCount: participantCounts.get(s.id) || 0,
        questionCount: questionCounts.get(s.id) || 0,
      }))
    );
    setLoading(false);
  }, [selectedCourseId]);

  useEffect(() => {
    fetchPastSessions();
  }, [fetchPastSessions]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-primary" />
            Past Live Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-16 bg-muted rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5 text-primary" />
            Past Live Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-6">
            No past live sessions found.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="h-5 w-5 text-primary" />
          Past Live Sessions
          <Badge variant="outline" className="ml-2">
            {sessions.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sessions.map((session) => {
          const isExpanded = expandedSessionId === session.id;
          return (
            <div key={session.id} className="border rounded-lg overflow-hidden">
              <button
                onClick={() =>
                  setExpandedSessionId(isExpanded ? null : session.id)
                }
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant="secondary" className="shrink-0 font-mono text-xs">
                    {session.session_code}
                  </Badge>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {session.title || "Untitled Session"}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(session.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {session.participantCount} participants
                      </span>
                      <span>{session.questionCount} questions</span>
                    </div>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t px-4 py-4">
                  <LiveSessionResults sessionId={session.id} />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
