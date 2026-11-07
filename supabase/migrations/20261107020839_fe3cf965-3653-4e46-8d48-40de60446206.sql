CREATE POLICY "Participants can review questions from joined sessions"
ON public.live_questions FOR SELECT TO authenticated
USING (public.current_user_joined_live_session(session_id));

-- Regression fixtures are rolled back before the migration completes.
SAVEPOINT history_access_test;
DO $$
DECLARE
  accounts uuid[];
  session_id uuid := gen_random_uuid();
  question_id uuid := gen_random_uuid();
BEGIN
  SELECT array_agg(id) INTO accounts FROM (SELECT id FROM auth.users ORDER BY id LIMIT 3) users_for_test;
  IF coalesce(array_length(accounts, 1), 0) < 3 THEN
    RAISE EXCEPTION 'History access regression needs three existing accounts';
  END IF;
  PERFORM set_config('test.history_participant', accounts[2]::text, true);
  PERFORM set_config('test.history_outsider', accounts[3]::text, true);
  PERFORM set_config('test.history_question', question_id::text, true);
  INSERT INTO public.live_sessions (id, instructor_id, session_code, title, is_active)
  VALUES (session_id, accounts[1], session_id::text, 'History access regression', true);
  INSERT INTO public.live_participants (session_id, nickname, user_id)
  VALUES (session_id, 'History test participant', accounts[2]);
  INSERT INTO public.live_questions (id, session_id, instructor_id, question_number, question_content, image_url, image_status)
  VALUES (question_id, session_id, accounts[1], 1,
    '{"question":"How many bones are in the adult human body?","correctAnswer":"206"}',
    'https://example.com/history-test.png', 'ready');
  UPDATE public.live_sessions SET is_active = false WHERE id = session_id;
END $$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('test.history_participant'), true);
DO $$
DECLARE visible_count integer;
BEGIN
  SELECT count(*) INTO visible_count FROM public.live_questions
  WHERE id = current_setting('test.history_question')::uuid
    AND question_content->>'question' = 'How many bones are in the adult human body?'
    AND question_content->>'correctAnswer' = '206'
    AND image_url = 'https://example.com/history-test.png'
    AND image_status = 'ready';
  IF visible_count <> 1 THEN
    RAISE EXCEPTION 'Linked participant cannot review the ended session question, answer, and image';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', current_setting('test.history_outsider'), true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.live_questions WHERE id = current_setting('test.history_question')::uuid) THEN
    RAISE EXCEPTION 'Unlinked account can read an ended session question';
  END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.live_questions WHERE id = current_setting('test.history_question')::uuid) THEN
    RAISE EXCEPTION 'Anonymous visitor can read an ended session question';
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  -- The baseline active-session rule also denies access via table privileges.
  NULL;
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT history_access_test;
RELEASE SAVEPOINT history_access_test;