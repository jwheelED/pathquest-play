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
      misconception,
      missingConcept,
      rootCause,
      originalQuestion,
      correctAnswer,
      studentAnswer,
    } = await req.json();

    if (!misconception || !originalQuestion) {
      return new Response(
        JSON.stringify({ error: "misconception and originalQuestion are required" }),
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
              content: `You are a patient, encouraging tutor. A student got a question wrong. Based on the diagnosed misconception, provide:
1. A clear, concise explanation that addresses the specific misconception
2. A follow-up multiple-choice question that tests the same concept from a different angle

Be supportive and constructive. Explain the concept simply and directly.`,
            },
            {
              role: "user",
              content: `Original Question: ${originalQuestion}
Correct Answer: ${correctAnswer}
Student's Answer: ${studentAnswer}

Misconception: ${misconception}
Missing Concept: ${missingConcept}
Root Cause: ${rootCause}

Generate a remediation explanation and follow-up question.`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "create_remediation",
                description: "Create remediation content for a student's misconception",
                parameters: {
                  type: "object",
                  properties: {
                    explanation: {
                      type: "string",
                      description: "Clear explanation addressing the misconception (2-4 sentences)",
                    },
                    followUpQuestion: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["multiple_choice"] },
                        question: { type: "string", description: "Follow-up question text" },
                        options: {
                          type: "array",
                          items: { type: "string" },
                          description: "4 answer options prefixed with A. B. C. D.",
                        },
                        correctAnswer: {
                          type: "string",
                          description: "Correct answer letter (A, B, C, or D)",
                        },
                        explanation: {
                          type: "string",
                          description: "Explanation for the correct answer",
                        },
                      },
                      required: ["type", "question", "options", "correctAnswer", "explanation"],
                    },
                  },
                  required: ["explanation", "followUpQuestion"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "create_remediation" } },
          temperature: 0.4,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI generation failed" }),
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

    const remediation = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(remediation), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Remediation generation error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
