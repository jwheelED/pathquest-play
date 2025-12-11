import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { 
      lectureVideoId,
      pausePointId,
      questionText,
      correctAnswer,
      studentAnswer,
      questionType,
      transcriptContext 
    } = await req.json();

    console.log('Detecting misconception for:', { lectureVideoId, questionType, studentAnswer });

    // Fetch concept map for the lecture
    const { data: conceptMap } = await supabaseClient
      .from('lecture_concept_map')
      .select('*')
      .eq('lecture_video_id', lectureVideoId)
      .order('start_timestamp');

    const conceptContext = conceptMap?.map(c => 
      `- ${c.concept_name} (${formatTime(c.start_timestamp)} - ${formatTime(c.end_timestamp)}): ${c.description || 'No description'}`
    ).join('\n') || 'No concept map available';

    const systemPrompt = `You are an expert educational AI that analyzes student misconceptions.
Your task is to:
1. Identify what specific concept the student misunderstood
2. Determine the root cause of the misconception
3. Find the best timestamp in the lecture to help remediate

Available concepts in this lecture:
${conceptContext}

Respond ONLY with valid JSON in this exact format:
{
  "misconception": "Brief description of what the student got wrong",
  "missingConcept": "The specific concept they need to understand",
  "rootCause": "Why they likely made this mistake",
  "recommendedTimestamp": 120.5,
  "endTimestamp": 180.0,
  "conceptName": "Name of the concept to review"
}`;

    const userPrompt = `Question: ${questionText}
Correct Answer: ${correctAnswer}
Student's Answer: ${studentAnswer}
Question Type: ${questionType}
${transcriptContext ? `\nRelevant Transcript Context:\n${transcriptContext}` : ''}

Analyze why the student got this wrong and identify which concept they need to review.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://edvana.app',
        'X-Title': 'Edvana Education Platform',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices[0]?.message?.content || '';
    
    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response as JSON');
    }

    const misconceptionData = JSON.parse(jsonMatch[0]);
    console.log('Misconception detected:', misconceptionData);

    return new Response(JSON.stringify({
      success: true,
      misconception: misconceptionData.misconception,
      missingConcept: misconceptionData.missingConcept,
      rootCause: misconceptionData.rootCause,
      recommendedTimestamp: misconceptionData.recommendedTimestamp,
      endTimestamp: misconceptionData.endTimestamp,
      conceptName: misconceptionData.conceptName,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in detect-misconception:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
