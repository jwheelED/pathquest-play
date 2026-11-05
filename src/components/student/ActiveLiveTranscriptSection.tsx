import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Radio, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { LiveTranscriptPanel } from "./LiveTranscriptPanel";
import { logger } from "@/lib/logger";

interface Props {
  instructorId?: string;
  courseId?: string;
}

interface ActiveSession {
  id: string;
  title: string | null;
  session_code: string | null;
}

/**
 * Shows a live transcript panel for any currently-active live session
 * belonging to the student's instructor/course, plus a one-tap join button
 * that links the student's account to the session so answers persist to
 * their permanent history.
 */
export function ActiveLiveTranscriptSection({ instructorId, courseId }: Props) {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!instructorId) return;
    let cancelled = false;

    const fetchActive = async () => {
      try {
        let q = supabase
          .from("live_sessions")
          .select("id, title, session_code, course_id, is_active, created_at")
          .eq("instructor_id", instructorId)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1);
        if (courseId) q = q.eq("course_id", courseId);
        const { data, error } = await q;
        if (cancelled) return;
        if (error) {
          logger.warn("Active live session lookup failed", error.message);
          setSession(null);
        } else {
          const row = (data as any[])?.[0];
          setSession(row ? { id: row.id, title: row.title, session_code: row.session_code } : null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchActive();

    // Subscribe to changes on live_sessions so the section appears/disappears live
    const channel = supabase
      .channel(`active-session-${instructorId}-${courseId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_sessions", filter: `instructor_id=eq.${instructorId}` },
        () => fetchActive()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [instructorId, courseId]);

  const handleJoin = async () => {
    if (!session?.session_code) return;
    setJoining(true);
    try {
      // The signed-in user's JWT rides along automatically, so the edge
      // function links this participant to their account.
      const { data, error } = await supabase.functions.invoke("join-live-session", {
        body: { sessionCode: session.session_code },
      });
      if (error || !data?.participant?.id) throw error ?? new Error("join failed");
      localStorage.setItem(`participantId:${session.session_code}`, data.participant.id);
      localStorage.setItem("participantId", data.participant.id);
      localStorage.setItem("participantNickname", data.participant.nickname);
      navigate(`/live/${session.session_code}`);
    } catch (e) {
      logger.warn("One-tap live join failed", e instanceof Error ? e.message : String(e));
      toast.error("Couldn't join the live session. Try the session code instead.");
    } finally {
      setJoining(false);
    }
  };

  if (loading || !session) return null;

  return (
    <section className="space-y-2" aria-label="Live session in progress">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600" />
        </span>
        <Radio className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        Live now
      </h2>

      <Card className="p-4 space-y-3 border-emerald-200 bg-emerald-50/40">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {session.title || "Live session in progress"}
            </p>
            <p className="text-xs text-muted-foreground">
              Join to answer check-ins — your answers save to your course history.
            </p>
          </div>
          <Button
            onClick={handleJoin}
            disabled={joining || !session.session_code}
            className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium shrink-0"
          >
            {joining ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-4 w-4" />
                Join live session
              </>
            )}
          </Button>
        </div>
        <LiveTranscriptPanel sessionId={session.id} canFetchHistory />
      </Card>
    </section>
  );
}
