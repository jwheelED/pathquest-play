-- Drop existing function to recreate with auto-grading support
DROP FUNCTION IF EXISTS public.submit_quiz(uuid, jsonb);

-- Recreated submit_quiz function with auto-grading support for short answers
CREATE OR REPLACE FUNCTION public.submit_quiz(p_assignment_id uuid, p_user_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment RECORD;
  v_correct_count INTEGER := 0;
  v_total_mc_questions INTEGER := 0;
  v_total_questions INTEGER;
  v_calculated_grade NUMERIC;
  v_question JSONB;
  v_i INTEGER;
  v_user_answer TEXT;
  v_answer_count INTEGER;
  v_has_short_answer BOOLEAN := false;
  v_needs_manual_review BOOLEAN := false;
BEGIN
  -- Verify assignment belongs to calling user and isn't completed
  SELECT * INTO v_assignment
  FROM student_assignments
  WHERE id = p_assignment_id
  AND student_id = auth.uid()
  AND completed = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or already completed';
  END IF;
  
  -- Validate answer structure
  v_total_questions := jsonb_array_length(v_assignment.content->'questions');
  
  -- Count JSONB object keys correctly
  SELECT COUNT(*) INTO v_answer_count FROM jsonb_object_keys(p_user_answers);
  
  IF v_answer_count != v_total_questions THEN
    RAISE EXCEPTION 'Invalid answer count. Expected % answers, got %', 
      v_total_questions, v_answer_count;
  END IF;
  
  -- Server-side grade calculation
  FOR v_i IN 0..v_total_questions-1 LOOP
    v_question := v_assignment.content->'questions'->v_i;
    v_user_answer := p_user_answers->>v_i::text;
    
    -- Check if this is a short answer question
    IF v_question->>'type' = 'short_answer' THEN
      v_has_short_answer := true;
      -- If mode is manual_grade, mark for review
      IF v_assignment.mode = 'manual_grade' THEN
        v_needs_manual_review := true;
      END IF;
      -- If mode is auto_grade, the client will handle calling the auto-grade function
      -- We'll mark it as needing review for now, and the client will update the grade
    ELSE
      -- Multiple choice question - auto-grade it
      v_total_mc_questions := v_total_mc_questions + 1;
      IF v_user_answer = v_question->>'correctAnswer' THEN
        v_correct_count := v_correct_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Calculate grade based only on multiple choice questions
  -- If there are short answer questions with manual_grade mode, grade is null (pending review)
  IF v_needs_manual_review THEN
    v_calculated_grade := NULL;
  ELSIF v_total_mc_questions > 0 THEN
    v_calculated_grade := (v_correct_count::NUMERIC / v_total_mc_questions) * 100;
  ELSE
    v_calculated_grade := 0;
  END IF;
  
  -- Update with server-calculated grade and store answers
  UPDATE student_assignments
  SET completed = true,
      quiz_responses = p_user_answers,
      grade = v_calculated_grade
  WHERE id = p_assignment_id;
  
  RETURN jsonb_build_object(
    'grade', v_calculated_grade, 
    'correct', v_correct_count,
    'total', v_total_mc_questions,
    'pending_review', v_needs_manual_review,
    'has_short_answer', v_has_short_answer,
    'assignment_mode', v_assignment.mode
  );
END;
$$;