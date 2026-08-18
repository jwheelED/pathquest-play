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

    // Build a labelled, role-explicit context block. Prior context (focused, recent teaching prose
    // captured at trigger time) is given highest priority for pronoun resolution; the broader
    // source_transcript tail is included as background lecture history.
    //
    // PERF: when we already have focused prior_context, trim the broad transcript tail
    // hard (1200 chars vs 3000). The focused window covers pronoun resolution, and the
    // extra ~1800 chars of stale lecture history adds input-token latency without
    // improving answer quality on short factual questions.
    const focusedContext = (prior_context || '').trim();
    const broadCap = focusedContext.length > 0 ? 1200 : 2400;
    const broadContext = (source_transcript || '').slice(-broadCap).trim();
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

    // PERF: tight system prompt — keeps the critical rules (transcript overrides
    // training data, no vague distractors, time-sensitive guard) while cutting
    // ~1.4 KB of input tokens per request.
    const systemPrompt = `Today is ${todayStr}. You generate ONE 4-option MCQ from a professor's live-lecture utterance for Edvana.

Rules (apply in order):
1. RESOLVE pronouns and isolated symbols ("it","this","E","the function") against MOST RECENT TEACHING first, then EARLIER LECTURE HISTORY. Never resolve from training data when transcript evidence exists.
2. CORRECT ANSWER: extract from the transcript when transcript evidence exists. Transcript ALWAYS overrides training data. If non-time-sensitive and no transcript evidence, answer from general knowledge. If the question asks for a CURRENT fact (current officeholder, price, champion, version, recent event) and the transcript does NOT supply it, set the correct option to "Needs current verification" and say so in the explanation. Do NOT guess time-sensitive facts.
3. DISTRACTORS: domain-specific, on-topic, plausible. FORBIDDEN: "none of the above", "all of the above", "not specified", "the end result", or any generic filler.
4. Emit ONLY via the \`generate_mcq_options\` tool call. Exactly 4 options "A. …" through "D. …", a \`correct_answer\` letter, a brief \`explanation\`, and optionally a short \`citation\` (transcript span you used).`;

    const userPrompt = `${teachingContextBlock ? `=== TEACHING CONTEXT ===\n${teachingContextBlock}\n\n` : ''}=== INSTRUCTOR'S QUESTION ===\n"${question_text}"\n\nGenerate 4 MCQ options ("A. …" through "D. …"). Resolve pronouns using the transcript. If time-sensitive and not supplied, correct answer = "Needs current verification". Distractors must be specific.`;

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
            required: ['options', 'correct_answer'],
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

    // Primary + retry both use the default Kimi model. A structural-failure retry
    // re-runs with the validator's reason injected as a hint (see below), which
    // still clears the most common wrong-letter bug even on the same model.
    const primaryModel = 'kimi-k2.6';

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
      console.warn(`MCQ validator REJECTED first attempt (structural): ${verdict.reason}. Retrying once with a corrective hint.`);
      // Retry re-runs the same Kimi model with the validator's reason injected as
      // a hint, which clears most structural (wrong-letter) failures.
      const retryResp = await callModel('kimi-k2.6', 'retry', verdict.reason);
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
