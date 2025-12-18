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

    const { 
      mode, // "transform" or "generate" (default)
      prompt, 
      parsedMaterials, 
      instructorPreferences, 
      regenerateQuestion, 
      count,
      existingQuestions, // For transform mode
      lectureTranscript, // Full transcript for context
    } = await req.json();

    if (!prompt || prompt.length < 10) {
      return new Response(JSON.stringify({ error: "Please provide detailed instructions" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const difficulty = instructorPreferences?.difficulty || "medium";
    const professorType = instructorPreferences?.professorType || "stem";
    const questionFormat = instructorPreferences?.questionFormat || "multiple_choice";
    
    // Transform mode: modify existing questions while staying grounded in transcript
    if (mode === "transform" && existingQuestions && existingQuestions.length > 0) {
      const transformedQuestions = await transformQuestions({
        existingQuestions,
        lectureTranscript,
        stylePrompt: prompt,
        difficulty,
        professorType,
        questionFormat,
      });
      
      return new Response(JSON.stringify({ questions: transformedQuestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate mode: create new questions from materials/prompt
    const questionCount = count || 5;

    // Build context from uploaded materials
    let materialContext = "";
    if (parsedMaterials && parsedMaterials.length > 0) {
      materialContext = parsedMaterials
        .map((m: { filename: string; content: string }) => `--- ${m.filename} ---\n${m.content.slice(0, 8000)}`)
        .join("\n\n");
    }

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

// Transform existing questions while staying grounded in transcript context
async function transformQuestions({
  existingQuestions,
  lectureTranscript,
  stylePrompt,
  difficulty,
  professorType,
  questionFormat,
}: {
  existingQuestions: any[];
  lectureTranscript: string;
  stylePrompt: string;
  difficulty: string;
  professorType: string;
  questionFormat: string;
}) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  // Build questions with their transcript context
  const questionsForTransform = existingQuestions.map((q, idx) => ({
    index: idx + 1,
    original_question: q.question_text,
    original_options: q.options || [],
    original_answer: q.correct_answer,
    transcript_context: q.transcriptContext || "",
    timestamp: q.timestamp,
  }));

  const systemPrompt = `You are an expert educational content creator specializing in ${professorType === "medical" ? "medical education and USMLE-style" : "STEM"} question transformation.

Your task is to TRANSFORM existing questions into a new style while STRICTLY staying grounded in the lecture transcript content.

CRITICAL GROUNDING RULES:
1. ALL facts, concepts, answer options, and clinical details MUST come from the provided transcript context
2. You may NOT introduce ANY information not present in the transcript
3. The transformation changes STYLE/FORMAT/DIFFICULTY only - NOT the underlying factual content
4. Every answer option must be traceable to content in the transcript
5. If the transcript doesn't contain enough detail for the requested style, keep the question simpler

DIFFICULTY LEVEL: ${difficulty}
${difficulty === "easy" ? "Focus on recall and basic comprehension." : ""}
${difficulty === "medium" ? "Balance recall with application." : ""}
${difficulty === "hard" ? "Focus on application, analysis, and clinical reasoning." : ""}

${professorType === "medical" ? `
MEDICAL TRANSFORMATION GUIDELINES:
- Transform into clinical vignette format when requested
- Patient details (age, sex, symptoms) must be derived from transcript mentions
- Clinical findings must reference actual lecture content
- Treatment options must reflect what was discussed
` : `
STEM TRANSFORMATION GUIDELINES:
- Focus on conceptual understanding from the lecture
- Use examples and scenarios mentioned in the lecture
- Reference specific terminology from the transcript
`}

RESPONSE FORMAT:
Return a JSON array with EXACTLY ${existingQuestions.length} transformed questions in the same order. Each must have:
{
  "question_text": "The transformed question text",
  "question_type": "${questionFormat === "short_answer" ? "short_answer" : "multiple_choice"}",
  ${questionFormat !== "short_answer" ? `"options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "correct_answer": "A) ...",` : `"options": [],
  "correct_answer": "Expected answer",`}
  "explanation": "Brief explanation grounded in lecture content"
}

Return ONLY the JSON array, no additional text.`;

  const userPrompt = `INSTRUCTOR'S TRANSFORMATION REQUEST:
"${stylePrompt}"

FULL LECTURE TRANSCRIPT (for reference):
${lectureTranscript.slice(0, 15000)}

QUESTIONS TO TRANSFORM:
${questionsForTransform.map(q => `
---
Question ${q.index} (at ${q.timestamp ? Math.floor(q.timestamp / 60) + ":" + String(Math.floor(q.timestamp % 60)).padStart(2, "0") : "unknown time"}):
Original: "${q.original_question}"
${q.original_options.length > 0 ? `Options: ${q.original_options.join(" | ")}` : ""}
Answer: "${q.original_answer}"

TRANSCRIPT CONTEXT UP TO THIS POINT:
${q.transcript_context.slice(-3000) || "No transcript context available"}
---`).join("\n")}

Transform ALL ${existingQuestions.length} questions according to the instructor's style request. REMEMBER: Every detail must come from the transcript - do not add external knowledge.`;

  console.log(`Transforming ${existingQuestions.length} questions with style: ${stylePrompt.slice(0, 100)}`);

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
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Transform API error:", response.status, errorText);
    
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }
    if (response.status === 402) {
      throw new Error("AI credits exhausted. Please add funds.");
    }
    throw new Error(`AI API error: ${response.status}`);
  }

  const aiResponse = await response.json();
  const content = aiResponse.choices?.[0]?.message?.content || "";
  
  console.log("Transform response received, parsing...");

  // Parse the JSON response
  let questions = [];
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      questions = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("No JSON array found in response");
    }
  } catch (parseError) {
    console.error("JSON parse error:", parseError, "Content:", content.slice(0, 500));
    throw new Error("Failed to parse transformed questions");
  }

  // Validate and clean questions
  questions = questions.filter((q: any) => 
    q.question_text && 
    q.correct_answer
  ).map((q: any) => ({
    question_text: q.question_text,
    question_type: q.question_type || "multiple_choice",
    options: Array.isArray(q.options) ? q.options : [],
    correct_answer: q.correct_answer,
    explanation: q.explanation || "",
  }));

  console.log(`Successfully transformed ${questions.length} questions`);

  return questions;
}
