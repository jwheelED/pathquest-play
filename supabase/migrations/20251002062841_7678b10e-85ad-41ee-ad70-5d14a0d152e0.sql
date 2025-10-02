-- Add RLS policy to allow students to join a class
CREATE POLICY "Students can join classes"
  ON instructor_students
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = student_id);