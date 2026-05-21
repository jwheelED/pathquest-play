import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      lectureVideoId,
      pausePointId,
      questionText,
      correctAnswer,
      studentAnswer,
      questionType,
    } = await req.json();

    if (!questionText || !studentAnswer) {
      return new Response(
        JSON.stringify({ error: "questionText and studentAnswer are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch lecture transcript for context
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const { data: lecture } = await serviceClient
      .from("lecture_videos")
      .select("transcript, duration_seconds")
      .eq("id", lectureVideoId)
      .single();

    const { data: pausePoint } = await serviceClient
      .from("lecture_pause_points")
      .select("pause_timestamp")
      .eq("id", pausePointId)
      .single();

    const timestamp = pausePoint?.pause_timestamp || 0;
    const duration = lecture?.duration_seconds || 600;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.5-flash",
          messages: [
            {
              role: "system",
              content: `You are an expert educational diagnostician. Analyze a student's incorrect answer to identify the specific misconception, the missing concept, and the root cause of their error. Also recommend a timestamp range in the lecture where the relevant concept was explained.

The lecture is ${Math.round(duration / 60)} minutes long. The question was at ${Math.round(timestamp)}s.`,
            },
            {
              role: "user",
              content: `Question (${questionType}): ${questionText}
Correct Answer: ${correctAnswer}
Student's Answer: ${studentAnswer}

Identify the misconception and recommend a review timestamp.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "diagnose_misconception",
                description: "Diagnose a student's misconception from their incorrect answer",
                parameters: {
                  type: "object",
                  properties: {
                    misconception: {
                      type: "string",
                      description: "The specific misconception the student has",
                    },
                    missingConcept: {
                      type: "string",
                      description: "The key concept the student is missing or misunderstanding",
                    },
                    rootCause: {
                      type: "string",
                      description: "Why the student likely made this error",
                    },
                    recommendedTimestamp: {
                      type: "number",
                      description: "Start timestamp (seconds) of the lecture section to review",
                    },
                    endTimestamp: {
                      type: "number",
                      description: "End timestamp (seconds) of the review section",
                    },
                  },
                  required: [
                    "misconception",
                    "missingConcept",
                    "rootCause",
                    "recommendedTimestamp",
                    "endTimestamp",
                  ],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "diagnose_misconception" } },
          temperature: 0.3,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      return new Response(
        JSON.stringify({ error: "Invalid AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const diagnosis = JSON.parse(toolCall.function.arguments);

    // Clamp timestamps to valid range
    diagnosis.recommendedTimestamp = Math.max(0, Math.min(diagnosis.recommendedTimestamp, timestamp));
    diagnosis.endTimestamp = Math.max(
      diagnosis.recommendedTimestamp + 10,
      Math.min(diagnosis.endTimestamp, timestamp)
    );

    return new Response(JSON.stringify(diagnosis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Misconception detection error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
