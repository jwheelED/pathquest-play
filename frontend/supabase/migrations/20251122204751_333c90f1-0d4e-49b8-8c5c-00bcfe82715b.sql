-- Add instructor_id to student_study_materials to track which class the material belongs to
ALTER TABLE student_study_materials 
ADD COLUMN instructor_id UUID REFERENCES profiles(id);

-- Add index for better query performance
CREATE INDEX idx_student_study_materials_instructor_id ON student_study_materials(instructor_id);

-- Add instructor_id to personalized_questions to track which class the question belongs to
ALTER TABLE personalized_questions 
ADD COLUMN instructor_id UUID REFERENCES profiles(id);

-- Add index for better query performance
CREATE INDEX idx_personalized_questions_instructor_id ON personalized_questions(instructor_id);

-- Update RLS policies for student_study_materials to include instructor filtering
DROP POLICY IF EXISTS "Users can view their own materials" ON student_study_materials;
DROP POLICY IF EXISTS "Users can insert their own materials" ON student_study_materials;
DROP POLICY IF EXISTS "Users can update their own materials" ON student_study_materials;
DROP POLICY IF EXISTS "Users can delete their own materials" ON student_study_materials;
DROP POLICY IF EXISTS "Instructors can view student materials" ON student_study_materials;

CREATE POLICY "Users can view their own materials" 
ON student_study_materials 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own materials" 
ON student_study_materials 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own materials" 
ON student_study_materials 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own materials" 
ON student_study_materials 
FOR DELETE 
USING (auth.uid() = user_id);

CREATE POLICY "Instructors can view their students materials" 
ON student_study_materials 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM instructor_students
    WHERE instructor_students.instructor_id = auth.uid()
    AND instructor_students.student_id = student_study_materials.user_id
  )
  OR auth.uid() = user_id
);

-- Update RLS policies for personalized_questions to include instructor filtering
DROP POLICY IF EXISTS "Users can view their own personalized questions" ON personalized_questions;
DROP POLICY IF EXISTS "Users can insert their own personalized questions" ON personalized_questions;
DROP POLICY IF EXISTS "Users can update their own personalized questions" ON personalized_questions;
DROP POLICY IF EXISTS "Users can delete their own personalized questions" ON personalized_questions;
DROP POLICY IF EXISTS "Instructors can view student personalized questions" ON personalized_questions;

CREATE POLICY "Users can view their own personalized questions" 
ON personalized_questions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own personalized questions" 
ON personalized_questions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own personalized questions" 
ON personalized_questions 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own personalized questions" 
ON personalized_questions 
FOR DELETE 
USING (auth.uid() = user_id);

CREATE POLICY "Instructors can view their students personalized questions" 
ON personalized_questions 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM instructor_students
    WHERE instructor_students.instructor_id = auth.uid()
    AND instructor_students.student_id = personalized_questions.user_id
  )
  OR auth.uid() = user_id
);