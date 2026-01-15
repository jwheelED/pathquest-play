-- Performance optimizations for classroom scale (25-40+ students)

-- Add indexes for faster queries on commonly filtered columns
CREATE INDEX IF NOT EXISTS idx_student_assignments_instructor_type 
ON student_assignments(instructor_id, assignment_type) 
WHERE assignment_type = 'lecture_checkin';

CREATE INDEX IF NOT EXISTS idx_student_assignments_student_completed 
ON student_assignments(student_id, completed);

CREATE INDEX IF NOT EXISTS idx_instructor_students_instructor 
ON instructor_students(instructor_id);

CREATE INDEX IF NOT EXISTS idx_instructor_students_student 
ON instructor_students(student_id);

CREATE INDEX IF NOT EXISTS idx_messages_recipient_read 
ON messages(recipient_id, read) WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_user_stats_user 
ON user_stats(user_id);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_user 
ON lesson_progress(user_id);

CREATE INDEX IF NOT EXISTS idx_lecture_questions_instructor_status 
ON lecture_questions(instructor_id, status) WHERE status = 'pending';

-- Optimize the submit_quiz function to handle response tracking better
CREATE OR REPLACE FUNCTION public.submit_quiz(p_assignment_id uuid, p_user_answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment RECORD;
  v_correct_count INTEGER := 0;
  v_total_questions INTEGER;
  v_calculated_grade NUMERIC;
  v_question JSONB;
  v_i INTEGER;
  v_user_answer TEXT;
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
  
  IF jsonb_object_length(p_user_answers) != v_total_questions THEN
    RAISE EXCEPTION 'Invalid answer count. Expected % answers, got %', 
      v_total_questions, jsonb_object_length(p_user_answers);
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
$$;