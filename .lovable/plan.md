

# Fix: Create Missing `generate-interval-question` Edge Function

## Problem Summary
Auto-questions are being skipped with "failed to send a request to edge function" errors because the **`generate-interval-question` edge function does not exist**. The frontend code (`LectureTranscription.tsx` and `useLectureRecording.ts`) calls this function at lines 1494 and 456 respectively, but there is no corresponding function in `supabase/functions/`.

Additionally, `generate-live-lecture-summary` is also missing, causing lecture summaries to fail.

## Root Cause
The `supabase/functions/` directory contains these functions:
- `auto-grade-coding/`
- `auto-grade-short-answer/`
- `convert-pptx-to-pdf/`
- `extract-slide-question/`
- `extract-voice-command-question/`
- `format-and-send-question/`
- `send-slide-question/`

**Missing functions:**
1. **`generate-interval-question/`** - Called by auto-question timer to generate questions from transcript
2. **`generate-live-lecture-summary/`** - Called after long recordings to generate teaching summaries

The `supabase/config.toml` also doesn't include these functions, confirming they were never created.

## Solution

Create both missing edge functions following the existing patterns in the codebase:

### 1. Create `generate-interval-question` Edge Function

This function will:
- Accept transcript content and interval settings
- Use AI to generate an appropriate question based on the lecture content
- Support format preferences (MCQ, short answer, coding)
- Handle fallback questions when AI fails
- Return structured question data for delivery

### 2. Create `generate-live-lecture-summary` Edge Function

This function will:
- Accept transcript chunks and check-in results
- Generate a teaching summary with engagement metrics
- Return structured summary data

## Technical Implementation

### File 1: `supabase/functions/generate-interval-question/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Fallback questions for when AI fails
const FALLBACK_QUESTIONS = [
  { question_text: "What was the main concept just discussed?", suggested_type: "short_answer" },
  { question_text: "Can you summarize the key point from the last few minutes?", suggested_type: "short_answer" },
  { question_text: "What is the most important takeaway from what was just covered?", suggested_type: "short_answer" },
];

