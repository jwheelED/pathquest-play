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

TASK: Extract the MOST RECENT complete question the professor asked, preserving EXACT wording.

TRANSCRIPT (with voice command at the end):
"""
${recentTranscript}
"""

CRITICAL EXTRACTION RULES:
1. Find the last complete question asked by the professor
2. Preserve the EXACT wording - do not paraphrase, shorten, or modify ANY words
3. Include the FULL question with all words intact (e.g., if they said "business", do not shorten to "bus")
4. Look for question indicators: "?", "what", "how", "why", "can you", "could you", etc.
5. The question is BEFORE any phrases like "send question now", "send this", "send it", etc.
6. Do NOT cut off the question mid-sentence or mid-word
7. Ensure the question makes complete sense when read alone
8. Return ONLY the question text, nothing else

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
        max_tokens: 500 // Increased from 300 to ensure complete questions
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const extractedQuestion = data.choices[0]?.message?.content?.trim();

    // Remove any potential trailing ellipsis or incomplete endings
    let cleanedQuestion = extractedQuestion;
    if (cleanedQuestion) {
      // If it ends with incomplete word indicators, log a warning
      if (cleanedQuestion.endsWith('...') || 
          !cleanedQuestion.endsWith('?') && !cleanedQuestion.endsWith('.')) {
        console.warn('⚠️ Extracted question may be incomplete:', cleanedQuestion);
      }
      
      // Trim any trailing ellipsis
      cleanedQuestion = cleanedQuestion.replace(/\.\.\.+$/, '').trim();
    }

    if (!cleanedQuestion || cleanedQuestion === 'NO_QUESTION_FOUND') {
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

    console.log('✅ Extracted question:', cleanedQuestion);

    // Determine question type based on content
    let suggestedType = 'multiple_choice';
    const lowerQuestion = cleanedQuestion.toLowerCase();
    
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
        question_text: cleanedQuestion,
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
