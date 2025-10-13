-- Fix submit_quiz function - replace jsonb_object_length with correct PostgreSQL syntax
CREATE OR REPLACE FUNCTION public.submit_quiz(p_assignment_id uuid, p_user_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_assignment RECORD;
  v_correct_count INTEGER := 0;
  v_total_questions INTEGER;
  v_calculated_grade NUMERIC;
  v_question JSONB;
  v_i INTEGER;
  v_user_answer TEXT;
  v_answer_count INTEGER;
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
  
  -- Server-side grade calculation and track each answer
  FOR v_i IN 0..v_total_questions-1 LOOP
    v_question := v_assignment.content->'questions'->v_i;
    v_user_answer := p_user_answers->>v_i::text;
    
    IF v_user_answer = v_question->>'correctAnswer' THEN
      v_correct_count := v_correct_count + 1;
    END IF;
  END LOOP;
  
  v_calculated_grade := (v_correct_count::NUMERIC / v_total_questions) * 100;
  
  -- Update with server-calculated grade and store answers
  UPDATE student_assignments
  SET completed = true,
      quiz_responses = p_user_answers,
      grade = v_calculated_grade
  WHERE id = p_assignment_id;
  
  RETURN jsonb_build_object(
    'grade', v_calculated_grade, 
    'correct', v_correct_count,
    'total', v_total_questions
  );
END;
$function$;