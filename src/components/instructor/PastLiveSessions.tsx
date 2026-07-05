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
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="h-3 w-28 bg-slate-100 rounded animate-pulse" />
          <div className="h-5 w-40 bg-slate-100 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-slate-50 rounded-xl animate-pulse border border-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-charcoal-subtle/70">
            Past Sessions
          </span>
          <h3 className="text-lg font-semibold text-charcoal mt-1">
            Previous live sessions
          </h3>
        </div>
        <div className="command-card p-6 text-center">
          <p className="text-sm text-charcoal-muted">
            No past live sessions found. Your completed sessions will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-charcoal-subtle/70">
            Past Sessions
          </span>
          <h3 className="text-lg font-semibold text-charcoal mt-1">
            Previous live sessions
          </h3>
        </div>
        <span className="text-xs font-medium text-charcoal-muted bg-slate-100 px-2.5 py-1 rounded-full">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Sessions list */}
      <div className="space-y-2">
        {sessions.map((session) => {
          const isExpanded = expandedSessionId === session.id;
          return (
            <div key={session.id} className="command-card overflow-hidden">
              <button
                onClick={() =>
                  setExpandedSessionId(isExpanded ? null : session.id)
                }
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <code className="shrink-0 font-semibold text-xs bg-slate-50 px-2 py-1 rounded border border-slate-100 text-charcoal tracking-wider">
                    {session.session_code}
                  </code>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-charcoal truncate">
                      {session.title || "Untitled Session"}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-charcoal-subtle mt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(session.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {session.participantCount} students
                      </span>
                      <span>{session.questionCount} check-ins</span>
                    </div>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-charcoal-subtle shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-charcoal-subtle shrink-0" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/30">
                  <LiveSessionResults sessionId={session.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
