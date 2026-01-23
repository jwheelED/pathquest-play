import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

    // Verify instructor role
    const { data: roleData, error: roleError } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "instructor",
    });

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: "Unauthorized: Instructor role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { question_text, context = "" } = await req.json();

    if (!question_text) {
      return new Response(JSON.stringify({ error: "Missing question_text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("🎯 Generating MCQ options for:", question_text.substring(0, 100));

    const prompt = `Question: "${question_text}"
${context ? `Context: "${context}"` : ""}

Generate 4 MCQ options. One correct, three plausible distractors. Randomize correct position.

MATHEMATICS FORMATTING:
- If the question contains mathematical expressions, options MUST also use proper LaTeX notation
- Use $...$ for inline math in options
- Examples for a calculus question:
  A. $2x$
  B. $x^2$  
  C. $\\frac{1}{x}$
  D. $2x + h$
- Ensure LaTeX is properly escaped with double backslashes

Return JSON only:
{"options":["A. ...","B. ...","C. ...","D. ..."],"correct_answer":"A"|"B"|"C"|"D"}`;

    const MAX_ATTEMPTS = 3;
    let lastError: Error | null = null;
    let result = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      try {
        console.log(`🎯 Attempt ${attempt}/${MAX_ATTEMPTS} for MCQ generation`);

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
                content: "Generate MCQ options. Return ONLY valid JSON.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.5,
            max_tokens: 500,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`AI API error (attempt ${attempt}):`, response.status, errorText);
          lastError = new Error(`AI API error: ${response.status}`);
          continue; // Retry
        }

        const aiResponse = await response.json();
        let content = aiResponse.choices[0]?.message?.content;

        if (!content) {
          console.warn(`Empty AI response on attempt ${attempt}`);
          lastError = new Error("Empty AI response");
          continue; // Retry
        }

        // Clean up markdown if present
        content = content
          .replace(/```json\s*/g, "")
          .replace(/```\s*/g, "")
          .trim();

        const parsed = JSON.parse(content);

        if (!parsed.options || parsed.options.length !== 4 || !parsed.correct_answer) {
          console.warn(`Invalid MCQ format on attempt ${attempt}:`, parsed);
          lastError = new Error("Invalid MCQ options format");
          continue; // Retry
        }

        // Success!
        result = parsed;
        console.log(`✅ MCQ options generated successfully on attempt ${attempt}`);
        break;
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === "AbortError") {
          console.warn(`Request timed out on attempt ${attempt}`);
          lastError = new Error("Request timed out");
        } else {
          console.error(`Fetch error on attempt ${attempt}:`, fetchError);
          lastError = fetchError;
        }
        // Continue to next attempt
      }
    }

    // If we have a result, return it
    if (result) {
      return new Response(
        JSON.stringify({
          success: true,
          options: result.options,
          correct_answer: result.correct_answer,
          explanation: result.explanation || "",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // All attempts failed - return placeholder options so user can edit manually
    console.warn("⚠️ All attempts failed, returning placeholder options");
    return new Response(
      JSON.stringify({
        success: true,
        options: [
          "A. [Please edit this option]",
          "B. [Please edit this option]",
          "C. [Please edit this option]",
          "D. [Please edit this option]",
        ],
        correct_answer: "A",
        explanation: "AI generation failed after retries. Please edit these placeholder options manually.",
        is_placeholder: true,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in generate-mcq-options:", error);
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
