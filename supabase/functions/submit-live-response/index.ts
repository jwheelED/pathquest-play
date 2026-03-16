import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Normalize MCQ answer to just the letter (A, B, C, D)
// Enhanced with robust fallback matching for 100% grading reliability
const normalizeAnswer = (answer: string, questionType: string, options?: string[]): string => {
  // Only normalize multiple choice answers
  if (questionType !== 'multiple_choice') {
    return answer.trim();
  }
  
  const trimmed = answer.trim();
  console.log(`🔍 Normalizing MCQ answer: "${trimmed}"`);
  
  // 1. Already just a letter (A-D) - most common case
  if (/^[A-Da-d]$/.test(trimmed)) {
    console.log(`✅ Already a single letter: "${trimmed.toUpperCase()}"`);
    return trimmed.toUpperCase();
  }
  
  // 2. Extract letter from prefixed formats: "B) text", "B. text", "B - text", "B text"
  const letterMatch = trimmed.match(/^([A-Da-d])[\).\-\s]/);
  if (letterMatch) {
    console.log(`✅ Extracted letter from prefix: "${letterMatch[1].toUpperCase()}" from "${trimmed}"`);
    return letterMatch[1].toUpperCase();
  }
  
  // 3. Match against options array (for text-only answers)
  if (options && options.length > 0) {
    const letters = ['A', 'B', 'C', 'D'];
    
    for (let i = 0; i < options.length && i < 4; i++) {
      const option = options[i];
      
      // Strip any letter prefix from option for comparison
      const optionText = option.replace(/^[A-Da-d][\).\-\s]+\s*/, '').trim();
      
      // Full match (case insensitive) - "206 bones" matches "B. 206 bones"
      if (trimmed.toLowerCase() === option.toLowerCase() || 
          trimmed.toLowerCase() === optionText.toLowerCase()) {
        console.log(`✅ Matched "${trimmed}" to option ${letters[i]} via full text match`);
        return letters[i];
      }
      
      // Partial numeric match - "206" matches "B. 206 bones"
      const answerNumbers = trimmed.match(/\d+/g);
      const optionNumbers = optionText.match(/\d+/g);
      if (answerNumbers && optionNumbers && 
          answerNumbers.length === 1 && optionNumbers.length >= 1 &&
          optionNumbers.includes(answerNumbers[0])) {
        // Only match if this number is unique across options
        const matchingOptions = options.filter(opt => {
          const nums = opt.match(/\d+/g);
          return nums && nums.includes(answerNumbers[0]);
        });
        if (matchingOptions.length === 1) {
          console.log(`✅ Matched "${trimmed}" to option ${letters[i]} via unique numeric match`);
          return letters[i];
        }
      }
    }
  }
  
  // 4. No match found - return original (will likely be marked incorrect)
  // NOTE: Removed dangerous first-char fallback that misinterpreted words like "Bones" as "B"
  console.warn(`❌ Could not normalize answer: "${trimmed}" - returning as-is`);
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
      .select('question_content, question_number, instructor_id, session_id')
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
      correctAnswer = (firstQuestion.correctAnswer || '').toString().trim();
      questionType = firstQuestion.type || 'multiple_choice';
      options = firstQuestion.options || [];
      console.log('📋 Using nested question format:', { correctAnswer, questionType, optionsCount: options.length });
    } else {
      // Handle direct format: { correctAnswer, type }
      correctAnswer = (questionContent.correctAnswer || '').toString().trim();
      questionType = questionContent.type || 'multiple_choice';
      options = questionContent.options || [];
      console.log('📋 Using direct question format:', { correctAnswer, questionType, optionsCount: options.length });
    }

    // Diagnostic: warn if options are missing for MCQ
    if (questionType === 'multiple_choice' && (!options || options.length === 0)) {
      console.warn(`⚠️ No options array found for MCQ grading. Question ID: ${questionId}. This may cause grading issues.`);
    }

    // Guard: reject MCQ grading if correctAnswer is empty (prevents all-wrong bug)
    if (questionType === 'multiple_choice' && (!correctAnswer || correctAnswer.trim() === '')) {
      console.error(`🚫 Empty correctAnswer for MCQ question ${questionId} — cannot grade`);
      return new Response(
        JSON.stringify({ 
          error: 'Question has no correct answer configured. Please notify your instructor.',
          code: 'MISSING_CORRECT_ANSWER'
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize both answers for comparison (pass options for text matching)
    const studentAnswerTrimmed = answer.toString().trim();
    const normalizedStudentAnswer = normalizeAnswer(studentAnswerTrimmed, questionType, options);
    const normalizedCorrectAnswer = normalizeAnswer(correctAnswer, questionType, options);

    // Case-insensitive comparison for robustness
    const isCorrect = normalizedStudentAnswer.toUpperCase() === normalizedCorrectAnswer.toUpperCase();

    // Enhanced logging for debugging grading issues
    console.log('🎯 Final grading comparison:', {
      rawStudentAnswer: answer,
      rawCorrectAnswer: correctAnswer,
      normalizedStudent: normalizedStudentAnswer,
      normalizedCorrect: normalizedCorrectAnswer,
      isCorrect,
      questionType,
      hasOptions: options.length > 0
    });

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

    // Best-effort sync: update corresponding student_assignments record
    // so LectureCheckInResults card reflects live session answers
    try {
      if (question.session_id && question.instructor_id) {
        // 1. Get course_id from live_sessions
        const { data: session } = await supabase
          .from('live_sessions')
          .select('course_id')
          .eq('id', question.session_id)
          .single();

        if (session?.course_id) {
          // 2. Get participant nickname
          const { data: participant } = await supabase
            .from('live_participants')
            .select('nickname')
            .eq('id', participantId)
            .single();

          if (participant?.nickname) {
            const nickname = participant.nickname.trim().toLowerCase();

            // 3. Get student IDs for this instructor + course
            const { data: instructorStudents } = await supabase
              .from('instructor_students')
              .select('student_id')
              .eq('instructor_id', question.instructor_id)
              .eq('course_id', session.course_id);

            if (instructorStudents && instructorStudents.length > 0) {
              const studentIds = instructorStudents.map((s: { student_id: string }) => s.student_id);

              // 4. Find matching profile by nickname
              const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name')
                .in('id', studentIds);

              const matchedProfile = profiles?.find((p: { id: string; full_name: string | null }) =>
                p.full_name && p.full_name.trim().toLowerCase() === nickname
              );

              if (matchedProfile) {
                console.log(`🔗 Matched participant "${participant.nickname}" to profile ${matchedProfile.id}`);

                // 5. Find recent uncompleted lecture_checkin assignments
                const { data: assignments } = await supabase
                  .from('student_assignments')
                  .select('id, content, quiz_responses')
                  .eq('student_id', matchedProfile.id)
                  .eq('instructor_id', question.instructor_id)
                  .eq('assignment_type', 'lecture_checkin')
                  .eq('completed', false)
                  .order('created_at', { ascending: false })
                  .limit(5);

                if (assignments && assignments.length > 0) {
                  // 6. Find the assignment whose content.questions contains this question
                  const questionText = questionContent.questions?.[0]?.question || questionContent.question || '';

                  for (const assignment of assignments) {
                    const content = assignment.content as { questions?: Array<{ question?: string }> };
                    const questions = content?.questions || [];
                    const matchIdx = questions.findIndex(
                      (q: { question?: string }) => q.question === questionText
                    );

                    if (matchIdx >= 0) {
                      // 7. Build quiz_responses and update
                      const existingResponses = assignment.quiz_responses || {};
                      const updatedResponses = {
                        ...existingResponses,
                        [matchIdx.toString()]: normalizedStudentAnswer,
                      };

                      const grade = isCorrect ? 100 : 0;
                      const responseTimeSec = responseTimeMs ? Math.round(responseTimeMs / 1000) : null;

                      const { error: updateError } = await supabase
                        .from('student_assignments')
                        .update({
                          completed: true,
                          quiz_responses: updatedResponses,
                          grade,
                          response_time_seconds: responseTimeSec,
                        })
                        .eq('id', assignment.id);

                      if (updateError) {
                        console.error('⚠️ Sync: failed to update student_assignment:', updateError);
                      } else {
                        console.log(`✅ Sync: updated student_assignment ${assignment.id} for student ${matchedProfile.id}`);
                      }
                      break; // Only update the first matching assignment
                    }
                  }
                }
              } else {
                console.log(`ℹ️ Sync: no profile match for nickname "${participant.nickname}" — skipping`);
              }
            }
          }
        }
      }
    } catch (syncError) {
      // Non-blocking: sync failure should never affect the primary live response flow
      console.error('⚠️ Sync to student_assignments failed (non-blocking):', syncError);
    }

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
