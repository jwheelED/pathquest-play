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
    const { question, questionType, correctAnswer, options, studentResponses, totalStudents, completedCount, courseType } =
      await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Calculate statistics
    const correctCount = studentResponses.filter((r: any) => r.isCorrect).length;
    const correctPercentage = completedCount > 0 ? Math.round((correctCount / completedCount) * 100) : 0;

    // Check if this is a short answer or coding question (text-based)
    const isTextBased = questionType === "short_answer" || questionType === "coding";

    // Build analysis data based on question type
    let analysisData = "";

    if (questionType === "multiple_choice" && options) {
      // Calculate answer distribution
      const distribution: Record<string, number> = {};
      options.forEach((opt: string) => {
        distribution[opt] = 0;
      });

      studentResponses.forEach((r: any) => {
        if (r.answer && distribution.hasOwnProperty(r.answer)) {
          distribution[r.answer]++;
        }
      });

      analysisData = `Answer Distribution:
${Object.entries(distribution)
  .map(([opt, count]) => {
    const percentage = completedCount > 0 ? Math.round(((count as number) / completedCount) * 100) : 0;
    const isCorrect = opt === correctAnswer ? " ✓" : "";
    return `${opt}${isCorrect}: ${count} students (${percentage}%)`;
  })
  .join("\n")}`;
    } else if (isTextBased) {
      // For short answer and coding: Include responses with grades and student names for analysis
      const responsesWithGrades = studentResponses
        .filter((r: any) => r.answer && typeof r.answer === 'string' && r.grade != null)
        .sort((a: any, b: any) => (b.grade || 0) - (a.grade || 0))
        .slice(0, 20); // Top 20 responses for analysis

      const responseTexts = responsesWithGrades
        .map((r: any) => `- [Grade: ${r.grade}%] "${r.answer.slice(0, 300)}" (Student: ${r.studentName || 'Unknown'})`)
        .join('\n');
      
      // Calculate grade distribution
      const gradesWithValues = studentResponses.filter((r: any) => r.grade != null);
      const avgGrade = gradesWithValues.length > 0
        ? Math.round(gradesWithValues.reduce((sum: number, r: any) => sum + r.grade, 0) / gradesWithValues.length)
        : 0;

      const gradeRanges = {
        "90-100% (Excellent)": 0,
        "70-89% (Good)": 0,
        "50-69% (Passing)": 0,
        "Below 50% (Needs Work)": 0,
      };

      gradesWithValues.forEach((r: any) => {
        if (r.grade >= 90) gradeRanges["90-100% (Excellent)"]++;
        else if (r.grade >= 70) gradeRanges["70-89% (Good)"]++;
        else if (r.grade >= 50) gradeRanges["50-69% (Passing)"]++;
        else gradeRanges["Below 50% (Needs Work)"]++;
      });

      analysisData = `Grade Distribution (Average: ${avgGrade}%):
${Object.entries(gradeRanges)
  .filter(([_, count]) => count > 0)
  .map(([range, count]) => `${range}: ${count} students`)
  .join("\n")}

Student Responses (sorted by grade):
${responseTexts || "No graded responses available."}`;
    }

    // Build AI prompt - different for text-based vs multiple choice
    let systemPrompt: string;

    if (isTextBased) {
      // Enhanced prompt for short answer and coding questions
      systemPrompt = `You are an educational analytics expert analyzing student responses to ${questionType === 'coding' ? 'coding' : 'short answer'} questions.

FORMAT REQUIREMENTS - Respond with EXACTLY this JSON structure:
{
  "summary": "Overall performance summary (max 20 words)",
  "trend": "Key patterns or common approaches (max 20 words)",
  "sentiment": "Positive|Neutral|Mixed|Negative - brief reason",
  "themes": ["theme1", "theme2", "theme3"],
  "topResponses": [
    {
      "studentName": "Student Name",
      "grade": 95,
      "answerSnippet": "First 150 chars of their answer...",
      "highlight": "What made this answer excellent (max 15 words)"
    }
  ]
}

ANALYSIS GUIDELINES:
1. Summary: Focus on overall class performance and understanding level
2. Trend: Identify common approaches, misconceptions, or patterns
3. Sentiment: Assess overall engagement and effort level from responses
4. Themes: Extract 2-4 common themes or topics from answers
5. Top Responses: Select 3-5 best answers (highest grades), explain what made them good

${questionType === 'coding' ? 
`For coding responses, evaluate:
- Code correctness and logic
- Coding style and best practices
- Problem-solving approach` : 
`For short answer responses, evaluate:
- Conceptual understanding
- Clarity of explanation
- Depth of analysis`}

Return ONLY valid JSON, no markdown formatting.`;
    } else {
      // Standard prompt for multiple choice
      systemPrompt = `You are an educational analytics expert. Generate concise, actionable summaries of student performance on quiz questions.

FORMAT REQUIREMENTS:
- Line 1 (Summary): Start with "Summary:" followed by overall performance assessment (max 15 words)
- Line 2 (Trend): Start with "Trend:" followed by notable pattern or insight (max 15 words)

FOCUS ON:
- Percentage of correct vs incorrect answers
- Common misconceptions (for multiple choice, which wrong answers were popular)
- Response patterns and notable behaviors

BE SPECIFIC with numbers and percentages. Keep it brief and actionable.`;
    }

    const userPrompt = `Question: "${question}"
Question Type: ${questionType}
${questionType === "multiple_choice" ? `Correct Answer: ${correctAnswer}` : ""}

STUDENT RESPONSES:
Total Students: ${totalStudents}
Completed: ${completedCount}
${questionType === "multiple_choice" ? `Correct: ${correctCount} (${correctPercentage}%)` : ""}

${analysisData}

${isTextBased ? 
`Analyze these responses and return JSON with summary, trend, sentiment, themes, and the top 3-5 best student responses with their names and what made their answers excellent.` : 
`Generate a 2-line summary (Summary + Trend).`}`;

    console.log("Calling Lovable AI for summary generation...", { questionType, isTextBased });

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
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.error("Rate limit exceeded");
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded",
            summary: `Summary: ${correctPercentage}% correct. Review recommended.`,
            trend: "Trend: AI summary unavailable due to rate limits.",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (response.status === 402) {
        console.error("Payment required");
        return new Response(
          JSON.stringify({
            error: "Payment required",
            summary: `Summary: ${correctPercentage}% correct. Review recommended.`,
            trend: "Trend: AI summary unavailable. Please add credits.",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const errorText = await response.text();
      console.error("Lovable AI error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const generatedText = data.choices[0].message.content;

    console.log("AI generated text:", generatedText);

    // Parse the response differently for text-based vs multiple choice
    if (isTextBased) {
      try {
        // Clean the response - remove markdown code blocks if present
        let cleanedText = generatedText.trim();
        if (cleanedText.startsWith('```json')) {
          cleanedText = cleanedText.slice(7);
        } else if (cleanedText.startsWith('```')) {
          cleanedText = cleanedText.slice(3);
        }
        if (cleanedText.endsWith('```')) {
          cleanedText = cleanedText.slice(0, -3);
        }
        cleanedText = cleanedText.trim();

        const parsed = JSON.parse(cleanedText);
        
        return new Response(JSON.stringify({
          summary: parsed.summary || `Summary: ${completedCount} responses analyzed.`,
          trend: parsed.trend || "Trend: Review individual responses for details.",
          sentiment: parsed.sentiment || "Neutral - Unable to determine sentiment",
          themes: parsed.themes || [],
          topResponses: parsed.topResponses || [],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (parseError) {
        console.error("Error parsing JSON response:", parseError);
        // Fallback to extracting what we can
        return new Response(JSON.stringify({
          summary: `Summary: ${completedCount} responses analyzed with varying quality.`,
          trend: "Trend: Unable to parse detailed analysis. Review manually.",
          sentiment: "Neutral",
          themes: [],
          topResponses: [],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Parse the generated text for multiple choice (original logic)
      const lines = generatedText.split("\n").filter((line: string) => line.trim());
      let summary = "";
      let trend = "";

      for (const line of lines) {
        if (line.toLowerCase().startsWith("summary:")) {
          summary = line.trim();
        } else if (line.toLowerCase().startsWith("trend:")) {
          trend = line.trim();
        }
      }

      // Fallback if parsing fails
      if (!summary || !trend) {
        summary = `Summary: ${correctPercentage}% of students answered correctly.`;
        trend = `Trend: ${completedCount} out of ${totalStudents} students responded.`;
      }

      return new Response(JSON.stringify({ summary, trend }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Error in generate-question-summary:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        summary: "Summary: Unable to generate AI summary.",
        trend: "Trend: Please try again or review manually.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});