import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple hash function for cache key generation
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { problemText, correctAnswer, userAnswer, wasCorrect, courseContext } = await req.json();

    // Input validation
    if (
      !problemText ||
      typeof problemText !== "string" ||
      problemText.length > 1000 ||
      /[\x00-\x1F]/.test(problemText)
    ) {
      return new Response(JSON.stringify({ error: "Invalid problem text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!correctAnswer || typeof correctAnswer !== "string" || correctAnswer.length > 500) {
      return new Response(JSON.stringify({ error: "Invalid correct answer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userAnswer && (typeof userAnswer !== "string" || userAnswer.length > 5000)) {
      return new Response(JSON.stringify({ error: "Invalid user answer" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (courseContext && (typeof courseContext !== "string" || courseContext.length > 2000)) {
      return new Response(JSON.stringify({ error: "Invalid course context" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Generate cache key
    const questionHash = simpleHash(problemText.toLowerCase().trim());
    const normalizedWrongAnswer = (userAnswer || "").toLowerCase().trim();
    const normalizedCorrectAnswer = correctAnswer.toLowerCase().trim();

    console.log("Cache lookup for:", { questionHash, wrongAnswer: normalizedWrongAnswer });

    // Check cache first
    const { data: cachedExplanation, error: cacheError } = await supabase
      .from("ai_explanation_cache")
      .select("explanation, id, usage_count")
      .eq("question_hash", questionHash)
      .eq("wrong_answer", normalizedWrongAnswer)
      .eq("correct_answer", normalizedCorrectAnswer)
      .maybeSingle();

    if (cachedExplanation) {
      console.log("✅ Cache hit! Returning cached explanation (usage:", cachedExplanation.usage_count + 1, ")");

      // Update usage stats
      await supabase
        .from("ai_explanation_cache")
        .update({
          usage_count: cachedExplanation.usage_count + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", cachedExplanation.id);

      return new Response(
        JSON.stringify({
          explanation: cachedExplanation.explanation,
          cached: true,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("❌ Cache miss. Generating new explanation...");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const contextInfo = courseContext ? `\n\nCourse Context: ${courseContext}` : "";
    const userAnswerInfo = userAnswer ? `\nStudent's Answer: ${userAnswer}` : "";
    const outcomeInfo = wasCorrect ? "The student answered correctly." : "The student answered incorrectly.";

    const prompt = `Provide a detailed, in-depth explanation for this practice question:

Question: ${problemText}
Correct Answer: ${correctAnswer}${userAnswerInfo}

${outcomeInfo}${contextInfo}

Please provide a comprehensive explanation (200-300 words) that includes:

1. **Conceptual Breakdown**: Explain the underlying concept being tested
2. **Step-by-Step Reasoning**: Walk through how to arrive at the correct answer
3. **Why This Matters**: Explain the practical importance or real-world application
4. **Related Concepts**: Mention connected topics the student should understand
5. **Common Pitfalls**: Highlight typical mistakes students make with this type of question

Make the explanation engaging, educational, and appropriate for the student's level. Use clear language and examples where helpful.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an expert educator providing detailed, clear explanations to help students deeply understand concepts.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", { status: response.status, body: errorText });
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI service quota exceeded. Please contact support." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(
        JSON.stringify({ error: `AI API error: ${response.status}`, details: errorText }), 
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    const explanation = data.choices?.[0]?.message?.content;

    if (!explanation) {
      throw new Error("No explanation generated");
    }

    console.log("✨ Generated explanation (length:", explanation.length, "chars)");

    // Store in cache for future use
    const { error: insertError } = await supabase
      .from("ai_explanation_cache")
      .insert({
        question_hash: questionHash,
        wrong_answer: normalizedWrongAnswer,
        correct_answer: normalizedCorrectAnswer,
        explanation: explanation,
      })
      .select()
      .single();

    if (insertError) {
      console.error("⚠️ Cache insert error:", insertError);
      // Don't fail the request if cache insert fails
    } else {
      console.log("💾 Explanation cached successfully");
    }

    return new Response(
      JSON.stringify({
        explanation,
        cached: false,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    console.error("Error generating explanation:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to generate explanation";
    return new Response(
      JSON.stringify({
        error: errorMessage,
        details: "An unexpected error occurred while processing your request.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
