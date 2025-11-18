import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { studentAnswer, expectedAnswer, question } = await req.json();
    
    // Input validation for security
    if (!studentAnswer || typeof studentAnswer !== 'string') {
      return new Response(
        JSON.stringify({ error: 'studentAnswer must be a non-empty string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!expectedAnswer || typeof expectedAnswer !== 'string') {
      return new Response(
        JSON.stringify({ error: 'expectedAnswer must be a non-empty string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (question && typeof question !== 'string') {
      return new Response(
        JSON.stringify({ error: 'question must be a string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Length validation to prevent resource exhaustion
    if (studentAnswer.length > 5000) {
      return new Response(
        JSON.stringify({ error: 'studentAnswer exceeds maximum length of 5,000 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (expectedAnswer.length > 5000) {
      return new Response(
        JSON.stringify({ error: 'expectedAnswer exceeds maximum length of 5,000 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (question && question.length > 1000) {
      return new Response(
        JSON.stringify({ error: 'question exceeds maximum length of 1,000 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check for control characters
    const hasInvalidChars = (text: string) => /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text);
    
    if (hasInvalidChars(studentAnswer)) {
      return new Response(
        JSON.stringify({ error: 'studentAnswer contains invalid characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (hasInvalidChars(expectedAnswer)) {
      return new Response(
        JSON.stringify({ error: 'expectedAnswer contains invalid characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (question && hasInvalidChars(question)) {
      return new Response(
        JSON.stringify({ error: 'question contains invalid characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Grading service temporarily unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use AI to grade the short answer
    const systemPrompt = `You are an expert educational grader with years of experience assessing student answers. Your goal is to fairly and accurately grade short answer responses on a scale of 0-100.

GRADING RUBRIC:
- 90-100: Excellent - Answer is complete, accurate, and demonstrates deep understanding. All key concepts are correctly explained.
- 80-89: Very Good - Answer is mostly complete and accurate. Minor details may be missing but core concepts are correct.
- 70-79: Good - Answer demonstrates solid understanding. Some key points present but incomplete or contains minor errors.
- 60-69: Satisfactory - Answer shows basic understanding but missing significant details or has notable errors.
- 50-59: Needs Improvement - Answer demonstrates limited understanding. Several key concepts are missing or incorrect.
- 40-49: Poor - Answer is mostly incorrect or off-topic, with only minimal relevant content.
- 0-39: Unacceptable - Answer is fundamentally wrong, off-topic, or shows no understanding.

GRADING GUIDELINES:
1. Compare student's answer to the expected answer for key concepts
2. Award partial credit for partially correct explanations
3. Be lenient with wording differences if the concept is correct
4. Don't penalize for minor spelling/grammar errors unless they change meaning
5. Focus on conceptual understanding, not memorization of exact phrases
6. If student provides correct information not in expected answer, still give credit
7. For numerical answers, check if the approach is correct even if final answer has minor calculation errors

IMPORTANT: Be fair and generous with partial credit. Students may express correct ideas in different ways than the expected answer.

Return ONLY a JSON object with this exact format:
{
  "grade": <number from 0-100>,
  "feedback": "<constructive feedback explaining the grade, highlighting what was correct and what was missing>"
}`;

    const userPrompt = `Question: ${question}

Expected Answer: ${expectedAnswer}

Student's Answer: ${studentAnswer}

ANSWER TYPE DETECTION:
- If this is a numerical/calculation problem, focus on methodology and approach
- If this is a conceptual explanation, focus on understanding of core principles
- If this is a definition, check for key terminology and accurate explanation

Grade this answer from 0-100 and provide constructive feedback that:
1. Acknowledges what the student got right
2. Explains what was missing or incorrect
3. Encourages improvement with specific suggestions`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const errorText = await response.text();
      console.error('AI API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to grade answer. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('No content in AI response');
      return new Response(
        JSON.stringify({ error: 'Invalid grading response. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    let gradingResult;
    try {
      gradingResult = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      return new Response(
        JSON.stringify({ error: 'Invalid grading response. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate grade is between 0-100
    if (typeof gradingResult.grade !== 'number' || gradingResult.grade < 0 || gradingResult.grade > 100) {
      console.error('Invalid grade value:', gradingResult.grade);
      return new Response(
        JSON.stringify({ error: 'Invalid grading response. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Auto-graded answer:', gradingResult.grade);

    return new Response(
      JSON.stringify(gradingResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auto-grading error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to grade answer. Please try again.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
