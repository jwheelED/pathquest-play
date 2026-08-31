// wb-transcribe — Edvana Whiteboard Tutor
//
// One-shot speech-to-text for push-to-talk voice mode. The student records a
// single clip (tap to start, tap to stop); this function sends the whole
// clip to Deepgram's prerecorded REST API and returns the transcript.
//
// Deliberately NOT built on deepgram-streaming — that function holds a live
// WebSocket open for a continuous stream (lecture capture), which is the
// wrong shape for "here is one finished audio clip, transcribe it." The
// prerecorded API is a single POST with the raw audio bytes.
//
// Audio is never persisted: it is forwarded to Deepgram and discarded.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB safety cap (~90s of webm/opus is well under this)

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const apiKey = Deno.env.get("DEEPGRAM_API_KEY");
    if (!apiKey) {
      return json({ error: "Transcription not configured (set DEEPGRAM_API_KEY)" }, 500);
    }

    const contentType = req.headers.get("content-type") || "audio/webm";
    const audio = new Uint8Array(await req.arrayBuffer());
    if (audio.byteLength === 0) {
      return json({ error: "No audio received" }, 400);
    }
    if (audio.byteLength > MAX_BYTES) {
      return json({ error: "Audio clip too large" }, 400);
    }

    const params = new URLSearchParams({
      model: "nova-2",
      smart_format: "true",
      punctuate: "true",
      language: "en",
    });

    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": contentType,
      },
      body: audio,
    });

    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `Deepgram error ${res.status}: ${detail.slice(0, 300)}` }, 502);
    }

    const data = await res.json();
    const transcript: string =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

    return json({ transcript: transcript.trim() }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
