-- Update submit_quiz to recognize coding and coding_simple question types
-- This ensures the frontend knows when to trigger auto-grading

CREATE OR REPLACE FUNCTION public.submit_quiz(p_assignment_id uuid, p_user_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_has_coding BOOLEAN := false;
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
  
  v_total_questions := jsonb_array_length(v_assignment.content->'questions');
  SELECT COUNT(*) INTO v_answer_count FROM jsonb_object_keys(p_user_answers);
  
  IF v_answer_count != v_total_questions THEN
    RAISE EXCEPTION 'Invalid answer count. Expected % answers, got %', 
      v_total_questions, v_answer_count;
  END IF;
  
  FOR v_i IN 0..v_total_questions-1 LOOP
    v_question := v_assignment.content->'questions'->v_i;
    v_user_answer := p_user_answers->>v_i::text;
    
    IF v_question->>'type' = 'short_answer' THEN
      v_has_short_answer := true;
      IF v_assignment.mode = 'manual_grade' THEN
        v_needs_manual_review := true;
      END IF;
    ELSIF v_question->>'type' IN ('coding', 'coding_simple') THEN
      v_has_coding := true;
      -- coding_simple is always auto-graded
    ELSE
      -- Multiple choice
      v_total_mc_questions := v_total_mc_questions + 1;
      IF v_user_answer = v_question->>'correctAnswer' THEN
        v_correct_count := v_correct_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  IF v_needs_manual_review THEN
    v_calculated_grade := NULL;
  ELSIF v_total_mc_questions > 0 THEN
    v_calculated_grade := (v_correct_count::NUMERIC / v_total_mc_questions) * 100;
  ELSE
    v_calculated_grade := NULL;
  END IF;
  
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
    'has_coding', v_has_coding,
    'assignment_mode', v_assignment.mode
  );
END;
$function$;