import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Calculate points based on correctness and confidence
function calculatePoints(
  isCorrect: boolean,
  confidenceLevel: string | null,
  confidenceMultiplier: number,
  baseReward: number
): number {
  if (!confidenceLevel) {
    // No confidence betting - just return base reward or 0
    return isCorrect ? baseReward : 0;
  }

  if (isCorrect) {
    // Correct answer: multiply base reward by confidence multiplier
    return Math.round(baseReward * confidenceMultiplier);
  } else {
    // Wrong answer: penalty based on confidence level
    switch (confidenceLevel) {
      case 'low':
        // Small penalty for playing it safe
        return -Math.round(baseReward * 0.25);
      case 'medium':
        // No penalty for medium confidence
        return 0;
      case 'high':
      case 'very_high':
        // Bigger penalty for high confidence wrong answers
        return -Math.round(baseReward * confidenceMultiplier * 0.5);
      default:
        return 0;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { 
      questionId, 
      participantId, 
      answer, 
      responseTimeMs,
      confidenceLevel,
      confidenceMultiplier,
      baseReward 
    } = await req.json();

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
    
    // For MCQ: Extract letter prefix from answer (e.g., "A. Some text" → "A")
    let studentAnswer = answer;
    if (question.question_content.type === "multiple_choice" && typeof answer === "string") {
      // Extract just the letter if answer starts with "A.", "B.", "C.", or "D."
      const letterMatch = answer.match(/^([A-D])\./);
      if (letterMatch) {
        studentAnswer = letterMatch[1]; // Just the letter
      }
    }
    
    // Compare (now: "C" === "C" = TRUE!)
    const isCorrect = studentAnswer === correctAnswer;
    
    // Calculate points earned based on confidence
    const pointsEarned = calculatePoints(
      isCorrect,
      confidenceLevel || null,
      confidenceMultiplier || 1,
      baseReward || 10
    );
    
    // Add logging for debugging
    console.log(`Grading: student answered "${studentAnswer}", correct answer is "${correctAnswer}", result: ${isCorrect}`);
    console.log(`Confidence: ${confidenceLevel}, multiplier: ${confidenceMultiplier}, points earned: ${pointsEarned}`);

    // Submit response with confidence data
    const { data: response, error: responseError } = await supabaseClient
      .from('live_responses')
      .insert({
        question_id: questionId,
        participant_id: participantId,
        answer,
        is_correct: isCorrect,
        response_time_ms: responseTimeMs,
        confidence_level: confidenceLevel || null,
        confidence_multiplier: confidenceMultiplier || 1.0,
        points_earned: pointsEarned,
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
      JSON.stringify({ response, isCorrect, pointsEarned }),
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