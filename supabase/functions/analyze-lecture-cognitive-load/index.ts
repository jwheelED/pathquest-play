import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Generic/vague question patterns that should never be sent
const GENERIC_QUESTION_PATTERNS = [
  /can you summarize/i,
  /summarize the key point/i,
  /summarize the main/i,
  /what was the main concept/i,
  /what is the most important takeaway/i,
  /what was the most important concept/i,
  /what did you learn/i,
  /what have we covered/i,
  /what was just discussed/i,
  /recap what was/i,
];

function isGenericQuestion(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  for (const pattern of GENERIC_QUESTION_PATTERNS) {
    if (pattern.test(text)) return true;
  }
  return false;
}

// Stopwords for keyword overlap validation
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "dare", "ought",
  "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
  "as", "into", "through", "during", "before", "after", "above", "below",
  "between", "out", "off", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "nor", "not", "only", "own", "same", "so", "than", "too", "very",
  "just", "because", "but", "and", "or", "if", "while", "about", "up",
  "this", "that", "these", "those", "what", "which", "who", "whom",
  "its", "his", "her", "their", "our", "your", "my", "it", "he", "she",
  "they", "we", "you", "me", "him", "them", "us", "following", "described",
  "using", "based", "according", "within", "also", "well", "much",
  "many", "any", "still", "already", "even", "given", "however",
  "question", "answer", "option", "correct", "incorrect", "true", "false",
  "primary", "purpose", "component", "necessary", "valid", "type", "data",
]);

