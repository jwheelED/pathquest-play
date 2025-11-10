import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

    // Verify instructor role
    const { data: roleData, error: roleError } = await supabase.rpc('has_role', {
      _user_id: user.id,
      _role: 'instructor'
    });

    if (roleError || !roleData) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Instructor role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { interval_transcript, interval_minutes } = await req.json();

    if (!interval_transcript || interval_transcript.length < 100) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Not enough content in interval' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📝 Generating auto-question from ${interval_minutes}-minute interval (${interval_transcript.length} chars)`);

    const prompt = `You are analyzing a ${interval_minutes}-minute segment of a university lecture.

RECENT LECTURE CONTENT (last ${interval_minutes} minutes):
"${interval_transcript}"

TASK: Generate ONE high-quality question that:
1. Tests the MOST IMPORTANT concept from this interval
2. Is clearly answerable based on what was just taught
3. Requires students to apply or recall key information
4. Avoids trivial or overly specific details

CRITERIA:
- Focus on main concepts, not minor details
- Question should be fair and clear
- Appropriate difficulty for what was just covered
- Avoid questions about examples unless they're core to understanding
- The question should test comprehension, not just recall

Return JSON:
{
  "question_text": "the question",
  "suggested_type": "multiple_choice" | "short_answer",
  "confidence": 0.0-1.0,
  "reasoning": "why this question tests the key concept"
}`;

    // Add timeout handling (30 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'You are an educational AI that generates high-quality lecture check-in questions. Return ONLY valid JSON, no markdown formatting.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          response_format: { type: "json_object" }
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'AI request timed out after 30 seconds' 
        }), {
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      let errorMessage = 'Failed to generate question from AI';
      if (response.status === 429) {
        errorMessage = 'AI service rate limit exceeded. Please try again in a moment.';
      } else if (response.status === 402) {
        errorMessage = 'AI service quota exceeded. Please add credits to your workspace.';
      }
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: errorMessage,
        status_code: response.status
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiResponse = await response.json();
    let content = aiResponse.choices[0].message.content;
    
    // Enhanced JSON parsing with markdown cleanup
    content = content
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim();
    
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error('JSON parse failed, content:', content);
      // Fallback: try to extract JSON from text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Failed to parse AI response'
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log('✅ Auto-question generated:', result.question_text);
    console.log('📊 Confidence:', result.confidence, '| Reasoning:', result.reasoning);

    // Only return questions with reasonable confidence (lowered from 0.5 to 0.3)
    if (result.confidence < 0.3) { // Lowered threshold for better question generation
      console.log('⚠️ Confidence too low, skipping auto-question');
      console.log('   Question was:', result.question_text);
      console.log('   Confidence:', result.confidence);
      console.log('   Reasoning:', result.reasoning);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Generated question did not meet confidence threshold',
        confidence: result.confidence,
        question_text: result.question_text,
        reasoning: result.reasoning
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      question_text: result.question_text,
      suggested_type: result.suggested_type,
      confidence: result.confidence,
      reasoning: result.reasoning
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-interval-question:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
