-- Enable realtime for instructor_students table
ALTER TABLE instructor_students REPLICA IDENTITY FULL;

-- Add instructor_students to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE instructor_students;