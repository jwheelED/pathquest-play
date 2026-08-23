import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { callOpenRouter } from "../_shared/openrouter.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Use service role for cache operations since live session participants may be anonymous
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { problemText, correctAnswer, userAnswer, wasCorrect, courseContext } = await req.json();

    if (!problemText) {
      return new Response(
        JSON.stringify({ error: "problemText is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Server-side correctness validation as safety net
    // If userAnswer matches correctAnswer (after normalization), force wasCorrect = true
    const effectiveWasCorrect = wasCorrect === true ||
      (correctAnswer && userAnswer &&
       userAnswer.trim().toUpperCase().charAt(0) === correctAnswer.trim().toUpperCase().charAt(0));

    // Check cache first — include correctness in hash to avoid cross-contamination
    const questionHash = await hashString(`${problemText}|${correctAnswer}|${userAnswer}|${effectiveWasCorrect}`);
    
    const { data: cached } = await supabaseClient
      .from("ai_explanation_cache")
      .select("explanation")
      .eq("question_hash", questionHash)
      .maybeSingle();

    if (cached?.explanation) {
      console.log("Cache hit for explanation");
      // Update usage stats
      await supabaseClient
        .from("ai_explanation_cache")
        .update({
          usage_count: 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("question_hash", questionHash);

      return new Response(
        JSON.stringify({ explanation: cached.explanation, cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate explanation via OpenAI
    const systemPrompt = `You are a helpful teaching assistant. Generate a clear, concise explanation for a quiz question. 
Use simple language appropriate for students. If mathematical notation is needed, use plain readable Unicode text (√, π, ∫, x², fractions as a/b). Do NOT use LaTeX syntax — no $, \\frac, \\int, {, }, or backslash commands.
Keep explanations focused and under 200 words.
IMPORTANT: If the student answered correctly, NEVER say their answer is wrong, incorrect, or that they misunderstood. Only reinforce why the answer is correct and deepen their understanding.`;

    const userPrompt = effectiveWasCorrect
      ? `The student answered correctly! Reinforce their understanding.

Question: ${problemText}
Correct Answer: ${correctAnswer}
${courseContext ? `Course Context: ${courseContext}` : ""}

Explain WHY this answer is correct and provide any additional insight that deepens understanding. Do NOT mention anything about the answer being wrong.`
      : `The student answered incorrectly. Help them understand.

Question: ${problemText}
Student's Answer: ${userAnswer}
Correct Answer: ${correctAnswer}
${courseContext ? `Course Context: ${courseContext}` : ""}

Explain:
1. Why the correct answer is right
2. Why the student's answer is wrong (common misconception)
3. A tip to remember the correct concept`;

    console.log("Generating explanation via ox-alpha (OpenRouter)...", { effectiveWasCorrect, wasCorrect });

    const aiResponse = await callOpenRouter({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    if (!aiResponse.ok) {
      const errBody = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errBody);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const explanation = aiData.choices?.[0]?.message?.content || "Unable to generate explanation.";

    console.log("Explanation generated successfully");

    // Cache the explanation (best-effort, don't fail if cache write fails)
    try {
      await supabaseClient.from("ai_explanation_cache").upsert({
        question_hash: questionHash,
        correct_answer: (correctAnswer || "").slice(0, 1000),
        wrong_answer: (userAnswer || "").slice(0, 1000),
        explanation,
        usage_count: 1,
        last_used_at: new Date().toISOString(),
      }, { onConflict: "question_hash" });
    } catch (cacheError) {
      console.warn("Failed to cache explanation:", cacheError);
    }

    return new Response(
      JSON.stringify({ explanation, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in generate-detailed-explanation:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
