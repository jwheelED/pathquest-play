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

    // Determine if this is a humanities course
    const isHumanities = courseType === 'humanities';

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
    } else if (questionType === "short_answer") {
      // For humanities short answers, include actual response texts for sentiment analysis
      if (isHumanities) {
        const responseTexts = studentResponses
          .filter((r: any) => r.answer && typeof r.answer === 'string')
          .map((r: any) => `- "${r.answer.slice(0, 200)}"`)
          .slice(0, 15) // Limit to 15 responses for token efficiency
          .join('\n');
        
        analysisData = `Student Responses (sample for sentiment analysis):
${responseTexts || "No text responses available."}`;
      } else {
        // STEM: Analyze grades if available
        const gradesWithValues = studentResponses.filter((r: any) => r.grade != null);

        if (gradesWithValues.length > 0) {
          const avgGrade = Math.round(
            gradesWithValues.reduce((sum: number, r: any) => sum + r.grade, 0) / gradesWithValues.length,
          );

          const gradeRanges = {
            "90-100%": 0,
            "80-89%": 0,
            "70-79%": 0,
            "60-69%": 0,
            "Below 60%": 0,
          };

          gradesWithValues.forEach((r: any) => {
            if (r.grade >= 90) gradeRanges["90-100%"]++;
            else if (r.grade >= 80) gradeRanges["80-89%"]++;
            else if (r.grade >= 70) gradeRanges["70-79%"]++;
            else if (r.grade >= 60) gradeRanges["60-69%"]++;
            else gradeRanges["Below 60%"]++;
          });

          analysisData = `Grade Distribution (Average: ${avgGrade}%):
${Object.entries(gradeRanges)
  .filter(([_, count]) => count > 0)
  .map(([range, count]) => `${range}: ${count} students`)
  .join("\n")}`;
        } else {
          analysisData = "Responses received but not yet graded.";
        }
      }
    }

    // Build AI prompt - use different prompts for Humanities vs STEM
    let systemPrompt: string;
    let additionalInstructions = "";

    if (isHumanities && questionType === "short_answer") {
      // Humanities-specific sentiment analysis prompt
      systemPrompt = `You are an educational analytics expert specializing in humanities education.

FORMAT REQUIREMENTS:
- Line 1 (Summary): Overall engagement and analytical depth assessment (max 20 words)
- Line 2 (Trend): Key themes or perspectives emerging from responses (max 20 words)
- Line 3 (Sentiment): "Sentiment: [Positive/Neutral/Mixed/Negative] - [brief reason]"

ANALYZE:
- Emotional tone across responses (enthusiasm, skepticism, confusion, insight)
- Depth of critical thinking (surface-level vs. analytical)
- Common perspectives or disagreements
- Level of engagement with the material

Focus on giving actionable teaching insights for humanities educators.`;
      
      additionalInstructions = "Analyze the sentiment and themes in student responses. Look for engagement levels, critical thinking depth, and common perspectives.";
    } else {
      // Standard STEM prompt
      systemPrompt = `You are an educational analytics expert. Generate concise, actionable summaries of student performance on quiz questions.

FORMAT REQUIREMENTS:
- Line 1 (Summary): Start with "Summary:" followed by overall performance assessment (max 15 words)
- Line 2 (Trend): Start with "Trend:" followed by notable pattern or insight (max 15 words)

FOCUS ON:
- Percentage of correct vs incorrect answers
- Common misconceptions (for multiple choice, which wrong answers were popular)
- Quality patterns (for short answer with grades)
- Response patterns and notable behaviors

BE SPECIFIC with numbers and percentages. Keep it brief and actionable.`;

      if (questionType === "multiple_choice") {
        additionalInstructions = "Focus on which wrong answers were chosen and why they might be confusing.";
      } else if (questionType === "short_answer") {
        additionalInstructions = "Analyze grade distribution and what patterns emerge from student responses.";
      }
    }

    const userPrompt = `Question: "${question}"
Question Type: ${questionType}
${questionType === "multiple_choice" ? `Correct Answer: ${correctAnswer}` : ""}
${isHumanities ? "Course Type: Humanities" : ""}

STUDENT RESPONSES:
Total Students: ${totalStudents}
Completed: ${completedCount}
${!isHumanities || questionType === "multiple_choice" ? `Correct: ${correctCount} (${correctPercentage}%)` : ""}

${analysisData}

${additionalInstructions}

Generate a ${isHumanities && questionType === "short_answer" ? "3-line summary (Summary + Trend + Sentiment)" : "2-line summary (Summary + Trend)"}.`;

    console.log("Calling Lovable AI for summary generation...", { isHumanities, questionType });

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

    // Parse the generated text to extract summary, trend, and sentiment
    const lines = generatedText.split("\n").filter((line: string) => line.trim());
    let summary = "";
    let trend = "";
    let sentiment = "";

    for (const line of lines) {
      if (line.toLowerCase().startsWith("summary:")) {
        summary = line.trim();
      } else if (line.toLowerCase().startsWith("trend:")) {
        trend = line.trim();
      } else if (line.toLowerCase().startsWith("sentiment:")) {
        sentiment = line.trim();
      }
    }

    // Fallback if parsing fails
    if (!summary || !trend) {
      summary = `Summary: ${correctPercentage}% of students answered correctly.`;
      trend = `Trend: ${completedCount} out of ${totalStudents} students responded.`;
    }

    // Return sentiment only for humanities courses
    const result: any = { summary, trend };
    if (isHumanities && sentiment) {
      result.sentiment = sentiment;
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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