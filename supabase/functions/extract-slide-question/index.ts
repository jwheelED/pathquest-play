import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify instructor role
    const { data: hasRole } = await supabase.rpc('has_role', { _role: 'instructor', _user_id: user.id });
    if (!hasRole) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { slideImage, questionType } = await req.json();

    if (!slideImage) {
      return new Response(JSON.stringify({ error: 'Slide image is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validTypes = ['mcq', 'short_answer', 'coding'];
    const type = validTypes.includes(questionType) ? questionType : 'mcq';

    console.log(`📋 Extracting ${type} question from slide image (${slideImage.length} chars)`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build the prompt based on question type
    let extractionPrompt = '';
    
    if (type === 'mcq') {
      extractionPrompt = `You are analyzing a slide image that contains a multiple choice question.

Extract the question and return it in this exact JSON format:
{
  "found": true,
  "question": "The exact question text from the slide",
  "options": ["A. First option", "B. Second option", "C. Third option", "D. Fourth option"],
  "correctAnswer": "The letter of the correct answer (A, B, C, or D)",
  "explanation": "Brief explanation of why this is the correct answer"
}

If the correct answer is marked on the slide (checkmark, highlight, asterisk, etc.), use that.
If no correct answer is marked, analyze the content and determine the most likely correct answer.

If no question is found on this slide, return:
{"found": false, "error": "No question found on this slide"}

Return ONLY valid JSON, no other text.`;
    } else if (type === 'short_answer') {
      extractionPrompt = `You are analyzing a slide image that contains a short answer question.

Extract the question and return it in this exact JSON format:
{
  "found": true,
  "question": "The exact question text from the slide",
  "expectedAnswer": "The expected answer if shown, or a brief model answer",
  "explanation": "Additional context or explanation if available"
}

If no question is found on this slide, return:
{"found": false, "error": "No question found on this slide"}

Return ONLY valid JSON, no other text.`;
    } else if (type === 'coding') {
      extractionPrompt = `You are analyzing a slide image that contains a coding problem or challenge.

Extract the problem and return it in this exact JSON format:
{
  "found": true,
  "question": "The problem statement/description",
  "functionName": "The function name to implement",
  "parameters": "Description of input parameters",
  "returnType": "Expected return type",
  "examples": [
    {"input": "example input", "output": "expected output"}
  ],
  "constraints": "Any constraints mentioned",
  "starterCode": "// Starter code if shown on slide"
}

If no coding problem is found on this slide, return:
{"found": false, "error": "No coding problem found on this slide"}

Return ONLY valid JSON, no other text.`;
    }

    // Call Gemini with vision
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: extractionPrompt },
              { 
                type: 'image_url', 
                image_url: { 
                  url: slideImage.startsWith('data:') ? slideImage : `data:image/png;base64,${slideImage}`
                } 
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('📋 AI response:', content.substring(0, 500));

    // Parse the JSON response
    let extractedData;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return new Response(JSON.stringify({ 
        error: 'Failed to parse question from slide',
        details: content.substring(0, 200)
      }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!extractedData.found) {
      return new Response(JSON.stringify({ 
        error: extractedData.error || 'No question found on this slide'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Successfully extracted question:', extractedData.question?.substring(0, 100));

    return new Response(JSON.stringify({
      success: true,
      questionType: type,
      data: extractedData,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in extract-slide-question:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
