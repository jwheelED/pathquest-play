import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { question_text } = await req.json();

    if (!question_text || question_text.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Question text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Generating expected answer for question:', question_text.substring(0, 100));

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
            content: `You are an expert educator. Generate a concise, ideal answer for the given question. This answer will be used as a grading reference for student responses. Keep it clear, accurate, and comprehensive but not overly long.`
          },
          {
            role: 'user',
            content: `Generate the expected/ideal answer for this question:\n\n${question_text}`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'generate_expected_answer',
              description: 'Generate an expected/ideal answer for a short answer question',
              parameters: {
                type: 'object',
                properties: {
                  expected_answer: {
                    type: 'string',
                    description: 'The ideal/expected answer that will be used as a grading reference'
                  }
                },
                required: ['expected_answer'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'generate_expected_answer' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI response received');

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== 'generate_expected_answer') {
      throw new Error('Invalid response from AI - no tool call found');
    }

    const result = JSON.parse(toolCall.function.arguments);

    if (!result.expected_answer) {
      throw new Error('Invalid expected answer generated');
    }

    console.log('Expected answer generated successfully');

    return new Response(
      JSON.stringify({
        expected_answer: result.expected_answer
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error generating expected answer:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to generate expected answer' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
