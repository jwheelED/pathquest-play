-- Update RLS policies to allow instructors to view their students' data

-- Allow instructors to view their students' stats
CREATE POLICY "Instructors can view their students' stats"
  ON user_stats FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM instructor_students
      WHERE instructor_students.student_id = user_stats.user_id
      AND instructor_students.instructor_id = auth.uid()
    )
  );

-- Allow instructors to view their students' lesson progress
CREATE POLICY "Instructors can view their students' progress"
  ON lesson_progress FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM instructor_students
      WHERE instructor_students.student_id = lesson_progress.user_id
      AND instructor_students.instructor_id = auth.uid()
    )
  );

-- Allow instructors to view their students' problem attempts
CREATE POLICY "Instructors can view their students' attempts"
  ON problem_attempts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM instructor_students
      WHERE instructor_students.student_id = problem_attempts.user_id
      AND instructor_students.instructor_id = auth.uid()
    )
  );

-- Allow instructors to view their students' achievements
CREATE POLICY "Instructors can view their students' achievements"
  ON user_achievements FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM instructor_students
      WHERE instructor_students.student_id = user_achievements.user_id
      AND instructor_students.instructor_id = auth.uid()
    )
  );

-- Allow instructors to view their students' profiles
CREATE POLICY "Instructors can view their students' profiles"
  ON users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM instructor_students
      WHERE instructor_students.student_id = users.id
      AND instructor_students.instructor_id = auth.uid()
    )
  );