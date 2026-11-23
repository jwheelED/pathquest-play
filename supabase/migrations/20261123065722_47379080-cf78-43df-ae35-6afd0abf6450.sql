ALTER TABLE public.live_responses ALTER COLUMN is_correct DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_live_question_themes_session ON public.live_question_themes(session_id);