const LONG_INTERVAL_FALLBACK_QUESTIONS = [
  { question_text: "What was the most important concept covered in the last section of the lecture?", suggested_type: "short_answer" },
  { question_text: "Summarize the main learning objective from the past segment.", suggested_type: "short_answer" },
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const {
      interval_transcript,
      interval_minutes,
      format_preference = "multiple_choice",
      coding_question_style = "simple",
      force_send = false,
      strict_mode = false,
      materialContext = [],
      slide_context = null,
      course_context = null,
    } = await req.json();

    console.log("📝 Generating interval question");
    console.log("  Transcript length:", interval_transcript?.length || 0);
    console.log("  Interval minutes:", interval_minutes);
    console.log("  Format preference:", format_preference);

    // Validate transcript
    if (!interval_transcript || interval_transcript.length < 50) {
      if (!force_send) {
        return new Response(JSON.stringify({
          success: false,
          error: "Not enough content to generate a question",
          error_type: "insufficient_content",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Trim transcript for AI processing (max 8000 chars)
    const trimmedTranscript = interval_transcript.slice(-8000);

    // Build context for AI
    let additionalContext = "";
    if (materialContext && materialContext.length > 0) {
      additionalContext += "\n\nCourse Materials Context:\n";
      for (const material of materialContext.slice(0, 2)) {
        additionalContext += `- ${material.title}: ${material.content?.slice(0, 500) || ""}\n`;
      }
    }
    if (slide_context) {
      additionalContext += `\n\nCurrent Slide: ${slide_context}\n`;
    }

    // Long interval guidance
    const longIntervalGuidance = interval_minutes >= 20
      ? `\n⚠️ LONG INTERVAL (${interval_minutes} min): Focus on THE SINGLE MOST IMPORTANT concept. Prioritize topics that were emphasized or repeated.`
      : "";

    // Build prompt based on format preference
    let formatInstructions = "";
    if (format_preference === "coding") {
      formatInstructions = coding_question_style === "simple"
        ? `Generate a simple coding fill-in-the-blank question with ONE missing line.`
        : `Generate a complete coding problem with starter code and test cases.`;
    } else if (format_preference === "short_answer") {
      formatInstructions = `Generate an open-ended short answer question that tests understanding.`;
    } else {
      formatInstructions = `Generate a multiple choice question with 4 options, one correct answer.`;
    }

    const systemPrompt = `You are an expert educational AI that generates high-quality check-in questions from lecture transcripts.
${longIntervalGuidance}

${formatInstructions}

Return JSON in this exact format:
{
  "question_text": "the question (use LaTeX $...$ for math)",
  "suggested_type": "${format_preference}",
  "confidence": 0.0-1.0,
  "reasoning": "why this question tests the key concept"
}

For multiple_choice, also include:
- "options": ["A. ...", "B. ...", "C. ...", "D. ..."]
- "correct_answer": "A" | "B" | "C" | "D"
- "explanation": "why the correct answer is right"

For coding questions:
- "question_text": { "title": "...", "description": "...", "starterCode": "...", "language": "python" | "javascript" }`;

    const userPrompt = `Generate a question from this lecture content:

"""
${trimmedTranscript}
"""
${additionalContext}

Generate ONE focused question that tests understanding of the most important concept just taught.`;

    // Call AI
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
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
          temperature: 0.7,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error("AI API error:", response.status);
        // Use fallback
        const fallback = interval_minutes >= 20
          ? LONG_INTERVAL_FALLBACK_QUESTIONS[Math.floor(Math.random() * LONG_INTERVAL_FALLBACK_QUESTIONS.length)]
          : FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
        
        return new Response(JSON.stringify({
          success: true,
          ...fallback,
          confidence: 0.5,
          is_fallback: true,
          reasoning: "AI service unavailable, using fallback question",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiResponse = await response.json();
      let content = aiResponse.choices[0].message.content;

      // Parse JSON response
      content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(content);

      console.log("✅ Question generated:", parsed.question_text?.substring?.(0, 100) || parsed.question_text?.title);

      return new Response(JSON.stringify({
        success: true,
        question_text: parsed.question_text,
        suggested_type: parsed.suggested_type || format_preference,
        confidence: parsed.confidence || 0.8,
        options: parsed.options,
        correct_answer: parsed.correct_answer,
        explanation: parsed.explanation,
        reasoning: parsed.reasoning,
        is_fallback: false,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } catch (aiError: any) {
      clearTimeout(timeoutId);
      console.error("AI error:", aiError);

      // Use fallback on any AI error
      const fallback = interval_minutes >= 20
        ? LONG_INTERVAL_FALLBACK_QUESTIONS[Math.floor(Math.random() * LONG_INTERVAL_FALLBACK_QUESTIONS.length)]
        : FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];

      return new Response(JSON.stringify({
        success: true,
        ...fallback,
        confidence: 0.5,
        is_fallback: true,
        reasoning: `AI error: ${aiError.message}, using fallback`,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (error: any) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

### File 2: `supabase/functions/generate-live-lecture-summary/index.ts`

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const {
      transcript_chunks,
      recording_duration_seconds,
      check_in_results = [],
      questions_asked = 0,
      course_type = "general",
    } = await req.json();

    const durationMinutes = Math.round(recording_duration_seconds / 60);
    const fullTranscript = transcript_chunks.join(" ").slice(-15000);
    
    // Calculate engagement metrics
    const totalCheckIns = check_in_results.length;
    const correctAnswers = check_in_results.filter((c: any) => c.is_correct).length;
    const engagementRate = totalCheckIns > 0 ? (correctAnswers / totalCheckIns * 100).toFixed(0) : 0;

    const prompt = `Analyze this ${durationMinutes}-minute lecture and generate a teaching summary.

Transcript (last portion):
"""
${fullTranscript}
"""

Check-in Results: ${totalCheckIns} responses, ${correctAnswers} correct (${engagementRate}% accuracy)
Questions Asked: ${questions_asked}

Generate a JSON summary with:
{
  "overallScore": 0-100,
  "topicsIdentified": ["topic1", "topic2", ...],
  "keyConceptsCovered": ["concept1", "concept2", ...],
  "engagementAnalysis": "brief analysis of student engagement",
  "teachingSuggestions": ["suggestion1", "suggestion2"],
  "conceptsToReview": ["concept that may need more explanation"],
  "lectureHighlights": ["key moment 1", "key moment 2"]
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are an expert educational analyst. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    let content = aiResponse.choices[0].message.content;
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const summary = JSON.parse(content);

    return new Response(JSON.stringify({
      success: true,
      summary: {
        ...summary,
        durationMinutes,
        questionsAsked: questions_asked,
        checkInResults: {
          total: totalCheckIns,
          correct: correctAnswers,
          accuracy: engagementRate,
        },
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Summary generation error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

### File 3: Update `supabase/config.toml`

Add the new functions to the config:

```toml
project_id = "otsmjgrhyteyvpufkwdh"

[functions.auto-grade-coding]
verify_jwt = false

[functions.auto-grade-short-answer]
verify_jwt = false

[functions.extract-voice-command-question]
verify_jwt = false

[functions.format-and-send-question]
verify_jwt = false

[functions.extract-slide-question]
verify_jwt = false

[functions.send-slide-question]
verify_jwt = false

[functions.convert-pptx-to-pdf]
verify_jwt = false

[functions.generate-interval-question]
verify_jwt = false

[functions.generate-live-lecture-summary]
verify_jwt = false
```

## Summary of Changes

| File | Action |
|------|--------|
| `supabase/functions/generate-interval-question/index.ts` | CREATE - New edge function for auto-question generation |
| `supabase/functions/generate-live-lecture-summary/index.ts` | CREATE - New edge function for lecture summaries |
| `supabase/config.toml` | UPDATE - Add both new functions with `verify_jwt = false` |

## Expected Behavior After Fix

1. Auto-questions will generate reliably at each interval (1, 2, 3, 5, 10, 15, 20, 30 minutes)
2. AI will analyze the transcript and generate relevant questions
3. If AI fails, fallback questions will be used (no more skipped questions)
4. Lecture summaries will generate after 10+ minute recordings
5. The "failed to send a request to edge function" error will be eliminated

## Key Reliability Features

1. **Fallback Questions**: If AI fails for any reason, pre-defined questions are used
2. **Timeout Handling**: 30-second timeout with graceful fallback
3. **Long Interval Support**: Special handling for 20+ minute intervals
4. **Format Flexibility**: Supports MCQ, short answer, and coding questions
5. **Math Support**: LaTeX rendering for STEM content

