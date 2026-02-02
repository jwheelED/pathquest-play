-- Add unique constraint to prevent duplicate submissions with race conditions
-- This ensures atomic, reliable submission even with 20+ concurrent students

ALTER TABLE public.live_responses
ADD CONSTRAINT live_responses_question_participant_unique 
UNIQUE (question_id, participant_id);

-- Add index for faster duplicate checking (the unique constraint creates this implicitly, but making it explicit)
COMMENT ON CONSTRAINT live_responses_question_participant_unique ON public.live_responses 
IS 'Ensures each participant can only submit once per question - enforced at database level for race condition safety';