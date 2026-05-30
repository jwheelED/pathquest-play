import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

// ── Question detection logic (mirrors usePassiveQuestionDetection.ts) ──────────

const RHETORICAL_BLOCKLIST = [
  'right', 'okay', 'ok', 'understand', 'got it', 'you know', 'see what i mean',
  "isn't it", "aren't they", "don't you think", 'does that make sense', 'make sense',
  'with me so far', 'any questions', 'everyone with me', 'following along', 'clear',
  'is that clear', 'yes', 'no', 'huh', 'correct', 'true', "isn't that right", 'see',
  'you see', 'you follow', 'shall we', 'shall i', 'ready', 'are we good', 'good so far',
  'sound good', 'sounds good', 'know what i mean', 'fair enough', 'yeah',
  'everyone got that', 'all good', 'is it not', "wouldn't you say", "can you see",
  "can everyone see", "can you hear me", "can everyone hear me",
];

const GREETING_PATTERNS = [
  /^how('?s| is) everyone/i,
  /^how('?s| is) everybody/i,
  /^how('?s| are) (you|y'all|ya'll|yall) (all )?(doing|today|this|feeling)/i,
  /^how are (we|you|you guys|y'all|everyone|everybody) (doing|today|this|feeling)/i,
  /^how('?s| is) it going/i,
  /^what('?s| is) up/i,
  /^how('?s| is| are) (your|the) (day|morning|afternoon|evening)/i,
  /^how('?s| is| are) (you|everyone|everybody|you guys) feeling/i,
  /^(good )?(morning|afternoon|evening|hey|hello|hi|welcome)/i,
  /^(is )?everyone (here|ready|good|doing)/i,
  /^(are )?we (all )?(here|ready|good|set)/i,
  /^can (you|everyone|everybody) hear me/i,
  /^can (you|everyone|everybody) see (me|this|the screen|my screen)/i,
];

function extractQuestions(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized.includes('?') && !normalized.includes('？')) return [];

  const sentences = normalized.split(/[.!;:]\s+/);
  const questions: string[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.includes('?') || trimmed.includes('？')) {
      const matches = trimmed.match(/[^?？]*[?？]/g);
      if (matches) {
        questions.push(...matches.map((s: string) => s.trim()).filter(Boolean));
      } else {
        questions.push(trimmed);
      }
    }
  }

  return questions;
}

function isRhetorical(question: string): boolean {
  const normalized = question.replace(/[?？]+$/, '').trim().toLowerCase();

  for (const pattern of GREETING_PATTERNS) {
    if (pattern.test(normalized)) return true;
  }

  if (/^(what|how|why|when|where|who|which)\b/.test(normalized)) {
    return false;
  }

  for (const phrase of RHETORICAL_BLOCKLIST) {
    if (normalized === phrase) return true;
    const stripped = normalized.replace(/^(so|and|but|well|now|or|um|uh|like)\s+/i, '').trim();
    if (stripped === phrase) return true;
  }

  return false;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ── Main handler ──────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth: require instructor JWT ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub as string;

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Verify instructor role
    const { data: isInstructor } = await supabaseClient.rpc("has_role", {
      _user_id: userId,
      _role: "instructor",
    });
    if (!isInstructor) {
      return new Response(JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { lecture_video_id, transcript_segments } = await req.json();

    if (!lecture_video_id || !Array.isArray(transcript_segments)) {
      return new Response(JSON.stringify({ error: "Missing lecture_video_id or transcript_segments" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Confirm the lecture belongs to this instructor
    const { data: lecture, error: lecErr } = await supabaseClient
      .from("lecture_videos")
      .select("id, instructor_id")
      .eq("id", lecture_video_id)
      .maybeSingle();
    if (lecErr || !lecture || lecture.instructor_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[detect-speaker-questions] Processing ${transcript_segments.length} segments for lecture ${lecture_video_id}`);

    const MIN_WORD_COUNT = 5;
    const detectedPausePoints: Array<{
      lecture_video_id: string;
      pause_timestamp: number;
      question_content: object;
      question_type: string;
      cognitive_load_score: number;
      reason: string;
      is_active: boolean;
      difficulty_type: string;
      order_index: number;
    }> = [];

    // Merge segments into a sliding window of ~3 sentences for better context
    // but track position by start_ms of the first segment that introduced the question
    for (let i = 0; i < transcript_segments.length; i++) {
      const seg = transcript_segments[i];
      const text = seg.text ?? seg.transcript ?? '';
      const startMs: number = seg.start_ms ?? Math.round((seg.start ?? 0) * 1000);

      const questions = extractQuestions(text);
      for (const q of questions) {
        if (wordCount(q) < MIN_WORD_COUNT) continue;
        if (isRhetorical(q)) continue;

        const pauseTimestamp = Math.floor(startMs / 1000);

        // Deduplicate: skip if we already have a pause point within 10 seconds
        const isDuplicate = detectedPausePoints.some(
          (pp) => Math.abs(pp.pause_timestamp - pauseTimestamp) < 10
        );
        if (isDuplicate) continue;

        detectedPausePoints.push({
          lecture_video_id,
          pause_timestamp: pauseTimestamp,
          question_content: {
            question: q,
            type: "speaker_question",
            options: null,
            correctAnswer: null,
            explanation: null,
          },
          question_type: "short_answer",
          cognitive_load_score: 5,
          reason: "Speaker asked this question in the video",
          is_active: true,
          difficulty_type: "application",
          order_index: detectedPausePoints.length,
        });
      }
    }

    console.log(`[detect-speaker-questions] Detected ${detectedPausePoints.length} speaker questions`);

    if (detectedPausePoints.length === 0) {
      return new Response(JSON.stringify({ success: true, detected: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Insert all pause points
    const { error: insertError } = await supabaseClient
      .from("lecture_pause_points")
      .insert(detectedPausePoints);

    if (insertError) {
      console.error("[detect-speaker-questions] Insert error:", insertError);
      return new Response(JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: true, detected: detectedPausePoints.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[detect-speaker-questions] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
