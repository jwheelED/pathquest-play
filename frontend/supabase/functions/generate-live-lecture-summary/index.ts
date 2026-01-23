import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckInResult {
  id: string;
  question: string;
  student_id: string;
  is_correct: boolean;
  grade?: number;
  content?: string;
}

interface LectureSummaryRequest {
  transcript_chunks: string[];
  recording_duration_seconds: number;
  check_in_results: CheckInResult[];
  questions_asked: number;
  course_type?: "stem" | "humanities";
}

interface TranscriptInsights {
  avgPaceWPM: number;
  topicsCovered: string[];
  complexSections: Array<{ timestamp: string; topic: string }>;
  coverageGaps?: string[];
}

interface StudentInsights {
  overallAccuracy: number;
  totalResponses: number;
  strugglingQuestions: Array<{ question: string; accuracy: number }>;
  commonMisconceptions: string[];
  sentiment?: string;
}

interface LectureSummary {
  overallScore: number;
  summary: string;
  transcriptInsights: TranscriptInsights;
  studentInsights: StudentInsights;
  recommendations: string[];
  reteachingSuggestions: Array<{ topic: string; reason: string }>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: LectureSummaryRequest = await req.json();
    const {
      transcript_chunks,
      recording_duration_seconds,
      check_in_results,
      questions_asked,
      course_type = "stem",
    } = body;

    console.log("📊 Generating lecture summary:", {
      transcriptChunks: transcript_chunks.length,
      durationSeconds: recording_duration_seconds,
      checkInsCount: check_in_results.length,
      questionsAsked: questions_asked,
      courseType: course_type,
    });

    // Combine transcript chunks
    const fullTranscript = transcript_chunks.join(" ").trim();
    const wordCount = fullTranscript.split(/\s+/).filter((w) => w.length > 0).length;
    const durationMinutes = recording_duration_seconds / 60;
    const avgWPM = durationMinutes > 0 ? Math.round(wordCount / durationMinutes) : 0;

    // Calculate student performance metrics
    const totalResponses = check_in_results.length;
    const correctResponses = check_in_results.filter((r) => r.is_correct).length;
    const overallAccuracy = totalResponses > 0 ? Math.round((correctResponses / totalResponses) * 100) : 0;

    // Group responses by question to find struggling areas
    const questionStats: Map<string, { total: number; correct: number; question: string }> = new Map();
    for (const result of check_in_results) {
      const key = result.question || result.id;
      const existing = questionStats.get(key) || {
        total: 0,
        correct: 0,
        question: result.question || "Unknown question",
      };
      existing.total++;
      if (result.is_correct) existing.correct++;
      questionStats.set(key, existing);
    }

    const strugglingQuestions = Array.from(questionStats.entries())
      .map(([_, stats]) => ({
        question: stats.question.substring(0, 100),
        accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      }))
      .filter((q) => q.accuracy < 70)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    // Prepare AI prompt for deeper analysis
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Truncate transcript for API (keep last ~8000 chars for context)
    const truncatedTranscript = fullTranscript.length > 8000 ? fullTranscript.slice(-8000) : fullTranscript;

    const systemPrompt = `You are an expert teaching coach analyzing a lecture. Provide actionable, specific feedback to help the instructor improve. Be encouraging but honest.

Your analysis should include:
1. Key topics covered (extract 3-5 main topics)
2. Potential student misconceptions based on the content
3. Specific, actionable teaching recommendations
4. Areas that might need re-teaching based on complexity

Consider the student check-in performance data when making recommendations.
Course type: ${course_type}`;

    const userPrompt = `Analyze this lecture recording:

## Metrics
- Duration: ${Math.round(durationMinutes)} minutes
- Speaking pace: ${avgWPM} words/minute (ideal: 120-150 WPM)
- Questions asked: ${questions_asked}
- Student accuracy: ${overallAccuracy}% (${correctResponses}/${totalResponses} correct)

## Struggling Questions (lowest accuracy)
${
  strugglingQuestions.length > 0
    ? strugglingQuestions.map((q) => `- "${q.question}..." - ${q.accuracy}% accuracy`).join("\n")
    : "No low-accuracy questions detected"
}

## Transcript Excerpt (most recent content)
${truncatedTranscript}

Provide your analysis as a JSON object with this structure:
{
  "overallScore": <1-10 rating>,
  "summary": "<2-3 sentence overview of the lecture>",
  "topicsCovered": ["topic1", "topic2", ...],
  "complexSections": [{"timestamp": "approximate time", "topic": "topic name"}],
  "commonMisconceptions": ["potential misconception 1", ...],
  "recommendations": ["specific action 1", "specific action 2", ...],
  "reteachingSuggestions": [{"topic": "topic name", "reason": "why it needs review"}],
  "sentiment": "${course_type === "humanities" ? "brief note on student engagement" : ""}"
}`;

    console.log("🤖 Calling AI for lecture analysis...");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);

      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || "";

    console.log("✅ AI response received, parsing...");

    // Parse AI response (handle potential JSON in markdown code blocks)
    let parsedAI: any;
    try {
      const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, aiContent];
      const jsonStr = jsonMatch[1].trim();
      parsedAI = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fallback to basic analysis
      parsedAI = {
        overallScore: 7,
        summary: "Lecture analysis completed. Review the metrics below for insights.",
        topicsCovered: [],
        complexSections: [],
        commonMisconceptions: [],
        recommendations: [
          "Continue monitoring student understanding through check-in questions",
          "Consider adjusting speaking pace based on content complexity",
        ],
        reteachingSuggestions: strugglingQuestions.map((q) => ({
          topic: q.question.substring(0, 50),
          reason: `Only ${q.accuracy}% of students answered correctly`,
        })),
      };
    }

    // Construct final summary
    const lectureSummary: LectureSummary = {
      overallScore: Math.min(10, Math.max(1, parsedAI.overallScore || 7)),
      summary: parsedAI.summary || "Lecture completed successfully.",
      transcriptInsights: {
        avgPaceWPM: avgWPM,
        topicsCovered: parsedAI.topicsCovered || [],
        complexSections: parsedAI.complexSections || [],
        coverageGaps: parsedAI.coverageGaps,
      },
      studentInsights: {
        overallAccuracy,
        totalResponses,
        strugglingQuestions,
        commonMisconceptions: parsedAI.commonMisconceptions || [],
        sentiment: parsedAI.sentiment,
      },
      recommendations: parsedAI.recommendations || [],
      reteachingSuggestions: parsedAI.reteachingSuggestions || [],
    };

    console.log("📊 Lecture summary generated:", {
      score: lectureSummary.overallScore,
      accuracy: overallAccuracy,
      topics: lectureSummary.transcriptInsights.topicsCovered.length,
      recommendations: lectureSummary.recommendations.length,
    });

    return new Response(JSON.stringify({ success: true, summary: lectureSummary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating lecture summary:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to generate summary" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
