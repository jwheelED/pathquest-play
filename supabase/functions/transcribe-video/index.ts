import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

// ── YouTube helpers ──────────────────────────────────────────────────

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&?#]+)/,
    /(?:youtu\.be\/)([^&?#]+)/,
    /(?:youtube\.com\/embed\/)([^&?#]+)/,
    /(?:youtube\.com\/v\/)([^&?#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

/**
 * Build the protobuf-like `params` value needed by the Innertube
 * get_transcript endpoint.  This mirrors the encoding used by the
 * popular `youtube-transcript` npm package.
 */
function buildInnertubeParams(videoId: string): string {
  // Protobuf wire encoding (simplified):
  // field 1 (string) = "\n" + videoId
  // wrapped in outer container
  const videoIdBytes = new TextEncoder().encode(videoId);
  
  // Inner message: field 2 -> field 1 -> field 1 = videoId
  // This is the exact binary sequence the youtube-transcript library produces
  const inner = new Uint8Array([
    0x0a, videoIdBytes.length, ...videoIdBytes, // field 1 = videoId
  ]);
  
  const outer = new Uint8Array([
    0x0a, inner.length, ...inner, // field 1 = inner
    0x12, 0x09, // field 2, length 9
    0x18, 0xe8, 0x07, // field 3 varint = 1000
    0x82, 0x01, 0x03, // field 16 length 3
    0x0a, 0x01, 0x00, // nested
  ]);
  
  // base64url encode
  return btoa(String.fromCharCode(...outer));
}

/**
 * Primary method: YouTube Innertube get_transcript endpoint.
 * This is the same internal API YouTube's own frontend uses.
 */
async function fetchTranscriptViaInnertube(
  videoId: string
): Promise<{ text: string; segments: Array<{ text: string; start: number; duration: number }> } | null> {
  try {
    console.log(`[Innertube] Attempting transcript for ${videoId}`);
    
    // First, fetch the video page to get the INNERTUBE_API_KEY
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResp = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Cookie": "CONSENT=PENDING+987; SOCS=CAESEwgDEgk2NDcxMjgzNTQaAmVuIAEaBgiA_LyaBg",
      },
    });

    if (!pageResp.ok) {
      console.error(`[Innertube] Page fetch failed: ${pageResp.status}`);
      return null;
    }

    const html = await pageResp.text();
    
    // Extract INNERTUBE_API_KEY
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const apiKey = apiKeyMatch?.[1] || "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"; // fallback to well-known key
    
    console.log(`[Innertube] Got API key: ${apiKey.substring(0, 10)}...`);

    // Try to extract captions directly from the page first (faster)
    const captionsResult = await extractCaptionsFromPage(html, videoId);
    if (captionsResult) {
      console.log(`[Innertube] Got captions from page: ${captionsResult.text.length} chars, ${captionsResult.segments.length} segments`);
      return captionsResult;
    }

    // If page extraction failed, try the get_transcript endpoint
    const params = buildInnertubeParams(videoId);
    
    const transcriptResp = await fetch(
      `https://www.youtube.com/youtubei/v1/get_transcript?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Cookie": "CONSENT=PENDING+987; SOCS=CAESEwgDEgk2NDcxMjgzNTQaAmVuIAEaBgiA_LyaBg",
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: "2.20240313.05.00",
              hl: "en",
              gl: "US",
            },
          },
          params,
        }),
      }
    );

    if (!transcriptResp.ok) {
      console.error(`[Innertube] get_transcript failed: ${transcriptResp.status}`);
      const errBody = await transcriptResp.text();
      console.error(`[Innertube] Response: ${errBody.substring(0, 500)}`);
      return null;
    }

    const data = await transcriptResp.json();
    return parseInnertubeTranscript(data);
  } catch (error) {
    console.error("[Innertube] Error:", error);
    return null;
  }
}

/**
 * Extract caption tracks directly from the page HTML.
 * YouTube includes `ytInitialPlayerResponse` with captionTracks
 * if the request includes proper consent cookies.
 */
async function extractCaptionsFromPage(
  html: string,
  videoId: string
): Promise<{ text: string; segments: Array<{ text: string; start: number; duration: number }> } | null> {
  // Try to extract ytInitialPlayerResponse
  const playerMatch = html.match(
    /ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|const|let|<\/script>)/s
  );

  let captions: Record<string, unknown> | undefined;

  if (playerMatch) {
    try {
      const playerResponse = JSON.parse(playerMatch[1]);
      captions = playerResponse?.captions;
      if (!captions) {
        console.log(`[PageExtract] No captions object in playerResponse for ${videoId}`);
      }
    } catch (e) {
      console.error("[PageExtract] Failed to parse playerResponse:", e);
    }
  } else {
    console.log(`[PageExtract] No ytInitialPlayerResponse found in page HTML (length: ${html.length})`);
    // Log a snippet to help debug what YouTube returned
    const snippetStart = html.indexOf("ytInitialPlayer");
    if (snippetStart === -1) {
      console.log("[PageExtract] 'ytInitialPlayer' not found anywhere in HTML");
      // Check for consent wall
      if (html.includes("consent.youtube.com") || html.includes("CONSENT")) {
        console.log("[PageExtract] Detected consent wall in response");
      }
    }
  }

  if (!captions) {
    // Try alternative pattern
    const altMatch = html.match(
      /"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"videoDetails"/s
    );
    if (altMatch) {
      try {
        captions = JSON.parse(altMatch[1]);
      } catch {
        console.error("[PageExtract] Failed to parse alt captions");
        return null;
      }
    } else {
      return null;
    }
  }

  return await fetchCaptionTracksData(captions);
}

/**
 * Fetch actual caption text from captionTracks URLs.
 */
async function fetchCaptionTracksData(
  captionsData: Record<string, unknown>
): Promise<{ text: string; segments: Array<{ text: string; start: number; duration: number }> } | null> {
  const renderer = captionsData?.playerCaptionsTracklistRenderer as Record<string, unknown> | undefined;
  const tracks = renderer?.captionTracks as Array<{
    baseUrl: string;
    languageCode: string;
    name?: { simpleText?: string };
    kind?: string;
  }> | undefined;

  if (!tracks || tracks.length === 0) {
    console.log("[CaptionTracks] No caption tracks available");
    return null;
  }

  console.log(`[CaptionTracks] Found ${tracks.length} tracks: ${tracks.map(t => `${t.languageCode}${t.kind === 'asr' ? '(auto)' : ''}`).join(", ")}`);

  // Prefer manual English > auto English > any manual > any auto
  const manualEn = tracks.find(t => (t.languageCode === "en" || t.languageCode?.startsWith("en")) && t.kind !== "asr");
  const autoEn = tracks.find(t => (t.languageCode === "en" || t.languageCode?.startsWith("en")) && t.kind === "asr");
  const anyManual = tracks.find(t => t.kind !== "asr");
  const track = manualEn || autoEn || anyManual || tracks[0];

  if (!track?.baseUrl) {
    console.log("[CaptionTracks] No baseUrl found");
    return null;
  }

  // Fetch in JSON3 format
  const captionUrl = track.baseUrl + (track.baseUrl.includes("?") ? "&" : "?") + "fmt=json3";
  console.log(`[CaptionTracks] Fetching: ${captionUrl.substring(0, 100)}...`);

  const resp = await fetch(captionUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!resp.ok) {
    console.error(`[CaptionTracks] JSON3 fetch failed: ${resp.status}, trying XML...`);
    // Try XML format
    const xmlResp = await fetch(track.baseUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!xmlResp.ok) {
      console.error(`[CaptionTracks] XML fetch also failed: ${xmlResp.status}`);
      return null;
    }
    return parseXmlCaptions(await xmlResp.text());
  }

  return parseTimedTextJson(await resp.json());
}

/**
 * Parse the Innertube get_transcript response format.
 */
function parseInnertubeTranscript(
  data: Record<string, unknown>
): { text: string; segments: Array<{ text: string; start: number; duration: number }> } | null {
  try {
    // Navigate the nested response structure
    const actions = (data as { actions?: Array<Record<string, unknown>> })?.actions;
    if (!actions?.length) {
      console.log("[Innertube] No actions in response");
      console.log("[Innertube] Response keys:", Object.keys(data).join(", "));
      return null;
    }

    const transcriptAction = actions[0];
    const renderer = (transcriptAction as Record<string, unknown>)
      ?.updateEngagementPanelAction as Record<string, unknown>;
    
    const content = (renderer?.content as Record<string, unknown>)
      ?.transcriptRenderer as Record<string, unknown>;
    
    const body = (content?.body as Record<string, unknown>)
      ?.transcriptBodyRenderer as Record<string, unknown>;
    
    const cueGroups = (body?.cueGroups as Array<Record<string, unknown>>) || [];

    if (cueGroups.length === 0) {
      console.log("[Innertube] No cue groups found");
      return null;
    }

    const segments: Array<{ text: string; start: number; duration: number }> = [];
    const textParts: string[] = [];

    for (const group of cueGroups) {
      const cues = (group?.transcriptCueGroupRenderer as Record<string, unknown>)
        ?.cues as Array<Record<string, unknown>>;
      
      if (!cues) continue;

      for (const cue of cues) {
        const renderer = cue?.transcriptCueRenderer as Record<string, unknown>;
        if (!renderer) continue;

        const cueText = ((renderer.cue as Record<string, unknown>)
          ?.simpleText as string) || "";
        const startMs = parseInt(renderer.startOffsetMs as string) || 0;
        const durationMs = parseInt(renderer.durationMs as string) || 0;

        if (cueText.trim()) {
          segments.push({
            text: cueText.trim(),
            start: startMs / 1000,
            duration: durationMs / 1000,
          });
          textParts.push(cueText.trim());
        }
      }
    }

    if (textParts.length === 0) {
      console.log("[Innertube] Parsed 0 text segments from cue groups");
      return null;
    }

    console.log(`[Innertube] Parsed ${segments.length} segments, ${textParts.join(" ").length} chars`);
    return { text: textParts.join(" "), segments };
  } catch (error) {
    console.error("[Innertube] Parse error:", error);
    return null;
  }
}

/**
 * Orchestrate all YouTube transcript methods with fallbacks.
 */
async function fetchYouTubeTranscript(
  videoId: string
): Promise<{ text: string; segments: Array<{ text: string; start: number; duration: number }> } | null> {
  // Method 1: Innertube API (most reliable)
  try {
    const result = await fetchTranscriptViaInnertube(videoId);
    if (result) return result;
  } catch (error) {
    console.error("[YouTube] Innertube method failed:", error);
  }

  // Method 2: YouTube Data API timedtext
  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (apiKey) {
    try {
      const result = await fetchTranscriptViaTimedText(videoId, apiKey);
      if (result) return result;
    } catch (error) {
      console.error("[YouTube] Timedtext method failed:", error);
    }
  }

  console.log("[YouTube] All transcript methods failed for video:", videoId);
  return null;
}

/**
 * Fallback: YouTube Data API v3 timedtext endpoint.
 */
async function fetchTranscriptViaTimedText(
  videoId: string,
  apiKey: string
): Promise<{ text: string; segments: Array<{ text: string; start: number; duration: number }> } | null> {
  const listUrl = `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`;
  const listResponse = await fetch(listUrl);

  if (!listResponse.ok) {
    const errText = await listResponse.text();
    console.error(`[Timedtext] Captions list failed: ${listResponse.status} - ${errText.substring(0, 200)}`);
    return null;
  }

  const listData = await listResponse.json();
  const tracks = listData.items || [];

  if (tracks.length === 0) {
    console.log("[Timedtext] No caption tracks found via Data API");
    return null;
  }

  const englishTrack = tracks.find(
    (t: { snippet: { language: string } }) =>
      t.snippet.language === "en" || t.snippet.language?.startsWith("en")
  );
  const track = englishTrack || tracks[0];

  const timedtextUrl = `https://www.youtube.com/api/timedtext?lang=${track.snippet.language || "en"}&v=${videoId}&fmt=json3`;
  const captionResponse = await fetch(timedtextUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Cookie": "CONSENT=PENDING+987; SOCS=CAESEwgDEgk2NDcxMjgzNTQaAmVuIAEaBgiA_LyaBg",
    },
  });

  if (!captionResponse.ok) {
    const errText = await captionResponse.text();
    console.error(`[Timedtext] Caption fetch failed: ${captionResponse.status} - ${errText.substring(0, 200)}`);
    return null;
  }

  const text = await captionResponse.text();
  if (!text || text.length < 10) {
    console.log("[Timedtext] Empty or very short response");
    return null;
  }

  try {
    const captionJson = JSON.parse(text);
    return parseTimedTextJson(captionJson);
  } catch (e) {
    console.error("[Timedtext] Failed to parse JSON:", e);
    return null;
  }
}

// ── Shared parsers ──────────────────────────────────────────────────

function parseTimedTextJson(
  captionJson: { events?: Array<{ segs?: Array<{ utf8: string }>; tStartMs?: number; dDurationMs?: number }> }
): { text: string; segments: Array<{ text: string; start: number; duration: number }> } | null {
  const events = captionJson.events || [];
  const segments: Array<{ text: string; start: number; duration: number }> = [];
  const textParts: string[] = [];

  for (const event of events) {
    if (!event.segs) continue;
    const segText = event.segs.map((s) => s.utf8 || "").join("").trim();
    if (!segText || segText === "\n") continue;

    segments.push({
      text: segText,
      start: (event.tStartMs || 0) / 1000,
      duration: (event.dDurationMs || 0) / 1000,
    });
    textParts.push(segText);
  }

  if (textParts.length === 0) return null;
  return { text: textParts.join(" "), segments };
}

function parseXmlCaptions(
  xml: string
): { text: string; segments: Array<{ text: string; start: number; duration: number }> } | null {
  const segments: Array<{ text: string; start: number; duration: number }> = [];
  const textParts: string[] = [];

  const regex = /<text\s+start="([^"]*)"(?:\s+dur="([^"]*)")?[^>]*>([\s\S]*?)<\/text>/g;
  let match;

  while ((match = regex.exec(xml)) !== null) {
    const start = parseFloat(match[1]) || 0;
    const duration = parseFloat(match[2]) || 0;
    let text = match[3]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n/g, " ")
      .trim();
    if (!text) continue;
    segments.push({ text, start, duration });
    textParts.push(text);
  }

  if (textParts.length === 0) return null;
  return { text: textParts.join(" "), segments };
}

// ── YouTube duration ──────────────────────────────────────────────

async function fetchYouTubeDuration(videoId: string): Promise<number> {
  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey) return 0;
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) { await resp.text(); return 0; }
    const data = await resp.json();
    const dur = data.items?.[0]?.contentDetails?.duration;
    if (!dur) return 0;
    const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return 0;
    return (parseInt(m[1] || "0") * 3600) + (parseInt(m[2] || "0") * 60) + parseInt(m[3] || "0");
  } catch { return 0; }
}

