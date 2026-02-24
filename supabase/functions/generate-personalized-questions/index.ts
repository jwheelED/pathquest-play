import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    const { materialId, userId, difficulty = 'intermediate', questionCount = 5 } = await req.json();

    if (!materialId) {
      return new Response(
        JSON.stringify({ error: 'materialId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the material
    const { data: material, error: materialError } = await supabaseClient
      .from('student_study_materials')
      .select('id, title, content, material_type, file_path')
      .eq('id', materialId)
      .single();

    if (materialError || !material) {
      console.error('Material fetch error:', materialError);
      return new Response(
        JSON.stringify({ error: 'Material not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build context from material content
    let materialContext = material.content || '';
    if (!materialContext && material.title) {
      materialContext = `Study material titled: "${material.title}"`;
    }

    // Trim to avoid token overflow
    const trimmedContext = materialContext.substring(0, 8000);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Generating ${questionCount} ${difficulty} questions for material: ${material.title}`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert educator creating practice questions for students. Generate exactly ${questionCount} questions at ${difficulty} difficulty level based on the provided study material. Mix question types: multiple choice and short answer. For multiple choice, provide 4 options. Questions should test understanding, not just recall.`
          },
          {
            role: 'user',
            content: `Generate ${questionCount} practice questions from this study material:\n\n${trimmedContext}`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'save_questions',
              description: 'Save generated practice questions',
              parameters: {
                type: 'object',
                properties: {
                  questions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        question_text: { type: 'string', description: 'The question' },
                        question_type: { type: 'string', enum: ['multiple_choice', 'short_answer'] },
                        options: {
                          type: 'array',
                          items: { type: 'string' },
                          description: 'Options for multiple choice (4 items). Null for short answer.'
                        },
                        correct_answer: { type: 'string', description: 'The correct answer' },
                        explanation: { type: 'string', description: 'Why this answer is correct' },
                        topic_tags: { type: 'array', items: { type: 'string' }, description: '1-3 topic tags' }
                      },
                      required: ['question_text', 'question_type', 'correct_answer', 'explanation']
                    }
                  }
                },
                required: ['questions'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'save_questions' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function?.name !== 'save_questions') {
      throw new Error('Invalid AI response - no tool call found');
    }

    const result = JSON.parse(toolCall.function.arguments);
    const questions = result.questions || [];

    if (questions.length === 0) {
      throw new Error('No questions generated');
    }

    // Use service role to insert questions
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get user's org_id
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    const questionsToInsert = questions.map((q: any) => ({
      user_id: user.id,
      source_material_id: materialId,
      org_id: profile?.org_id || null,
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.question_type === 'multiple_choice' && q.options ? q.options : null,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      difficulty,
      topic_tags: q.topic_tags || [],
      points_reward: difficulty === 'beginner' ? 5 : difficulty === 'intermediate' ? 10 : 15,
    }));

    const { error: insertError } = await serviceClient
      .from('personalized_questions')
      .insert(questionsToInsert);

    if (insertError) {
      console.error('Insert error:', insertError);
      throw new Error(`Failed to save questions: ${insertError.message}`);
    }

    // Update material question count
    await serviceClient
      .from('student_study_materials')
      .update({
        questions_generated: (material as any).questions_generated
          ? (material as any).questions_generated + questions.length
          : questions.length
      })
      .eq('id', materialId);

    console.log(`Successfully generated ${questions.length} questions`);

    return new Response(
      JSON.stringify({ count: questions.length, questions: questionsToInsert }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error generating personalized questions:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to generate questions' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
