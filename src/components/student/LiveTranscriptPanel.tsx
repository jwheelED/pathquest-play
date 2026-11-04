import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronUp, MessageSquareText, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface LiveTranscriptPanelProps {
  sessionId: string | null;
  /** When true, panel auto-fetches any persisted chunks (for enrolled students). */
  canFetchHistory?: boolean;
  className?: string;
}

interface TranscriptLine {
  chunk_index: number;
  text: string;
  ts: number;
}

/**
 * Student-facing live transcript panel. Subscribes to the
 * `live-transcript-{sessionId}` realtime channel and (if allowed) fetches
 * any persisted chunks so late joiners catch up.
 */
export function LiveTranscriptPanel({
  sessionId,
  canFetchHistory = true,
  className,
}: LiveTranscriptPanelProps) {
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const seenIndices = useRef<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Fetch history (best-effort; will silently no-op for anonymous users)
  useEffect(() => {
    if (!sessionId || !canFetchHistory) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("live_session_transcripts")
        .select("chunk_index, text, created_at")
        .eq("session_id", sessionId)
        .order("chunk_index", { ascending: true })
        .limit(500);
      if (cancelled || error || !data) return;
      const next: TranscriptLine[] = [];
      data.forEach((row: any) => {
        if (seenIndices.current.has(row.chunk_index)) return;
        seenIndices.current.add(row.chunk_index);
        next.push({
          chunk_index: row.chunk_index,
          text: row.text,
          ts: new Date(row.created_at).getTime(),
        });
      });
      if (next.length > 0) {
        setLines((prev) => [...prev, ...next].sort((a, b) => a.chunk_index - b.chunk_index));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, canFetchHistory]);

  // Subscribe to realtime broadcast
  useEffect(() => {
    if (!sessionId) return;
    const channel = supabase
      .channel(`live-transcript-${sessionId}`, { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "transcript_chunk" }, (msg) => {
        const payload = msg.payload as { text: string; chunk_index: number; ts: number };
        if (!payload?.text) return;
        if (seenIndices.current.has(payload.chunk_index)) return;
        seenIndices.current.add(payload.chunk_index);
        setLines((prev) =>
          [...prev, { chunk_index: payload.chunk_index, text: payload.text, ts: payload.ts }].sort(
            (a, b) => a.chunk_index - b.chunk_index
          )
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Auto-scroll to bottom on new line
  useEffect(() => {
    if (!autoScroll || !expanded) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, autoScroll, expanded]);

  if (!sessionId) return null;

  return (
    <Card
      className={cn(
        "border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquareText className="h-4 w-4 text-primary" aria-hidden="true" />
          Live transcript
          {lines.length > 0 && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {lines.length} line{lines.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => setAutoScroll((v) => !v)}
            aria-pressed={autoScroll}
            aria-label={autoScroll ? "Pause auto-scroll" : "Resume auto-scroll"}
          >
            {autoScroll ? (
              <>
                <Pause className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Auto
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                Paused
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse transcript" : "Expand transcript"}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      {expanded && (
        <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-label="Live lecture transcript"
          className="max-h-56 overflow-y-auto px-4 py-3 text-sm leading-relaxed text-muted-foreground"
        >
          {lines.length === 0 ? (
            <p className="italic text-muted-foreground/80">
              Transcript will appear here as the instructor speaks.
            </p>
          ) : (
            <div className="space-y-1.5">
              {lines.map((l) => (
                <p key={l.chunk_index} className="text-foreground/90">
                  {l.text}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
