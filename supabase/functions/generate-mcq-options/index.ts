import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { callClaude } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/^[a-d][\.\)\:]\s*/i, '') // strip "A. " prefix
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalize(s).split(' ').filter(w => w.length >= 3));
}

/**
 * Jaccard token overlap between two strings, weighted to be tolerant of paraphrase.
 * Returns a value in [0, 1].
 */
function tokenOverlap(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

/**
 * Verify the model's chosen `correct_answer` letter actually points to an option
 * whose content is supported by the lecture transcript (when transcript context exists).
 *
 * Returns:
 *   - { ok: true } if the answer is reasonable (citation matches, or no transcript to check)
 *   - { ok: false, reason } if the answer is unsupported by transcript and a retry is warranted
 */
function validateAnswer(
  result: { options: string[]; correct_answer: string; explanation?: string; citation?: string },
  priorContext: string,
  broadContext: string,
): { ok: boolean; reason?: string } {
  const transcript = `${priorContext}\n${broadContext}`.trim();
  if (!transcript || transcript.length < 40) {
    // No transcript to verify against — accept the model output as-is.
    return { ok: true };
  }

  const letters = ['A', 'B', 'C', 'D'];
  const idx = letters.indexOf((result.correct_answer || '').toUpperCase());
  if (idx < 0 || !result.options?.[idx]) {
    return { ok: false, reason: 'correct_answer letter does not map to an option' };
  }
  const correctText = result.options[idx];
  const correctNorm = normalize(correctText);

  // 1. If model provided a citation, require the citation to actually appear
  //    in the transcript AND the correct option's tokens to overlap with it.
  if (result.citation && result.citation.trim().length > 5) {
    const citationNorm = normalize(result.citation);
    const transcriptNorm = normalize(transcript);
    // Look for a meaningful chunk of the citation (first 6 words) inside transcript
    const citationHead = citationNorm.split(' ').slice(0, 6).join(' ');
    if (citationHead.length > 0 && !transcriptNorm.includes(citationHead)) {
      return { ok: false, reason: `citation not found in transcript: "${citationHead}"` };
    }
    const overlapWithCitation = tokenOverlap(correctText, result.citation);
    if (overlapWithCitation < 0.2) {
      return { ok: false, reason: `correct option does not overlap with its own citation (${overlapWithCitation.toFixed(2)})` };
    }
    return { ok: true };
  }

  // 2. No citation provided. If the transcript is too short to reliably score
  //    overlap, skip validation — the overlap heuristic produces too many
  //    false rejects below ~400 chars and triggers a needless Pro retry.
  if (transcript.length < 400) {
    return { ok: true };
  }

  // Score every option against the transcript and require the chosen one to
  // be at least tied-best (within 0.15 of the max).
  const scores = result.options.map(opt => tokenOverlap(opt, transcript));
  const maxScore = Math.max(...scores);
  const correctScore = scores[idx];

  // If transcript looks unrelated to all options, can't validate — accept.
  if (maxScore < 0.15) return { ok: true };

  if (maxScore - correctScore > 0.15) {
    return {
      ok: false,
      reason: `correct option weakly supported by transcript (score=${correctScore.toFixed(2)}, best=${maxScore.toFixed(2)})`,
    };
  }
  return { ok: true };
}

// ── Main handler ─────────────────────────────────────────────────────────────

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
    const broadContext = (source_transcript || '').slice(-3000).trim();
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

    const systemPrompt = `Today's date is ${todayStr}. Your training data has a knowledge cutoff and may be stale for time-sensitive facts (current officeholders, prices, champions, versions, recent events).

You are an educational assessment engine embedded in Edvana, a live classroom platform. Your ONLY job: generate a 4-option multiple choice question grounded in a professor's live lecture.

INPUTS
You will receive a user message containing:
- [MOST RECENT TEACHING — IMMEDIATELY BEFORE THE QUESTION]: prose spoken right before the question. HIGHEST priority for resolving references.
- [EARLIER LECTURE HISTORY]: broader session transcript. Secondary reference.
- INSTRUCTOR'S QUESTION: the short utterance to convert into an MCQ.

EXECUTION ORDER — apply rules top-to-bottom.

1. RESOLUTION
Every pronoun (it, this, they, that, these, those) and every isolated symbol or term (e.g., "E", "the function", "this process") in the INSTRUCTOR'S QUESTION MUST be resolved against MOST RECENT TEACHING first, then EARLIER LECTURE HISTORY. Never resolve from training data when transcript evidence exists. If no antecedent exists anywhere in the transcript, fall back to training knowledge ONLY for non-time-sensitive questions.

2. CORRECT ANSWER (CRITICAL — most failures happen here)
- First, identify the answer by extracting it FROM the transcript when transcript evidence exists. Quote the exact span you used as your justification in the \`citation\` field.
- The transcript ALWAYS overrides training data. If the transcript says E is the dominant allele, the answer is "the dominant allele" — never an energy/physics interpretation, regardless of how the symbol "E" is used elsewhere.
- If the transcript does not supply the answer and the question is non-time-sensitive, answer from general knowledge of the apparent domain. Leave \`citation\` empty.
- If the question asks for a CURRENT fact (officeholder, price, champion, latest version, recent event) and the transcript does not supply it, set the correct option to "Needs current verification" and state in the explanation that the answer is time-sensitive. Do NOT confidently emit a possibly outdated fact.

3. DISTRACTORS
Distractors must be domain-specific, on-topic, plausible alternatives — items a student of THIS subject could reasonably confuse with the correct answer. FORBIDDEN: "none of the above", "all of the above", "the output of the process", "the end result", "not specified", or any generic filler.

4. SELF-CHECK BEFORE EMITTING
Before emitting the tool call, re-read the option you marked as correct. Confirm it directly answers the INSTRUCTOR'S QUESTION using the transcript evidence in \`citation\`. If the chosen option does not match the citation's meaning, fix the assignment.

5. OUTPUT
Emit the MCQ ONLY through the \`generate_mcq_options\` tool call. Never write prose outside the tool call. The tool call must contain exactly 4 options labeled "A. …" through "D. …", a \`correct_answer\` letter (A/B/C/D), a \`citation\` (the exact transcript span justifying the answer, or empty string if answered from general knowledge), and a brief \`explanation\` justifying the correct answer with reference to the transcript when applicable.`;

    const userPrompt = `${teachingContextBlock ? `=== TEACHING CONTEXT (background — earlier in the lecture) ===\n${teachingContextBlock}\n\n` : ''}=== INSTRUCTOR'S QUESTION (turn this into a 4-option MCQ) ===\n"${question_text}"\n\nGenerate 4 multiple choice options. Format each option as "A. text", "B. text", "C. text", "D. text". Resolve any pronouns first using the transcript. Quote the exact transcript span you used in \`citation\`. If this is a time-sensitive CURRENT question and the teaching context does not explicitly provide the answer, do NOT guess using possibly outdated memory — make the correct option a verification-safe answer like "Needs current verification" and explain that current sources should be checked. Distractors must be specific and topic-relevant — never vague phrases.`;

    const tools = [
      {
        type: 'function' as const,
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
              citation: {
                type: 'string',
                description: 'Exact transcript span (10-200 chars) that justifies the correct answer, or empty string if answered from general knowledge.',
              },
              explanation: {
                type: 'string',
                description: 'Brief explanation of why the correct answer is correct'
              }
            },
            required: ['options', 'correct_answer', 'citation'],
            additionalProperties: false
          }
        }
      }
    ];

    // D1 — structured timing log. Each call emits a single JSON line so the
    // Supabase Functions dashboard can be filtered/aggregated by `evt`.
    async function callModel(model: string, stage: 'primary' | 'retry', retryHint?: string) {
      const messages: Array<{ role: 'system' | 'user'; content: string }> = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];
      if (retryHint) {
        messages.push({
          role: 'user',
          content: `RETRY: Your previous attempt failed validation: ${retryHint}. Re-read the transcript carefully. Identify the answer FROM the transcript first, then assign the correct letter to the option that matches that answer. Fill \`citation\` with the exact transcript span.`,
        });
      }
      const t0 = performance.now();
      const res = await callClaude({
        model,
        messages,
        tools,
        tool_choice: { type: 'function', function: { name: 'generate_mcq_options' } },
      });
      const elapsed = Math.round(performance.now() - t0);
      console.log(JSON.stringify({
        evt: 'mcq.llm_call',
        stage,
        model,
        ms: elapsed,
        ok: res.ok,
        status: res.status,
        focused_ctx_chars: focusedContext.length,
        broad_ctx_chars: broadContext.length,
      }));
      return res;
    }

    // Always start with Flash — ~2-3s vs Pro's ~8-12s, and plenty capable for
    // a 4-option MCQ. The validator will escalate to Pro on the rare retry.
    const primaryModel = 'google/gemini-2.5-flash';

    const primaryStart = performance.now();
    let response = await callModel(primaryModel, 'primary');

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    let data = await response.json();
    let toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== 'generate_mcq_options') {
      throw new Error('Invalid response from AI - no tool call found');
    }

    let result = JSON.parse(toolCall.function.arguments);

    if (!result.options || result.options.length !== 4 || !result.correct_answer) {
      throw new Error('Invalid MCQ options generated');
    }

    // Deterministic validator — catch the most common failure mode (wrong letter
    // assigned to the correct text) before it ships to students.
    let verdict = validateAnswer(result, focusedContext, broadContext);
    // Only escalate to Pro for STRUCTURAL failures. The "weakly supported by
    // transcript" branch is a noisy heuristic on live ASR text and was the
    // dominant cause of 10s+ stalls. Ship the Flash result with a warning
    // instead of paying the Pro round-trip.
    const isStructuralFailure = !verdict.ok && !!verdict.reason && (
      verdict.reason.includes('does not map to an option') ||
      verdict.reason.includes('citation not found in transcript') ||
      verdict.reason.includes('does not overlap with its own citation')
    );
    if (!verdict.ok && isStructuralFailure) {
      console.warn(`MCQ validator REJECTED first attempt (structural): ${verdict.reason}. Retrying once with stronger model.`);
      const retryResp = await callModel('google/gemini-2.5-pro', 'retry', verdict.reason);
      if (retryResp.ok) {
        const retryData = await retryResp.json();
        const retryCall = retryData.choices?.[0]?.message?.tool_calls?.[0];
        if (retryCall?.function?.name === 'generate_mcq_options') {
          const retryResult = JSON.parse(retryCall.function.arguments);
          if (retryResult.options?.length === 4 && retryResult.correct_answer) {
            const retryVerdict = validateAnswer(retryResult, focusedContext, broadContext);
            if (retryVerdict.ok) {
              console.log('MCQ validator accepted retry attempt.');
              result = retryResult;
              verdict = retryVerdict;
            } else {
              console.warn(`MCQ retry also rejected: ${retryVerdict.reason}. Shipping retry result anyway with warning flag.`);
              result = retryResult; // still better than original
            }
          }
        }
      }
    } else if (!verdict.ok) {
      console.warn(`MCQ validator soft-warning (no retry): ${verdict.reason}`);
    }

    const totalMs = Math.round(performance.now() - primaryStart);
    console.log(JSON.stringify({
      evt: 'mcq.complete',
      total_ms: totalMs,
      validator_ok: verdict.ok,
      validator_warning: verdict.ok ? null : verdict.reason,
      question_chars: question_text.length,
    }));

    return new Response(
      JSON.stringify({
        options: result.options,
        correct_answer: result.correct_answer,
        explanation: result.explanation || null,
        citation: result.citation || null,
        validator_warning: verdict.ok ? null : verdict.reason,
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
