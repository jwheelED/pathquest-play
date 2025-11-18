-- Allow students to insert their own connection to instructors
CREATE POLICY "Students can insert their own instructor connection"
ON instructor_students
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

-- Allow students to view their own instructor connections
CREATE POLICY "Students can view their own instructor connections"
ON instructor_students
FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

-- Allow instructors to view their student connections
CREATE POLICY "Instructors can view their student connections"
ON instructor_students
FOR SELECT
TO authenticated
USING (auth.uid() = instructor_id);

-- Allow students to insert their own stats
CREATE POLICY "Students can insert their own stats"
ON user_stats
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Allow users to view their own stats
CREATE POLICY "Users can view their own stats"
ON user_stats
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Allow users to update their own stats
CREATE POLICY "Users can update their own stats"
ON user_stats
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);