import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, MessageSquareText, Radio, Video } from "lucide-react";
import { logger } from "@/lib/logger";

interface PastTranscriptsListProps {
  instructorId?: string;
  courseId?: string;
}

interface LiveSessionRow {
  id: string;
  title: string | null;
  created_at: string;
}

interface LectureRow {
  id: string;
  title: string | null;
  created_at: string;
  transcript: any;
}

interface LoadedTranscript {
  text: string;
  loading: boolean;
}

/**
 * Lists past live sessions + pre-recorded lectures for the student's class and
 * lets them expand each one to read the full transcript.
 */
export function PastTranscriptsList({ instructorId, courseId }: PastTranscriptsListProps) {
  const [liveSessions, setLiveSessions] = useState<LiveSessionRow[]>([]);
  const [lectures, setLectures] = useState<LectureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, LoadedTranscript>>({});

  useEffect(() => {
    if (!instructorId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        let liveQuery = supabase
          .from("live_sessions")
          .select("id, title, created_at, course_id")
          .eq("instructor_id", instructorId)
          .eq("is_active", false)
          .order("created_at", { ascending: false })
          .limit(30);
        if (courseId) liveQuery = liveQuery.eq("course_id", courseId);

        let lectureQuery = supabase
          .from("lecture_videos")
          .select("id, title, created_at, transcript, course_id, published, status")
          .eq("instructor_id", instructorId)
          .eq("status", "ready")
          .eq("published", true)
          .order("created_at", { ascending: false })
          .limit(30);
        if (courseId) lectureQuery = lectureQuery.eq("course_id", courseId);

        const [{ data: live }, { data: lec }] = await Promise.all([liveQuery, lectureQuery]);
        if (cancelled) return;
        setLiveSessions((live as any) ?? []);
        setLectures((lec as any) ?? []);
      } catch (err) {
        logger.error("Failed to load transcript list", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [instructorId, courseId]);

  const handleToggle = async (
    kind: "live" | "lecture",
    id: string,
    lectureTranscript?: any
  ) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (transcripts[id]) return;

    setTranscripts((prev) => ({ ...prev, [id]: { text: "", loading: true } }));

    if (kind === "lecture") {
      const text = normalizeLectureTranscript(lectureTranscript);
      setTranscripts((prev) => ({ ...prev, [id]: { text, loading: false } }));
      return;
    }

    // live session
    const { data, error } = await supabase
      .from("live_session_transcripts")
      .select("text, chunk_index")
      .eq("session_id", id)
      .order("chunk_index", { ascending: true })
      .limit(2000);

    if (error) {
      setTranscripts((prev) => ({
        ...prev,
        [id]: { text: "Couldn't load transcript.", loading: false },
      }));
      return;
    }

    const text = (data ?? [])
      .map((r: any) => (r.text ?? "").trim())
      .filter(Boolean)
      .join(" ");
    setTranscripts((prev) => ({
      ...prev,
      [id]: {
        text: text || "No transcript was captured for this session.",
        loading: false,
      },
    }));
  };

  if (!instructorId) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        Join a class to see its transcripts.
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">Loading transcripts…</Card>
    );
  }

  const empty = liveSessions.length === 0 && lectures.length === 0;
  if (empty) {
    return (
      <Card className="p-8 text-center">
        <MessageSquareText className="h-8 w-8 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          No transcripts available yet. They'll appear here after your instructor records a
          session or publishes a lecture.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {liveSessions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Past live sessions
          </h2>
          <div className="space-y-2">
            {liveSessions.map((s) => (
              <TranscriptRow
                key={s.id}
                id={s.id}
                title={s.title ?? "Untitled session"}
                createdAt={s.created_at}
                badge="Live"
                open={expandedId === s.id}
                loaded={transcripts[s.id]}
                onToggle={() => handleToggle("live", s.id)}
              />
            ))}
          </div>
        </section>
      )}

      {lectures.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Video className="h-4 w-4 text-blue-600" aria-hidden="true" />
            Pre-recorded lectures
          </h2>
          <div className="space-y-2">
            {lectures.map((l) => (
              <TranscriptRow
                key={l.id}
                id={l.id}
                title={l.title ?? "Untitled lecture"}
                createdAt={l.created_at}
                badge="Recorded"
                open={expandedId === l.id}
                loaded={transcripts[l.id]}
                onToggle={() => handleToggle("lecture", l.id, l.transcript)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TranscriptRow({
  id,
  title,
  createdAt,
  badge,
  open,
  loaded,
  onToggle,
}: {
  id: string;
  title: string;
  createdAt: string;
  badge: string;
  open: boolean;
  loaded?: LoadedTranscript;
  onToggle: () => void;
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
            aria-controls={`transcript-${id}`}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{title}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(createdAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="secondary" className="text-xs">
                {badge}
              </Badge>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div id={`transcript-${id}`} className="border-t border-border/60 bg-muted/30">
            {loaded?.loading ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Loading transcript…</p>
            ) : (
              <ScrollArea className="max-h-72">
                <p className="px-4 py-3 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                  {loaded?.text || ""}
                </p>
              </ScrollArea>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function normalizeLectureTranscript(raw: any): string {
  if (!raw) return "No transcript available for this lecture.";
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((segment: any) => {
        if (typeof segment === "string") return segment;
        return segment?.text ?? segment?.transcript ?? "";
      })
      .filter(Boolean)
      .join(" ");
  }
  if (typeof raw === "object") {
    if (typeof raw.text === "string") return raw.text;
    if (Array.isArray(raw.segments)) {
      return raw.segments
        .map((s: any) => s?.text ?? "")
        .filter(Boolean)
        .join(" ");
    }
  }
  return "No transcript available for this lecture.";
}
