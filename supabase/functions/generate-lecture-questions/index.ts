import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get and verify user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check instructor role
    const { data: isInstructor, error: roleError } = await supabaseClient
      .rpc('has_role', { _user_id: user.id, _role: 'instructor' });

    if (roleError || !isInstructor) {
      return new Response(
        JSON.stringify({ error: 'Instructor access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { transcript, materialContext } = await req.json();
    
    // Input validation for security
    if (!transcript || typeof transcript !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Transcript must be a non-empty string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (transcript.length < 30) {
      return new Response(
        JSON.stringify({ error: 'Transcript too short (minimum 30 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (transcript.length > 50000) {
      return new Response(
        JSON.stringify({ error: 'Transcript too long (maximum 50,000 characters)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate transcript doesn't contain control characters
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(transcript)) {
      return new Response(
        JSON.stringify({ error: 'Transcript contains invalid characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate materialContext if provided
    if (materialContext !== undefined && materialContext !== null) {
      if (!Array.isArray(materialContext)) {
        return new Response(
          JSON.stringify({ error: 'materialContext must be an array' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (materialContext.length > 10) {
        return new Response(
          JSON.stringify({ error: 'materialContext cannot contain more than 10 items' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Validate each material item
      for (let i = 0; i < materialContext.length; i++) {
        const material = materialContext[i];
        if (typeof material.content === 'string' && material.content.length > 10000) {
          return new Response(
            JSON.stringify({ error: `Material ${i + 1} content exceeds 10,000 characters` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Service temporarily unavailable' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build context from uploaded materials only
    let contextInfo = '';
    
    if (materialContext && materialContext.length > 0) {
      contextInfo += `Reference Course Materials:\n`;
      materialContext.forEach((material: any, idx: number) => {
        contextInfo += `\nMaterial ${idx + 1}: ${material.title}\n`;
        if (material.description) {
          contextInfo += `Description: ${material.description}\n`;
        }
        if (material.content) {
          contextInfo += `Content excerpt: ${material.content.slice(0, 1000)}\n`;
        }
      });
    }

    const systemPrompt = `You are an expert educational assessment designer. Generate adaptive check-in questions based ONLY on what the professor is saying in the lecture transcript.

${contextInfo ? contextInfo + '\n' : ''}${contextInfo ? 'IMPORTANT: Use the uploaded course materials ONLY as reference context to better understand concepts mentioned in the lecture. Generate questions strictly based on what the professor actually says in the transcript.\n\n' : ''}

CRITICAL: Focus on the MOST RECENT content in the transcript - the professor may have just asked a question or introduced a new topic. Prioritize the last few sentences.

Generate exactly 3 different question options. CRITICAL: Each option must contain ONLY ONE question.

For each option, create ONE question that:
1. Tests understanding of the MOST RECENT key concept or question mentioned by the professor
2. If the professor asked a question at the end, make that the focus of your generated question
3. Is appropriate for real-time lecture check-ins
4. Can be answered quickly (2-3 minutes)
5. Is EITHER multiple choice OR short answer (not both)
6. Focuses on what the professor actually said in the most recent part of the transcript

Return a JSON array with 3 question sets. Each set is an array containing EXACTLY ONE question object.

Question format:
{
  "id": "unique_id",
  "text": "question text",
  "type": "multiple_choice" | "short_answer",
  "options": ["Option text 1", "Option text 2", "Option text 3", "Option text 4"], // only for multiple_choice, provide ONLY the text without letters
  "expectedAnswer": "A" | "B" | "C" | "D" // for multiple choice, provide ONLY the letter
}`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Transcript excerpt: "${transcript}"\n\nGenerate 3 different question options based on this lecture content.` }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to generate questions. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();
    console.log('AI response received:', JSON.stringify(result).substring(0, 200));
    
    const content = result.choices?.[0]?.message?.content;
    if (!content) {
      console.error('No content in AI response:', result);
      throw new Error('AI returned empty response');
    }
    
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse AI response:', content.substring(0, 500));
      return new Response(
        JSON.stringify({ error: 'Invalid response format. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate that we have questions
    let questions = parsedContent.questions || parsedContent;
    if (!Array.isArray(questions) || questions.length === 0) {
      console.error('Invalid questions format:', parsedContent);
      return new Response(
        JSON.stringify({ error: 'Invalid response format. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize format: wrap each question in an array if not already wrapped
    questions = questions.map((q: any, i: number) => {
      if (Array.isArray(q)) {
        return q; // Already wrapped
      } else if (typeof q === 'object' && q !== null) {
        // Single question object, wrap it
        return [q];
      } else {
        console.error(`Question ${i} is invalid:`, q);
        throw new Error('Invalid question format');
      }
    });

    console.log('✅ Successfully generated', questions.length, 'question sets');

    return new Response(
      JSON.stringify({ questions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Question generation error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate questions. Please try again.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});