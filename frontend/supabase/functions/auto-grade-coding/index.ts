import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

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
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { studentCode, expectedSolution, problemStatement, language, functionSignature } = await req.json();

    // Input validation
    if (!studentCode || typeof studentCode !== "string") {
      return new Response(JSON.stringify({ error: "studentCode must be a non-empty string" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!problemStatement || typeof problemStatement !== "string") {
      return new Response(JSON.stringify({ error: "problemStatement must be a non-empty string" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Length validation
    if (studentCode.length > 10000) {
      return new Response(JSON.stringify({ error: "studentCode exceeds maximum length of 10,000 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ error: "Grading service temporarily unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lenient AI-based grading focused on CONCEPTUAL UNDERSTANDING
    const systemPrompt = `You are a LENIENT coding grader focused on CONCEPTUAL UNDERSTANDING, not strict correctness.

GRADING PHILOSOPHY:
- Your PRIMARY goal is to determine if the student UNDERSTANDS THE CONCEPT/ALGORITHM
- If the student demonstrates they understand the approach, award FULL MARKS (100%)
- Minor syntax errors, off-by-one errors, typos, or small bugs should NOT significantly reduce the grade
- Focus on: "Did they get the right idea?" NOT "Does it compile and run perfectly?"

AWARD 100% IF:
- The algorithmic approach is correct (e.g., uses the right data structure, correct algorithm choice)
- The logic flow demonstrates understanding of the problem
- Minor bugs, syntax errors, or edge case issues don't obscure the core concept
- The student clearly knows HOW to solve the problem even if implementation has small issues

COMPONENT-BASED GRADING (more lenient than traditional grading):

1. ALGORITHMIC UNDERSTANDING (50 points) - THE MOST IMPORTANT:
   - 45-50: Correct algorithm/approach (even with minor implementation issues) = FULL MARKS
   - 35-44: Mostly correct approach with some conceptual gaps
   - 20-34: Partially correct approach, missing key insights
   - 0-19: Wrong approach or no meaningful attempt

2. LOGIC CORRECTNESS (30 points):
   - 27-30: Logic is sound (even if syntax has minor errors) = FULL MARKS
   - 20-26: Good logic with some flaws
   - 10-19: Partial logic, significant gaps
   - 0-9: Incorrect or no logic

3. CODE QUALITY (10 points):
   - 8-10: Readable, reasonable structure
   - 5-7: Acceptable quality
   - 0-4: Poor quality but still evaluable

4. EDGE CASE AWARENESS (10 points):
   - 8-10: Shows awareness of edge cases (even if not perfectly handled)
   - 4-7: Some edge case consideration
   - 0-3: No edge case handling

TOTAL: Sum of all components (0-100)

CRITICAL RULES:
1. A student who uses the RIGHT ALGORITHM but has syntax errors → 90-100%
2. A student who has the RIGHT LOGIC but off-by-one error → 90-100%
3. A student who UNDERSTANDS the concept but forgot a semicolon → 95-100%
4. Only significantly reduce grade if the APPROACH/ALGORITHM is fundamentally wrong`;

    const userPrompt = `Problem Statement: ${problemStatement}
${functionSignature ? `\nExpected Function Signature: ${functionSignature}` : ""}
${language ? `\nLanguage: ${language}` : ""}
${expectedSolution ? `\nReference Solution (for comparison only):\n${expectedSolution}` : ""}

Student's Code:
\`\`\`
${studentCode}
\`\`\`

TASK: Grade this code with a focus on CONCEPTUAL UNDERSTANDING, being LENIENT with minor errors.

For each component, provide a score and brief justification:
1. Algorithmic Understanding (0-50): Does the student use the correct approach?
2. Logic Correctness (0-30): Is the logic sound even with minor errors?
3. Code Quality (0-10): Is it readable and structured?
4. Edge Case Awareness (0-10): Any consideration for edge cases?

Remember: If the student clearly understands the concept, award full or near-full marks!`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        tools: [
          {
            type: "function",
            function: {
              name: "grade_coding",
              description: "Grade a student's coding solution with lenient, concept-focused scoring",
              parameters: {
                type: "object",
                properties: {
                  algorithmic_understanding: {
                    type: "number",
                    description: "Score for algorithmic understanding (0-50)",
                    minimum: 0,
                    maximum: 50,
                  },
                  logic_correctness: {
                    type: "number",
                    description: "Score for logic correctness (0-30)",
                    minimum: 0,
                    maximum: 30,
                  },
                  code_quality: {
                    type: "number",
                    description: "Score for code quality (0-10)",
                    minimum: 0,
                    maximum: 10,
                  },
                  edge_case_awareness: {
                    type: "number",
                    description: "Score for edge case awareness (0-10)",
                    minimum: 0,
                    maximum: 10,
                  },
                  total_grade: {
                    type: "number",
                    description: "Total grade (sum of all components, 0-100)",
                    minimum: 0,
                    maximum: 100,
                  },
                  understands_concept: {
                    type: "boolean",
                    description: "Does the student clearly understand the core concept/algorithm?",
                  },
                  feedback: {
                    type: "string",
                    description: "Constructive feedback focused on what the student did well and specific areas for improvement",
                  },
                },
                required: [
                  "algorithmic_understanding",
                  "logic_correctness",
                  "code_quality",
                  "edge_case_awareness",
                  "total_grade",
                  "understands_concept",
                  "feedback",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "grade_coding" } },
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI API error:", errorText);
      return new Response(JSON.stringify({ error: "Failed to grade code. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== "grade_coding") {
      console.error("No tool call in AI response:", result);
      return new Response(JSON.stringify({ error: "Invalid grading response. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let gradingResult;
    try {
      gradingResult = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool call arguments:", toolCall.function.arguments);
      return new Response(JSON.stringify({ error: "Invalid grading response. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If student understands the concept, ensure they get at least 90%
    let finalGrade = gradingResult.total_grade;
    if (gradingResult.understands_concept && finalGrade < 90) {
      console.log(`📈 Boosting grade from ${finalGrade} to 90+ (student understands concept)`);
      finalGrade = Math.max(finalGrade, 90);
    }

    // Validate total grade is between 0-100
    if (typeof finalGrade !== "number" || finalGrade < 0 || finalGrade > 100) {
      console.error("Invalid total_grade value:", finalGrade);
      return new Response(JSON.stringify({ error: "Invalid grading response. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("✅ Auto-graded coding with lenient approach:", {
      total: finalGrade,
      algorithmic: gradingResult.algorithmic_understanding,
      logic: gradingResult.logic_correctness,
      quality: gradingResult.code_quality,
      edgeCases: gradingResult.edge_case_awareness,
      understandsConcept: gradingResult.understands_concept,
    });

    const responseData = {
      grade: finalGrade,
      feedback: gradingResult.feedback,
      understands_concept: gradingResult.understands_concept,
      components: {
        algorithmic_understanding: gradingResult.algorithmic_understanding,
        logic_correctness: gradingResult.logic_correctness,
        code_quality: gradingResult.code_quality,
        edge_case_awareness: gradingResult.edge_case_awareness,
      },
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Auto-grading coding error:", error);
    return new Response(JSON.stringify({ error: "Failed to grade code. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