// ── Vimeo helpers ──────────────────────────────────────────────────

function extractVimeoVideoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(\d+)/);
  return m ? m[1] : null;
}

async function fetchVimeoDuration(videoId: string): Promise<number> {
  try {
    const resp = await fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${videoId}`);
    if (!resp.ok) { await resp.text(); return 0; }
    return (await resp.json()).duration || 0;
  } catch { return 0; }
}

// ── Direct video / Deepgram ──────────────────────────────────────

function isDirectVideoUrl(url: string): boolean {
  try {
    return /\.(mp4|webm|mov|avi|mkv|m4v|ogg)$/i.test(new URL(url).pathname);
  } catch { return false; }
}

async function transcribeWithDeepgram(
  videoUrl: string,
  deepgramKey: string
): Promise<{ text: string; duration: number; segments: Array<{ text: string; start: number; duration: number }> } | null> {
  try {
    const resp = await fetch(
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
    if (!resp.ok) {
      console.error("Deepgram error:", resp.status, await resp.text());
      return null;
    }
    const result = await resp.json();
    const alt = result.results?.channels?.[0]?.alternatives?.[0];
    if (!alt) return null;

    const duration = result.metadata?.duration || 0;
    const segments: Array<{ text: string; start: number; duration: number }> = [];
    const utterances = result.results?.utterances || [];

    if (utterances.length > 0) {
      for (const u of utterances) {
        segments.push({ text: u.transcript, start: u.start, duration: u.end - u.start });
      }
    } else {
      segments.push({ text: alt.transcript, start: 0, duration });
    }

    return { text: alt.transcript, duration: Math.round(duration), segments };
  } catch (error) {
    console.error("Deepgram transcription failed:", error);
    return null;
  }
}

// ── Main handler ─────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { lectureVideoId, videoPath } = await req.json();
    if (!lectureVideoId || typeof lectureVideoId !== "string") {
      return new Response(JSON.stringify({ error: "lectureVideoId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Transcribing lecture: ${lectureVideoId}, path: ${videoPath}`);

    const { data: lecture, error: lectureError } = await supabaseClient
      .from("lecture_videos")
      .select("video_url, video_path, instructor_id")
      .eq("id", lectureVideoId)
      .single();

    if (lectureError || !lecture) {
      return new Response(JSON.stringify({ error: "Lecture not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (lecture.instructor_id !== user.id) {
      return new Response(JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let transcript: { text: string; segments: Array<{ text: string; start: number; duration: number }> } | null = null;
    let durationSeconds = 0;
    const isExternal = videoPath?.startsWith("external-");

    if (isExternal && lecture.video_url) {
      const url = lecture.video_url;
      console.log(`Processing external URL: ${url}`);

      const ytVideoId = extractYouTubeVideoId(url);
      if (ytVideoId) {
        console.log(`YouTube video detected: ${ytVideoId}`);
        transcript = await fetchYouTubeTranscript(ytVideoId);

        if (transcript && transcript.segments.length > 0) {
          const lastSeg = transcript.segments[transcript.segments.length - 1];
          durationSeconds = Math.round(lastSeg.start + lastSeg.duration);
        }
        const ytDuration = await fetchYouTubeDuration(ytVideoId);
        if (ytDuration > 0) durationSeconds = ytDuration;
      }

      const vimeoId = extractVimeoVideoId(url);
      if (vimeoId && !transcript) {
        console.log(`Vimeo video detected: ${vimeoId}`);
        const vd = await fetchVimeoDuration(vimeoId);
        if (vd > 0) durationSeconds = vd;

        const dgKey = Deno.env.get("DEEPGRAM_API_KEY");
        if (dgKey) {
          const r = await transcribeWithDeepgram(url, dgKey);
          if (r) { transcript = { text: r.text, segments: r.segments }; if (!durationSeconds) durationSeconds = r.duration; }
        }
      }

      if (!transcript && isDirectVideoUrl(url)) {
        console.log("Direct video URL, using Deepgram");
        const dgKey = Deno.env.get("DEEPGRAM_API_KEY");
        if (!dgKey) {
          await supabaseClient.from("lecture_videos").update({ status: "error", error_message: "Deepgram API key not configured" }).eq("id", lectureVideoId);
          return new Response(JSON.stringify({ error: "Transcription service not configured" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const r = await transcribeWithDeepgram(url, dgKey);
        if (r) { transcript = { text: r.text, segments: r.segments }; durationSeconds = r.duration; }
      }

      if (!transcript && !ytVideoId && !vimeoId) {
        console.log("Unknown URL type, trying Deepgram");
        const dgKey = Deno.env.get("DEEPGRAM_API_KEY");
        if (dgKey) {
          const r = await transcribeWithDeepgram(url, dgKey);
          if (r) { transcript = { text: r.text, segments: r.segments }; durationSeconds = r.duration; }
        }
      }
    } else {
      // Uploaded file → Deepgram
      console.log(`Processing uploaded file: ${videoPath}`);
      const dgKey = Deno.env.get("DEEPGRAM_API_KEY");
      if (!dgKey) {
        await supabaseClient.from("lecture_videos").update({ status: "error", error_message: "Deepgram API key not configured" }).eq("id", lectureVideoId);
        return new Response(JSON.stringify({ error: "Transcription service not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: signedUrl, error: urlError } = await supabaseClient.storage.from("lecture-videos").createSignedUrl(videoPath, 3600);
      if (urlError || !signedUrl) {
        await supabaseClient.from("lecture_videos").update({ status: "error", error_message: "Failed to access video file" }).eq("id", lectureVideoId);
        return new Response(JSON.stringify({ error: "Failed to access video file" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const r = await transcribeWithDeepgram(signedUrl.signedUrl, dgKey);
      if (r) { transcript = { text: r.text, segments: r.segments }; durationSeconds = r.duration; }
    }

    // Handle no transcript
    if (!transcript || !transcript.text) {
      const ytId = isExternal && lecture.video_url ? extractYouTubeVideoId(lecture.video_url) : null;
      const vimId = isExternal && lecture.video_url ? extractVimeoVideoId(lecture.video_url) : null;

      if (ytId || vimId) {
        console.log("No transcript for embedded video, creating placeholder");
        transcript = { text: "[Transcript unavailable - video will play without AI-generated questions]", segments: [] };
        await supabaseClient.from("lecture_videos").update({
          transcript: { text: transcript.text, segments: transcript.segments },
          status: "analyzing", duration_seconds: durationSeconds || null,
        }).eq("id", lectureVideoId);
        return new Response(JSON.stringify({ success: true, hasTranscript: false, durationSeconds }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      await supabaseClient.from("lecture_videos").update({
        status: "error", error_message: "Failed to transcribe video. Please check the URL and try again.",
      }).eq("id", lectureVideoId);
      return new Response(JSON.stringify({ error: "Transcription failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`Transcription complete: ${transcript.text.length} chars, ${durationSeconds}s`);

    await supabaseClient.from("lecture_videos").update({
      transcript: { text: transcript.text, segments: transcript.segments },
      status: "analyzing", duration_seconds: durationSeconds || null,
    }).eq("id", lectureVideoId);

    return new Response(JSON.stringify({ success: true, hasTranscript: true, durationSeconds }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Transcription error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
