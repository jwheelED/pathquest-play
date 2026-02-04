-- Drop the old unique constraint that only uses instructor_id and student_id
ALTER TABLE public.instructor_students 
DROP CONSTRAINT IF EXISTS instructor_students_instructor_id_student_id_key;

-- Create new unique constraint that includes course_id for multi-course support
-- This allows a student to join multiple courses from the same instructor
CREATE UNIQUE INDEX instructor_students_instructor_student_course_unique 
ON public.instructor_students (instructor_id, student_id, COALESCE(course_id, '00000000-0000-0000-0000-000000000000'::uuid));