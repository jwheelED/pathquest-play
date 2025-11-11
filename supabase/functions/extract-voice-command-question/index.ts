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

🚨 CRITICAL EXTRACTION RULES (FOLLOW EXACTLY):
1. Find the LAST COMPLETE question asked by the professor
2. YOU MUST preserve EVERY SINGLE WORD - do not paraphrase, shorten, or modify ANY words
3. Include the ENTIRE question from start to finish - DO NOT cut off any words
4. NEVER truncate mid-sentence or mid-word - if a question says "what does the death represent?", include ALL of "represent?"
5. Look for question indicators: "?", "what", "how", "why", "can you", "explain", etc.
6. The question is typically BEFORE phrases like "send question now", "send this", "send it"
7. DO NOT cut off questions - ensure they make complete grammatical sense
8. If the question is "what does the death represent?", DO NOT return "what does the death"

VALIDATION:
- Your extracted question MUST end with proper punctuation (?, ., or !)
- It MUST make complete grammatical sense when read alone
- It MUST include all words from the original question

If you cannot find a COMPLETE question in the transcript, respond with exactly: NO_QUESTION_FOUND

Return ONLY the complete question text, nothing else. Do not add explanations or notes.`;

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
        temperature: 0.1, // Lower from 0.2 for more deterministic extraction
        max_tokens: 1000 // Increase from 500 to ensure complete questions
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const extractedQuestion = data.choices[0]?.message?.content?.trim();

    // Validation checks for complete questions
    const validateQuestionCompleteness = (question: string): { isValid: boolean; reason?: string } => {
      if (!question || question.length < 5) {
        return { isValid: false, reason: 'Question too short' };
      }
      
      // Check for incomplete endings
      if (question.endsWith('...') || question.endsWith('..')) {
        return { isValid: false, reason: 'Question ends with ellipsis (incomplete)' };
      }
      
      // Check for mid-word truncation (ends with lowercase letter followed by space or nothing)
      if (/[a-z]$/.test(question) && !question.endsWith('?') && !question.endsWith('.')) {
        return { isValid: false, reason: 'Question appears to be cut off mid-word' };
      }
      
      // For questions, should typically end with ? or complete sentence
      const hasProperEnding = question.endsWith('?') || 
                              question.endsWith('.') || 
                              /[.!?]\s*$/.test(question);
      
      if (!hasProperEnding && question.split(' ').length > 3) {
        console.warn('⚠️ Question may be incomplete (no proper ending):', question);
      }
      
      // Check for common truncation patterns
      const truncationPatterns = [
        /\bwhat\s+does\s+the\s+\w+$/i,  // "what does the death" (cuts off "represent?")
        /\bhow\s+\w+\s+the\s+\w+$/i,    // "how does the system" (cuts off rest)
        /\bwhy\s+is\s+the\s+\w+$/i      // "why is the concept" (cuts off rest)
      ];
      
      for (const pattern of truncationPatterns) {
        if (pattern.test(question)) {
          return { isValid: false, reason: 'Detected common truncation pattern' };
        }
      }
      
      return { isValid: true };
    };

    const validation = validateQuestionCompleteness(extractedQuestion);
    if (!validation.isValid) {
      console.error('❌ Question failed completeness check:', validation.reason);
      console.error('   Extracted:', extractedQuestion);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: `Question extraction incomplete: ${validation.reason}. Please try again.`,
          debug: { extracted: extractedQuestion }
        }), 
        { 
          status: 422, // Unprocessable Entity
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

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
