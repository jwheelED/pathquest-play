import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { questionId, participantId, answer, responseTimeMs } = await req.json();

    if (!questionId || !participantId || !answer) {
      return new Response(
        JSON.stringify({ error: 'Question ID, participant ID, and answer are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get question to check correct answer
    const { data: question, error: questionError } = await supabaseClient
      .from('live_questions')
      .select('question_content')
      .eq('id', questionId)
      .single();

    if (questionError || !question) {
      return new Response(
        JSON.stringify({ error: 'Question not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if already answered
    const { data: existing } = await supabaseClient
      .from('live_responses')
      .select('id')
      .eq('question_id', questionId)
      .eq('participant_id', participantId)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'Already answered this question' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const correctAnswer = question.question_content.correctAnswer || question.question_content.correct_answer;
    const isCorrect = answer === correctAnswer;

    // Submit response
    const { data: response, error: responseError } = await supabaseClient
      .from('live_responses')
      .insert({
        question_id: questionId,
        participant_id: participantId,
        answer,
        is_correct: isCorrect,
        response_time_ms: responseTimeMs,
      })
      .select()
      .single();

    if (responseError) {
      console.error('Error submitting response:', responseError);
      return new Response(
        JSON.stringify({ error: 'Failed to submit response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ response, isCorrect }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in submit-live-response:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});