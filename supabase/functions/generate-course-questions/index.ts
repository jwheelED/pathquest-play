import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { courseTitle, courseTopics, difficulty = "intermediate" } = await req.json();

    // Input validation
    if (!courseTitle || typeof courseTitle !== "string" || courseTitle.length > 200) {
      return new Response(JSON.stringify({ error: "Invalid course title" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (courseTopics && (!Array.isArray(courseTopics) || courseTopics.length > 20)) {
      return new Response(JSON.stringify({ error: "Invalid course topics" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validDifficulties = ["beginner", "intermediate", "advanced"];
    if (difficulty && !validDifficulties.includes(difficulty.toLowerCase())) {
      return new Response(JSON.stringify({ error: "Invalid difficulty level" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build context about the course
    const topicsContext =
      courseTopics && courseTopics.length > 0 ? `The course covers these topics: ${courseTopics.join(", ")}.` : "";

    const systemPrompt = `You are an expert educator creating practice questions for students. Generate multiple-choice questions that are directly relevant to the course material.

Course: ${courseTitle}
${topicsContext}
Difficulty Level: ${difficulty}

Generate 5 high-quality practice questions that:
1. Are directly relevant to ${courseTitle}
2. Cover fundamental concepts from the course topics
3. Have 4 answer options each
4. RANDOMIZE which option is correct - don't always make the first option correct
5. Include clear explanations for the correct answer
6. Include explanations for why each WRONG answer is incorrect
7. Are at ${difficulty} difficulty level
8. Keep problem_text concise and avoid code snippets with special characters

IMPORTANT: Return ONLY a valid JSON array, nothing else. No markdown, no code blocks, no explanations.

[
  {
    "subject": "${courseTitle}",
    "difficulty": "${difficulty}",
    "problem_text": "Clear, concise question text without code blocks",
    "options": ["Option 1 text", "Option 2 text", "Option 3 text", "Option 4 text"],
    "correct_answer": "Option X text (exact match to one of the options - randomize which one is correct)",
    "explanation": "Brief explanation of why this is correct",
    "wrong_answer_explanations": {
      "Option 1 text": "Why this option is wrong (only include if it's NOT the correct answer)",
      "Option 2 text": "Why this option is wrong (only include if it's NOT the correct answer)",
      "Option 3 text": "Why this option is wrong (only include if it's NOT the correct answer)"
    },
    "points_reward": 10
  }
]

Note: wrong_answer_explanations should only contain entries for incorrect options, NOT the correct answer.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Generate 5 practice questions for ${courseTitle}. ${topicsContext}` },
        ],
        temperature: 0.8,
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
        return new Response(JSON.stringify({ error: "AI service requires payment. Please contact support." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Failed to generate questions" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content in AI response");
      return new Response(JSON.stringify({ error: "Failed to generate questions" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract JSON from the response (handle markdown code blocks and clean up)
    let questionsJson = content.trim();

    // Remove markdown code blocks if present
    if (questionsJson.includes("```json")) {
      questionsJson = questionsJson.split("```json")[1].split("```")[0].trim();
    } else if (questionsJson.includes("```")) {
      questionsJson = questionsJson.split("```")[1].split("```")[0].trim();
    }

    // Remove any leading/trailing text that's not part of the JSON array
    const arrayStart = questionsJson.indexOf("[");
    const arrayEnd = questionsJson.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd !== -1) {
      questionsJson = questionsJson.substring(arrayStart, arrayEnd + 1);
    }

    let questions;
    try {
      questions = JSON.parse(questionsJson);
    } catch (parseError) {
      console.error("Failed to parse AI response. Raw content:", content);
      console.error("Extracted JSON:", questionsJson);
      console.error("Parse error:", parseError);
      return new Response(
        JSON.stringify({
          error: "Failed to parse generated questions",
          details: parseError instanceof Error ? parseError.message : "Unknown parse error",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate the questions structure
    if (!Array.isArray(questions) || questions.length === 0) {
      console.error("Invalid questions format:", questions);
      return new Response(JSON.stringify({ error: "Invalid questions format" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Add unique IDs to each question
    const questionsWithIds = questions.map((q: any, index: number) => ({
      id: `course-${Date.now()}-${index}`,
      ...q,
      subject: courseTitle,
      difficulty: difficulty,
    }));

    console.log(`Generated ${questionsWithIds.length} questions for ${courseTitle}`);

    return new Response(JSON.stringify({ questions: questionsWithIds }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in generate-course-questions:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
