import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const INTENT_DETECTION_PROMPT = `You are an AI that detects when a professor asks a question to students during a live lecture.

Your task:
1. Analyze the recent transcript chunk and broader context
2. Determine if the professor is asking a question that students should answer
3. Extract the exact question text
4. Suggest question type (multiple_choice, short_answer, or coding)

IMPORTANT RULES:
- Only detect REAL questions for students (not rhetorical questions)
- Ignore questions like "You know what I mean?" or "Isn't that interesting?"
- Detect questions that start with phrases like:
  * "My question for you is..."
  * "So class, what is..."
  * "Can anyone tell me..."
  * "Here's a question..."
  * "Let me ask you..."
- Detect implicit questions like "What is 2+2?" without preamble
- If professor immediately answers their own question, ignore it
- Coding questions mention: "write", "implement", "code", "function", "algorithm"
- Multiple choice indicators: "which one", "choose", "select", "true or false"
- Default to short_answer for most questions

Return JSON with:
{
  "is_question": boolean,
  "confidence": 0.0-1.0 (how confident you are this is a real question),
  "question_text": "extracted question" or null,
  "suggested_type": "multiple_choice" | "short_answer" | "coding" | null,
  "reasoning": "brief explanation"
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting: max 10 detection calls per minute
    const rateLimitKey = `question_detection:${user.id}`;
    const windowStart = new Date(Date.now() - (Date.now() % 60000)); // Current minute window
    
    const { data: rateLimitData, error: rateLimitError } = await supabase
      .from('rate_limits')
      .select('count')
      .eq('key', rateLimitKey)
      .eq('window_start', windowStart.toISOString())
      .single();

    if (rateLimitData && rateLimitData.count >= 10) {
      console.log('🚫 Rate limit exceeded for user:', user.id);
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded: max 10 detections per minute',
        retry_after: 60 - Math.floor((Date.now() % 60000) / 1000)
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Record this detection attempt
    if (rateLimitData) {
      await supabase
        .from('rate_limits')
        .update({ count: rateLimitData.count + 1 })
        .eq('key', rateLimitKey)
        .eq('window_start', windowStart.toISOString());
    } else {
      await supabase
        .from('rate_limits')
        .insert({
          key: rateLimitKey,
          window_start: windowStart.toISOString(),
          count: 1
        });
    }

    const { recentChunk, context } = await req.json();

    if (!recentChunk || !context) {
      return new Response(JSON.stringify({ error: 'Missing recentChunk or context' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('🔍 Analyzing chunk for questions...');
    console.log('Recent:', recentChunk.substring(0, 100));

    // Call Lovable AI for intent detection
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: INTENT_DETECTION_PROMPT },
          { role: 'user', content: `Recent speech: "${recentChunk}"\n\nBroader context: "${context}"` }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'AI detection failed', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResponse = await response.json();
    const result = JSON.parse(aiResponse.choices[0].message.content);

    console.log('✅ Detection result:', result);

    return new Response(JSON.stringify({
      is_question: result.is_question,
      confidence: result.confidence,
      question_text: result.question_text,
      suggested_type: result.suggested_type,
      reasoning: result.reasoning
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in detect-lecture-question:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
