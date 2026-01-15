-- Add source_type and answer_key_id to answer_key_mcqs for direct extraction support
ALTER TABLE answer_key_mcqs 
ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'generated' CHECK (source_type IN ('generated', 'extracted'));

ALTER TABLE answer_key_mcqs 
ADD COLUMN IF NOT EXISTS answer_key_id uuid REFERENCES instructor_answer_keys(id) ON DELETE CASCADE;

-- Add content_type to instructor_answer_keys to track what kind of content it contains
ALTER TABLE instructor_answer_keys 
ADD COLUMN IF NOT EXISTS content_type text DEFAULT 'problem-solutions' CHECK (content_type IN ('problem-solutions', 'mcqs'));

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_answer_key_mcqs_answer_key_id ON answer_key_mcqs(answer_key_id);
CREATE INDEX IF NOT EXISTS idx_answer_key_mcqs_source_type ON answer_key_mcqs(source_type);