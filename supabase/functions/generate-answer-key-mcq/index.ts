import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Distractor {
  text: string;
  latex: string | null;
  why_wrong: string;
}

interface GeneratedMCQ {
  question_text: string;
  question_latex: string | null;
  correct_answer: string;
  correct_answer_latex: string | null;
  distractors: Distractor[];
  explanation: string;
  explanation_latex: string | null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { problem_id } = await req.json();

    if (!problem_id) {
      return new Response(JSON.stringify({ error: "Missing problem_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating MCQ for problem ${problem_id}`);

    // Fetch the problem
    const { data: problem, error: problemError } = await supabase
      .from("answer_key_problems")
      .select(`
        *,
        instructor_answer_keys (
          subject,
          course_context,
          instructor_id
        )
      `)
      .eq("id", problem_id)
      .single();

    if (problemError || !problem) {
      console.error("Problem not found:", problemError);
      return new Response(JSON.stringify({ error: "Problem not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify ownership
    if (problem.instructor_answer_keys?.instructor_id !== user.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = problem.instructor_answer_keys?.subject || "general";
    const courseContext = problem.instructor_answer_keys?.course_context || "";

    const systemPrompt = `You are an expert at creating multiple-choice questions (MCQs) for STEM education.

Your task is to generate an MCQ from a verified problem-solution pair. The MCQ must test the same concept and use the EXACT verified answer as the correct option.

CRITICAL RULES:
1. The correct_answer MUST match the verified final_answer EXACTLY
2. Generate exactly 3 plausible distractors (wrong answers) that represent common student mistakes:
   - Sign errors (forgot negative sign)
   - Unit conversion errors
   - Missing factors (forgot to square, divide by 2, etc.)
   - Conceptual misunderstandings
   - Calculation errors (off by order of magnitude)
3. Each distractor needs a "why_wrong" explanation for the instructor
4. The question should be clear and test the same concept as the original problem
5. If the problem involves specific values, you may rephrase slightly but keep the same mathematical structure

Subject: ${subject}
Course: ${courseContext}
Difficulty: ${problem.difficulty}

Return ONLY a valid JSON object with this structure:
{
  "question_text": "...",
  "question_latex": null,
  "correct_answer": "EXACT MATCH to final_answer",
  "correct_answer_latex": null,
  "distractors": [
    {"text": "wrong answer 1", "latex": null, "why_wrong": "forgot to account for..."},
    {"text": "wrong answer 2", "latex": null, "why_wrong": "sign error when..."},
    {"text": "wrong answer 3", "latex": null, "why_wrong": "used wrong formula..."}
  ],
  "explanation": "Complete explanation of the correct answer",
  "explanation_latex": null
}`;

    const userPrompt = `Generate an MCQ for this problem:

PROBLEM:
${problem.problem_text}
${problem.problem_latex ? `LaTeX: ${problem.problem_latex}` : ""}

SOLUTION:
${problem.solution_text}
${problem.solution_latex ? `LaTeX: ${problem.solution_latex}` : ""}

VERIFIED FINAL ANSWER (use this EXACTLY as the correct answer):
${problem.final_answer}${problem.units ? ` ${problem.units}` : ""}
${problem.final_answer_latex ? `LaTeX: ${problem.final_answer_latex}` : ""}

TOPIC TAGS: ${problem.topic_tags?.join(", ") || "none"}`;

    console.log("Calling Lovable AI Gateway for MCQ generation...");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI generation failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices?.[0]?.message?.content;

    if (!responseContent) {
      console.error("No content in AI response");
      return new Response(JSON.stringify({ error: "AI returned empty response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("AI response received, parsing JSON...");

    let generatedMCQ: GeneratedMCQ;
    try {
      let jsonStr = responseContent;
      const jsonMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }
      generatedMCQ = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      console.error("Raw response:", responseContent.substring(0, 500));
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate the MCQ
    if (!generatedMCQ.question_text || !generatedMCQ.correct_answer || !generatedMCQ.distractors) {
      console.error("Invalid MCQ structure:", generatedMCQ);
      return new Response(JSON.stringify({ error: "AI generated invalid MCQ structure" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert MCQ into database
    const mcqInsert = {
      problem_id,
      question_text: generatedMCQ.question_text,
      question_latex: generatedMCQ.question_latex || null,
      correct_answer: generatedMCQ.correct_answer,
      correct_answer_latex: generatedMCQ.correct_answer_latex || null,
      distractors: generatedMCQ.distractors,
      explanation: generatedMCQ.explanation || null,
      explanation_latex: generatedMCQ.explanation_latex || null,
      verified: false,
    };

    console.log("Inserting MCQ into database...");

    const { data: insertedMCQ, error: insertError } = await supabase
      .from("answer_key_mcqs")
      .insert(mcqInsert)
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert MCQ:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save MCQ" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Successfully generated MCQ ${insertedMCQ.id} for problem ${problem_id}`);

    return new Response(JSON.stringify({
      success: true,
      mcq: insertedMCQ,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in generate-answer-key-mcq function:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
