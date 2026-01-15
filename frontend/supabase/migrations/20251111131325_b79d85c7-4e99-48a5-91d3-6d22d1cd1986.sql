-- Create secure RPC function to update assignment grades after auto-grading
-- This prevents students from manipulating their grades via client-side updates

CREATE OR REPLACE FUNCTION public.update_assignment_grade(
  p_assignment_id uuid,
  p_short_answer_grades jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_assignment RECORD;
  v_mc_grade NUMERIC;
  v_mc_count INTEGER;
  v_short_answer_avg NUMERIC := 0;
  v_short_answer_count INTEGER := 0;
  v_combined_grade NUMERIC;
  v_grade_key TEXT;
  v_grade_value NUMERIC;
BEGIN
  -- Verify assignment belongs to calling user and is completed
  SELECT * INTO v_assignment
  FROM student_assignments
  WHERE id = p_assignment_id
  AND student_id = auth.uid()
  AND completed = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found, not completed, or unauthorized';
  END IF;
  
  -- Get MC grade and count from existing grade (set by submit_quiz)
  v_mc_grade := COALESCE(v_assignment.grade, 0);
  
  -- Count MC questions from stored responses (exclude AI recommendations)
  SELECT COUNT(*) INTO v_mc_count
  FROM jsonb_object_keys(v_assignment.quiz_responses) k
  WHERE k NOT LIKE '_ai_%';
  
  -- Calculate short answer average from provided grades
  IF p_short_answer_grades IS NOT NULL THEN
    FOR v_grade_key, v_grade_value IN 
      SELECT * FROM jsonb_each_text(p_short_answer_grades)
    LOOP
      IF v_grade_value::NUMERIC >= 0 AND v_grade_value::NUMERIC <= 100 THEN
        v_short_answer_avg := v_short_answer_avg + v_grade_value::NUMERIC;
        v_short_answer_count := v_short_answer_count + 1;
      END IF;
    END LOOP;
    
    IF v_short_answer_count > 0 THEN
      v_short_answer_avg := v_short_answer_avg / v_short_answer_count;
    END IF;
  END IF;
  
  -- Calculate combined grade
  IF v_mc_count > 0 AND v_short_answer_count > 0 THEN
    v_combined_grade := ((v_mc_grade * v_mc_count) + (v_short_answer_avg * v_short_answer_count)) / (v_mc_count + v_short_answer_count);
  ELSIF v_short_answer_count > 0 THEN
    v_combined_grade := v_short_answer_avg;
  ELSE
    v_combined_grade := v_mc_grade;
  END IF;
  
  -- Update grade server-side only
  UPDATE student_assignments
  SET grade = v_combined_grade
  WHERE id = p_assignment_id;
  
  RETURN jsonb_build_object(
    'grade', v_combined_grade,
    'mc_grade', v_mc_grade,
    'short_answer_avg', v_short_answer_avg,
    'mc_count', v_mc_count,
    'short_answer_count', v_short_answer_count
  );
END;
$function$;