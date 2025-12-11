import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { 
      lectureVideoId,
      pausePointId,
      misconception,
      missingConcept,
      rootCause,
      originalQuestion,
      correctAnswer,
      studentAnswer
    } = await req.json();

    console.log('Generating remediation for:', { misconception, missingConcept });

    const systemPrompt = `You are an expert educational AI that creates personalized remediation content.
Your task is to:
1. Generate a clear, concise explanation (2-3 sentences) that addresses the student's specific misconception
2. Create a simpler follow-up question to verify they understood the concept

The explanation should:
- Be encouraging and supportive
- Directly address the root cause of the misunderstanding
- Use simple, clear language
- Connect to what they may already understand

The follow-up question should:
- Be easier than the original question
- Test the same underlying concept
- Help build confidence

Respond ONLY with valid JSON in this exact format:
{
  "explanation": "Your personalized explanation here",
  "followUpQuestion": {
    "type": "multiple_choice",
    "question": "The simpler follow-up question",
    "options": ["A. Option 1", "B. Option 2", "C. Option 3", "D. Option 4"],
    "correctAnswer": "A",
    "explanation": "Why this is correct"
  }
}`;

    const userPrompt = `The student got this question wrong:
Question: ${originalQuestion}
Correct Answer: ${correctAnswer}
Student's Answer: ${studentAnswer}

Their misconception: ${misconception}
Missing concept: ${missingConcept}
Root cause: ${rootCause}

Generate a personalized explanation and follow-up question to help them understand.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://edvana.app',
        'X-Title': 'Edvana Education Platform',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response as JSON');
    }

    const remediationData = JSON.parse(jsonMatch[0]);
    console.log('Remediation generated successfully');

    return new Response(JSON.stringify({
      success: true,
      explanation: remediationData.explanation,
      followUpQuestion: remediationData.followUpQuestion,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in generate-remediation:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
