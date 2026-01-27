import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

// Fallback questions for when AI fails
const FALLBACK_QUESTIONS = [
  { question_text: "What was the main concept just discussed?", suggested_type: "short_answer" },
  { question_text: "Can you summarize the key point from the last few minutes?", suggested_type: "short_answer" },
  { question_text: "What is the most important takeaway from what was just covered?", suggested_type: "short_answer" },
];

const LONG_INTERVAL_FALLBACK_QUESTIONS = [
  { question_text: "What was the most important concept covered in the last section of the lecture?", suggested_type: "short_answer" },
  { question_text: "Summarize the main learning objective from the past segment.", suggested_type: "short_answer" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const {
      interval_transcript,
      interval_minutes,
      format_preference = "multiple_choice",
      coding_question_style = "simple",
      force_send = false,
      strict_mode = false,
      materialContext = [],
      slide_context = null,
      course_context = null,
    } = await req.json();

    console.log("📝 Generating interval question");
    console.log("  Transcript length:", interval_transcript?.length || 0);
    console.log("  Interval minutes:", interval_minutes);
    console.log("  Format preference:", format_preference);

    // Validate transcript
    if (!interval_transcript || interval_transcript.length < 50) {
      if (!force_send) {
        return new Response(JSON.stringify({
          success: false,
          error: "Not enough content to generate a question",
          error_type: "insufficient_content",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Trim transcript for AI processing (max 8000 chars)
    const trimmedTranscript = interval_transcript.slice(-8000);

    // Build context for AI
    let additionalContext = "";
    if (materialContext && materialContext.length > 0) {
      additionalContext += "\n\nCourse Materials Context:\n";
      for (const material of materialContext.slice(0, 2)) {
        additionalContext += `- ${material.title}: ${material.content?.slice(0, 500) || ""}\n`;
      }
    }
    if (slide_context) {
      additionalContext += `\n\nCurrent Slide: ${slide_context}\n`;
    }

    // Long interval guidance
    const longIntervalGuidance = interval_minutes >= 20
      ? `\n⚠️ LONG INTERVAL (${interval_minutes} min): Focus on THE SINGLE MOST IMPORTANT concept. Prioritize topics that were emphasized or repeated.`
      : "";

    // Build prompt based on format preference
    let formatInstructions = "";
    if (format_preference === "coding") {
      formatInstructions = coding_question_style === "simple"
        ? `Generate a simple coding fill-in-the-blank question with ONE missing line.`
        : `Generate a complete coding problem with starter code and test cases.`;
    } else if (format_preference === "short_answer") {
      formatInstructions = `Generate an open-ended short answer question that tests understanding.`;
    } else {
      formatInstructions = `Generate a multiple choice question with 4 options, one correct answer.`;
    }

    const systemPrompt = `You are an expert educational AI that generates high-quality check-in questions from lecture transcripts.
${longIntervalGuidance}

${formatInstructions}

Return JSON in this exact format:
{
  "question_text": "the question (use LaTeX $...$ for math)",
  "suggested_type": "${format_preference}",
  "confidence": 0.0-1.0,
  "reasoning": "why this question tests the key concept"
}

For multiple_choice, also include:
- "options": ["A. ...", "B. ...", "C. ...", "D. ..."]
- "correct_answer": "A" | "B" | "C" | "D"
- "explanation": "why the correct answer is right"

For coding questions:
- "question_text": { "title": "...", "description": "...", "starterCode": "...", "language": "python" | "javascript" }`;

    const userPrompt = `Generate a question from this lecture content:

"""
${trimmedTranscript}
"""
${additionalContext}

Generate ONE focused question that tests understanding of the most important concept just taught.`;

    // Call AI
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
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
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error("AI API error:", response.status);
        // Use fallback
        const fallback = interval_minutes >= 20
          ? LONG_INTERVAL_FALLBACK_QUESTIONS[Math.floor(Math.random() * LONG_INTERVAL_FALLBACK_QUESTIONS.length)]
          : FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
        
        return new Response(JSON.stringify({
          success: true,
          ...fallback,
          confidence: 0.5,
          is_fallback: true,
          reasoning: "AI service unavailable, using fallback question",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiResponse = await response.json();
      let content = aiResponse.choices[0].message.content;

      // Parse JSON response
      content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(content);

      console.log("✅ Question generated:", parsed.question_text?.substring?.(0, 100) || parsed.question_text?.title);

      return new Response(JSON.stringify({
        success: true,
        question_text: parsed.question_text,
        suggested_type: parsed.suggested_type || format_preference,
        confidence: parsed.confidence || 0.8,
        options: parsed.options,
        correct_answer: parsed.correct_answer,
        explanation: parsed.explanation,
        reasoning: parsed.reasoning,
        is_fallback: false,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (aiError: any) {
      clearTimeout(timeoutId);
      console.error("AI error:", aiError);

      // Use fallback on any AI error
      const fallback = interval_minutes >= 20
        ? LONG_INTERVAL_FALLBACK_QUESTIONS[Math.floor(Math.random() * LONG_INTERVAL_FALLBACK_QUESTIONS.length)]
        : FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];

      return new Response(JSON.stringify({
        success: true,
        ...fallback,
        confidence: 0.5,
        is_fallback: true,
        reasoning: `AI error: ${aiError.message}, using fallback`,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (error: any) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
