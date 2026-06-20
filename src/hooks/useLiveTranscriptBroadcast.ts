import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

interface Options {
  sessionId: string | null;
  instructorId: string | null;
  courseId?: string | null;
  chunks: string[];
  enabled: boolean;
}

/**
 * Broadcasts live transcript chunks via Supabase Realtime AND persists them
 * to live_session_transcripts so late joiners and the class dashboard can
 * replay the full transcript.
 */
export function useLiveTranscriptBroadcast({
  sessionId,
  instructorId,
  courseId,
  chunks,
  enabled,
}: Options) {
  const lastSentIndexRef = useRef(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Reset counter when session changes
  useEffect(() => {
    lastSentIndexRef.current = 0;
  }, [sessionId]);

  // Maintain a single channel for the active session
  useEffect(() => {
    if (!enabled || !sessionId) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    const channel = supabase.channel(`live-transcript-${sessionId}`, {
      config: { broadcast: { self: false } },
    });
    channel.subscribe();
    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [sessionId, enabled]);

  // Push new chunks
  useEffect(() => {
    if (!enabled || !sessionId || !instructorId || !channelRef.current) return;
    if (chunks.length <= lastSentIndexRef.current) return;

    const newChunks = chunks.slice(lastSentIndexRef.current);
    const startIndex = lastSentIndexRef.current;
    lastSentIndexRef.current = chunks.length;

    newChunks.forEach((text, i) => {
      const chunkIndex = startIndex + i;
      const clean = (text || "").trim();
      if (!clean) return;

      // Realtime broadcast (instant for live viewers)
      channelRef.current
        ?.send({
          type: "broadcast",
          event: "transcript_chunk",
          payload: { text: clean, chunk_index: chunkIndex, ts: Date.now() },
        })
        .catch((err) => logger.warn("Transcript broadcast failed", err));

      // Persist for late joiners and class dashboard replay
      // Fire and forget; errors should not break recording
      supabase
        .from("live_session_transcripts")
        .insert({
          session_id: sessionId,
          instructor_id: instructorId,
          course_id: courseId ?? null,
          chunk_index: chunkIndex,
          text: clean,
        })
        .then(({ error }) => {
          if (error) logger.warn("Transcript persist failed", error.message);
        });
    });
  }, [chunks, enabled, sessionId, instructorId, courseId]);
}
