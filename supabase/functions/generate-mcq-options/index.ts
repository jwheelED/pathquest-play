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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build a labelled, role-explicit context block. Prior context (focused, recent teaching prose
    // captured at trigger time) is given highest priority for pronoun resolution; the broader
    // source_transcript tail is included as background lecture history.
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

    console.log('Generating MCQ options for question:', question_text.substring(0, 100));
    console.log(`Context received — broad=${broadContext.length} chars, focused=${focusedContext.length} chars`);

    const todayStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const response = await callClaude({
      messages: [
        {
          role: 'system',
          content: `Today's date is ${todayStr}. Your training data has a cutoff and may be out of date for time-sensitive facts (current officeholders, recent events, current prices, latest versions, sports champions, etc.).

TIME-SENSITIVE RULES — CRITICAL:
- If a question asks for a CURRENT fact and the lecture context does not explicitly provide that fact, do NOT confidently answer from stale model memory.
- Instead, prefer a verification-safe answer that signals the fact must be checked against current sources.
- Never confidently provide a possibly outdated officeholder, champion, price, or "current" status.
- If you are not certain the fact is current, the correct option should be a verification-safe answer such as "Needs current verification" or equivalent, and the explanation must explicitly say the answer is time-sensitive and should be verified with current sources.
- When the lecture transcript provides the answer, ALWAYS prefer it over your own knowledge.

You are an expert educator creating multiple choice questions grounded in a live lecture transcript.

CRITICAL: Instructor questions are often SHORT and contain pronouns ("it", "this", "they", "that", "these", "those") that refer back to topics discussed earlier in the lecture. You MUST resolve these pronouns using the TEACHING CONTEXT before generating options.

EXAMPLE — pronoun resolution:
  Teaching context: "the mitochondria converts glucose into energy"
  Instructor's question: "what does it produce?"
  → Resolved: "What does the mitochondria produce?"
  → Correct answer must reference ATP / energy, NOT a generic "output of the process".

RULES:
1. Read the TEACHING CONTEXT carefully — it is the PRIMARY source for the correct answer.
2. Resolve every pronoun in the INSTRUCTOR'S QUESTION using the TEACHING CONTEXT.
3. The correct answer MUST be a specific, factual answer drawn from the lecture when the lecture supplies it.
4. For time-sensitive CURRENT questions without explicit lecture support, use a verification-safe correct answer instead of a potentially outdated factual claim.
5. Distractors must be plausible but clearly wrong to a student who understood the lecture. They must be SPECIFIC and on-topic — never generic phrases like "the output of the process" or "the end result".
6. If after reading all the context the question still cannot be resolved (no antecedent for the pronoun anywhere), make your best educated guess only for NON-time-sensitive questions and keep the answer specific and grounded in the apparent topic.`
        },
        {
          role: 'user',
          content: `${teachingContextBlock ? `=== TEACHING CONTEXT (background — earlier in the lecture) ===\n${teachingContextBlock}\n\n` : ''}=== INSTRUCTOR'S QUESTION (turn this into a 4-option MCQ) ===\n"${question_text}"\n\nGenerate 4 multiple choice options. Format each option as "A. text", "B. text", "C. text", "D. text". Resolve any pronouns first. If this is a time-sensitive CURRENT question and the teaching context does not explicitly provide the answer, do NOT guess using possibly outdated memory — make the correct option a verification-safe answer like "Needs current verification" and explain that current sources should be checked. Distractors must be specific and topic-relevant — never vague phrases like "the output of the process" or "the end result of a procedure".`
        }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'generate_mcq_options',
            description: 'Generate 4 multiple choice options with a correct answer',
            parameters: {
              type: 'object',
              properties: {
                options: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of exactly 4 answer options (A, B, C, D)',
                  minItems: 4,
                  maxItems: 4
                },
                correct_answer: {
                  type: 'string',
                  enum: ['A', 'B', 'C', 'D'],
                  description: 'The letter of the correct answer'
                },
                explanation: {
                  type: 'string',
                  description: 'Brief explanation of why the correct answer is correct'
                }
              },
              required: ['options', 'correct_answer'],
              additionalProperties: false
            }
          }
        }
      ],
      tool_choice: { type: 'function', function: { name: 'generate_mcq_options' } }
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
    if (!toolCall || toolCall.function?.name !== 'generate_mcq_options') {
      throw new Error('Invalid response from AI - no tool call found');
    }

    const result = JSON.parse(toolCall.function.arguments);

    // Validate the result
    if (!result.options || result.options.length !== 4 || !result.correct_answer) {
      throw new Error('Invalid MCQ options generated');
    }

    console.log('MCQ options generated successfully');

    return new Response(
      JSON.stringify({
        options: result.options,
        correct_answer: result.correct_answer,
        explanation: result.explanation || null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error generating MCQ options:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to generate MCQ options' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
