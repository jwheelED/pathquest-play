import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
};

const STOP = new Set([
  'the','a','an','is','are','of','to','in','on','for','and','or','what','which','that','this',
  'these','those','it','its','as','be','by','do','does','did','how','why','when','where','who','can','could','would','should','will','was','were'
]);

function tokens(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP.has(t));
}

// Aggressive normalization for exact-string compare: lowercase, strip all
// non-alphanumerics, collapse whitespace. Strips leading "1." / "Q2:" prefixes
// that PDF parsing often preserves.
function normalizeForExact(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/^\s*(q\s*\d+\s*[:.\-)]\s*|\d+\s*[:.\-)]\s*)/i, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  let hits = 0;
  for (const t of b) if (setA.has(t)) hits++;
  return hits / Math.max(a.length, b.length);
}

function normalizeQuestionContent(questionType: string, content: any): Record<string, unknown> {
  if (content?.mcq) {
    return {
      question: content.mcq.question || '',
      options: content.mcq.options || [],
      correctAnswer: content.mcq.correct_answer || content.mcq.correctAnswer || 'A',
      explanation: content.mcq.explanation || '',
    };
  }
  if (content?.short_answer) {
    return {
      question: content.short_answer.question || '',
      expectedAnswer: content.short_answer.expected_answer || content.short_answer.expectedAnswer || '',
      explanation: content.short_answer.explanation || '',
    };
  }
  return content || { question: '', type: questionType };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { question_text, course_id, format } = await req.json();
    if (!question_text || typeof question_text !== 'string') {
      return new Response(JSON.stringify({ error: 'question_text required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map UI format to bank question_type values
    const formatTypes: string[] = (() => {
      if (format === 'short_answer') return ['short_answer'];
      if (format === 'poll' || format === 'multiple_choice') return ['multiple_choice', 'mcq', 'poll'];
      return ['multiple_choice', 'mcq', 'poll', 'short_answer'];
    })();

    let q = supabase
      .from('instructor_question_bank')
      .select('id, title, question_type, question_content')
      .eq('instructor_id', user.id)
      .in('question_type', formatTypes)
      .limit(200);

    if (course_id) {
      q = q.or(`course_id.eq.${course_id},course_id.is.null`);
    }

    let slideQ = supabase
      .from('slide_preset_questions')
      .select('id, question_name, question_type, question_content')
      .eq('instructor_id', user.id)
      .in('question_type', formatTypes)
      .limit(200);

    if (course_id) {
      slideQ = slideQ.or(`course_id.eq.${course_id},course_id.is.null`);
    }

    const [{ data: bankData, error: bankErr }, { data: slideData, error: slideErr }] = await Promise.all([q, slideQ]);
    if (bankErr) throw bankErr;
    if (slideErr) throw slideErr;

    const bankRows = [
      ...((bankData || []) as any[]).map((r) => ({ ...r, source_table: 'instructor_question_bank' })),
      ...((slideData || []) as any[]).map((r) => ({
        id: r.id,
        title: r.question_name || 'Slide Question',
        question_type: r.question_type === 'mcq' ? 'multiple_choice' : r.question_type,
        question_content: normalizeQuestionContent(r.question_type, r.question_content),
        source_table: 'slide_preset_questions',
      })),
    ];
    if (!bankRows || bankRows.length === 0) {
      return new Response(JSON.stringify({ match: null, reason: 'empty_bank' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 0) Exact-string short-circuit. If a bank question's text matches the
    // spoken question after aggressive normalization, return it immediately.
    const askExact = normalizeForExact(question_text);
    if (askExact.length > 0) {
      const exactHit = bankRows.find((r: any) => {
        const bq: string = r.question_content?.question || r.title || '';
        return normalizeForExact(bq) === askExact;
      });
      if (exactHit) {
        console.log(`[match-bank] exact_match id=${exactHit.id} title="${exactHit.title}"`);
        return new Response(JSON.stringify({
          match: {
            id: exactHit.id,
            title: exactHit.title,
            question_type: exactHit.question_type,
            question_content: exactHit.question_content,
          },
          confidence: 1.0,
          source: 'exact_match',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const askTokens = tokens(question_text);

    type Scored = {
      id: string;
      title: string;
      question_type: string;
      question_content: any;
      score: number;
      bankQuestion: string;
    };

    const scored: Scored[] = bankRows.map((r: any) => {
      const bq: string = r.question_content?.question || r.title || '';
      return {
        id: r.id,
        title: r.title,
        question_type: r.question_type,
        question_content: r.question_content,
        bankQuestion: bq,
        score: overlap(askTokens, tokens(bq)),
      };
    }).sort((a, b) => b.score - a.score);

    const top = scored.filter(s => s.score >= 0.3).slice(0, 8);
    if (top.length === 0) {
      console.log(`[match-bank] no_lexical_match bank_size=${bankRows.length} top_score=${scored[0]?.score ?? 0}`);
      return new Response(JSON.stringify({ match: null, reason: 'no_lexical_match' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use AI to confirm best semantic match among top candidates.
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const candidatesBlock = top
      .map((c, i) => `[${i}] id=${c.id} | "${c.bankQuestion.slice(0, 240)}"`)
      .join('\n');

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You decide whether an instructor\'s spoken question is essentially the same question (same intent and same correct answer) as one of the candidate bank questions. Return the index of the best match and a confidence 0–1. If no candidate is essentially the same, return match_index=-1.',
          },
          {
            role: 'user',
            content: `SPOKEN QUESTION:\n"${question_text}"\n\nCANDIDATES:\n${candidatesBlock}\n\nReturn the index of the candidate that asks essentially the same thing (same answer expected). Be strict: paraphrases of the same question = match. Different topic, different specifics, or different correct answer = no match (-1).`,
          },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'pick_match',
            description: 'Pick the matching candidate index',
            parameters: {
              type: 'object',
              properties: {
                match_index: { type: 'integer', description: 'Index of best matching candidate, or -1 for no match' },
                confidence: { type: 'number', description: '0 to 1 confidence in the match' },
                reason: { type: 'string' },
              },
              required: ['match_index', 'confidence'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'pick_match' } },
      }),
    });

    if (!aiResp.ok) {
      const txt = await aiResp.text();
      console.error('AI gateway error', aiResp.status, txt);
      // Fall back to lexical top match if it's strong
      const best = top[0];
      if (best.score >= 0.7) {
        return new Response(JSON.stringify({
          match: { id: best.id, title: best.title, question_type: best.question_type, question_content: best.question_content },
          confidence: best.score,
          source: 'lexical_fallback',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ match: null, reason: 'ai_error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiJson = await aiResp.json();
    const tc = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!tc) {
      return new Response(JSON.stringify({ match: null, reason: 'no_tool_call' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const args = JSON.parse(tc.function.arguments);
    const idx = args.match_index;
    const confidence = args.confidence ?? 0;

    if (typeof idx !== 'number' || idx < 0 || idx >= top.length || confidence < 0.75) {
      console.log(`[match-bank] low_confidence idx=${idx} conf=${confidence} top_score=${top[0]?.score}`);
      return new Response(JSON.stringify({ match: null, confidence, reason: 'low_confidence' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const picked = top[idx];
    console.log(`[match-bank] ai_match id=${picked.id} conf=${confidence} title="${picked.title}"`);
    return new Response(JSON.stringify({
      match: {
        id: picked.id,
        title: picked.title,
        question_type: picked.question_type,
        question_content: picked.question_content,
      },
      confidence,
      source: 'ai_match',
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    console.error('match-bank-question error', err);
    return new Response(JSON.stringify({ error: err.message || 'internal_error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
