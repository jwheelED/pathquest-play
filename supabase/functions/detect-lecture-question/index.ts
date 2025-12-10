import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

const INTENT_DETECTION_PROMPT = `You are an expert AI system specialized in detecting questions in educational lectures.

CONTEXT: You analyze real-time lecture transcripts from university/school classes where professors ask questions to students.

YOUR TASK:
1. Identify if the professor is asking a REAL question that students should answer
2. Extract the complete, exact question text
3. Classify the question type accurately
4. Provide confidence score based on clarity and directness

DETECTION CRITERIA - Consider these HIGH confidence (0.8-1.0):
✓ Direct questions with clear preambles:
  • "My question for you is..."
  • "Here's what I want to ask you..."
  • "Can anyone tell me..."
  • "Who can explain..."
  • "What do you think about..."
  
✓ Explicit prompts with student names/class address:
  • "So class, what is..."
  • "Everyone, think about this:"
  • "Let's see if you can solve..."
  
✓ Clear assessment questions:
  • "What is [concept]?"
  • "How would you [action]?"
  • "Why does [phenomenon] happen?"
  • "Calculate/Find/Determine [value]"
  
✓ Challenge/problem statements:
  • "Here's a problem for you to solve..."
  • "Try to figure out..."
  • "See if you can..."

DETECTION CRITERIA - Consider these MEDIUM confidence (0.5-0.7):
⚠ Questions without clear preamble but in teaching context
⚠ Questions immediately followed by pause indicators
⚠ Questions with multiple interpretations

DO NOT DETECT (confidence 0.0-0.3):
✗ Rhetorical questions professor answers themselves
✗ Conversational fillers: "You know?", "Right?", "Make sense?"
✗ Self-questioning: "What was I saying?", "Where did I put..."
✗ Questions about logistics: "Can everyone see the screen?"
✗ Questions immediately followed by professor's answer (within 2 sentences)

QUESTION TYPE CLASSIFICATION:
• multiple_choice: Uses "which", "select", "choose", provides options, "true or false"
• coding: Mentions "write", "implement", "code", "function", "algorithm", "program", "debug"
• short_answer: All other questions requiring explanation, calculation, or analysis (DEFAULT)

CONTEXT ANALYSIS RULES:
- Check if professor answers their own question in the SAME breath
- Look for pauses or "wait for student response" indicators
- Consider the pedagogical flow - is this a teaching moment?
- Verify question is complete and not cut off mid-sentence

OUTPUT FORMAT (JSON):
{
  "is_question": boolean,
  "confidence": 0.0-1.0,
  "question_text": "exact extracted question" or null,
  "suggested_type": "multiple_choice" | "short_answer" | "coding" | null,
  "reasoning": "brief explanation of decision",
  "context_clues": "key phrases that influenced decision"
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limiting: max 10 detection calls per minute
    const rateLimitKey = `question_detection:${user.id}`;
    const windowStart = new Date(Date.now() - (Date.now() % 60000)); // Current minute window

    const { data: rateLimitData, error: rateLimitError } = await supabase
      .from("rate_limits")
      .select("count")
      .eq("key", rateLimitKey)
      .eq("window_start", windowStart.toISOString())
      .single();

    if (rateLimitData && rateLimitData.count >= 10) {
      console.log("🚫 Rate limit exceeded for user:", user.id);
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded: max 10 detections per minute",
          retry_after: 60 - Math.floor((Date.now() % 60000) / 1000),
        }),
        {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Record this detection attempt
    if (rateLimitData) {
      await supabase
        .from("rate_limits")
        .update({ count: rateLimitData.count + 1 })
        .eq("key", rateLimitKey)
        .eq("window_start", windowStart.toISOString());
    } else {
      await supabase.from("rate_limits").insert({
        key: rateLimitKey,
        window_start: windowStart.toISOString(),
        count: 1,
      });
    }

    const { recentChunk, context } = await req.json();

    if (!recentChunk || !context) {
      return new Response(JSON.stringify({ error: "Missing recentChunk or context" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("🔍 Analyzing chunk for questions...");
    console.log("Recent:", recentChunk.substring(0, 100));

    // Call Lovable AI for intent detection
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: INTENT_DETECTION_PROMPT },
          {
            role: "user",
            content: `RECENT SPEECH (last 20-60 seconds):\n"${recentChunk}"\n\nBROADER CONTEXT (last 90 seconds):\n"${context}"\n\nAnalyze if the professor is asking a REAL question for students to answer. Consider the full context to determine if they answer their own question.`,
          },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI detection failed", details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await response.json();
    const result = JSON.parse(aiResponse.choices[0].message.content);

    console.log("✅ Detection result:", result);

    return new Response(
      JSON.stringify({
        is_question: result.is_question,
        confidence: result.confidence,
        question_text: result.question_text,
        suggested_type: result.suggested_type,
        reasoning: result.reasoning,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in detect-lecture-question:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
