import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { callClaude } from "../_shared/anthropic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

interface RequestBody {
  question_text: string;
  source_transcript?: string;
  prior_context?: string;
  style?: "simple" | "full";
  language?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

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

    const body = (await req.json()) as RequestBody;
    const questionText = (body.question_text || "").trim();
    if (!questionText) {
      return new Response(
        JSON.stringify({ error: "question_text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const style: "simple" | "full" = body.style === "full" ? "full" : "simple";

    // Resolve preferred language from profile when not supplied.
    let language = (body.language || "").toLowerCase().trim();
    if (!language) {
      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("preferred_programming_language")
        .eq("id", user.id)
        .single();
      language =
        (profile?.preferred_programming_language as string)?.toLowerCase() ||
        "python";
    }

    const broadContext = (body.source_transcript || "").slice(-6000).trim();
    const focusedContext = (body.prior_context || "").trim();
    const teachingContextBlock = [
      focusedContext
        ? `[MOST RECENT TEACHING — IMMEDIATELY BEFORE THE QUESTION]\n"${focusedContext}"`
        : "",
      broadContext
        ? `[EARLIER LECTURE HISTORY]\n"${broadContext}"`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    console.log(
      `🔧 generate-coding-preview style=${style} lang=${language} q="${questionText.slice(0, 80)}"`
    );

    // ─────────────────────────────────────────────────────────────────────
    // SIMPLE: short conceptual reference answer (used as grading reference
    // by the auto-grader). Mirrors generate-expected-answer but biased to
    // coding-style responses (1-3 lines of code or a brief concept).
    // ─────────────────────────────────────────────────────────────────────
    if (style === "simple") {
      const response = await callClaude({
        messages: [
          {
            role: "system",
            content: `You generate a concise reference answer for a SIMPLE coding check-in (quick conceptual question, not a full LeetCode problem). The answer must be in ${language} where applicable. Keep it to 1-5 short lines of code OR a 1-2 sentence conceptual answer. This is used as a grading reference for lenient, concept-focused auto-grading. Resolve any pronouns in the question using the teaching context first.`,
          },
          {
            role: "user",
            content: `${
              teachingContextBlock
                ? `=== TEACHING CONTEXT ===\n${teachingContextBlock}\n\n`
                : ""
            }=== INSTRUCTOR'S QUESTION ===\n"${questionText}"\n\nGenerate the ideal short reference answer.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_simple_coding_answer",
              description:
                "Return a concise reference answer for a simple coding check-in",
              parameters: {
                type: "object",
                properties: {
                  expected_answer: {
                    type: "string",
                    description:
                      "Short reference answer (1-5 lines of code or 1-2 sentences)",
                  },
                },
                required: ["expected_answer"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "generate_simple_coding_answer" },
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("AI gateway error (simple):", response.status, errorText);
        throw new Error(`AI gateway error: ${response.status}`);
      }
      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (!toolCall) throw new Error("No tool call returned");
      const args = JSON.parse(toolCall.function.arguments);
      return new Response(
        JSON.stringify({
          style: "simple",
          expected_answer: args.expected_answer || "",
          language,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // FULL: LeetCode-style problem. Returns the field shape the on-deck
    // PreviewPanel renders and the same shape format-and-send-question
    // already understands (title/problemStatement/...).
    // ─────────────────────────────────────────────────────────────────────
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const prompt = `Based on the lecture content, create a LeetCode-style coding problem.

=== TEACHING CONTEXT (background — earlier in the lecture) ===
${teachingContextBlock || "(no transcript context)"}

=== INSTRUCTOR'S QUESTION/TOPIC ===
"${questionText}"

INSTRUCTIONS:
- Resolve any pronouns in the question using the teaching context.
- Generate the coding challenge grounded in the teaching context.
- Target language: ${language}.

Return ONLY valid JSON with this EXACT shape:
{
  "title": "Brief descriptive title (2-4 words)",
  "difficulty": "Easy" | "Medium" | "Hard",
  "problemStatement": "Clear comprehensive description (3-5 sentences)",
  "functionSignature": "language-correct function signature",
  "language": "${language}",
  "constraints": ["constraint 1", "Big-O expectation"],
  "examples": [
    {"input": "...", "output": "...", "explanation": "..."},
    {"input": "...", "output": "..."}
  ],
  "hints": ["hint 1", "hint 2"],
  "starterCode": "function template with parameters",
  "testCases": [
    {"input": "...", "expectedOutput": "..."},
    {"input": "...", "expectedOutput": "..."}
  ]
}`;

      const response = await callClaude({
        messages: [
          {
            role: "system",
            content:
              "You create LeetCode-style coding challenges grounded strictly in provided lecture content. Return ONLY valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw new Error("AI rate limit exceeded. Try again in a moment.");
        }
        if (response.status === 402) {
          throw new Error("AI credits exhausted. Add credits to your workspace.");
        }
        throw new Error(`AI API error: ${response.status} - ${errorText}`);
      }

      const aiResponse = await response.json();
      let content = aiResponse.choices[0].message.content as string;
      content = content
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("Failed to parse AI JSON");
        parsed = JSON.parse(match[0]);
      }

      return new Response(
        JSON.stringify({
          style: "full",
          title: parsed.title || "",
          difficulty: parsed.difficulty || "Medium",
          problemStatement: parsed.problemStatement || "",
          functionSignature: parsed.functionSignature || "",
          language: parsed.language || language,
          constraints: parsed.constraints || [],
          examples: parsed.examples || [],
          hints: parsed.hints || [],
          starterCode: parsed.starterCode || "",
          testCases: parsed.testCases || [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new Error("AI request timed out after 30 seconds");
      }
      throw err;
    }
  } catch (error: any) {
    console.error("generate-coding-preview error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate coding preview" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
