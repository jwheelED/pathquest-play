-- Add ai_summary column to student_assignments for caching AI-generated summaries
ALTER TABLE student_assignments 
ADD COLUMN ai_summary JSONB DEFAULT NULL;

-- Add GIN index for faster JSONB queries
CREATE INDEX IF NOT EXISTS idx_student_assignments_ai_summary 
ON student_assignments USING GIN (ai_summary);

-- Add comment explaining the structure
COMMENT ON COLUMN student_assignments.ai_summary IS 'Stores AI-generated summaries per question. Structure: {"0": {"summary": "...", "trend": "...", "generated_at": "...", "response_count": 10}, "1": {...}}';