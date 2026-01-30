import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Normalize MCQ answer to just the letter (A, B, C, D)
// Also handles matching full option text against the options array
const normalizeAnswer = (answer: string, questionType: string, options?: string[]): string => {
  // Only normalize multiple choice answers
  if (questionType !== 'multiple_choice') {
    return answer.trim();
  }
  
  const trimmed = answer.trim();
  
  // If it's already just a letter (A-D), return as-is uppercase
  if (/^[A-Da-d]$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  
  // Extract letter from formats like "B) 206 bones" or "B. Answer" or "B - text"
  const match = trimmed.match(/^([A-Da-d])[).\-\s]/);
  if (match) {
    return match[1].toUpperCase();
  }
  
  // Check if answer matches the text part of an option (without prefix)
  // e.g., "Dennis Lehane" should match option "B. Dennis Lehane" → returns "B"
  if (options && options.length > 0) {
    const letters = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < options.length && i < 4; i++) {
      const option = options[i];
      // Remove prefix like "A. ", "A) ", "A - " from option
      const optionText = option.replace(/^[A-Da-d][).\-\s]+\s*/, '').trim();
      if (optionText.toLowerCase() === trimmed.toLowerCase()) {
        return letters[i];
      }
      // Also check if full option matches
      if (option.toLowerCase() === trimmed.toLowerCase()) {
        return letters[i];
      }
    }
  }
  
  // Fallback: return first character if it's a letter A-D
  if (/^[A-Da-d]/i.test(trimmed)) {
    return trimmed.charAt(0).toUpperCase();
  }
  
  // Return original trimmed if no pattern matches (for non-standard answers)
  return trimmed;
};

// Calculate points based on correctness and confidence
const calculatePoints = (isCorrect: boolean, confidenceLevel: string | null): { points: number; multiplier: number } => {
  const basePoints = 10;
  
  // Confidence multipliers
  const confidenceMultipliers: Record<string, number> = {
    'low': 1,
    'medium': 2,
    'high': 3,
  };
  
  const multiplier = confidenceLevel ? (confidenceMultipliers[confidenceLevel] || 1) : 1;
  
  if (isCorrect) {
    return { points: basePoints * multiplier, multiplier };
  } else {
    // Penalty for wrong answers with high confidence (negative points)
    if (confidenceLevel === 'high') {
      return { points: -15, multiplier };
    } else if (confidenceLevel === 'medium') {
      return { points: -5, multiplier };
    }
    return { points: 0, multiplier };
  }
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { questionId, participantId, answer, confidenceLevel, responseTimeMs } = await req.json();

    console.log('Submit live response:', { questionId, participantId, answer, confidenceLevel, responseTimeMs });

    if (!questionId || !participantId || answer === undefined) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: questionId, participantId, answer' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the question to check the correct answer
    const { data: question, error: questionError } = await supabase
      .from('live_questions')
      .select('question_content, question_number')
      .eq('id', questionId)
      .single();

    if (questionError || !question) {
      console.error('Error fetching question:', questionError);
      return new Response(
        JSON.stringify({ error: 'Question not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const questionContent = question.question_content as {
      question?: string;
      type?: string;
      options?: string[];
      correctAnswer?: string;
      questions?: Array<{
        question?: string;
        type?: string;
        options?: string[];
        correctAnswer?: string;
      }>;
    };

    // Handle both nested and direct formats for question content
    let correctAnswer = '';
    let questionType = 'multiple_choice';
    let options: string[] = [];

    // Check for nested format: { questions: [{ correctAnswer, type }] }
    if (questionContent.questions && Array.isArray(questionContent.questions) && questionContent.questions.length > 0) {
      const firstQuestion = questionContent.questions[0];
      correctAnswer = firstQuestion.correctAnswer || '';
      questionType = firstQuestion.type || 'multiple_choice';
      options = firstQuestion.options || [];
      console.log('📋 Using nested question format:', { correctAnswer, questionType });
    } else {
      // Handle direct format: { correctAnswer, type }
      correctAnswer = questionContent.correctAnswer || '';
      questionType = questionContent.type || 'multiple_choice';
      options = questionContent.options || [];
      console.log('📋 Using direct question format:', { correctAnswer, questionType });
    }

    // Normalize both answers for comparison (pass options for text matching)
    const normalizedStudentAnswer = normalizeAnswer(answer, questionType, options);
    const normalizedCorrectAnswer = normalizeAnswer(correctAnswer, questionType, options);

    const isCorrect = normalizedStudentAnswer === normalizedCorrectAnswer;

    console.log('Grading:', {
      studentAnswer: answer,
      normalizedStudentAnswer,
      correctAnswer,
      normalizedCorrectAnswer,
      questionType,
      isCorrect,
    });

    // Calculate points based on correctness and confidence
    const { points, multiplier } = calculatePoints(isCorrect, confidenceLevel);

    // Check if response already exists
    const { data: existingResponse } = await supabase
      .from('live_responses')
      .select('id')
      .eq('question_id', questionId)
      .eq('participant_id', participantId)
      .single();

    if (existingResponse) {
      return new Response(
        JSON.stringify({ error: 'Response already submitted', existingId: existingResponse.id }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert the response
    const { data: response, error: insertError } = await supabase
      .from('live_responses')
      .insert({
        question_id: questionId,
        participant_id: participantId,
        answer: answer,
        is_correct: isCorrect,
        confidence_level: confidenceLevel,
        confidence_multiplier: multiplier,
        points_earned: points,
        response_time_ms: responseTimeMs,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting response:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save response', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Response saved:', { responseId: response.id, isCorrect, points });

    return new Response(
      JSON.stringify({
        success: true,
        response: {
          id: response.id,
          isCorrect,
          pointsEarned: points,
          confidenceMultiplier: multiplier,
          correctAnswer: correctAnswer,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in submit-live-response:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
