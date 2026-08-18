import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { callClaude } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
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

    const { data: hasRole } = await supabaseClient.rpc('has_role', {
      _user_id: user.id,
      _role: 'instructor'
    });

    if (!hasRole) {
      return new Response(
        JSON.stringify({ error: 'Instructor role required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { question_text, source_transcript, prior_context } = await req.json();

    if (!question_text || question_text.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Question text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const broadContext = (source_transcript || '').slice(-6000).trim();
    const focusedContext = (prior_context || '').trim();
    const hasAnyContext = broadContext.length > 0 || focusedContext.length > 0;

    const teachingContextBlock = hasAnyContext
      ? [
          focusedContext
            ? `[MOST RECENT TEACHING — IMMEDIATELY BEFORE THE QUESTION]\n"${focusedContext}"`
            : '',
          broadContext
            ? `[EARLIER LECTURE HISTORY]\n"${broadContext}"`
            : '',
        ].filter(Boolean).join('\n\n')
      : '';

    console.log('Generating expected answer for question:', question_text.substring(0, 100));
    console.log(`Context received — broad=${broadContext.length} chars, focused=${focusedContext.length} chars`);

    const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const response = await callClaude({
      messages: [
        {
          role: 'system',
          content: `Today's date is ${todayStr}. Your training data has a cutoff and may be out of date for time-sensitive facts (current officeholders, recent events, current prices, latest versions, sports champions, etc.). If the question asks about something that may have changed since your training cutoff, you MUST acknowledge uncertainty in the answer (e.g. "As of my last training data, X — please verify against current sources") rather than confidently asserting an outdated fact. When the teaching context provides the answer, ALWAYS prefer it over your own knowledge.

You are an expert educator generating an ideal answer used as a grading reference. The answer must be SPECIFIC and FACTUALLY CORRECT — never vague.

CRITICAL: Instructor questions are often SHORT and contain pronouns ("it", "this", "they", "that") that refer back to topics discussed earlier. You MUST resolve these pronouns using the TEACHING CONTEXT before answering.

EXAMPLE:
  Teaching context: "the mitochondria converts glucose into energy"
  Instructor's question: "what does it produce?"
  → Resolved: "What does the mitochondria produce?"
  → Expected answer: "ATP (adenosine triphosphate) — the energy currency of the cell."

If the teaching context explicitly states or implies the answer, quote/paraphrase it directly. Only fall back to general world knowledge if the lecture context truly does not address the question.`
        },
        {
          role: 'user',
          content: `${teachingContextBlock ? `=== TEACHING CONTEXT (background — earlier in the lecture) ===\n${teachingContextBlock}\n\n` : ''}=== INSTRUCTOR'S QUESTION ===\n"${question_text}"\n\nGenerate the ideal expected answer. Resolve any pronouns in the question using the teaching context first. The answer should be clear, specific, and factually correct so it can serve as a reliable grading reference.`
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
