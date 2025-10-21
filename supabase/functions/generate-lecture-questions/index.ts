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
    
    // Reduced minimum to 30 chars for faster response
    if (!transcript || transcript.length < 30) {
      throw new Error('Transcript too short to generate questions');
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
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

Generate exactly 3 different question options. CRITICAL: Each option must contain ONLY ONE question.

For each option, create ONE question that:
1. Tests understanding of key concepts directly mentioned in the lecture transcript
2. Is appropriate for real-time lecture check-ins
3. Can be answered quickly (2-3 minutes)
4. Is EITHER multiple choice OR short answer (not both)
5. Focuses on what the professor actually said, not on general course topics

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
        model: 'google/gemini-2.5-flash',
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
      const error = await response.text();
      console.error('AI API error:', error);
      throw new Error(`AI API error: ${response.status}`);
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
      throw new Error('Invalid AI response format - could not parse JSON');
    }

    // Validate that we have questions
    const questions = parsedContent.questions || parsedContent;
    if (!Array.isArray(questions) || questions.length === 0) {
      console.error('Invalid questions format:', parsedContent);
      throw new Error('AI did not return valid question sets');
    }

    // Validate each question set
    for (let i = 0; i < questions.length; i++) {
      if (!Array.isArray(questions[i]) || questions[i].length === 0) {
        console.error(`Question set ${i} is invalid:`, questions[i]);
        throw new Error(`Question set ${i} is not properly formatted`);
      }
    }

    console.log('✅ Successfully generated', questions.length, 'question sets');

    return new Response(
      JSON.stringify({ questions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Question generation error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});