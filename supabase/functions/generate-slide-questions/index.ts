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

    const results: Array<{ slide_number: number; success: boolean; error?: string }> = [];

    // Process each slide
    for (const slide of slides) {
      try {
        console.log(`📋 Generating question for slide ${slide.number}`);

        const prompt = `You are analyzing a lecture slide image. Your job is to determine if this slide has enough educational content to generate a question, and if so, generate ONE high-quality question.

SKIP slides that are: title slides, table of contents, "thank you" slides, transition slides, or slides with only images/logos and no educational text.

Difficulty level: ${difficulty}

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

If the slide has meaningful educational content, generate a multiple choice question.

For graphs, charts, diagrams:
- Read axis labels, data points, trends
- Generate questions testing understanding of the visual data

Return ONLY valid JSON in one of these formats:

If question can be generated:
{
  "found": true,
  "questionType": "mcq",
  "question": "Clear, specific question based on slide content (plain Unicode math, no LaTeX)",
  "options": ["A. First option", "B. Second option", "C. Third option", "D. Fourth option"],
  "correctAnswer": "A",
  "explanation": "Brief explanation of the correct answer",
  "difficulty": "${difficulty}"
}

If slide should be skipped:
{"found": false, "reason": "title slide" }

Return ONLY valid JSON.`;

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

        // Build question_content in the same shape as ExtractedQuestionData
        const questionType = parsed.questionType || "mcq";
        let questionContent: Record<string, unknown> = {};

        if (questionType === "mcq") {
          questionContent = {
            mcq: {
              question: parsed.question || "",
              options: parsed.options || ["", "", "", ""],
              correct_answer: parsed.correctAnswer || "A",
              explanation: parsed.explanation || "",
            },
          };
        } else if (questionType === "short_answer") {
          questionContent = {
            short_answer: {
              question: parsed.question || "",
              expected_answer: parsed.expectedAnswer || "",
              explanation: parsed.explanation || "",
            },
          };
        }

        // Insert into appropriate table based on target
        const questionName = `Slide ${slide.number} Question`;
        let insertError;

        if (target === "question_bank") {
          // Insert into instructor_question_bank
          // Flatten question_content for bank format
          const bankContent: Record<string, unknown> = {};
          if (questionType === "mcq" && questionContent.mcq) {
            bankContent.question = (questionContent.mcq as Record<string, unknown>).question;
            bankContent.options = (questionContent.mcq as Record<string, unknown>).options;
            bankContent.correctAnswer = (questionContent.mcq as Record<string, unknown>).correct_answer;
            bankContent.explanation = (questionContent.mcq as Record<string, unknown>).explanation;
          } else if (questionType === "short_answer" && questionContent.short_answer) {
            bankContent.question = (questionContent.short_answer as Record<string, unknown>).question;
            bankContent.expectedAnswer = (questionContent.short_answer as Record<string, unknown>).expected_answer;
            bankContent.explanation = (questionContent.short_answer as Record<string, unknown>).explanation;
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
          // Legacy: insert into slide_preset_questions
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
              order_index: 0,
              generation_source: "auto",
              org_id: orgId,
              course_id: course_id || null,
            });
          insertError = error;
        }

        if (insertError) {
          console.error(`DB insert error for slide ${slide.number}:`, insertError);
          results.push({ slide_number: slide.number, success: false, error: insertError.message });
          continue;
        }

        console.log(`✅ Question generated for slide ${slide.number}`);
        results.push({ slide_number: slide.number, success: true });

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
