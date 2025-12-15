import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lectureId, lectureTitle, studentProgress, pausePoints } = await req.json();

    console.log(`Generating grades summary for lecture: ${lectureTitle} (${lectureId})`);
    console.log(`Students: ${studentProgress?.length || 0}, Questions: ${pausePoints?.length || 0}`);

    if (!studentProgress || studentProgress.length === 0) {
      return new Response(
        JSON.stringify({ summary: "No student data available to analyze." }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Analyze student performance data
    const analysisData = analyzeStudentPerformance(studentProgress, pausePoints);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const systemPrompt = `You are an educational analytics expert helping instructors understand student performance on pre-recorded lecture questions. Provide actionable insights in a clear, concise format.

Focus on:
1. Overall class performance summary (1-2 sentences)
2. Questions where students struggled most (with specific percentages)
3. Common misconceptions or patterns in wrong answers
4. Specific teaching recommendations

Keep the summary to 150-200 words. Use markdown formatting with bullet points for clarity.`;

    const userPrompt = `Analyze this student performance data for the lecture "${lectureTitle}":

**Class Statistics:**
- Total Students: ${analysisData.totalStudents}
- Completed: ${analysisData.completedStudents} (${Math.round(analysisData.completedStudents / analysisData.totalStudents * 100)}%)
- Average Score: ${analysisData.avgScore !== null ? `${analysisData.avgScore}%` : 'N/A'}

**Question Performance:**
${analysisData.questionStats.map((q, i) => 
  `Q${i + 1} (${q.type}): ${q.correctRate}% correct - "${q.questionText.substring(0, 80)}..."`
).join('\n')}

**Common Wrong Answers:**
${analysisData.commonWrongAnswers.map(w => 
  `- Q${w.questionIndex}: "${w.wrongAnswer}" (${w.count} students)`
).join('\n') || 'None identified'}

**Low Performing Students:**
${analysisData.lowPerformers.map(s => 
  `- ${s.name}: ${s.score}%`
).join('\n') || 'None below 40%'}

Please provide a summary with:
1. Performance overview
2. Struggling areas (specific questions)
3. Misconception patterns
4. Teaching recommendations`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || "Unable to generate summary.";

    console.log("Summary generated successfully");

    return new Response(
      JSON.stringify({ summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Error generating grades summary:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function analyzeStudentPerformance(studentProgress: any[], pausePoints: any[]) {
  const totalStudents = studentProgress.length;
  const completedStudents = studentProgress.filter(p => p.completed_at).length;

  // Calculate question-level stats
  const questionStats: any[] = [];
  const wrongAnswersByQuestion: Map<number, Map<string, number>> = new Map();

  pausePoints.forEach((pp, idx) => {
    let correct = 0;
    let total = 0;
    const wrongAnswers = new Map<string, number>();

    studentProgress.forEach(progress => {
      if (!progress.responses) return;
      
      const responses = typeof progress.responses === 'string' 
        ? JSON.parse(progress.responses) 
        : progress.responses;
      
      const response = responses[pp.id];
      if (!response) return;

      total++;
      const isCorrect = response.correct || (response.grade && response.grade >= 70);
      
      if (isCorrect) {
        correct++;
      } else if (response.answer) {
        const count = wrongAnswers.get(response.answer) || 0;
        wrongAnswers.set(response.answer, count + 1);
      }
    });

    const questionContent = typeof pp.question_content === 'string'
      ? JSON.parse(pp.question_content)
      : pp.question_content;

    questionStats.push({
      questionText: questionContent.question || "Question",
      type: pp.question_type,
      correctRate: total > 0 ? Math.round((correct / total) * 100) : 0,
      total,
      correct
    });

    wrongAnswersByQuestion.set(idx + 1, wrongAnswers);
  });

  // Get common wrong answers
  const commonWrongAnswers: any[] = [];
  wrongAnswersByQuestion.forEach((wrongAnswers, questionIndex) => {
    wrongAnswers.forEach((count, answer) => {
      if (count >= 2) { // At least 2 students made same mistake
        commonWrongAnswers.push({
          questionIndex,
          wrongAnswer: answer.substring(0, 50),
          count
        });
      }
    });
  });

  // Sort by count descending and take top 5
  commonWrongAnswers.sort((a, b) => b.count - a.count);
  const topWrongAnswers = commonWrongAnswers.slice(0, 5);

  // Calculate overall scores and find low performers
  const studentScores: { name: string; score: number }[] = [];
  let totalScore = 0;
  let scoreCount = 0;

  studentProgress.forEach(progress => {
    if (!progress.responses) return;
    
    const responses = typeof progress.responses === 'string' 
      ? JSON.parse(progress.responses) 
      : progress.responses;
    
    let studentTotal = 0;
    let studentCount = 0;

    Object.values(responses).forEach((resp: any) => {
      if (resp.grade !== undefined) {
        studentTotal += resp.grade;
        studentCount++;
      } else if (resp.correct !== undefined) {
        studentTotal += resp.correct ? 100 : 0;
        studentCount++;
      }
    });

    if (studentCount > 0) {
      const avgScore = Math.round(studentTotal / studentCount);
      studentScores.push({ name: progress.student_name, score: avgScore });
      totalScore += avgScore;
      scoreCount++;
    }
  });

  const avgScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : null;
  const lowPerformers = studentScores.filter(s => s.score < 40).slice(0, 5);

  return {
    totalStudents,
    completedStudents,
    avgScore,
    questionStats,
    commonWrongAnswers: topWrongAnswers,
    lowPerformers
  };
}
