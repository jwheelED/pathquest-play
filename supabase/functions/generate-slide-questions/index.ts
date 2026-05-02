import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaude } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify instructor role
    const { data: hasRole } = await supabase.rpc("has_role", { _role: "instructor", _user_id: user.id });
    if (!hasRole) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { material_id, slides, course_id, target, source_material_title } = await req.json();
    // slides: Array<{ number: number, image: string (data URL) }>
    // target: "question_bank" | "slide_preset" (default: "slide_preset" for backward compat)

    if (!material_id || !slides || !Array.isArray(slides) || slides.length === 0) {
      return new Response(JSON.stringify({ error: "material_id and slides array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get instructor's org_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, question_difficulty_preference")
      .eq("id", user.id)
      .single();

    const orgId = profile?.org_id || null;
    const difficulty = profile?.question_difficulty_preference || "medium";

    const results: Array<{ slide_number: number; success: boolean; questions_added?: number; error?: string }> = [];
    const MAX_QUESTIONS_PER_SLIDE = 8;

    // Process each slide
    for (const slide of slides) {
      try {
        console.log(`📋 Generating question for slide ${slide.number}`);

        const prompt = `You are analyzing a lecture slide image. Extract or generate ALL high-quality multiple choice questions present on this slide.

SKIP slides that are: title slides, table of contents, "thank you" slides, transition slides, or slides with only images/logos and no educational text.

EXTRACTION PRIORITY:
1. If the slide ALREADY contains one or more questions (e.g. numbered Q1, Q2, practice problems, quiz items), extract EVERY question VERBATIM. Preserve the original question text and answer choices exactly. Do not paraphrase. Cap at 8 questions per slide.
2. If the slide does NOT contain explicit questions but has meaningful educational content, GENERATE up to 2 multiple choice questions testing the key concepts.
3. If neither applies, mark the slide as skipped.

Difficulty level (for generated questions only): ${difficulty}

MATH FORMATTING - CRITICAL:
Do NOT use LaTeX syntax. No $, \\frac, \\int, {, }, or backslash commands.
Write all math as plain readable text using Unicode:
- Fractions: a/b, cos x / sin x (never \\frac)
- Integrals: ∫(a to b) f(x) dx
- Square roots: √x, √(x+1)
- Exponents: x², x³, e^(x²)
- Greek letters: π, θ, α, β
- Derivatives: d/dx, d²/dx², f'(x), dy/dx
- Limits: lim(h→0), lim(x→∞)
- Summation: Σ(n=1 to ∞) 1/n²
- Apply to the question AND all answer options
- Reproduce the EXACT notation from the slide using Unicode

For graphs, charts, diagrams: read axis labels, data points, trends and test understanding of the visual data.

DISTRACTOR RULES: All MCQ options must be plausible and realistic. NEVER use "None of the above", "All of the above", or "Not specified".

Return ONLY valid JSON in this exact format:

If one or more questions can be extracted/generated:
{
  "found": true,
  "questions": [
    {
      "questionType": "mcq",
      "question": "Clear, specific question (plain Unicode math, no LaTeX)",
      "options": ["A. First option", "B. Second option", "C. Third option", "D. Fourth option"],
      "correctAnswer": "A",
      "explanation": "Brief explanation",
      "source": "extracted" | "generated"
    }
  ]
}

If slide should be skipped:
{"found": false, "reason": "title slide"}

Hard cap: maximum 8 questions in the array. Return ONLY valid JSON.`;

        const response = await callClaude({
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: slide.image.startsWith("data:") ? slide.image : `data:image/jpeg;base64,${slide.image}`,
                  },
                },
              ],
            },
          ],
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`AI error for slide ${slide.number}:`, response.status, errorText);
          
          // Handle rate limiting
          if (response.status === 429) {
            results.push({ slide_number: slide.number, success: false, error: "Rate limited, try again later" });
            // Wait before next request
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          if (response.status === 402) {
            results.push({ slide_number: slide.number, success: false, error: "AI credits exhausted" });
            break; // Stop processing further slides
          }
          
          results.push({ slide_number: slide.number, success: false, error: `AI error: ${response.status}` });
          continue;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";

        // Parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          results.push({ slide_number: slide.number, success: false, error: "No JSON in AI response" });
          continue;
        }

        const parsed = JSON.parse(jsonMatch[0]);

        if (!parsed.found) {
          console.log(`⏭️ Slide ${slide.number} skipped: ${parsed.reason || "no content"}`);
          results.push({ slide_number: slide.number, success: false, error: "skipped" });
          continue;
        }

        // Backward compat: support both new {questions: [...]} and old single-question shape
        const rawQuestions: any[] = Array.isArray(parsed.questions)
          ? parsed.questions
          : (parsed.question || parsed.questionType)
            ? [{
                questionType: parsed.questionType || "mcq",
                question: parsed.question,
                options: parsed.options,
                correctAnswer: parsed.correctAnswer,
                expectedAnswer: parsed.expectedAnswer,
                explanation: parsed.explanation,
                source: "generated",
              }]
            : [];

        if (rawQuestions.length === 0) {
          results.push({ slide_number: slide.number, success: false, error: "no questions in AI response" });
          continue;
        }

        const cappedQuestions = rawQuestions.slice(0, MAX_QUESTIONS_PER_SLIDE);
        let addedForSlide = 0;
        let lastError: string | undefined;

        for (let qIdx = 0; qIdx < cappedQuestions.length; qIdx++) {
          const q = cappedQuestions[qIdx];
          const questionType = q.questionType || "mcq";
          let questionContent: Record<string, unknown> = {};

          if (questionType === "mcq") {
            questionContent = {
              mcq: {
                question: q.question || "",
                options: q.options || ["", "", "", ""],
                correct_answer: q.correctAnswer || "A",
                explanation: q.explanation || "",
              },
            };
          } else if (questionType === "short_answer") {
            questionContent = {
              short_answer: {
                question: q.question || "",
                expected_answer: q.expectedAnswer || "",
                explanation: q.explanation || "",
              },
            };
          }

          const questionName = cappedQuestions.length > 1
            ? `Slide ${slide.number} Question ${qIdx + 1}`
            : `Slide ${slide.number} Question`;
          let insertError;

          if (target === "question_bank") {
            const bankContent: Record<string, unknown> = {};
            if (questionType === "mcq" && questionContent.mcq) {
              const mcq = questionContent.mcq as Record<string, unknown>;
              bankContent.question = mcq.question;
              bankContent.options = mcq.options;
              bankContent.correctAnswer = mcq.correct_answer;
              bankContent.explanation = mcq.explanation;
            } else if (questionType === "short_answer" && questionContent.short_answer) {
              const sa = questionContent.short_answer as Record<string, unknown>;
              bankContent.question = sa.question;
              bankContent.expectedAnswer = sa.expected_answer;
              bankContent.explanation = sa.explanation;
            }

            const bankQuestionType = questionType === "mcq" ? "multiple_choice" : questionType;
            const { error } = await supabase
              .from("instructor_question_bank")
              .insert({
                instructor_id: user.id,
                title: questionName,
                question_type: bankQuestionType,
                question_content: bankContent,
                difficulty: difficulty,
                source_material_id: material_id,
                source_material_title: source_material_title || null,
                org_id: orgId,
                course_id: course_id || null,
              });
            insertError = error;
          } else {
            const { error } = await supabase
              .from("slide_preset_questions")
              .insert({
                material_id,
                instructor_id: user.id,
                slide_number: slide.number,
                question_type: questionType,
                question_content: questionContent,
                question_name: questionName,
                is_enabled: true,
                order_index: qIdx,
                generation_source: "auto",
                org_id: orgId,
                course_id: course_id || null,
              });
            insertError = error;
          }

          if (insertError) {
            console.error(`DB insert error for slide ${slide.number} q${qIdx + 1}:`, insertError);
            lastError = insertError.message;
            continue;
          }
          addedForSlide++;
        }

        if (addedForSlide === 0) {
          results.push({ slide_number: slide.number, success: false, error: lastError || "no questions inserted" });
          continue;
        }

        console.log(`✅ Slide ${slide.number}: ${addedForSlide} question(s) added`);
        results.push({ slide_number: slide.number, success: true, questions_added: addedForSlide });

        // Small delay between API calls to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));

      } catch (slideError) {
        console.error(`Error processing slide ${slide.number}:`, slideError);
        results.push({
          slide_number: slide.number,
          success: false,
          error: slideError instanceof Error ? slideError.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const skippedCount = results.filter(r => r.error === "skipped").length;

    return new Response(
      JSON.stringify({
        success: true,
        total_slides: slides.length,
        questions_generated: successCount,
        slides_skipped: skippedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in generate-slide-questions:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
