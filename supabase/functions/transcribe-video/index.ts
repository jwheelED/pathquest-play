import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

/**
 * Extract YouTube video ID from various URL formats.
 */
function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&?#]+)/,
    /(?:youtu\.be\/)([^&?#]+)/,
    /(?:youtube\.com\/embed\/)([^&?#]+)/,
    /(?:youtube\.com\/v\/)([^&?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Fetch YouTube captions using the free timedtext API.
 * Falls back to fetching caption tracks from the video page.
 */
async function fetchYouTubeTranscript(
  videoId: string
): Promise<{ text: string; segments: Array<{ text: string; start: number; duration: number }> } | null> {
  try {
    // Approach: fetch the YouTube video page to extract caption track info
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResponse = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!pageResponse.ok) {
      console.error("Failed to fetch YouTube page:", pageResponse.status);
      return null;
    }

    const pageHtml = await pageResponse.text();

    // Extract captions player response JSON
    const captionMatch = pageHtml.match(
      /"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"videoDetails"/s
    );

    if (!captionMatch) {
      console.log("No captions found for YouTube video:", videoId);
      return null;
    }

    let captionsData;
    try {
      captionsData = JSON.parse(captionMatch[1]);
    } catch {
      console.error("Failed to parse captions JSON");
      return null;
    }

    const tracks =
      captionsData?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks || tracks.length === 0) {
      console.log("No caption tracks available");
      return null;
    }

    // Prefer English captions, fall back to first available
    const englishTrack = tracks.find(
      (t: { languageCode: string }) =>
        t.languageCode === "en" || t.languageCode?.startsWith("en")
    );
    const track = englishTrack || tracks[0];

    if (!track?.baseUrl) {
      console.log("No caption base URL found");
      return null;
    }

    // Fetch the caption XML
    const captionUrl = track.baseUrl + "&fmt=json3";
    const captionResponse = await fetch(captionUrl);

    if (!captionResponse.ok) {
      console.error("Failed to fetch captions:", captionResponse.status);
      return null;
    }

    const captionJson = await captionResponse.json();
    const events = captionJson.events || [];

    const segments: Array<{ text: string; start: number; duration: number }> =
      [];
    const textParts: string[] = [];

    for (const event of events) {
      if (!event.segs) continue;
      const segText = event.segs
        .map((s: { utf8: string }) => s.utf8 || "")
        .join("")
        .trim();
      if (!segText || segText === "\n") continue;

      const startMs = event.tStartMs || 0;
      const durationMs = event.dDurationMs || 0;

      segments.push({
        text: segText,
        start: startMs / 1000,
        duration: durationMs / 1000,
      });
      textParts.push(segText);
    }

    if (textParts.length === 0) return null;

    return {
      text: textParts.join(" "),
      segments,
    };
  } catch (error) {
    console.error("YouTube transcript extraction failed:", error);
    return null;
  }
}

/**
 * Check if URL points to a Vimeo video and extract its ID.
 */
function extractVimeoVideoId(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Determine if a URL is a direct video file link.
 */
function isDirectVideoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /\.(mp4|webm|mov|avi|mkv|m4v|ogg)$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Transcribe a direct video URL using Deepgram's pre-recorded API.
 */
async function transcribeWithDeepgram(
  videoUrl: string,
  deepgramKey: string
): Promise<{ text: string; duration: number; segments: Array<{ text: string; start: number; duration: number }> } | null> {
  try {
    const response = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&paragraphs=true&utterances=true&language=en",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${deepgramKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: videoUrl }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Deepgram API error:", response.status, errorText);
      return null;
    }

    const result = await response.json();
    const channel = result.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];

    if (!alternative) {
      console.error("No transcription results from Deepgram");
      return null;
    }

    const duration = result.metadata?.duration || 0;

    // Build segments from paragraphs or utterances
    const segments: Array<{ text: string; start: number; duration: number }> = [];
    const utterances = result.results?.utterances || [];

    if (utterances.length > 0) {
      for (const utt of utterances) {
        segments.push({
          text: utt.transcript,
          start: utt.start,
          duration: utt.end - utt.start,
        });
      }
    } else {
      // Fallback: use the full transcript as a single segment
      segments.push({
        text: alternative.transcript,
        start: 0,
        duration,
      });
    }

    return {
      text: alternative.transcript,
      duration: Math.round(duration),
      segments,
    };
  } catch (error) {
    console.error("Deepgram transcription failed:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!
    );

    // Verify user auth
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { lectureVideoId, videoPath } = await req.json();

    if (!lectureVideoId || typeof lectureVideoId !== "string") {
      return new Response(
        JSON.stringify({ error: "lectureVideoId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Transcribing lecture: ${lectureVideoId}, path: ${videoPath}`);

    // Fetch the lecture record to get video_url if external
    const { data: lecture, error: lectureError } = await supabaseClient
      .from("lecture_videos")
      .select("video_url, video_path, instructor_id")
      .eq("id", lectureVideoId)
      .single();

    if (lectureError || !lecture) {
      return new Response(
        JSON.stringify({ error: "Lecture not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify ownership
    if (lecture.instructor_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let transcript: { text: string; segments: Array<{ text: string; start: number; duration: number }> } | null = null;
    let durationSeconds = 0;
    const isExternal = videoPath?.startsWith("external-");

    if (isExternal && lecture.video_url) {
      const url = lecture.video_url;
      console.log(`Processing external URL: ${url}`);

      // Check if YouTube
      const ytVideoId = extractYouTubeVideoId(url);
      if (ytVideoId) {
        console.log(`YouTube video detected: ${ytVideoId}`);
        transcript = await fetchYouTubeTranscript(ytVideoId);

        if (transcript && transcript.segments.length > 0) {
          const lastSeg = transcript.segments[transcript.segments.length - 1];
          durationSeconds = Math.round(lastSeg.start + lastSeg.duration);
        }
      }

      // Check if Vimeo (limited free transcription support)
      const vimeoId = extractVimeoVideoId(url);
      if (vimeoId && !transcript) {
        console.log(`Vimeo video detected: ${vimeoId}, attempting Deepgram`);
        // Vimeo doesn't expose captions publicly; try Deepgram if URL is accessible
        const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");
        if (deepgramKey) {
          const result = await transcribeWithDeepgram(url, deepgramKey);
          if (result) {
            transcript = { text: result.text, segments: result.segments };
            durationSeconds = result.duration;
          }
        }
      }

      // Direct video URL - use Deepgram
      if (!transcript && isDirectVideoUrl(url)) {
        console.log("Direct video URL detected, using Deepgram");
        const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");
        if (!deepgramKey) {
          await supabaseClient
            .from("lecture_videos")
            .update({ status: "error", error_message: "Deepgram API key not configured" })
            .eq("id", lectureVideoId);

          return new Response(
            JSON.stringify({ error: "Transcription service not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const result = await transcribeWithDeepgram(url, deepgramKey);
        if (result) {
          transcript = { text: result.text, segments: result.segments };
          durationSeconds = result.duration;
        }
      }

      // If it's a non-direct URL (not YouTube, not Vimeo, not a direct file) - try Deepgram as last resort
      if (!transcript && !ytVideoId && !vimeoId) {
        console.log("Unknown URL type, attempting Deepgram as fallback");
        const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");
        if (deepgramKey) {
          const result = await transcribeWithDeepgram(url, deepgramKey);
          if (result) {
            transcript = { text: result.text, segments: result.segments };
            durationSeconds = result.duration;
          }
        }
      }
    } else {
      // Uploaded file - get signed URL from storage and use Deepgram
      console.log(`Processing uploaded file: ${videoPath}`);
      const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");
      if (!deepgramKey) {
        await supabaseClient
          .from("lecture_videos")
          .update({ status: "error", error_message: "Deepgram API key not configured" })
          .eq("id", lectureVideoId);

        return new Response(
          JSON.stringify({ error: "Transcription service not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: signedUrl, error: urlError } = await supabaseClient.storage
        .from("lecture-videos")
        .createSignedUrl(videoPath, 3600);

      if (urlError || !signedUrl) {
        await supabaseClient
          .from("lecture_videos")
          .update({ status: "error", error_message: "Failed to access video file" })
          .eq("id", lectureVideoId);

        return new Response(
          JSON.stringify({ error: "Failed to access video file" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const result = await transcribeWithDeepgram(signedUrl.signedUrl, deepgramKey);
      if (result) {
        transcript = { text: result.text, segments: result.segments };
        durationSeconds = result.duration;
      }
    }

    // If no transcript was generated, handle gracefully
    if (!transcript || !transcript.text) {
      // For YouTube/Vimeo without captions, create a placeholder so the lecture can still be used
      const ytId = isExternal && lecture.video_url ? extractYouTubeVideoId(lecture.video_url) : null;
      const vimeoId = isExternal && lecture.video_url ? extractVimeoVideoId(lecture.video_url) : null;

      if (ytId || vimeoId) {
        console.log("No transcript available for embedded video, creating placeholder");
        transcript = {
          text: "[Transcript unavailable - video will play without AI-generated questions]",
          segments: [],
        };

        // Update lecture to analyzing so it can proceed (with generic questions)
        await supabaseClient
          .from("lecture_videos")
          .update({
            transcript: { text: transcript.text, segments: transcript.segments },
            status: "analyzing",
            duration_seconds: durationSeconds || null,
          })
          .eq("id", lectureVideoId);

        return new Response(
          JSON.stringify({ success: true, hasTranscript: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabaseClient
        .from("lecture_videos")
        .update({
          status: "error",
          error_message: "Failed to transcribe video. Please check the URL and try again.",
        })
        .eq("id", lectureVideoId);

      return new Response(
        JSON.stringify({ error: "Transcription failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Transcription complete: ${transcript.text.length} chars, ${durationSeconds}s duration`);

    // Save transcript and update status
    await supabaseClient
      .from("lecture_videos")
      .update({
        transcript: { text: transcript.text, segments: transcript.segments },
        status: "analyzing",
        duration_seconds: durationSeconds || null,
      })
      .eq("id", lectureVideoId);

    return new Response(
      JSON.stringify({ success: true, hasTranscript: true, durationSeconds }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Transcription error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
