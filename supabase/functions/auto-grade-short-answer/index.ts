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

    const { studentAnswer, expectedAnswer, question } = await req.json();

    // Input validation for security
    if (!studentAnswer || typeof studentAnswer !== "string") {
      return new Response(JSON.stringify({ error: "studentAnswer must be a non-empty string" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!expectedAnswer || typeof expectedAnswer !== "string") {
      return new Response(JSON.stringify({ error: "expectedAnswer must be a non-empty string" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (question && typeof question !== "string") {
      return new Response(JSON.stringify({ error: "question must be a string" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Length validation to prevent resource exhaustion
    if (studentAnswer.length > 5000) {
      return new Response(JSON.stringify({ error: "studentAnswer exceeds maximum length of 5,000 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (expectedAnswer.length > 5000) {
      return new Response(JSON.stringify({ error: "expectedAnswer exceeds maximum length of 5,000 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (question && question.length > 1000) {
      return new Response(JSON.stringify({ error: "question exceeds maximum length of 1,000 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for control characters
    const hasInvalidChars = (text: string) => /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text);

    if (hasInvalidChars(studentAnswer)) {
      return new Response(JSON.stringify({ error: "studentAnswer contains invalid characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (hasInvalidChars(expectedAnswer)) {
      return new Response(JSON.stringify({ error: "expectedAnswer contains invalid characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (question && hasInvalidChars(question)) {
      return new Response(JSON.stringify({ error: "question contains invalid characters" }), {
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

    // Use AI to grade the short answer with component-based scoring
    const systemPrompt = `You are an expert educational grader with years of experience assessing student answers. Your goal is to fairly and accurately grade short answer responses using a structured component-based approach.

COMPONENT-BASED GRADING RUBRIC:

You will evaluate the answer across 4 components, each worth 0-25 points:

1. CONCEPTUAL UNDERSTANDING (0-25 points):
   - 22-25: Deep understanding of core concepts, can explain reasoning
   - 17-21: Solid grasp of main concepts with minor gaps
   - 12-16: Basic understanding but missing key connections
   - 7-11: Partial understanding with significant gaps
   - 0-6: Minimal or no understanding of concepts

2. ACCURACY (0-25 points):
   - 22-25: All information is correct and precise
   - 17-21: Mostly correct with minor inaccuracies
   - 12-16: Several correct points but notable errors
   - 7-11: More errors than correct information
   - 0-6: Mostly or entirely incorrect

3. COMPLETENESS (0-25 points):
   - 22-25: Addresses all key aspects of the question thoroughly
   - 17-21: Covers most key points with minor omissions
   - 12-16: Addresses some key points but missing several
   - 7-11: Incomplete coverage, missing major elements
   - 0-6: Barely addresses the question

4. APPLICATION (0-25 points):
   - 22-25: Excellent application of knowledge, clear reasoning
   - 17-21: Good application with minor logical gaps
   - 12-16: Basic application but lacks depth
   - 7-11: Weak application or flawed reasoning
   - 0-6: No meaningful application of concepts

GRADING GUIDELINES:
1. Evaluate each component independently and justify your scoring
2. Award generous partial credit for partially correct work
3. Accept different wording if the concept is conveyed correctly
4. Don't penalize spelling/grammar unless it changes meaning
5. For numerical answers, credit correct methodology even with calculation errors
6. Recognize correct information not in expected answer
7. Focus on understanding over memorization

TOTAL GRADE: Sum of all 4 components (0-100)

IMPORTANT: Be thorough and fair. Students deserve detailed feedback on each component.`;

    const userPrompt = `Question: ${question || "Not provided"}

Expected Answer: ${expectedAnswer}

Student's Answer: ${studentAnswer}

TASK: Evaluate this answer using the component-based rubric.

For each component, provide:
- A score (0-25)
- Brief justification for that score

Then provide overall constructive feedback that:
1. Acknowledges what the student demonstrated well in each component
2. Explains specific gaps or errors by component
3. Offers actionable suggestions for improvement`;

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
              name: "grade_answer",
              description: "Grade a student's short answer response using component-based scoring",
              parameters: {
                type: "object",
                properties: {
                  conceptual_understanding: {
                    type: "number",
                    description: "Score for conceptual understanding (0-25)",
                    minimum: 0,
                    maximum: 25,
                  },
                  accuracy: {
                    type: "number",
                    description: "Score for accuracy of information (0-25)",
                    minimum: 0,
                    maximum: 25,
                  },
                  completeness: {
                    type: "number",
                    description: "Score for completeness of answer (0-25)",
                    minimum: 0,
                    maximum: 25,
                  },
                  application: {
                    type: "number",
                    description: "Score for application of knowledge (0-25)",
                    minimum: 0,
                    maximum: 25,
                  },
                  total_grade: {
                    type: "number",
                    description: "Total grade (sum of all components, 0-100)",
                    minimum: 0,
                    maximum: 100,
                  },
                  feedback: {
                    type: "string",
                    description: "Constructive feedback explaining each component score and overall performance",
                  },
                },
                required: [
                  "conceptual_understanding",
                  "accuracy",
                  "completeness",
                  "application",
                  "total_grade",
                  "feedback",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "grade_answer" } },
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
      return new Response(JSON.stringify({ error: "Failed to grade answer. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== "grade_answer") {
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

    // Validate all component scores
    const components = ["conceptual_understanding", "accuracy", "completeness", "application"];
    for (const component of components) {
      const score = gradingResult[component];
      if (typeof score !== "number" || score < 0 || score > 25) {
        console.error(`Invalid ${component} score:`, score);
        return new Response(JSON.stringify({ error: "Invalid grading response. Please try again." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Validate total grade is between 0-100
    if (
      typeof gradingResult.total_grade !== "number" ||
      gradingResult.total_grade < 0 ||
      gradingResult.total_grade > 100
    ) {
      console.error("Invalid total_grade value:", gradingResult.total_grade);
      return new Response(JSON.stringify({ error: "Invalid grading response. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("✅ Auto-graded answer with components:", {
      total: gradingResult.total_grade,
      conceptual: gradingResult.conceptual_understanding,
      accuracy: gradingResult.accuracy,
      completeness: gradingResult.completeness,
      application: gradingResult.application,
    });

    // Return with backward-compatible 'grade' field plus new component scores
    const responseData = {
      grade: gradingResult.total_grade,
      feedback: gradingResult.feedback,
      components: {
        conceptual_understanding: gradingResult.conceptual_understanding,
        accuracy: gradingResult.accuracy,
        completeness: gradingResult.completeness,
        application: gradingResult.application,
      },
    };

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Auto-grading error:", error);
    return new Response(JSON.stringify({ error: "Failed to grade answer. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
