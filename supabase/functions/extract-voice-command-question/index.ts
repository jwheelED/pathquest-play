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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { recentTranscript } = await req.json();

    if (!recentTranscript || recentTranscript.length < 10) {
      return new Response(
        JSON.stringify({ error: 'No transcript provided' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🎤 Voice command triggered - extracting question from:', recentTranscript.substring(0, 100));

    const prompt = `You are analyzing a lecture transcript where a professor used a voice command to send a question to students.

TASK: Extract the MOST RECENT complete question the professor asked, from BEFORE the voice command.

TRANSCRIPT (with voice command at the end):
"""
${recentTranscript}
"""

EXTRACTION RULES:
1. Find the last complete question asked by the professor
2. It should be a proper educational question (not rhetorical)
3. Include the full question with proper context
4. Look for question indicators: "?", "what", "how", "why", "can you", "could you", etc.
5. The question is BEFORE any phrases like "send question now", "send this", etc.
6. Return ONLY the question text, nothing else

If no clear question is found in the transcript, respond with "NO_QUESTION_FOUND".

Question:`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash', // Fast model for low latency
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 300
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const extractedQuestion = data.choices[0]?.message?.content?.trim();

    if (!extractedQuestion || extractedQuestion === 'NO_QUESTION_FOUND') {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Could not find a clear question in the recent transcript'
        }), 
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('✅ Extracted question:', extractedQuestion);

    // Determine question type based on content
    let suggestedType = 'multiple_choice';
    const lowerQuestion = extractedQuestion.toLowerCase();
    
    if (lowerQuestion.includes('code') || lowerQuestion.includes('program') || 
        lowerQuestion.includes('function') || lowerQuestion.includes('implement')) {
      suggestedType = 'coding';
    } else if (lowerQuestion.includes('explain') || lowerQuestion.includes('describe') || 
               lowerQuestion.includes('why') || lowerQuestion.includes('how')) {
      suggestedType = 'short_answer';
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        question_text: extractedQuestion,
        suggested_type: suggestedType,
        extraction_method: 'voice_command'
      }), 
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error in extract-voice-command-question:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
