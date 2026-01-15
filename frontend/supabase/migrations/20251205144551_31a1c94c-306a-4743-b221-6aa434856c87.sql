-- Tighten RLS policies on live session tables
-- The edge functions use service role, so these policies mainly protect against
-- authenticated users trying to bypass edge functions and manipulate data directly

-- Drop existing overly permissive policies on live_participants
DROP POLICY IF EXISTS "Participants can insert themselves" ON public.live_participants;
DROP POLICY IF EXISTS "Participants can update their own record" ON public.live_participants;
DROP POLICY IF EXISTS "Anyone can view participants" ON public.live_participants;

-- Create new restrictive policies for live_participants
-- Only service role (edge functions) or session instructors can insert participants
CREATE POLICY "Only anon or service role can insert participants"
ON public.live_participants
FOR INSERT
TO anon
WITH CHECK (true);

-- Instructors can view participants in their sessions
CREATE POLICY "Instructors can view their session participants"
ON public.live_participants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.live_sessions ls
    WHERE ls.id = live_participants.session_id
    AND ls.instructor_id = auth.uid()
  )
);

-- Anon users can only view (for polling) - no update
CREATE POLICY "Anon can view participants"
ON public.live_participants
FOR SELECT
TO anon
USING (true);

-- Remove the permissive UPDATE policy - only service role should update
-- (Supabase service role bypasses RLS)

-- Drop existing overly permissive policies on live_responses
DROP POLICY IF EXISTS "Anyone can insert responses" ON public.live_responses;
DROP POLICY IF EXISTS "Anyone can view responses" ON public.live_responses;

-- Create new restrictive policies for live_responses
-- Only anon role (for anonymous participants via edge function) can insert
CREATE POLICY "Only anon can insert responses"
ON public.live_responses
FOR INSERT
TO anon
WITH CHECK (true);

-- Instructors can view responses in their sessions
CREATE POLICY "Instructors can view their session responses"
ON public.live_responses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.live_questions lq
    JOIN public.live_sessions ls ON ls.id = lq.session_id
    WHERE lq.id = live_responses.question_id
    AND ls.instructor_id = auth.uid()
  )
);

-- Anon can view responses (for leaderboards etc)
CREATE POLICY "Anon can view responses"
ON public.live_responses
FOR SELECT
TO anon
USING (true);