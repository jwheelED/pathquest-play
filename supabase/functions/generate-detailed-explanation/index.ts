import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { problemText, correctAnswer, userAnswer, wasCorrect, courseContext } = await req.json();
    
    // Input validation
    if (!problemText || typeof problemText !== 'string' || 
        problemText.length > 1000 || /[\x00-\x1F]/.test(problemText)) {
      return new Response(
        JSON.stringify({ error: 'Invalid problem text' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!correctAnswer || typeof correctAnswer !== 'string' || correctAnswer.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Invalid correct answer' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (userAnswer && (typeof userAnswer !== 'string' || userAnswer.length > 5000)) {
      return new Response(
        JSON.stringify({ error: 'Invalid user answer' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (courseContext && (typeof courseContext !== 'string' || courseContext.length > 2000)) {
      return new Response(
        JSON.stringify({ error: 'Invalid course context' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const contextInfo = courseContext ? `\n\nCourse Context: ${courseContext}` : '';
    const userAnswerInfo = userAnswer ? `\nStudent's Answer: ${userAnswer}` : '';
    const outcomeInfo = wasCorrect ? 'The student answered correctly.' : 'The student answered incorrectly.';

    const prompt = `Provide a detailed, in-depth explanation for this practice question:

Question: ${problemText}
Correct Answer: ${correctAnswer}${userAnswerInfo}

${outcomeInfo}${contextInfo}

Please provide a comprehensive explanation (200-300 words) that includes:

1. **Conceptual Breakdown**: Explain the underlying concept being tested
2. **Step-by-Step Reasoning**: Walk through how to arrive at the correct answer
3. **Why This Matters**: Explain the practical importance or real-world application
4. **Related Concepts**: Mention connected topics the student should understand
5. **Common Pitfalls**: Highlight typical mistakes students make with this type of question

Make the explanation engaging, educational, and appropriate for the student's level. Use clear language and examples where helpful.`;

    console.log('Generating detailed explanation for:', problemText.substring(0, 50) + '...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an expert educator providing detailed, clear explanations to help students deeply understand concepts.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your Lovable AI workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to generate explanation' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const detailedExplanation = data.choices?.[0]?.message?.content;

    if (!detailedExplanation) {
      throw new Error('No explanation generated');
    }

    console.log('Successfully generated detailed explanation');

    return new Response(
      JSON.stringify({ detailedExplanation }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-detailed-explanation:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
