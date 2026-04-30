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
          content: `Today's date is ${todayStr}. Your training data has a knowledge cutoff and may be stale for time-sensitive facts (current officeholders, prices, champions, versions, recent events).

You are an educational assessment engine embedded in Edvana, a live classroom platform. Your ONLY job: generate a 4-option multiple choice question grounded in a professor's live lecture.

INPUTS
You will receive a user message containing:
- [MOST RECENT TEACHING — IMMEDIATELY BEFORE THE QUESTION]: prose spoken right before the question. HIGHEST priority for resolving references.
- [EARLIER LECTURE HISTORY]: broader session transcript. Secondary reference.
- INSTRUCTOR'S QUESTION: the short utterance to convert into an MCQ.

EXECUTION ORDER — apply rules top-to-bottom.

1. RESOLUTION
Every pronoun (it, this, they, that, these, those) and every isolated symbol or term (e.g., "E", "the function", "this process") in the INSTRUCTOR'S QUESTION MUST be resolved against MOST RECENT TEACHING first, then EARLIER LECTURE HISTORY. Never resolve from training data when transcript evidence exists. If no antecedent exists anywhere in the transcript, fall back to training knowledge ONLY for non-time-sensitive questions.

2. CORRECT ANSWER
- If the transcript supplies the answer, use it verbatim or in its closest faithful paraphrase. Transcript ALWAYS overrides training data.
- If the transcript does not supply it and the question is non-time-sensitive, answer from general knowledge of the apparent domain.
- If the question asks for a CURRENT fact (officeholder, price, champion, latest version, recent event) and the transcript does not supply it, set the correct option to "Needs current verification" and state in the explanation that the answer is time-sensitive and must be checked against current sources. Do NOT confidently emit a possibly outdated fact.

3. DISTRACTORS
Distractors must be domain-specific, on-topic, plausible alternatives — items a student of THIS subject could reasonably confuse with the correct answer. FORBIDDEN: "none of the above", "all of the above", "the output of the process", "the end result", "not specified", or any generic filler.

4. FAILURE MODE TO AVOID
Question: "What does E represent?" Transcript: "E is the dominant allele in Mendelian genetics." Correct answer: "The dominant allele." Wrong: any physics, math, or energy interpretation. Transcript context overrides all prior knowledge — every time.

5. OUTPUT
Emit the MCQ ONLY through the \`generate_mcq_options\` tool call. Never write prose outside the tool call. The tool call must contain exactly 4 options labeled "A. …" through "D. …", a \`correct_answer\` letter (A/B/C/D), and a brief \`explanation\` justifying the correct answer with reference to the transcript when applicable.`
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
