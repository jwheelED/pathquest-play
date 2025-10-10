-- Allow students to view profiles of instructors they are connected to
CREATE POLICY "Students can view their instructors' profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.instructor_students
    WHERE instructor_students.instructor_id = profiles.id
    AND instructor_students.student_id = auth.uid()
  )
);

-- Allow instructors to view profiles of students they teach
CREATE POLICY "Instructors can view their students' profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.instructor_students
    WHERE instructor_students.student_id = profiles.id
    AND instructor_students.instructor_id = auth.uid()
  )
);