-- Create live_sessions table for active lecture sessions
CREATE TABLE public.live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '4 hours'),
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL
);

-- Create index for fast session code lookups
CREATE INDEX idx_live_sessions_code ON public.live_sessions(session_code) WHERE is_active = true;
CREATE INDEX idx_live_sessions_instructor ON public.live_sessions(instructor_id, is_active);

-- Enable RLS
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

-- Instructors can manage their own sessions
CREATE POLICY "Instructors manage own sessions"
  ON public.live_sessions
  FOR ALL
  USING (auth.uid() = instructor_id)
  WITH CHECK (auth.uid() = instructor_id);

-- Anyone can view active sessions (needed for join validation)
CREATE POLICY "Anyone can view active sessions"
  ON public.live_sessions
  FOR SELECT
  USING (is_active = true);

-- Create live_participants table for anonymous participants
CREATE TABLE public.live_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_participants_session ON public.live_participants(session_id);

-- Enable RLS
ALTER TABLE public.live_participants ENABLE ROW LEVEL SECURITY;

-- Participants can view their own data
CREATE POLICY "Participants view own data"
  ON public.live_participants
  FOR SELECT
  USING (true);

-- Anyone can join (insert)
CREATE POLICY "Anyone can join session"
  ON public.live_participants
  FOR INSERT
  WITH CHECK (true);

-- Participants can update their last_seen
CREATE POLICY "Update last seen"
  ON public.live_participants
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Instructors can view all participants in their sessions
CREATE POLICY "Instructors view session participants"
  ON public.live_participants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id AND ls.instructor_id = auth.uid()
    )
  );

-- Create live_questions table (1 row per question instead of N)
CREATE TABLE public.live_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_content JSONB NOT NULL,
  question_number INTEGER NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_live_questions_session ON public.live_questions(session_id, sent_at DESC);

-- Enable RLS
ALTER TABLE public.live_questions ENABLE ROW LEVEL SECURITY;

-- Instructors can manage their questions
CREATE POLICY "Instructors manage own questions"
  ON public.live_questions
  FOR ALL
  USING (auth.uid() = instructor_id)
  WITH CHECK (auth.uid() = instructor_id);

-- Anyone can view questions in active sessions
CREATE POLICY "View session questions"
  ON public.live_questions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_sessions ls
      WHERE ls.id = session_id AND ls.is_active = true
    )
  );

-- Create live_responses table for participant answers
CREATE TABLE public.live_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.live_questions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.live_participants(id) ON DELETE CASCADE,
  answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_time_ms INTEGER
);

CREATE INDEX idx_live_responses_question ON public.live_responses(question_id);
CREATE INDEX idx_live_responses_participant ON public.live_responses(participant_id);

-- Enable RLS
ALTER TABLE public.live_responses ENABLE ROW LEVEL SECURITY;

-- Anyone can submit responses
CREATE POLICY "Submit responses"
  ON public.live_responses
  FOR INSERT
  WITH CHECK (true);

-- Participants can view their own responses
CREATE POLICY "View own responses"
  ON public.live_responses
  FOR SELECT
  USING (true);

-- Instructors can view all responses for their questions
CREATE POLICY "Instructors view question responses"
  ON public.live_responses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.live_questions lq
      WHERE lq.id = question_id AND lq.instructor_id = auth.uid()
    )
  );

-- Function to generate unique session codes
CREATE OR REPLACE FUNCTION generate_session_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  chars TEXT := '0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Trigger to set unique session code
CREATE OR REPLACE FUNCTION set_session_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.session_code IS NULL OR NEW.session_code = '' THEN
    LOOP
      NEW.session_code := generate_session_code();
      IF NOT EXISTS (
        SELECT 1 FROM live_sessions 
        WHERE session_code = NEW.session_code 
        AND id != NEW.id
        AND is_active = true
      ) THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_live_session_code
  BEFORE INSERT ON public.live_sessions
  FOR EACH ROW
  EXECUTE FUNCTION set_session_code();