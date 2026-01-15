-- Create LTI session tokens table for secure launch data passing
CREATE TABLE public.lti_session_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  platform_id uuid REFERENCES lti_platforms(id) ON DELETE CASCADE NOT NULL,
  context_id text,
  user_id text NOT NULL,
  is_instructor boolean NOT NULL DEFAULT false,
  redirect_path text NOT NULL DEFAULT '/dashboard',
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lti_session_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can manage tokens (edge functions)
CREATE POLICY "Service role manages session tokens"
ON public.lti_session_tokens
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- No client access to tokens
CREATE POLICY "Deny all client access to session tokens"
ON public.lti_session_tokens
FOR ALL
TO anon, authenticated
USING (false);

-- Create index for fast token lookup
CREATE INDEX idx_lti_session_tokens_token ON public.lti_session_tokens(token);
CREATE INDEX idx_lti_session_tokens_expires ON public.lti_session_tokens(expires_at);

-- Function to cleanup expired tokens (run periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_lti_tokens()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.lti_session_tokens
  WHERE expires_at < NOW() - INTERVAL '1 hour';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Tighten live_participants RLS policy
DROP POLICY IF EXISTS "Only anon or service role can insert participants" ON public.live_participants;

CREATE POLICY "Anon can insert into active sessions"
ON public.live_participants
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM live_sessions
    WHERE id = session_id 
    AND is_active = true 
    AND ends_at > NOW()
  )
);

-- Tighten live_responses RLS policy  
DROP POLICY IF EXISTS "Only anon can insert responses" ON public.live_responses;

CREATE POLICY "Anon can submit responses to active questions"
ON public.live_responses
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM live_questions lq
    JOIN live_sessions ls ON ls.id = lq.session_id
    WHERE lq.id = question_id
    AND ls.is_active = true
  )
  AND EXISTS (
    SELECT 1 FROM live_participants
    WHERE id = participant_id
  )
);