import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { materialId, userId, difficulty = "intermediate", questionCount = 5 } = await req.json();

    if (!materialId || !userId) {
      return new Response(JSON.stringify({ error: "Material ID and User ID are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // First, parse the material if not already done
    const parseResponse = await supabase.functions.invoke("parse-student-material", {
      body: { materialId },
    });

    if (parseResponse.error) {
      throw new Error(`Failed to parse material: ${parseResponse.error.message}`);
    }

    const { parsedContent, contentType } = parseResponse.data;

    if (!parsedContent || parsedContent.length < 50) {
      return new Response(JSON.stringify({ error: "Insufficient content to generate questions" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch material details for context
    const { data: material, error: materialError } = await supabase
      .from("student_study_materials")
      .select("title, description, subject_tags, questions_generated, instructor_id")
      .eq("id", materialId)
      .single();

    if (materialError) {
      throw new Error("Material not found");
    }

    // Generate questions using Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const systemPrompt = `You are an expert educational content creator. Generate ${questionCount} high-quality multiple-choice questions based on the provided study material. 

For each question:
1. Focus on key concepts and important information
2. Create clear, unambiguous questions
3. Provide 4 answer options (A, B, C, D)
4. Mark the correct answer
5. Provide a detailed explanation
6. Assign appropriate difficulty level (beginner/intermediate/advanced)
7. Extract relevant topic tags

Return ONLY a JSON array with this exact structure:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Option A",
    "explanation": "Detailed explanation of why this is correct and why others are wrong",
    "difficulty": "intermediate",
    "tags": ["topic1", "topic2"]
  }
]`;

    const userPrompt = `Material Title: ${material.title}
${material.description ? `Description: ${material.description}\n` : ""}
${material.subject_tags ? `Subject Tags: ${material.subject_tags.join(", ")}\n` : ""}
Content Type: ${contentType}
Target Difficulty: ${difficulty}

Study Material Content:
${parsedContent.substring(0, 15000)}

Generate ${questionCount} questions based on this material.`;

    console.log("Generating questions for material:", materialId);

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
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits depleted. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await aiResponse.text();
      console.error("AI generation error:", aiResponse.status, errorText);
      throw new Error("Failed to generate questions");
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices[0].message.content;

    // Parse the JSON response
    let questions;
    try {
      // Try to extract JSON array from the response
      const jsonMatch = aiContent.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON array found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", aiContent);
      throw new Error("Failed to parse AI response");
    }

    // Get user's org_id
    const { data: profileData } = await supabase.from("profiles").select("org_id").eq("id", userId).single();

    // Insert questions into database
    const questionsToInsert = questions.map((q: any) => ({
      user_id: userId,
      source_material_id: materialId,
      org_id: profileData?.org_id || null,
      instructor_id: material.instructor_id || null,
      question_text: q.question,
      question_type: "multiple_choice",
      options: q.options,
      correct_answer: q.correctAnswer,
      explanation: q.explanation,
      difficulty: q.difficulty || difficulty,
      topic_tags: q.tags || material.subject_tags || [],
      points_reward: q.difficulty === "advanced" ? 15 : q.difficulty === "intermediate" ? 10 : 5,
    }));

    const { data: insertedQuestions, error: insertError } = await supabase
      .from("personalized_questions")
      .insert(questionsToInsert)
      .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      throw new Error("Failed to save questions");
    }

    // Update material's questions_generated count
    await supabase
      .from("student_study_materials")
      .update({
        questions_generated: (material.questions_generated || 0) + questions.length,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", materialId);

    console.log(`Generated ${insertedQuestions.length} questions for material ${materialId}`);

    return new Response(
      JSON.stringify({
        success: true,
        questions: insertedQuestions,
        count: insertedQuestions.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: any) {
    console.error("Generation error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