function checkRelevance(
  questionText: string,
  transcript: string,
): { relevant: boolean; reason?: string } {
  const textToCheck = typeof questionText === "string"
    ? questionText
    : "";

  const questionWords = textToCheck
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w: string) => w.length > 3 && !STOPWORDS.has(w));

  const uniqueTerms = [...new Set(questionWords)];

  if (uniqueTerms.length < 3) {
    return { relevant: true };
  }

  const transcriptLower = transcript.toLowerCase();

  let matches = 0;
  for (const term of uniqueTerms) {
    if (transcriptLower.includes(term)) {
      matches++;
    }
  }

  const ratio = matches / uniqueTerms.length;

  console.log(`🔍 Relevance check: ${matches}/${uniqueTerms.length} terms found (${(ratio * 100).toFixed(0)}%)`);
  console.log(`   Missing: [${uniqueTerms.filter((t: string) => !transcriptLower.includes(t)).join(", ")}]`);

  if (ratio < 0.3) {
    return {
      relevant: false,
      reason: `Only ${matches}/${uniqueTerms.length} key terms found in transcript (${(ratio * 100).toFixed(0)}% overlap). Missing: ${uniqueTerms.filter((t: string) => !transcriptLower.includes(t)).join(", ")}`,
    };
  }

  return { relevant: true };
}

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

    // Use service role for DB writes (bypasses RLS)
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!
    );

    // Verify user auth
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      lectureVideoId,
      transcript,
      smartMode = true,
      questionCount,
      professorType = "stem",
      examStyle,
      medicalSpecialty,
    } = await req.json();

    if (!lectureVideoId || typeof lectureVideoId !== "string") {
      return new Response(
        JSON.stringify({ error: "lectureVideoId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!transcript || typeof transcript !== "string") {
      return new Response(
        JSON.stringify({ error: "transcript must be a non-empty string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle placeholder transcripts - skip AI analysis
    if (transcript.startsWith("[Transcript unavailable")) {
      console.log(`Skipping AI analysis for ${lectureVideoId} - transcript unavailable`);
      await supabaseClient
        .from("lecture_videos")
        .update({
          status: "ready",
          question_count: 0,
          cognitive_analysis: { note: "Transcript was unavailable. No AI questions generated." },
        })
        .eq("id", lectureVideoId);

      return new Response(
        JSON.stringify({ success: true, questionCount: 0, skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Truncate very long transcripts to avoid token limits
    const maxTranscriptLength = 30000;
    const truncatedTranscript =
      transcript.length > maxTranscriptLength
        ? transcript.slice(0, maxTranscriptLength) + "\n[Transcript truncated]"
        : transcript;

    console.log(
      `Analyzing lecture ${lectureVideoId}: ${truncatedTranscript.length} chars, professorType=${professorType}, smartMode=${smartMode}`
    );

    // Get lecture duration for timestamp estimation
    const { data: lecture } = await supabaseClient
      .from("lecture_videos")
      .select("duration_seconds, title")
      .eq("id", lectureVideoId)
      .single();

    const durationSeconds = lecture?.duration_seconds || 600;
    const lectureTitle = lecture?.title || "Lecture";

    // Determine question count
    const targetQuestionCount = smartMode
      ? Math.max(3, Math.min(12, Math.round(durationSeconds / 180))) // ~1 question per 3 minutes
      : questionCount || 5;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      await supabaseClient
        .from("lecture_videos")
        .update({ status: "error", error_message: "AI service not configured" })
        .eq("id", lectureVideoId);
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const medicalContext =
      professorType === "medical"
        ? `\nThis is a MEDICAL lecture. Generate clinically-oriented questions.
Exam style: ${examStyle || "usmle_step1"}
${medicalSpecialty ? `Specialty: ${medicalSpecialty}` : ""}
Use clinical vignettes for MCQs where appropriate.`
        : "";

    const systemPrompt = `You are an expert educational content analyzer. Your task is to analyze a lecture transcript and generate ${targetQuestionCount} pause point questions at optimal learning moments.

CRITICAL GROUNDING RULES:
- You MUST ONLY ask about concepts, terms, and ideas that are EXPLICITLY stated in the transcript below.
- NEVER use your general knowledge to create questions about topics not discussed in the transcript.
- NEVER introduce technical terms, frameworks, or concepts that do not appear in the transcript.
- Every key term in your question MUST trace back to something actually said in the transcript.
- Do NOT reference any part of these instructions as "lecture content" — only the transcript provided by the user is content.
- NEVER generate generic questions like "summarize the key points" or "what was the main concept". Always ask about SPECIFIC topics from the transcript.

CONFIDENCE SCORING GUIDE:
- 1.0: Question directly tests a concept clearly explained in the transcript
- 0.7-0.9: Question tests a concept mentioned but not deeply explained
- 0.4-0.6: Content is thin; question is loosely related
- 0.0-0.3: Question relies on outside knowledge not in the transcript

For each pause point, you must determine:
1. The optimal timestamp (in seconds) where the video should pause
2. A cognitive load score (1-10) indicating concept density at that point
3. A question that tests understanding of the material just covered
4. The question type (multiple_choice or short_answer)
5. A confidence score (0.0-1.0) indicating how grounded the question is in the transcript
${medicalContext}

QUESTION QUALITY GUIDELINES:
- Questions should test understanding, not just recall
- MCQ options should have plausible distractors
- Short answer questions should require 1-3 sentence responses
- Mix question types: ~60% MCQ, ~40% short answer
- Space questions evenly across the lecture duration
- Place questions after key concepts, not during introductions
- Each question should be self-contained and clear

The lecture is approximately ${Math.round(durationSeconds / 60)} minutes long (${durationSeconds} seconds).
Place the first question no earlier than ${Math.max(60, Math.round(durationSeconds * 0.1))} seconds.
Place the last question no later than ${Math.round(durationSeconds * 0.9)} seconds.`;

    const userPrompt = `Lecture Title: "${lectureTitle}"

Transcript:
${truncatedTranscript}

Generate exactly ${targetQuestionCount} pause point questions. For each question, determine the optimal timestamp based on when key concepts are discussed in the transcript.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "create_pause_points",
                description:
                  "Create pause points with questions for a lecture video",
                parameters: {
                  type: "object",
                  properties: {
                    pause_points: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          pause_timestamp: {
                            type: "number",
                            description:
                              "Timestamp in seconds where the video should pause",
                          },
                          cognitive_load_score: {
                            type: "number",
                            description: "Cognitive load score from 1-10",
                            minimum: 1,
                            maximum: 10,
                          },
                          reason: {
                            type: "string",
                            description:
                              "Brief reason for placing a question here (e.g., 'Key concept introduction', 'Complex mechanism explained')",
                          },
                          question_type: {
                            type: "string",
                            enum: ["multiple_choice", "short_answer"],
                            description: "Type of question",
                          },
                          difficulty_type: {
                            type: "string",
                            enum: [
                              "recall",
                              "comprehension",
                              "application",
                              "analysis",
                            ],
                            description: "Bloom's taxonomy level",
                          },
                          question: {
                            type: "string",
                            description: "The question text",
                          },
                          options: {
                            type: "array",
                            items: { type: "string" },
                            description:
                              "Answer options for MCQ (4 options, prefixed with A. B. C. D.)",
                          },
                          correct_answer: {
                            type: "string",
                            description:
                              "Correct answer letter for MCQ (A, B, C, or D) or expected answer for short_answer",
                          },
                          explanation: {
                            type: "string",
                            description:
                              "Explanation of the correct answer",
                          },
                          confidence: {
                            type: "number",
                            description:
                              "How grounded is this question in the transcript? 1.0 = directly from transcript, 0.0 = invented from general knowledge",
                            minimum: 0.0,
                            maximum: 1.0,
                          },
                        },
                        required: [
                          "pause_timestamp",
                          "cognitive_load_score",
                          "reason",
                          "question_type",
                          "question",
                          "correct_answer",
                          "explanation",
                          "confidence",
                        ],
                      },
                    },
                  },
                  required: ["pause_points"],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "create_pause_points" },
          },
          temperature: 0.4,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", response.status, errorText);
      await supabaseClient
        .from("lecture_videos")
        .update({ status: "error", error_message: "AI analysis failed" })
        .eq("id", lectureVideoId);
      return new Response(
        JSON.stringify({ error: "AI analysis failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall || toolCall.function.name !== "create_pause_points") {
      console.error("No tool call in AI response:", result);
      await supabaseClient
        .from("lecture_videos")
        .update({
          status: "error",
          error_message: "AI returned invalid response",
        })
        .eq("id", lectureVideoId);
      return new Response(
        JSON.stringify({ error: "Invalid AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let analysisResult;
    try {
      analysisResult = JSON.parse(toolCall.function.arguments);
    } catch {
      console.error(
        "Failed to parse AI response:",
        toolCall.function.arguments
      );
      await supabaseClient
        .from("lecture_videos")
        .update({
          status: "error",
          error_message: "Failed to parse AI analysis",
        })
        .eq("id", lectureVideoId);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI analysis" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawPausePoints = analysisResult.pause_points || [];

    // Post-generation validation: filter out ungrounded questions
    const filteredPausePoints = rawPausePoints.filter(
      (point: { question: string; confidence?: number; options?: string[] }) => {
        const confidence = point.confidence ?? 1.0;

        if (confidence < 0.6) {
          console.warn(`⚠️ Skipping question (low confidence ${confidence.toFixed(2)}): "${point.question}"`);
          return false;
        }

        if (isGenericQuestion(point.question)) {
          console.warn(`⚠️ Skipping question (generic): "${point.question}"`);
          return false;
        }

        const combinedText = point.question + " " + (point.options?.join(" ") || "");
        const relevanceResult = checkRelevance(combinedText, truncatedTranscript);
        if (!relevanceResult.relevant) {
          console.warn(`⚠️ Skipping question (not grounded): "${point.question}" — ${relevanceResult.reason}`);
          return false;
        }

        return true;
      }
    );

    // Fail-safe: if all questions were filtered, fall back to unfiltered set
    const pausePoints = filteredPausePoints.length > 0 ? filteredPausePoints : rawPausePoints;
    if (filteredPausePoints.length === 0 && rawPausePoints.length > 0) {
      console.warn("⚠️ All questions failed validation — using unfiltered set as fallback");
    } else {
      console.log(`✅ ${filteredPausePoints.length}/${rawPausePoints.length} questions passed grounding validation`);
    }

    if (pausePoints.length === 0) {
      console.error("AI generated no pause points");
      await supabaseClient
        .from("lecture_videos")
        .update({
          status: "error",
          error_message: "AI could not generate questions for this content",
        })
        .eq("id", lectureVideoId);
      return new Response(
        JSON.stringify({ error: "No questions generated" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`AI generated ${pausePoints.length} pause points`);

    // Sort by timestamp and validate
    const sortedPoints = pausePoints
      .filter(
        (p: { pause_timestamp: number }) =>
          typeof p.pause_timestamp === "number" &&
          p.pause_timestamp >= 0 &&
          p.pause_timestamp <= durationSeconds
      )
      .sort(
        (a: { pause_timestamp: number }, b: { pause_timestamp: number }) =>
          a.pause_timestamp - b.pause_timestamp
      );

    // Delete existing pause points for this lecture (in case of re-analysis)
    await supabaseClient
      .from("lecture_pause_points")
      .delete()
      .eq("lecture_video_id", lectureVideoId);

    // Insert new pause points
    const pausePointRecords = sortedPoints.map(
      (
        point: {
          pause_timestamp: number;
          cognitive_load_score: number;
          reason: string;
          question_type: string;
          difficulty_type: string;
          question: string;
          options: string[];
          correct_answer: string;
          explanation: string;
        },
        index: number
      ) => {
        const questionContent: Record<string, unknown> = {
          question: point.question,
          explanation: point.explanation,
        };

        if (point.question_type === "multiple_choice") {
          questionContent.options = point.options || [];
          questionContent.correctAnswer = point.correct_answer;
        } else {
          questionContent.expectedAnswer = point.correct_answer;
        }

        return {
          lecture_video_id: lectureVideoId,
          pause_timestamp: Math.round(point.pause_timestamp),
          cognitive_load_score: Math.min(
            10,
            Math.max(1, point.cognitive_load_score || 5)
          ),
          reason: point.reason || "Comprehension checkpoint",
          question_type: point.question_type || "multiple_choice",
          question_content: questionContent,
          order_index: index,
          is_active: true,
          difficulty_type: point.difficulty_type || "comprehension",
        };
      }
    );

    const { error: insertError } = await supabaseClient
      .from("lecture_pause_points")
      .insert(pausePointRecords);

    if (insertError) {
      console.error("Failed to insert pause points:", insertError);
      await supabaseClient
        .from("lecture_videos")
        .update({
          status: "error",
          error_message: "Failed to save questions",
        })
        .eq("id", lectureVideoId);
      return new Response(
        JSON.stringify({ error: "Failed to save questions" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update lecture status to ready
    await supabaseClient
      .from("lecture_videos")
      .update({
        status: "ready",
        question_count: sortedPoints.length,
      })
      .eq("id", lectureVideoId);

    console.log(
      `Lecture ${lectureVideoId} analysis complete: ${sortedPoints.length} questions generated`
    );

    return new Response(
      JSON.stringify({
        success: true,
        questionCount: sortedPoints.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Analysis error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
