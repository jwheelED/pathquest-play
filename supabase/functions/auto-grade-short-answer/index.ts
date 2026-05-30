import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

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

    // Allow empty expectedAnswer - AI will infer from question context
    const effectiveExpectedAnswer = (expectedAnswer && typeof expectedAnswer === "string" && expectedAnswer.trim()) 
      ? expectedAnswer 
      : "(Evaluate based on question context - infer the correct answer from the question itself)";

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

    if (expectedAnswer && expectedAnswer.length > 5000) {
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

    if (expectedAnswer && hasInvalidChars(expectedAnswer)) {
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
    const systemPrompt = `You are an expert educational grader. Your goal is to fairly grade short answer responses. You should be GENEROUS with grading — if a student demonstrates understanding of the core concept, they should receive a high grade.

GRADING PHILOSOPHY:
- Focus on whether the student UNDERSTANDS the concept, not on perfect wording
- A correct answer with imperfect phrasing should still get 85-100%
- Accept synonyms, paraphrasing, and alternative valid explanations
- Only deduct significantly for factual errors or missing the core concept entirely
- Brief but correct answers are perfectly acceptable
- Don't penalize for brevity if the key idea is present

COMPONENT-BASED GRADING RUBRIC (4 components, 0-25 each):

1. CONCEPTUAL UNDERSTANDING (0-25):
   - 20-25: Student clearly understands the core concept (even if briefly stated)
   - 12-19: Partial understanding with some gaps
   - 0-11: Fundamental misunderstanding or irrelevant answer

2. ACCURACY (0-25):
   - 20-25: Information provided is correct (even if incomplete)
   - 12-19: Mostly correct with minor errors
   - 0-11: Significant factual errors

3. COMPLETENESS (0-25):
   - 20-25: Addresses the key point(s) of the question
   - 12-19: Addresses some aspects but misses important points
   - 0-11: Barely addresses the question

4. APPLICATION (0-25):
   - 20-25: Shows ability to apply/explain the concept
   - 12-19: Some application but lacks clarity
   - 0-11: No meaningful application

CRITICAL RULES:
- If the student's answer is essentially correct, the total grade MUST be 75 or higher
- If the answer captures the main idea accurately, grade 85+
- A perfect or near-perfect answer = 90-100
- Only give below 50 if the answer is wrong or completely off-topic
- Don't require textbook-perfect answers for high scores`;

    const userPrompt = `Question: ${question || "Not provided"}

Expected Answer: ${effectiveExpectedAnswer}

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
        model: "google/gemini-2.5-flash",
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
