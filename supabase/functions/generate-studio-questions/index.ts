import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { prompt, parsedMaterials, instructorPreferences, regenerateQuestion, count } = await req.json();

    if (!prompt || prompt.length < 10) {
      return new Response(JSON.stringify({ error: "Please provide detailed instructions" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context from uploaded materials
    let materialContext = "";
    if (parsedMaterials && parsedMaterials.length > 0) {
      materialContext = parsedMaterials
        .map((m: { filename: string; content: string }) => `--- ${m.filename} ---\n${m.content.slice(0, 8000)}`)
        .join("\n\n");
    }

    const difficulty = instructorPreferences?.difficulty || "medium";
    const professorType = instructorPreferences?.professorType || "stem";
    const questionFormat = instructorPreferences?.questionFormat || "multiple_choice";
    const questionCount = count || 5;

    // Build the system prompt
    const systemPrompt = `You are an expert educational content creator specializing in ${professorType === "medical" ? "medical education and USMLE-style" : "STEM"} question generation.

Your task is to create ${questionCount} high-quality ${questionFormat === "short_answer" ? "short answer" : "multiple choice"} questions based on the instructor's specific instructions.

DIFFICULTY LEVEL: ${difficulty}
${difficulty === "easy" ? "Focus on recall and basic comprehension. Questions should test fundamental knowledge." : ""}
${difficulty === "medium" ? "Balance recall with application. Include some questions that require applying concepts." : ""}
${difficulty === "hard" ? "Focus on application, analysis, and clinical reasoning. Questions should require integrating multiple concepts." : ""}

${professorType === "medical" ? `
MEDICAL QUESTION GUIDELINES:
- Use clinical vignette format when appropriate
- Include patient demographics, chief complaint, relevant history
- Focus on diagnostic reasoning and clinical decision-making
- Test understanding of pathophysiology and treatment mechanisms
` : `
STEM QUESTION GUIDELINES:
- Focus on conceptual understanding over memorization
- Include problems that require multi-step reasoning
- Test ability to apply principles to new situations
`}

RESPONSE FORMAT:
Return a JSON array of questions. Each question must have:
{
  "question_text": "The complete question text",
  "question_type": "${questionFormat === "short_answer" ? "short_answer" : "multiple_choice"}",
  ${questionFormat !== "short_answer" ? `"options": ["A) First option", "B) Second option", "C) Third option", "D) Fourth option"],
  "correct_answer": "A) First option",` : `"options": [],
  "correct_answer": "Expected answer summary",`}
  "explanation": "Brief explanation of why this is correct"
}

CRITICAL RULES:
1. Questions MUST be specific to the provided content - no generic questions
2. For MCQs, all options must be plausible - avoid obviously wrong answers
3. Explanations should teach, not just state the answer
4. Each question should test a distinct concept
5. Return ONLY valid JSON array, no additional text`;

    const userPrompt = `INSTRUCTOR INSTRUCTIONS:
${prompt}

${materialContext ? `REFERENCE MATERIALS:\n${materialContext}` : "No reference materials provided - generate questions based on the instructor's topic description."}

${regenerateQuestion ? `
REGENERATE THIS QUESTION (create a new version with different phrasing):
${JSON.stringify(regenerateQuestion)}
` : ""}

Generate exactly ${questionCount} questions following the instructor's instructions. Return only the JSON array.`;

    // Call Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    console.log(`Generating ${questionCount} ${questionFormat} questions with difficulty: ${difficulty}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content || "";
    
    console.log("AI response received, parsing...");

    // Parse the JSON response
    let questions = [];
    try {
      // Extract JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON array found in response");
      }
    } catch (parseError) {
      console.error("JSON parse error:", parseError, "Content:", content.slice(0, 500));
      throw new Error("Failed to parse AI response as valid JSON");
    }

    // Validate questions
    questions = questions.filter((q: any) => 
      q.question_text && 
      q.question_type && 
      q.correct_answer
    ).map((q: any) => ({
      question_text: q.question_text,
      question_type: q.question_type || "multiple_choice",
      options: Array.isArray(q.options) ? q.options : [],
      correct_answer: q.correct_answer,
      explanation: q.explanation || "",
    }));

    console.log(`Successfully generated ${questions.length} valid questions`);

    return new Response(JSON.stringify({ questions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in generate-studio-questions:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
