-- Update the update_assignment_grade RPC to also release answers automatically
-- when auto-grading short answer or coding questions

CREATE OR REPLACE FUNCTION public.update_assignment_grade(
  p_assignment_id UUID,
  p_short_answer_grades JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment RECORD;
  v_mc_grade NUMERIC := 0;
  v_mc_total INTEGER := 0;
  v_mc_correct INTEGER := 0;
  v_sa_grade NUMERIC := 0;
  v_sa_count INTEGER := 0;
  v_combined_grade NUMERIC;
  v_questions JSONB;
  v_responses JSONB;
  v_question JSONB;
  v_response TEXT;
  v_correct_answer TEXT;
  v_i INTEGER;
  v_has_short_answer_or_coding BOOLEAN := FALSE;
BEGIN
  -- Fetch the assignment
  SELECT * INTO v_assignment
  FROM student_assignments
  WHERE id = p_assignment_id;
  
  IF v_assignment IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;
  
  v_questions := v_assignment.quiz_questions;
  v_responses := v_assignment.quiz_responses;
  
  -- Calculate MCQ grades
  FOR v_i IN 0..jsonb_array_length(v_questions) - 1 LOOP
    v_question := v_questions->v_i;
    
    IF v_question->>'type' = 'multiple_choice' THEN
      v_mc_total := v_mc_total + 1;
      v_response := v_responses->>v_i::text;
      v_correct_answer := v_question->>'correctAnswer';
      
      IF v_response = v_correct_answer THEN
        v_mc_correct := v_mc_correct + 1;
      END IF;
    ELSIF v_question->>'type' IN ('short_answer', 'coding', 'coding_simple') THEN
      v_has_short_answer_or_coding := TRUE;
      -- Use AI-calculated grade from the grades parameter
      IF p_short_answer_grades IS NOT NULL AND p_short_answer_grades->v_i::text IS NOT NULL THEN
        v_sa_grade := v_sa_grade + COALESCE((p_short_answer_grades->v_i::text->>'grade')::NUMERIC, 0);
        v_sa_count := v_sa_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  -- Calculate combined grade
  IF v_mc_total > 0 AND v_sa_count > 0 THEN
    v_mc_grade := (v_mc_correct::NUMERIC / v_mc_total) * 100;
    v_sa_grade := v_sa_grade / v_sa_count;
    v_combined_grade := (v_mc_grade + v_sa_grade) / 2;
  ELSIF v_mc_total > 0 THEN
    v_combined_grade := (v_mc_correct::NUMERIC / v_mc_total) * 100;
  ELSIF v_sa_count > 0 THEN
    v_combined_grade := v_sa_grade / v_sa_count;
  ELSE
    RETURN jsonb_build_object('error', 'No questions to grade');
  END IF;
  
  -- Update grade server-side AND auto-release answers for auto-graded short answer/coding
  -- When auto-grading is used (indicated by p_short_answer_grades being provided),
  -- we auto-release the answers so students see their grade immediately
  UPDATE student_assignments
  SET 
    grade = v_combined_grade,
    -- Auto-release if this has short answer/coding questions AND we have AI grades
    answers_released = CASE 
      WHEN v_has_short_answer_or_coding AND p_short_answer_grades IS NOT NULL THEN TRUE
      ELSE answers_released  -- Keep existing value for MCQ-only
    END,
    release_method = CASE
      WHEN v_has_short_answer_or_coding AND p_short_answer_grades IS NOT NULL THEN 'auto_grade'
      ELSE release_method
    END
  WHERE id = p_assignment_id;
  
  RETURN jsonb_build_object(
    'grade', v_combined_grade,
    'mc_grade', CASE WHEN v_mc_total > 0 THEN v_mc_grade ELSE NULL END,
    'sa_grade', CASE WHEN v_sa_count > 0 THEN v_sa_grade / v_sa_count ELSE NULL END,
    'mc_correct', v_mc_correct,
    'mc_total', v_mc_total,
    'sa_count', v_sa_count,
    'answers_released', v_has_short_answer_or_coding AND p_short_answer_grades IS NOT NULL
  );
END;
$$;