import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { handleDetectRequest } from "./detection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

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

    const { status, body: respBody } = await handleDetectRequest(body, supabaseClient);
    console.log(`[detect-speaker-questions] Result status=${status}`, respBody);

    return new Response(JSON.stringify(respBody), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[detect-speaker-questions] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
