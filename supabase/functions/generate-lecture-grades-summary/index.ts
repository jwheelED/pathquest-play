import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { lectureId, lectureTitle, studentProgress, pausePoints } = await req.json();

    if (!lectureId || !studentProgress) {
      return new Response(
        JSON.stringify({ error: "lectureId and studentProgress are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build a summary of student performance data
    const totalStudents = studentProgress.length;
    const completedStudents = studentProgress.filter(
      (p: { completed_at: string | null }) => p.completed_at
    ).length;

    // Aggregate question-level performance
    const questionStats: Record<string, { correct: number; incorrect: number; total: number }> = {};

    for (const progress of studentProgress) {
      const responses =
        typeof progress.responses === "string"
          ? JSON.parse(progress.responses)
          : progress.responses || {};

      for (const [questionId, resp] of Object.entries(responses)) {
        if (!questionStats[questionId]) {
          questionStats[questionId] = { correct: 0, incorrect: 0, total: 0 };
        }
        questionStats[questionId].total++;
        const response = resp as { correct?: boolean; grade?: number };
        if (response.correct || (response.grade && response.grade >= 70)) {
          questionStats[questionId].correct++;
        } else {
          questionStats[questionId].incorrect++;
        }
      }
    }

    // Map question IDs to question text
    const questionSummaries = (pausePoints || []).map(
      (pp: { id: string; question_content: { question: string }; order_index: number }) => {
        const stats = questionStats[pp.id] || { correct: 0, incorrect: 0, total: 0 };
        const content =
          typeof pp.question_content === "string"
            ? JSON.parse(pp.question_content)
            : pp.question_content;
        return {
          questionNumber: pp.order_index + 1,
          question: content.question,
          correctRate:
            stats.total > 0
              ? Math.round((stats.correct / stats.total) * 100)
              : 0,
          totalResponses: stats.total,
        };
      }
    );

    const dataContext = `Lecture: "${lectureTitle}"
Total students: ${totalStudents}
Completed: ${completedStudents}
Completion rate: ${totalStudents > 0 ? Math.round((completedStudents / totalStudents) * 100) : 0}%

Question Performance:
${questionSummaries
  .map(
    (q: { questionNumber: number; question: string; correctRate: number; totalResponses: number }) =>
      `Q${q.questionNumber}: "${q.question}" - ${q.correctRate}% correct (${q.totalResponses} responses)`
  )
  .join("\n")}`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash",
          messages: [
            {
              role: "system",
              content: `You are an educational analytics assistant. Generate a concise, actionable performance summary for an instructor based on student data from a pre-recorded lecture.

Include:
1. Overall performance overview (1-2 sentences)
2. Questions students struggled with most (highlight any below 60% correct rate)
3. Questions students excelled at
4. Actionable recommendations (2-3 bullet points)

Use markdown formatting. Be concise and data-driven.`,
            },
            {
              role: "user",
              content: dataContext,
            },
          ],
          temperature: 0.3,
          max_tokens: 1000,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI generation failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const summary =
      result.choices?.[0]?.message?.content || "Unable to generate summary.";

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Grade summary generation error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
