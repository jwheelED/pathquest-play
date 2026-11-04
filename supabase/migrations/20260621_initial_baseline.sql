

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'instructor',
    'student'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."assignment_mode" AS ENUM (
    'hints_only',
    'hints_solutions',
    'auto_grade',
    'manual_grade'
);


ALTER TYPE "public"."assignment_mode" OWNER TO "postgres";


CREATE TYPE "public"."assignment_type" AS ENUM (
    'quiz',
    'lesson',
    'mini_project',
    'lecture_checkin'
);


ALTER TYPE "public"."assignment_type" OWNER TO "postgres";


CREATE TYPE "public"."draft_status" AS ENUM (
    'draft',
    'approved',
    'published'
);


ALTER TYPE "public"."draft_status" OWNER TO "postgres";


CREATE TYPE "public"."professor_type" AS ENUM (
    'stem',
    'humanities',
    'medical'
);


ALTER TYPE "public"."professor_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_group_creator_as_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.study_group_members (group_id, user_id, role, org_id)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.org_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."add_group_creator_as_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_lecture_minutes"("p_instructor_id" "uuid", "p_minutes" integer) RETURNS TABLE("new_total" integer, "minutes_limit" integer, "usage_percent" numeric, "warning_level" "text", "warning_triggered" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_current_month DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_new_total INTEGER;
  v_limit INTEGER;
  v_usage_percent NUMERIC;
  v_warning_75_sent BOOLEAN;
  v_warning_100_sent BOOLEAN;
  v_warning_triggered BOOLEAN := false;
  v_org_id UUID;
BEGIN
  -- Get instructor's org_id
  SELECT profiles.org_id INTO v_org_id FROM profiles WHERE id = p_instructor_id;
  
  -- Upsert and increment minutes
  INSERT INTO instructor_usage_tracking (instructor_id, usage_month, minutes_used, org_id)
  VALUES (p_instructor_id, v_current_month, p_minutes, v_org_id)
  ON CONFLICT (instructor_id, usage_month) 
  DO UPDATE SET 
    minutes_used = instructor_usage_tracking.minutes_used + p_minutes,
    updated_at = now()
  RETURNING 
    instructor_usage_tracking.minutes_used, 
    instructor_usage_tracking.minutes_limit,
    instructor_usage_tracking.warning_75_sent,
    instructor_usage_tracking.warning_100_sent
  INTO v_new_total, v_limit, v_warning_75_sent, v_warning_100_sent;
  
  v_usage_percent := ROUND((v_new_total::NUMERIC / NULLIF(v_limit, 0)) * 100, 1);
  
  -- Check and update warning flags
  IF v_usage_percent >= 100 AND NOT v_warning_100_sent THEN
    UPDATE instructor_usage_tracking 
    SET warning_100_sent = true 
    WHERE instructor_id = p_instructor_id AND usage_month = v_current_month;
    v_warning_triggered := true;
  ELSIF v_usage_percent >= 75 AND NOT v_warning_75_sent THEN
    UPDATE instructor_usage_tracking 
    SET warning_75_sent = true 
    WHERE instructor_id = p_instructor_id AND usage_month = v_current_month;
    v_warning_triggered := true;
  END IF;
  
  RETURN QUERY SELECT 
    v_new_total,
    v_limit,
    v_usage_percent,
    CASE
      WHEN v_usage_percent >= 100 THEN 'limit_reached'
      WHEN v_usage_percent >= 75 THEN 'warning_75'
      ELSE 'ok'
    END,
    v_warning_triggered;
END;
$$;


ALTER FUNCTION "public"."add_lecture_minutes"("p_instructor_id" "uuid", "p_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_sync_org_members"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_org_id uuid;
  v_instructors_linked int := 0;
  v_students_linked int := 0;
  v_admin_links_created int := 0;
  v_rows int := 0;
  r record;
BEGIN
  IF NOT has_role(v_admin_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can run sync';
  END IF;

  SELECT org_id INTO v_org_id FROM profiles WHERE id = v_admin_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Admin has no organization';
  END IF;

  -- 1) Accept pending invites for users who already signed up
  FOR r IN
    SELECT ii.id AS invite_id, ii.email, ii.org_id, u.id AS user_id
    FROM instructor_invites ii
    JOIN auth.users u ON lower(u.email) = lower(ii.email)
    WHERE ii.org_id = v_org_id
      AND ii.status = 'pending'
  LOOP
    UPDATE profiles
      SET org_id = r.org_id
      WHERE id = r.user_id AND (org_id IS NULL OR org_id <> r.org_id);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_instructors_linked := v_instructors_linked + v_rows;
    UPDATE instructor_invites SET status = 'accepted', accepted_at = now() WHERE id = r.invite_id;
  END LOOP;

  -- 2) Domain-based connection for instructors with matching email domain but no org
  FOR r IN
    SELECT p.id AS user_id, od.org_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'instructor'::app_role
    JOIN auth.users u ON u.id = p.id
    JOIN organization_domains od ON lower(od.domain) = lower(split_part(u.email, '@', 2))
    WHERE p.org_id IS NULL
      AND od.org_id = v_org_id
  LOOP
    UPDATE profiles SET org_id = r.org_id WHERE id = r.user_id;
    v_instructors_linked := v_instructors_linked + 1;
  END LOOP;

  -- 3) Ensure admin_instructors rows exist for every instructor in this org
  INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
  SELECT v_admin_id, p.id, v_org_id
  FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'instructor'::app_role
  WHERE p.org_id = v_org_id
  ON CONFLICT (admin_id, instructor_id) DO NOTHING;
  GET DIAGNOSTICS v_admin_links_created = ROW_COUNT;

  -- 4) Backfill students' org_id from their instructor relationships
  WITH updated AS (
    UPDATE profiles sp
    SET org_id = v_org_id
    FROM instructor_students ist
    JOIN profiles ip ON ip.id = ist.instructor_id
    WHERE sp.id = ist.student_id
      AND ip.org_id = v_org_id
      AND (sp.org_id IS NULL OR sp.org_id <> v_org_id)
    RETURNING sp.id
  )
  SELECT count(*) INTO v_students_linked FROM updated;

  -- 5) Backfill org_id on instructor_students join rows
  UPDATE instructor_students ist
  SET org_id = v_org_id
  FROM profiles ip
  WHERE ip.id = ist.instructor_id
    AND ip.org_id = v_org_id
    AND ist.org_id IS NULL;

  RETURN jsonb_build_object(
    'instructors_linked', v_instructors_linked,
    'students_linked', v_students_linked,
    'admin_links_created', v_admin_links_created,
    'org_id', v_org_id
  );
END;
$$;


ALTER FUNCTION "public"."admin_sync_org_members"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_oauth_role"("p_user_id" "uuid", "p_role" "public"."app_role") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only allow if user has no role yet (new OAuth signup)
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role != 'student'::app_role
  ) THEN
    -- Remove student role if exists
    DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'student'::app_role;
    
    -- Insert new role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, p_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    
    -- Update profile for instructors
    IF p_role = 'instructor'::app_role THEN
      UPDATE public.profiles
      SET instructor_code = generate_instructor_code(),
          onboarded = true
      WHERE id = p_user_id;
      
      INSERT INTO public.users (id, user_id, name, email)
      SELECT p_user_id, p_user_id, full_name, (SELECT email FROM auth.users WHERE id = p_user_id)
      FROM public.profiles WHERE id = p_user_id
      ON CONFLICT (id) DO NOTHING;
    END IF;
    
    -- Update profile for admins
    IF p_role = 'admin'::app_role THEN
      UPDATE public.profiles
      SET onboarded = true
      WHERE id = p_user_id;
      
      INSERT INTO public.users (id, user_id, name, email)
      SELECT p_user_id, p_user_id, full_name, (SELECT email FROM auth.users WHERE id = p_user_id)
      FROM public.profiles WHERE id = p_user_id
      ON CONFLICT (id) DO NOTHING;
    END IF;
    
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;


ALTER FUNCTION "public"."assign_oauth_role"("p_user_id" "uuid", "p_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_connect_instructor_to_org"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_email TEXT;
  v_email_domain TEXT;
  v_matched_org_id UUID;
  v_invite_org_id UUID;
BEGIN
  IF NOT has_role(NEW.id, 'instructor') THEN
    RETURN NEW;
  END IF;

  IF NEW.org_id IS NOT NULL THEN
    -- Already in an org: just make sure admin_instructors rows exist for every admin.
    INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
    SELECT p.id, NEW.id, NEW.org_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
    WHERE p.org_id = NEW.org_id
    ON CONFLICT (admin_id, instructor_id) DO NOTHING;
    RETURN NEW;
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = NEW.id;
  IF v_user_email IS NULL THEN
    RETURN NEW;
  END IF;

  v_email_domain := lower(split_part(v_user_email, '@', 2));

  SELECT org_id INTO v_invite_org_id
  FROM instructor_invites
  WHERE lower(email) = lower(v_user_email)
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_invite_org_id IS NOT NULL THEN
    NEW.org_id := v_invite_org_id;

    UPDATE instructor_invites
    SET status = 'accepted', accepted_at = now()
    WHERE org_id = v_invite_org_id AND lower(email) = lower(v_user_email);

    INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
    SELECT p.id, NEW.id, v_invite_org_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
    WHERE p.org_id = v_invite_org_id
    ON CONFLICT (admin_id, instructor_id) DO NOTHING;

    RETURN NEW;
  END IF;

  SELECT od.org_id INTO v_matched_org_id
  FROM organization_domains od
  WHERE lower(od.domain) = v_email_domain
  LIMIT 1;

  IF v_matched_org_id IS NOT NULL THEN
    NEW.org_id := v_matched_org_id;

    INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
    SELECT p.id, NEW.id, v_matched_org_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
    WHERE p.org_id = v_matched_org_id
    ON CONFLICT (admin_id, instructor_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_connect_instructor_to_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_connect_on_seat_allocation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT s.org_id INTO v_org_id
  FROM seat_licenses sl
  JOIN subscriptions s ON s.id = sl.subscription_id
  WHERE sl.id = NEW.seat_license_id;

  IF v_org_id IS NOT NULL THEN
    UPDATE profiles
    SET org_id = v_org_id
    WHERE id = NEW.instructor_id AND org_id IS NULL;

    INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
    SELECT p.id, NEW.instructor_id, v_org_id
    FROM profiles p
    JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'admin'
    WHERE p.org_id = v_org_id
    ON CONFLICT (admin_id, instructor_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_connect_on_seat_allocation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_release_expired_answers"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.student_assignments
  SET answers_released = true,
      release_method = 'auto',
      auto_release_enabled = false
  WHERE auto_release_enabled = true
    AND answers_released = false
    AND completed = true
    AND auto_release_at IS NOT NULL
    AND auto_release_at <= NOW();
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;


ALTER FUNCTION "public"."auto_release_expired_answers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_auto_release_time"("p_created_at" timestamp with time zone, "p_minutes" integer) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN p_created_at + (p_minutes || ' minutes')::interval;
END;
$$;


ALTER FUNCTION "public"."calculate_auto_release_time"("p_created_at" timestamp with time zone, "p_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_mastery_threshold"("p_user_id" "uuid", "p_lesson_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  avg_attempts numeric;
  threshold integer;
BEGIN
  -- Calculate average attempts across all lessons for this user
  SELECT AVG(attempt_count)::numeric
  INTO avg_attempts
  FROM lesson_mastery
  WHERE user_id = p_user_id AND is_mastered = true;
  
  -- Set threshold based on user's history
  -- Fast learners (avg < 5): threshold = 3
  -- Average learners (5-8): threshold = 5
  -- Slower learners (> 8): threshold = 8
  IF avg_attempts IS NULL THEN
    threshold := 3; -- Default for new users
  ELSIF avg_attempts < 5 THEN
    threshold := 3;
  ELSIF avg_attempts < 8 THEN
    threshold := 5;
  ELSE
    threshold := 8;
  END IF;
  
  RETURN threshold;
END;
$$;


ALTER FUNCTION "public"."calculate_mastery_threshold"("p_user_id" "uuid", "p_lesson_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_group"("_user_id" "uuid", "_group_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_group_members
    WHERE user_id = _user_id
      AND group_id = _group_id
      AND role IN ('owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."can_manage_group"("_user_id" "uuid", "_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_record_lecture"("p_instructor_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_usage RECORD;
BEGIN
  SELECT * INTO v_usage FROM get_current_usage(p_instructor_id);
  RETURN v_usage.minutes_used < v_usage.minutes_limit;
END;
$$;


ALTER FUNCTION "public"."can_record_lecture"("p_instructor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_user"("_viewer_id" "uuid", "_target_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Allow users to view themselves
  IF _viewer_id = _target_user_id THEN
    RETURN true;
  END IF;
  
  -- Allow instructors to view their students
  -- Query instructor_students directly without RLS interference
  RETURN EXISTS (
    SELECT 1
    FROM public.instructor_students
    WHERE instructor_id = _viewer_id
      AND student_id = _target_user_id
  );
END;
$$;


ALTER FUNCTION "public"."can_view_user"("_viewer_id" "uuid", "_target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_lti_tokens"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."cleanup_expired_lti_tokens"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_question_logs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.question_send_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_question_logs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_rate_limits"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_rate_limits"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_unsaved_lecture_checkins"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.student_assignments
  WHERE assignment_type = 'lecture_checkin'
    AND saved_by_student = false
    AND auto_delete_at IS NOT NULL
    AND auto_delete_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_unsaved_lecture_checkins"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."connect_instructor_to_admin"("_admin_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_admin_id UUID;
  v_instructor_id UUID;
  v_org_id UUID;
BEGIN
  -- Get current user (instructor)
  v_instructor_id := auth.uid();
  
  -- Verify user is an instructor
  IF NOT has_role(v_instructor_id, 'instructor') THEN
    RAISE EXCEPTION 'Only instructors can connect to admins';
  END IF;
  
  -- Find admin by code
  SELECT id, org_id INTO v_admin_id, v_org_id
  FROM profiles
  WHERE admin_code = _admin_code;
  
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Invalid admin code';
  END IF;
  
  -- Verify the user is actually an admin
  IF NOT has_role(v_admin_id, 'admin') THEN
    RAISE EXCEPTION 'Code does not belong to an admin';
  END IF;
  
  -- Verify admin has an org_id
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Admin is not connected to an organization';
  END IF;
  
  -- Update instructor's org_id
  UPDATE profiles
  SET org_id = v_org_id
  WHERE id = v_instructor_id;
  
  -- Insert connection (ON CONFLICT DO NOTHING to handle duplicates)
  INSERT INTO admin_instructors (admin_id, instructor_id, org_id)
  VALUES (v_admin_id, v_instructor_id, v_org_id)
  ON CONFLICT (admin_id, instructor_id) DO NOTHING;
  
  RETURN v_admin_id;
END;
$$;


ALTER FUNCTION "public"."connect_instructor_to_admin"("_admin_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_admin_code"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN 'ADM-' || result;
END;
$$;


ALTER FUNCTION "public"."generate_admin_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_course_code"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."generate_course_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_group_invite_code"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN 'GRP-' || result;
END;
$$;


ALTER FUNCTION "public"."generate_group_invite_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_instructor_code"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."generate_instructor_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_org_invite_code"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN 'ORG-' || result;
END;
$$;


ALTER FUNCTION "public"."generate_org_invite_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_session_code"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."generate_session_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_adaptive_difficulty"("p_user_id" "uuid") RETURNS TABLE("current_difficulty" "text", "consecutive_correct" integer, "consecutive_incorrect" integer, "difficulty_history" "jsonb", "total_questions_at_level" "jsonb", "success_rate_by_level" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Try to get existing record
  RETURN QUERY
  SELECT 
    ad.current_difficulty,
    ad.consecutive_correct,
    ad.consecutive_incorrect,
    ad.difficulty_history,
    ad.total_questions_at_level,
    ad.success_rate_by_level
  FROM public.adaptive_difficulty ad
  WHERE ad.user_id = p_user_id;
  
  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.adaptive_difficulty (user_id, org_id)
    SELECT p_user_id, org_id FROM public.profiles WHERE id = p_user_id
    ON CONFLICT (user_id) DO NOTHING;
    
    RETURN QUERY
    SELECT 
      ad.current_difficulty,
      ad.consecutive_correct,
      ad.consecutive_incorrect,
      ad.difficulty_history,
      ad.total_questions_at_level,
      ad.success_rate_by_level
    FROM public.adaptive_difficulty ad
    WHERE ad.user_id = p_user_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_adaptive_difficulty"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_connected_instructors"("_admin_id" "uuid") RETURNS TABLE("instructor_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id uuid;
BEGIN
  IF NOT has_role(_admin_id, 'admin'::app_role) THEN
    RETURN;
  END IF;

  SELECT org_id INTO v_org_id FROM profiles WHERE id = _admin_id;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.id
  FROM profiles p
  JOIN user_roles ur ON ur.user_id = p.id AND ur.role = 'instructor'::app_role
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.org_id = v_org_id
    AND (
      -- Direct admin<->instructor link (admin code, seat allocation, manual)
      EXISTS (
        SELECT 1 FROM admin_instructors ai
        WHERE ai.org_id = v_org_id
          AND ai.instructor_id = p.id
      )
      OR EXISTS (
        SELECT 1 FROM instructor_invites ii
        WHERE ii.org_id = v_org_id
          AND lower(ii.email) = lower(u.email)
          AND ii.status = 'accepted'
      )
      OR EXISTS (
        SELECT 1 FROM organization_domains od
        WHERE od.org_id = v_org_id
          AND lower(od.domain) = lower(split_part(u.email, '@', 2))
      )
      OR EXISTS (
        SELECT 1 FROM seat_allocations sa
        JOIN seat_licenses sl ON sl.id = sa.seat_license_id
        JOIN subscriptions s ON s.id = sl.subscription_id
        WHERE sa.instructor_id = p.id
          AND s.org_id = v_org_id
      )
    );
END;
$$;


ALTER FUNCTION "public"."get_admin_connected_instructors"("_admin_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_usage"("p_instructor_id" "uuid") RETURNS TABLE("minutes_used" integer, "minutes_limit" integer, "usage_percent" numeric, "warning_level" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_current_month DATE := date_trunc('month', CURRENT_DATE)::DATE;
  v_minutes_used INTEGER;
  v_minutes_limit INTEGER;
  v_usage_percent NUMERIC;
  v_org_id UUID;
BEGIN
  -- Get instructor's org_id
  SELECT profiles.org_id INTO v_org_id FROM profiles WHERE id = p_instructor_id;
  
  -- Insert record if not exists
  INSERT INTO instructor_usage_tracking (instructor_id, usage_month, org_id)
  VALUES (p_instructor_id, v_current_month, v_org_id)
  ON CONFLICT (instructor_id, usage_month) DO NOTHING;
  
  -- Get current usage
  SELECT iut.minutes_used, iut.minutes_limit
  INTO v_minutes_used, v_minutes_limit
  FROM instructor_usage_tracking iut
  WHERE iut.instructor_id = p_instructor_id AND iut.usage_month = v_current_month;
  
  v_usage_percent := ROUND((v_minutes_used::NUMERIC / NULLIF(v_minutes_limit, 0)) * 100, 1);
  
  RETURN QUERY SELECT 
    v_minutes_used,
    v_minutes_limit,
    v_usage_percent,
    CASE
      WHEN v_usage_percent >= 100 THEN 'limit_reached'
      WHEN v_usage_percent >= 75 THEN 'warning_75'
      ELSE 'ok'
    END;
END;
$$;


ALTER FUNCTION "public"."get_current_usage"("p_instructor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invited_org_names"("_email" "text") RETURNS TABLE("org_id" "uuid", "org_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT o.id, o.name
  FROM public.instructor_invites i
  JOIN public.organizations o ON o.id = i.org_id
  WHERE lower(i.email) = lower(_email)
    AND i.status = 'pending';
$$;


ALTER FUNCTION "public"."get_invited_org_names"("_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_codes"("_org_id" "uuid") RETURNS TABLE("admin_code" "text", "instructor_invite_code" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT o.admin_code, o.instructor_invite_code
  FROM public.organizations o
  WHERE o.id = _org_id
    AND public.has_role(auth.uid(), 'admin'::app_role)
    AND o.id = public.get_user_org_id(auth.uid());
$$;


ALTER FUNCTION "public"."get_org_codes"("_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_problem_answer"("problem_id" "uuid") RETURNS TABLE("correct_answer" "text", "explanation" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  -- Check if the user has attempted this problem
  IF EXISTS (
    SELECT 1 
    FROM public.problem_attempts
    WHERE problem_attempts.user_id = auth.uid()
    AND problem_attempts.problem_id = $1
  ) THEN
    -- Return the answer if they've attempted it
    RETURN QUERY
    SELECT sp.correct_answer, sp.explanation
    FROM public.stem_problems sp
    WHERE sp.id = $1;
  ELSE
    -- Return null if they haven't attempted it
    RETURN QUERY
    SELECT NULL::text, NULL::text;
  END IF;
END;
$_$;


ALTER FUNCTION "public"."get_problem_answer"("problem_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_question_success_rate"("p_instructor_id" "uuid", "p_days" integer DEFAULT 7) RETURNS TABLE("total_questions" integer, "successful_questions" integer, "failed_questions" integer, "success_rate" numeric, "avg_processing_time_ms" numeric, "most_common_error" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER as total,
    SUM(CASE WHEN success THEN 1 ELSE 0 END)::INTEGER as successful,
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END)::INTEGER as failed,
    ROUND(
      (SUM(CASE WHEN success THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 
      2
    ) as rate,
    ROUND(AVG(processing_time_ms), 0) as avg_time,
    (
      SELECT error_type 
      FROM public.question_send_logs 
      WHERE instructor_id = p_instructor_id 
        AND NOT success 
        AND created_at > NOW() - (p_days || ' days')::INTERVAL
      GROUP BY error_type 
      ORDER BY COUNT(*) DESC 
      LIMIT 1
    ) as common_error
  FROM public.question_send_logs
  WHERE instructor_id = p_instructor_id
    AND created_at > NOW() - (p_days || ' days')::INTERVAL;
END;
$$;


ALTER FUNCTION "public"."get_question_success_rate"("p_instructor_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_student_limit"("_user_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT st.student_limit
     FROM subscriptions s
     JOIN subscription_tiers st ON st.id = s.tier_id
     WHERE (s.user_id = _user_id OR s.org_id = get_user_org_id(_user_id))
       AND s.status = 'active'
       AND s.current_period_end > now()
     ORDER BY st.student_limit DESC NULLS FIRST
     LIMIT 1),
    25 -- Free tier default
  );
$$;


ALTER FUNCTION "public"."get_student_limit"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_course_limit"("_user_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT st.course_limit
     FROM subscriptions s
     JOIN subscription_tiers st ON st.id = s.tier_id
     WHERE (s.user_id = _user_id OR s.org_id = get_user_org_id(_user_id))
       AND s.status = 'active'
       AND s.current_period_end > now()
     ORDER BY st.course_limit DESC NULLS FIRST
     LIMIT 1),
    1 -- Free tier default: 1 course
  );
$$;


ALTER FUNCTION "public"."get_user_course_limit"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_org_id"("_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT org_id FROM public.profiles WHERE id = _user_id;
$$;


ALTER FUNCTION "public"."get_user_org_id"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_subscription_tier"("_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    -- First check direct user subscription
    (SELECT st.name 
     FROM subscriptions s
     JOIN subscription_tiers st ON st.id = s.tier_id
     WHERE s.user_id = _user_id 
       AND s.status = 'active'
       AND s.current_period_end > now()
     ORDER BY st.sort_order DESC
     LIMIT 1),
    -- Then check org subscription via seat allocation
    (SELECT st.name
     FROM seat_allocations sa
     JOIN seat_licenses sl ON sl.id = sa.seat_license_id
     JOIN subscriptions s ON s.id = sl.subscription_id
     JOIN subscription_tiers st ON st.id = s.tier_id
     WHERE sa.instructor_id = _user_id
       AND s.status = 'active'
       AND s.current_period_end > now()
     LIMIT 1),
    -- Default to free
    'free'
  );
$$;


ALTER FUNCTION "public"."get_user_subscription_tier"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := NEW.raw_user_meta_data->>'role';

  IF v_role = 'instructor' THEN
    INSERT INTO public.profiles (id, full_name, onboarded, instructor_code)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Instructor'),
      false,
      generate_instructor_code()
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'instructor'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.users (id, user_id, name, email)
    VALUES (
      NEW.id,
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Instructor'),
      COALESCE(NEW.email, '')
    )
    ON CONFLICT (id) DO NOTHING;

  ELSIF v_role = 'admin' THEN
    INSERT INTO public.profiles (id, full_name, onboarded)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Admin'),
      false
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.users (id, user_id, name, email)
    VALUES (
      NEW.id,
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Admin'),
      COALESCE(NEW.email, '')
    )
    ON CONFLICT (id) DO NOTHING;

  ELSE
    INSERT INTO public.profiles (id, full_name, onboarded)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Student'),
      false
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'student'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_feature_access"("_user_id" "uuid", "_feature" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  tier_features JSONB;
BEGIN
  -- Get user's tier features
  SELECT st.features INTO tier_features
  FROM subscriptions s
  JOIN subscription_tiers st ON st.id = s.tier_id
  WHERE (s.user_id = _user_id OR s.org_id = get_user_org_id(_user_id))
    AND s.status = 'active'
    AND s.current_period_end > now()
  ORDER BY st.sort_order DESC
  LIMIT 1;
  
  -- Check if feature is in the features array
  IF tier_features IS NOT NULL THEN
    RETURN tier_features ? _feature;
  END IF;
  
  -- Check free tier features
  SELECT features INTO tier_features
  FROM subscription_tiers
  WHERE name = 'free';
  
  RETURN COALESCE(tier_features ? _feature, false);
END;
$$;


ALTER FUNCTION "public"."has_feature_access"("_user_id" "uuid", "_feature" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  );
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_mcq_usage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.mcq_id IS NOT NULL THEN
    UPDATE public.answer_key_mcqs
    SET usage_count = usage_count + 1
    WHERE id = NEW.mcq_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."increment_mcq_usage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_group_member"("_user_id" "uuid", "_group_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.study_group_members
    WHERE user_id = _user_id
      AND group_id = _group_id
  );
$$;


ALTER FUNCTION "public"."is_group_member"("_user_id" "uuid", "_group_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."join_group_by_code"("_invite_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_group_id UUID;
  v_org_id UUID;
BEGIN
  -- Find group by invite code
  SELECT id, org_id INTO v_group_id, v_org_id
  FROM public.study_groups
  WHERE invite_code = _invite_code;
  
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Invalid invite code';
  END IF;
  
  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM public.study_group_members
    WHERE group_id = v_group_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are already a member of this group';
  END IF;
  
  -- Add user as member
  INSERT INTO public.study_group_members (group_id, user_id, role, org_id)
  VALUES (v_group_id, auth.uid(), 'member', v_org_id);
  
  RETURN v_group_id;
END;
$$;


ALTER FUNCTION "public"."join_group_by_code"("_invite_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_admin_code"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only generate code if user is admin and code is null
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = NEW.id AND role = 'admin'::app_role
  ) AND (NEW.admin_code IS NULL OR NEW.admin_code = '') THEN
    -- Keep generating until we get a unique code
    LOOP
      NEW.admin_code := generate_admin_code();
      -- Check if this code already exists
      IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE admin_code = NEW.admin_code 
        AND id != NEW.id
      ) THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_admin_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_answer_key_org_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.profiles WHERE id = NEW.instructor_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_answer_key_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_auto_release_timer"("p_assignment_ids" "uuid"[], "p_minutes" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.student_assignments
  SET auto_release_enabled = true,
      auto_release_minutes = p_minutes,
      auto_release_at = NOW() + (p_minutes || ' minutes')::interval
  WHERE id = ANY(p_assignment_ids);
END;
$$;


ALTER FUNCTION "public"."set_auto_release_timer"("p_assignment_ids" "uuid"[], "p_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_course_org_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM profiles WHERE id = NEW.instructor_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_course_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_event_session_code"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.session_code IS NULL OR NEW.session_code = '' THEN
    LOOP
      NEW.session_code := generate_session_code();
      IF NOT EXISTS (
        SELECT 1 FROM scheduled_events
        WHERE session_code = NEW.session_code
        AND id != NEW.id
      ) THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_event_session_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_group_invite_code"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.invite_code IS NULL OR NEW.invite_code = '' THEN
    LOOP
      NEW.invite_code := generate_group_invite_code();
      IF NOT EXISTS (
        SELECT 1 FROM study_groups 
        WHERE invite_code = NEW.invite_code 
        AND id != NEW.id
      ) THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_group_invite_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_instructor_code"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only generate code if user is instructor and code is null
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = NEW.id AND role = 'instructor'::app_role
  ) AND (NEW.instructor_code IS NULL OR NEW.instructor_code = '') THEN
    -- Keep generating until we get a unique code
    LOOP
      NEW.instructor_code := generate_instructor_code();
      -- Check if this code already exists
      IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE instructor_code = NEW.instructor_code 
        AND id != NEW.id
      ) THEN
        EXIT;
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_instructor_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_lecture_checkin_auto_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only set auto_delete_at for lecture_checkin type assignments
  IF NEW.assignment_type = 'lecture_checkin' THEN
    NEW.auto_delete_at := NEW.created_at + INTERVAL '24 hours';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_lecture_checkin_auto_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_lecture_summary_org_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM profiles WHERE id = NEW.instructor_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_lecture_summary_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_lecture_video_org_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM profiles WHERE id = NEW.instructor_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_lecture_video_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_profile_org_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- If org_id is not set, keep it null (will be set during onboarding)
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_profile_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_question_bank_org_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id FROM profiles WHERE id = NEW.instructor_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_question_bank_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_session_code"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."set_session_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_student_assignment_org_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  instructor_org uuid;
BEGIN
  -- Only set it if it's not already provided
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO instructor_org
    FROM profiles
    WHERE id = NEW.instructor_id;

    NEW.org_id := instructor_org;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_student_assignment_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_quiz"("p_assignment_id" "uuid", "p_user_answers" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_assignment RECORD;
  v_correct_count INTEGER := 0;
  v_total_mc_questions INTEGER := 0;
  v_total_questions INTEGER;
  v_calculated_grade NUMERIC;
  v_question JSONB;
  v_i INTEGER;
  v_user_answer TEXT;
  v_answer_count INTEGER;
  v_has_short_answer BOOLEAN := false;
  v_has_coding BOOLEAN := false;
  v_needs_manual_review BOOLEAN := false;
BEGIN
  -- Verify assignment belongs to calling user and isn't completed
  SELECT * INTO v_assignment
  FROM student_assignments
  WHERE id = p_assignment_id
  AND student_id = auth.uid()
  AND completed = false;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assignment not found or already completed';
  END IF;
  
  v_total_questions := jsonb_array_length(v_assignment.content->'questions');
  SELECT COUNT(*) INTO v_answer_count FROM jsonb_object_keys(p_user_answers);
  
  IF v_answer_count != v_total_questions THEN
    RAISE EXCEPTION 'Invalid answer count. Expected % answers, got %', 
      v_total_questions, v_answer_count;
  END IF;
  
  FOR v_i IN 0..v_total_questions-1 LOOP
    v_question := v_assignment.content->'questions'->v_i;
    v_user_answer := p_user_answers->>v_i::text;
    
    IF v_question->>'type' = 'short_answer' THEN
      v_has_short_answer := true;
      IF v_assignment.mode = 'manual_grade' THEN
        v_needs_manual_review := true;
      END IF;
    ELSIF v_question->>'type' IN ('coding', 'coding_simple') THEN
      v_has_coding := true;
      -- coding_simple is always auto-graded
    ELSE
      -- Multiple choice
      v_total_mc_questions := v_total_mc_questions + 1;
      IF v_user_answer = v_question->>'correctAnswer' THEN
        v_correct_count := v_correct_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  IF v_needs_manual_review THEN
    v_calculated_grade := NULL;
  ELSIF v_total_mc_questions > 0 THEN
    v_calculated_grade := (v_correct_count::NUMERIC / v_total_mc_questions) * 100;
  ELSE
    v_calculated_grade := NULL;
  END IF;
  
  UPDATE student_assignments
  SET completed = true,
      quiz_responses = p_user_answers,
      grade = v_calculated_grade
  WHERE id = p_assignment_id;
  
  RETURN jsonb_build_object(
    'grade', v_calculated_grade, 
    'correct', v_correct_count,
    'total', v_total_mc_questions,
    'pending_review', v_needs_manual_review,
    'has_short_answer', v_has_short_answer,
    'has_coding', v_has_coding,
    'assignment_mode', v_assignment.mode
  );
END;
$$;


ALTER FUNCTION "public"."submit_quiz"("p_assignment_id" "uuid", "p_user_answers" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_student_org_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  instructor_org uuid;
BEGIN
  -- Get instructor's org_id
  SELECT org_id INTO instructor_org
  FROM profiles
  WHERE id = NEW.instructor_id;
  
  -- Set org_id on the instructor_students record
  NEW.org_id := instructor_org;
  
  -- Also update the student's profile with the same org_id
  UPDATE profiles
  SET org_id = instructor_org
  WHERE id = NEW.student_id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_student_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_adaptive_difficulty"("p_user_id" "uuid", "p_was_correct" boolean, "p_current_difficulty" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_consecutive_correct INTEGER;
  v_consecutive_incorrect INTEGER;
  v_new_difficulty TEXT;
  v_difficulty_changed BOOLEAN := false;
  v_history JSONB;
  v_total_questions JSONB;
  v_success_rates JSONB;
  v_questions_at_level INTEGER;
  v_correct_at_level INTEGER;
BEGIN
  -- Get current state
  SELECT 
    consecutive_correct,
    consecutive_incorrect,
    difficulty_history,
    total_questions_at_level,
    success_rate_by_level
  INTO 
    v_consecutive_correct,
    v_consecutive_incorrect,
    v_history,
    v_total_questions,
    v_success_rates
  FROM public.adaptive_difficulty
  WHERE user_id = p_user_id;
  
  -- Initialize if null
  IF v_consecutive_correct IS NULL THEN
    v_consecutive_correct := 0;
    v_consecutive_incorrect := 0;
    v_history := '[]'::jsonb;
    v_total_questions := '{"beginner": 0, "intermediate": 0, "advanced": 0, "expert": 0}'::jsonb;
    v_success_rates := '{"beginner": 0, "intermediate": 0, "advanced": 0, "expert": 0}'::jsonb;
  END IF;
  
  v_new_difficulty := p_current_difficulty;
  
  -- Update consecutive counters
  IF p_was_correct THEN
    v_consecutive_correct := v_consecutive_correct + 1;
    v_consecutive_incorrect := 0;
  ELSE
    v_consecutive_incorrect := v_consecutive_incorrect + 1;
    v_consecutive_correct := 0;
  END IF;
  
  -- Update question count for current level
  v_questions_at_level := COALESCE((v_total_questions->p_current_difficulty)::INTEGER, 0) + 1;
  v_total_questions := jsonb_set(
    v_total_questions,
    ARRAY[p_current_difficulty],
    to_jsonb(v_questions_at_level)
  );
  
  -- Calculate success rate for current level
  v_correct_at_level := COALESCE((v_success_rates->p_current_difficulty)::NUMERIC, 0) * 
                        (v_questions_at_level - 1);
  IF p_was_correct THEN
    v_correct_at_level := v_correct_at_level + 1;
  END IF;
  
  v_success_rates := jsonb_set(
    v_success_rates,
    ARRAY[p_current_difficulty],
    to_jsonb(ROUND((v_correct_at_level::NUMERIC / v_questions_at_level::NUMERIC) * 100, 2))
  );
  
  -- Adaptive difficulty logic
  -- Increase difficulty: 4 consecutive correct answers AND success rate >= 75%
  IF v_consecutive_correct >= 4 AND 
     v_questions_at_level >= 5 AND
     (v_success_rates->p_current_difficulty)::NUMERIC >= 75 THEN
    
    CASE p_current_difficulty
      WHEN 'beginner' THEN v_new_difficulty := 'intermediate';
      WHEN 'intermediate' THEN v_new_difficulty := 'advanced';
      WHEN 'advanced' THEN v_new_difficulty := 'expert';
      ELSE v_new_difficulty := p_current_difficulty;
    END CASE;
    
    IF v_new_difficulty != p_current_difficulty THEN
      v_difficulty_changed := true;
      v_consecutive_correct := 0;
      v_consecutive_incorrect := 0;
    END IF;
  END IF;
  
  -- Decrease difficulty: 3 consecutive incorrect answers OR success rate < 40% after 8 questions
  IF (v_consecutive_incorrect >= 3) OR 
     (v_questions_at_level >= 8 AND (v_success_rates->p_current_difficulty)::NUMERIC < 40) THEN
    
    CASE p_current_difficulty
      WHEN 'expert' THEN v_new_difficulty := 'advanced';
      WHEN 'advanced' THEN v_new_difficulty := 'intermediate';
      WHEN 'intermediate' THEN v_new_difficulty := 'beginner';
      ELSE v_new_difficulty := p_current_difficulty;
    END CASE;
    
    IF v_new_difficulty != p_current_difficulty THEN
      v_difficulty_changed := true;
      v_consecutive_correct := 0;
      v_consecutive_incorrect := 0;
    END IF;
  END IF;
  
  -- Add to history if difficulty changed
  IF v_difficulty_changed THEN
    v_history := v_history || jsonb_build_object(
      'from', p_current_difficulty,
      'to', v_new_difficulty,
      'timestamp', now(),
      'reason', CASE 
        WHEN p_was_correct THEN 'consistent_success'
        ELSE 'needs_practice'
      END
    );
  END IF;
  
  -- Update the record
  UPDATE public.adaptive_difficulty
  SET
    current_difficulty = v_new_difficulty,
    consecutive_correct = v_consecutive_correct,
    consecutive_incorrect = v_consecutive_incorrect,
    difficulty_history = v_history,
    total_questions_at_level = v_total_questions,
    success_rate_by_level = v_success_rates,
    last_difficulty_change = CASE WHEN v_difficulty_changed THEN now() ELSE last_difficulty_change END,
    updated_at = now()
  WHERE user_id = p_user_id;
  
  RETURN v_new_difficulty;
END;
$$;


ALTER FUNCTION "public"."update_adaptive_difficulty"("p_user_id" "uuid", "p_was_correct" boolean, "p_current_difficulty" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_answer_key_problem_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE public.instructor_answer_keys
    SET problem_count = (
      SELECT COUNT(*) FROM public.answer_key_problems
      WHERE answer_key_id = NEW.answer_key_id
    )
    WHERE id = NEW.answer_key_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.instructor_answer_keys
    SET problem_count = (
      SELECT COUNT(*) FROM public.answer_key_problems
      WHERE answer_key_id = OLD.answer_key_id
    )
    WHERE id = OLD.answer_key_id;
    RETURN OLD;
  END IF;
END;
$$;


ALTER FUNCTION "public"."update_answer_key_problem_count"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_assignment_grade"("p_assignment_id" "uuid", "p_short_answer_grades" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_assignment RECORD;
  v_mc_grade NUMERIC := 0;
  v_mc_total INTEGER := 0;
  v_mc_correct INTEGER := 0;
  v_sa_grade NUMERIC := 0;
  v_sa_count INTEGER := 0;
  v_combined_grade NUMERIC;
  v_questions JSONB;
  v_responses JSONB;
  v_question JSONB;
  v_response TEXT;
  v_correct_answer TEXT;
  v_i INTEGER;
  v_has_short_answer_or_coding BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_assignment
  FROM student_assignments
  WHERE id = p_assignment_id
  AND instructor_id = auth.uid();
  
  IF v_assignment IS NULL THEN
    RAISE EXCEPTION 'Assignment not found or permission denied';
  END IF;
  
  v_questions := v_assignment.content->'questions';
  v_responses := v_assignment.quiz_responses;
  
  IF v_questions IS NULL THEN
    RETURN jsonb_build_object('error', 'No questions found in assignment');
  END IF;
  
  FOR v_i IN 0..jsonb_array_length(v_questions) - 1 LOOP
    v_question := v_questions->v_i;
    
    IF v_question->>'type' = 'multiple_choice' THEN
      v_mc_total := v_mc_total + 1;
      v_response := v_responses->>v_i::text;
      v_correct_answer := v_question->>'correctAnswer';
      
      IF v_response = v_correct_answer THEN
        v_mc_correct := v_mc_correct + 1;
      END IF;
    ELSIF v_question->>'type' IN ('short_answer', 'coding', 'coding_simple') THEN
      v_has_short_answer_or_coding := TRUE;
      IF p_short_answer_grades IS NOT NULL AND p_short_answer_grades->v_i::text IS NOT NULL THEN
        v_sa_grade := v_sa_grade + COALESCE((p_short_answer_grades->v_i::text->>'grade')::NUMERIC, 0);
        v_sa_count := v_sa_count + 1;
      END IF;
    END IF;
  END LOOP;
  
  IF v_mc_total > 0 AND v_sa_count > 0 THEN
    v_mc_grade := (v_mc_correct::NUMERIC / v_mc_total) * 100;
    v_sa_grade := v_sa_grade / v_sa_count;
    v_combined_grade := (v_mc_grade + v_sa_grade) / 2;
  ELSIF v_mc_total > 0 THEN
    v_combined_grade := (v_mc_correct::NUMERIC / v_mc_total) * 100;
  ELSIF v_sa_count > 0 THEN
    v_combined_grade := v_sa_grade / v_sa_count;
  ELSE
    RETURN jsonb_build_object('error', 'No questions to grade');
  END IF;
  
  UPDATE student_assignments
  SET 
    grade = v_combined_grade,
    answers_released = CASE 
      WHEN v_has_short_answer_or_coding AND p_short_answer_grades IS NOT NULL THEN TRUE
      ELSE answers_released
    END,
    release_method = CASE
      WHEN v_has_short_answer_or_coding AND p_short_answer_grades IS NOT NULL THEN 'auto_grade'
      ELSE release_method
    END
  WHERE id = p_assignment_id;
  
  RETURN jsonb_build_object(
    'grade', v_combined_grade,
    'mc_grade', CASE WHEN v_mc_total > 0 THEN v_mc_grade ELSE NULL END,
    'sa_grade', CASE WHEN v_sa_count > 0 THEN v_sa_grade / v_sa_count ELSE NULL END,
    'mc_correct', v_mc_correct,
    'mc_total', v_mc_total,
    'sa_count', v_sa_count,
    'answers_released', v_has_short_answer_or_coding AND p_short_answer_grades IS NOT NULL
  );
END;
$$;


ALTER FUNCTION "public"."update_assignment_grade"("p_assignment_id" "uuid", "p_short_answer_grades" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_admin_code"("_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  org_uuid uuid;
BEGIN
  SELECT id INTO org_uuid
  FROM public.organizations
  WHERE admin_code = _code
  LIMIT 1;
  
  RETURN org_uuid;
END;
$$;


ALTER FUNCTION "public"."validate_admin_code"("_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_course_code"("code" "text") RETURNS TABLE("course_id" "uuid", "instructor_id" "uuid", "course_title" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.instructor_id, c.title
  FROM public.courses c
  WHERE c.course_code = code
    AND c.is_active = true
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."validate_course_code"("code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_instructor_code"("code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  instructor_user_id uuid;
BEGIN
  -- Find instructor by code and verify they have instructor role
  SELECT p.id INTO instructor_user_id
  FROM profiles p
  INNER JOIN user_roles ur ON p.id = ur.user_id
  WHERE p.instructor_code = code 
  AND ur.role = 'instructor'
  LIMIT 1;
  
  RETURN instructor_user_id;
END;
$$;


ALTER FUNCTION "public"."validate_instructor_code"("code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_org_invite_code"("_code" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  org_uuid uuid;
BEGIN
  SELECT id INTO org_uuid
  FROM public.organizations
  WHERE instructor_invite_code = _code
  LIMIT 1;
  
  RETURN org_uuid;
END;
$$;


ALTER FUNCTION "public"."validate_org_invite_code"("_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_scheduled_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.duration NOT IN ('1_hour', '2_hours', '4_hours', 'full_day') THEN
    RAISE EXCEPTION 'Invalid duration value';
  END IF;
  IF NEW.tier NOT IN ('self-serve', 'premium') THEN
    RAISE EXCEPTION 'Invalid tier value';
  END IF;
  IF NEW.join_method NOT IN ('qr_only', 'code_only', 'both') THEN
    RAISE EXCEPTION 'Invalid join_method value';
  END IF;
  IF NEW.status NOT IN ('scheduled', 'ready', 'live', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid status value';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_scheduled_event"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."achievements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "icon" "text" NOT NULL,
    "requirement_type" "text" NOT NULL,
    "requirement_value" integer NOT NULL,
    "points_reward" integer DEFAULT 50 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tier" "text" DEFAULT 'bronze'::"text" NOT NULL,
    "category" "text" DEFAULT 'general'::"text" NOT NULL,
    CONSTRAINT "achievements_category_check" CHECK (("category" = ANY (ARRAY['general'::"text", 'practice'::"text", 'lecture'::"text", 'streak'::"text", 'mastery'::"text"]))),
    CONSTRAINT "achievements_tier_check" CHECK (("tier" = ANY (ARRAY['bronze'::"text", 'silver'::"text", 'gold'::"text", 'platinum'::"text"])))
);


ALTER TABLE "public"."achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."adaptive_difficulty" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "current_difficulty" "text" DEFAULT 'beginner'::"text" NOT NULL,
    "consecutive_correct" integer DEFAULT 0 NOT NULL,
    "consecutive_incorrect" integer DEFAULT 0 NOT NULL,
    "difficulty_history" "jsonb" DEFAULT '[]'::"jsonb",
    "total_questions_at_level" "jsonb" DEFAULT '{"expert": 0, "advanced": 0, "beginner": 0, "intermediate": 0}'::"jsonb",
    "success_rate_by_level" "jsonb" DEFAULT '{"expert": 0, "advanced": 0, "beginner": 0, "intermediate": 0}'::"jsonb",
    "last_difficulty_change" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid",
    CONSTRAINT "adaptive_difficulty_current_difficulty_check" CHECK (("current_difficulty" = ANY (ARRAY['beginner'::"text", 'intermediate'::"text", 'advanced'::"text", 'expert'::"text"])))
);


ALTER TABLE "public"."adaptive_difficulty" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_dashboard_presets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "icon" "text",
    "filters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_dashboard_presets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_instructors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "org_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_instructors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_explanation_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_hash" "text" NOT NULL,
    "wrong_answer" "text" NOT NULL,
    "correct_answer" "text" NOT NULL,
    "explanation" "text" NOT NULL,
    "usage_count" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_explanation_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_quality_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rating_type" "text" NOT NULL,
    "reference_id" "uuid" NOT NULL,
    "rating" "text" NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_quality_ratings_rating_check" CHECK (("rating" = ANY (ARRAY['helpful'::"text", 'not_helpful'::"text", 'excellent'::"text", 'good'::"text", 'poor'::"text"]))),
    CONSTRAINT "ai_quality_ratings_rating_type_check" CHECK (("rating_type" = ANY (ARRAY['question_generation'::"text", 'transcription'::"text"])))
);


ALTER TABLE "public"."ai_quality_ratings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."answer_key_mcqs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "problem_id" "uuid" NOT NULL,
    "question_text" "text" NOT NULL,
    "question_latex" "text",
    "correct_answer" "text" NOT NULL,
    "correct_answer_latex" "text",
    "distractors" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "explanation" "text",
    "explanation_latex" "text",
    "verified" boolean DEFAULT false,
    "usage_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_type" "text" DEFAULT 'generated'::"text",
    "answer_key_id" "uuid",
    CONSTRAINT "answer_key_mcqs_source_type_check" CHECK (("source_type" = ANY (ARRAY['generated'::"text", 'extracted'::"text"])))
);


ALTER TABLE "public"."answer_key_mcqs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."answer_key_problems" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "answer_key_id" "uuid" NOT NULL,
    "problem_number" "text",
    "problem_text" "text" NOT NULL,
    "problem_latex" "text",
    "solution_text" "text",
    "solution_latex" "text",
    "solution_steps" "jsonb" DEFAULT '[]'::"jsonb",
    "final_answer" "text",
    "final_answer_latex" "text",
    "units" "text",
    "topic_tags" "text"[] DEFAULT '{}'::"text"[],
    "keywords" "text"[] DEFAULT '{}'::"text"[],
    "difficulty" "text" DEFAULT 'intermediate'::"text",
    "verified_by_instructor" boolean DEFAULT false,
    "verification_notes" "text",
    "order_index" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "has_solution" boolean DEFAULT true
);


ALTER TABLE "public"."answer_key_problems" OWNER TO "postgres";


COMMENT ON COLUMN "public"."answer_key_problems"."has_solution" IS 'True if the problem includes a worked solution, false if problem-only';



CREATE TABLE IF NOT EXISTS "public"."answer_key_usage_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "problem_id" "uuid",
    "mcq_id" "uuid",
    "session_id" "uuid",
    "instructor_id" "uuid" NOT NULL,
    "transcript_snippet" "text",
    "match_confidence" numeric(4,3),
    "match_keywords" "text"[],
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."answer_key_usage_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."answer_version_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "version_events" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "typed_count" integer DEFAULT 0 NOT NULL,
    "pasted_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "question_displayed_at" timestamp with time zone,
    "first_interaction_at" timestamp with time zone,
    "first_interaction_type" "text",
    "first_interaction_size" integer,
    "question_copied" boolean DEFAULT false,
    "question_copied_at" timestamp with time zone,
    "final_answer_length" integer,
    "editing_events_after_first_paste" integer DEFAULT 0,
    "tab_switch_count" integer DEFAULT 0 NOT NULL,
    "total_time_away_seconds" integer DEFAULT 0 NOT NULL,
    "tab_switches" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "longest_absence_seconds" integer DEFAULT 0 NOT NULL,
    "switched_away_immediately" boolean DEFAULT false NOT NULL,
    "answer_copied" boolean DEFAULT false,
    "answer_copy_count" integer DEFAULT 0,
    "answer_copy_events" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."answer_version_history" OWNER TO "postgres";


COMMENT ON COLUMN "public"."answer_version_history"."question_displayed_at" IS 'When the question first became visible to the student';



COMMENT ON COLUMN "public"."answer_version_history"."first_interaction_at" IS 'Timestamp of the very first user interaction';



COMMENT ON COLUMN "public"."answer_version_history"."first_interaction_type" IS 'Type of first interaction: typed or pasted';



COMMENT ON COLUMN "public"."answer_version_history"."first_interaction_size" IS 'Character count of first interaction';



COMMENT ON COLUMN "public"."answer_version_history"."question_copied" IS 'Whether the student copied the question text';



COMMENT ON COLUMN "public"."answer_version_history"."question_copied_at" IS 'When the question was copied';



COMMENT ON COLUMN "public"."answer_version_history"."final_answer_length" IS 'Total character count of final answer';



COMMENT ON COLUMN "public"."answer_version_history"."editing_events_after_first_paste" IS 'Number of edit events after the first paste';



COMMENT ON COLUMN "public"."answer_version_history"."answer_copied" IS 'Whether the student copied text from their answer box';



COMMENT ON COLUMN "public"."answer_version_history"."answer_copy_count" IS 'Number of times student copied from answer box';



COMMENT ON COLUMN "public"."answer_version_history"."answer_copy_events" IS 'Array of copy events with timestamps and text length';



CREATE TABLE IF NOT EXISTS "public"."checkin_streaks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "current_streak" integer DEFAULT 0 NOT NULL,
    "longest_streak" integer DEFAULT 0 NOT NULL,
    "last_correct_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."checkin_streaks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."content_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "topic" "text" NOT NULL,
    "slide_text" "text" NOT NULL,
    "code_example" "text",
    "demo_snippets" "jsonb",
    "assignment_type" "public"."assignment_type" NOT NULL,
    "status" "public"."draft_status" DEFAULT 'draft'::"public"."draft_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid"
);


ALTER TABLE "public"."content_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "org_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "topics" "text"[] DEFAULT '{}'::"text"[],
    "schedule" "text",
    "course_type" "text" DEFAULT 'stem'::"text",
    "course_code" "text" DEFAULT "public"."generate_course_code"() NOT NULL,
    "is_active" boolean DEFAULT true,
    "archived_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."courses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid",
    "challenge_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "challenge_type" "text" NOT NULL,
    "target_value" integer NOT NULL,
    "current_progress" integer DEFAULT 0 NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "xp_reward" integer DEFAULT 50 NOT NULL,
    "coins_reward" integer DEFAULT 25 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."daily_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."diagram_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "concept_context" "text" NOT NULL,
    "question_text" "text",
    "image_data" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."diagram_generations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grade_sync_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "context_id" "uuid",
    "student_id" "uuid" NOT NULL,
    "lti_user_id" "text",
    "assignment_type" "text" NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "score_given" numeric NOT NULL,
    "score_maximum" numeric DEFAULT 100 NOT NULL,
    "activity_progress" "text" DEFAULT 'Completed'::"text",
    "grading_progress" "text" DEFAULT 'FullyGraded'::"text",
    "lms_response" "jsonb",
    "sync_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error_message" "text",
    "synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "retry_count" integer DEFAULT 0
);


ALTER TABLE "public"."grade_sync_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instructor_answer_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "org_id" "uuid",
    "title" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "course_context" "text",
    "file_path" "text",
    "file_name" "text",
    "file_type" "text",
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "problem_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "content_type" "text" DEFAULT 'problem-solutions'::"text",
    "course_id" "uuid",
    CONSTRAINT "instructor_answer_keys_content_type_check" CHECK (("content_type" = ANY (ARRAY['problem-solutions'::"text", 'mcqs'::"text"])))
);


ALTER TABLE "public"."instructor_answer_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instructor_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "invited_by" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "accepted_at" timestamp with time zone,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "instructor_invites_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."instructor_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instructor_question_bank" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "course_id" "uuid",
    "title" "text" NOT NULL,
    "question_type" "text" NOT NULL,
    "question_content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "difficulty" "text" DEFAULT 'medium'::"text",
    "times_used" integer DEFAULT 0,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid",
    "source_material_id" "uuid",
    "source_material_title" "text",
    CONSTRAINT "instructor_question_bank_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['easy'::"text", 'medium'::"text", 'hard'::"text"]))),
    CONSTRAINT "instructor_question_bank_question_type_check" CHECK (("question_type" = ANY (ARRAY['multiple_choice'::"text", 'short_answer'::"text", 'coding'::"text", 'coding_simple'::"text"])))
);


ALTER TABLE "public"."instructor_question_bank" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instructor_students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid",
    "course_id" "uuid"
);

ALTER TABLE ONLY "public"."instructor_students" REPLICA IDENTITY FULL;


ALTER TABLE "public"."instructor_students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instructor_usage_tracking" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "usage_month" "date" DEFAULT ("date_trunc"('month'::"text", (CURRENT_DATE)::timestamp with time zone))::"date" NOT NULL,
    "minutes_used" integer DEFAULT 0 NOT NULL,
    "minutes_limit" integer DEFAULT 90 NOT NULL,
    "warning_75_sent" boolean DEFAULT false NOT NULL,
    "warning_100_sent" boolean DEFAULT false NOT NULL,
    "org_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."instructor_usage_tracking" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lecture_concept_map" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lecture_video_id" "uuid" NOT NULL,
    "concept_name" "text" NOT NULL,
    "start_timestamp" double precision NOT NULL,
    "end_timestamp" double precision NOT NULL,
    "prerequisites" "text"[] DEFAULT '{}'::"text"[],
    "difficulty_level" "text" DEFAULT 'intermediate'::"text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lecture_concept_map" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lecture_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid",
    "course_id" "uuid",
    "pdf_fallback_path" "text",
    "pdf_conversion_status" "text",
    "parsed_text" "text"
);


ALTER TABLE "public"."lecture_materials" OWNER TO "postgres";


COMMENT ON COLUMN "public"."lecture_materials"."pdf_fallback_path" IS 'Path to converted PDF for slide extraction when original is PPTX with animations preserved';



COMMENT ON COLUMN "public"."lecture_materials"."pdf_conversion_status" IS 'Status of background PDF conversion: pending, processing, completed, failed';



COMMENT ON COLUMN "public"."lecture_materials"."parsed_text" IS 'Pre-extracted text content from the uploaded file, populated by parse-lecture-material edge function';



CREATE TABLE IF NOT EXISTS "public"."lecture_medical_entities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lecture_video_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_name" "text" NOT NULL,
    "description" "text",
    "start_timestamp" double precision,
    "end_timestamp" double precision,
    "related_entities" "text"[] DEFAULT '{}'::"text"[],
    "clinical_context" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lecture_medical_entities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lecture_pause_points" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lecture_video_id" "uuid" NOT NULL,
    "pause_timestamp" double precision NOT NULL,
    "cognitive_load_score" integer,
    "reason" "text",
    "question_content" "jsonb" NOT NULL,
    "question_type" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "order_index" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "difficulty_type" "text" DEFAULT 'application'::"text",
    "follow_up_questions" "jsonb",
    "why_not_other_choices" "jsonb",
    CONSTRAINT "lecture_pause_points_cognitive_load_score_check" CHECK ((("cognitive_load_score" >= 1) AND ("cognitive_load_score" <= 10))),
    CONSTRAINT "lecture_pause_points_question_type_check" CHECK (("question_type" = ANY (ARRAY['multiple_choice'::"text", 'short_answer'::"text"])))
);


ALTER TABLE "public"."lecture_pause_points" OWNER TO "postgres";


COMMENT ON COLUMN "public"."lecture_pause_points"."difficulty_type" IS 'Question difficulty classification: recall, application, reasoning';



COMMENT ON COLUMN "public"."lecture_pause_points"."follow_up_questions" IS 'Branching follow-up questions for correct_confident and correct_uncertain paths';



COMMENT ON COLUMN "public"."lecture_pause_points"."why_not_other_choices" IS 'Explanations for why each wrong option is incorrect';



CREATE TABLE IF NOT EXISTS "public"."lecture_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "transcript_snippet" "text" NOT NULL,
    "questions" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid",
    "course_id" "uuid",
    CONSTRAINT "lecture_questions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."lecture_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lecture_summaries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "session_id" "uuid",
    "course_id" "uuid",
    "org_id" "uuid",
    "title" "text",
    "duration_seconds" integer DEFAULT 0 NOT NULL,
    "questions_asked" integer DEFAULT 0 NOT NULL,
    "student_count" integer DEFAULT 0 NOT NULL,
    "summary_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lecture_summaries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lecture_videos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "org_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "video_path" "text" NOT NULL,
    "video_url" "text",
    "duration_seconds" integer,
    "transcript" "jsonb" DEFAULT '[]'::"jsonb",
    "cognitive_analysis" "jsonb" DEFAULT '{}'::"jsonb",
    "question_count" integer DEFAULT 5,
    "status" "text" DEFAULT 'processing'::"text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "domain_type" "text" DEFAULT 'general'::"text",
    "extracted_entities" "jsonb" DEFAULT '[]'::"jsonb",
    "published" boolean DEFAULT true,
    "course_id" "uuid",
    CONSTRAINT "lecture_videos_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'analyzing'::"text", 'ready'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."lecture_videos" OWNER TO "postgres";


COMMENT ON COLUMN "public"."lecture_videos"."published" IS 'Whether the video is visible to students on their dashboard';



CREATE TABLE IF NOT EXISTS "public"."lesson_mastery" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lesson_id" "uuid" NOT NULL,
    "attempt_count" integer DEFAULT 0 NOT NULL,
    "successful_attempts" integer DEFAULT 0 NOT NULL,
    "mastery_threshold" integer DEFAULT 3 NOT NULL,
    "is_mastered" boolean DEFAULT false NOT NULL,
    "last_attempt_date" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lesson_mastery" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lesson_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lesson_id" "uuid" NOT NULL,
    "completed" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "org_id" "uuid"
);


ALTER TABLE "public"."lesson_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lessons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "type" "text" NOT NULL,
    "content" "text",
    "step_number" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    CONSTRAINT "lessons_type_check" CHECK (("type" = ANY (ARRAY['Lesson'::"text", 'Quiz'::"text", 'Article'::"text", 'Project'::"text"])))
);


ALTER TABLE "public"."lessons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "nickname" "text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."live_participants" REPLICA IDENTITY FULL;


ALTER TABLE "public"."live_participants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "question_content" "jsonb" NOT NULL,
    "question_number" integer NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."live_questions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."live_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "question_id" "uuid" NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "answer" "text" NOT NULL,
    "is_correct" boolean NOT NULL,
    "responded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "response_time_ms" integer,
    "confidence_level" "text",
    "confidence_multiplier" numeric DEFAULT 1.0,
    "points_earned" integer DEFAULT 0,
    "ai_grade" numeric,
    "ai_feedback" "text"
);

ALTER TABLE ONLY "public"."live_responses" REPLICA IDENTITY FULL;


ALTER TABLE "public"."live_responses" OWNER TO "postgres";


COMMENT ON COLUMN "public"."live_responses"."ai_grade" IS 'AI-assigned grade 0-100 for short answer questions';



COMMENT ON COLUMN "public"."live_responses"."ai_feedback" IS 'AI feedback explaining the grade';



CREATE TABLE IF NOT EXISTS "public"."live_session_transcripts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "course_id" "uuid",
    "org_id" "uuid",
    "chunk_index" integer NOT NULL,
    "text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."live_session_transcripts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."live_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "session_code" "text" NOT NULL,
    "title" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone DEFAULT ("now"() + '04:00:00'::interval) NOT NULL,
    "org_id" "uuid",
    "course_id" "uuid"
);

ALTER TABLE ONLY "public"."live_sessions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."live_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lti_contexts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "platform_id" "uuid" NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "context_id" "text" NOT NULL,
    "context_title" "text",
    "resource_link_id" "text",
    "lineitem_url" "text",
    "lineitems_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lti_contexts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lti_platforms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "platform_name" "text" NOT NULL,
    "platform_type" "text" NOT NULL,
    "issuer" "text" NOT NULL,
    "client_id" "text" NOT NULL,
    "deployment_id" "text",
    "auth_url" "text" NOT NULL,
    "token_url" "text" NOT NULL,
    "jwks_url" "text" NOT NULL,
    "ags_scopes" "text"[] DEFAULT ARRAY['https://purl.imsglobal.org/spec/lti-ags/scope/lineitem'::"text", 'https://purl.imsglobal.org/spec/lti-ags/scope/score'::"text"],
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lti_platforms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lti_session_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" NOT NULL,
    "platform_id" "uuid" NOT NULL,
    "context_id" "text",
    "user_id" "text" NOT NULL,
    "is_instructor" boolean DEFAULT false NOT NULL,
    "redirect_path" "text" DEFAULT '/dashboard'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lti_session_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lti_token_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "platform_id" "uuid" NOT NULL,
    "access_token" "text" NOT NULL,
    "token_type" "text" DEFAULT 'Bearer'::"text",
    "expires_at" timestamp with time zone NOT NULL,
    "scope" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lti_token_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lti_tool_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kid" "text" NOT NULL,
    "public_key" "text" NOT NULL,
    "private_key" "text" NOT NULL,
    "algorithm" "text" DEFAULT 'RS256'::"text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."lti_tool_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lti_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "platform_id" "uuid" NOT NULL,
    "lti_user_id" "text" NOT NULL,
    "edvana_user_id" "uuid",
    "email" "text",
    "name" "text",
    "roles" "text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lti_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid"
);

ALTER TABLE ONLY "public"."messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_domains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "domain" "text" NOT NULL,
    "verified" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."organization_domains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "admin_code" "text" NOT NULL,
    "instructor_invite_code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."personalized_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source_material_id" "uuid",
    "org_id" "uuid",
    "question_text" "text" NOT NULL,
    "question_type" "text" NOT NULL,
    "options" "jsonb",
    "correct_answer" "text" NOT NULL,
    "explanation" "text" NOT NULL,
    "difficulty" "text" NOT NULL,
    "topic_tags" "text"[],
    "points_reward" integer DEFAULT 10 NOT NULL,
    "times_attempted" integer DEFAULT 0,
    "times_correct" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "instructor_id" "uuid",
    CONSTRAINT "personalized_questions_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['beginner'::"text", 'intermediate'::"text", 'advanced'::"text"]))),
    CONSTRAINT "personalized_questions_question_type_check" CHECK (("question_type" = ANY (ARRAY['multiple_choice'::"text", 'short_answer'::"text", 'true_false'::"text"])))
);


ALTER TABLE "public"."personalized_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pilot_rebates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "original_amount_cents" integer NOT NULL,
    "stripe_payment_intent_id" "text" NOT NULL,
    "eligible_until" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'eligible'::"text" NOT NULL,
    "claimed_at" timestamp with time zone,
    "refund_amount_cents" integer,
    "institutional_subscription_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "valid_rebate_status" CHECK (("status" = ANY (ARRAY['eligible'::"text", 'claimed'::"text", 'expired'::"text", 'processing'::"text"])))
);


ALTER TABLE "public"."pilot_rebates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."practice_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid",
    "goal_type" "text" NOT NULL,
    "target_value" integer NOT NULL,
    "current_progress" integer DEFAULT 0 NOT NULL,
    "deadline" "date" NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "xp_reward" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."practice_goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."practice_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "problem_id" "uuid" NOT NULL,
    "problem_text" "text" NOT NULL,
    "confidence_level" "text" NOT NULL,
    "confidence_multiplier" numeric NOT NULL,
    "is_correct" boolean NOT NULL,
    "xp_earned" integer NOT NULL,
    "coins_earned" integer NOT NULL,
    "time_spent_seconds" integer,
    "org_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "practice_sessions_confidence_level_check" CHECK (("confidence_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'very_high'::"text"])))
);


ALTER TABLE "public"."practice_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."problem_attempts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "problem_id" "uuid" NOT NULL,
    "is_correct" boolean NOT NULL,
    "time_spent_seconds" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."problem_attempts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "goals" "text"[],
    "experience_level" "text",
    "onboarded" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "study_days" "text"[],
    "instructor_code" "text",
    "course_title" "text",
    "course_schedule" "text",
    "course_topics" "text"[],
    "question_format_preference" "text" DEFAULT 'multiple_choice'::"text",
    "daily_question_limit" integer DEFAULT 200,
    "auto_question_enabled" boolean DEFAULT false,
    "auto_question_interval" integer DEFAULT 15,
    "last_auto_question_at" timestamp without time zone,
    "auto_question_force_send" boolean DEFAULT false,
    "auto_grade_short_answer" boolean DEFAULT false,
    "auto_grade_coding" boolean DEFAULT false,
    "auto_grade_mcq" boolean DEFAULT true,
    "professor_type" "public"."professor_type",
    "auto_grade_model" "text" DEFAULT 'google/gemini-2.5-pro'::"text" NOT NULL,
    "org_id" "uuid",
    "admin_code" "text",
    "detection_model" "text" DEFAULT 'google/gemini-3-flash-preview'::"text" NOT NULL,
    "transcription_model" "text" DEFAULT 'google/gemini-3-flash-preview'::"text" NOT NULL,
    "generation_model" "text" DEFAULT 'google/gemini-3-flash-preview'::"text" NOT NULL,
    "interval_question_model" "text" DEFAULT 'google/gemini-3-flash-preview'::"text" NOT NULL,
    "auto_question_strict_mode" boolean DEFAULT true,
    "question_difficulty_preference" "text" DEFAULT 'easy'::"text",
    "medical_specialty" "text",
    "exam_style_preference" "text" DEFAULT 'usmle_step1'::"text",
    "difficulty_mix" "jsonb" DEFAULT '{"recall": 40, "reasoning": 20, "application": 40}'::"jsonb",
    "style_mix" "jsonb" DEFAULT '{"mcq": 70, "short_answer": 30}'::"jsonb",
    "question_preset" "text" DEFAULT 'balanced'::"text",
    "lecture_preferences" "jsonb" DEFAULT '{"timer_seconds": 90, "timed_quiz_mode": false, "reduce_interruptions": false}'::"jsonb",
    "coding_question_style" "text" DEFAULT 'simple'::"text",
    "question_preview_enabled" boolean DEFAULT false,
    "preferred_coding_language" "text" DEFAULT 'python'::"text",
    "kaltura_partner_id" "text",
    "kaltura_uiconf_id" "text",
    CONSTRAINT "profiles_auto_grade_model_check" CHECK (("auto_grade_model" = ANY (ARRAY['google/gemini-2.5-flash'::"text", 'google/gemini-2.5-pro'::"text", 'google/gemini-2.5-flash-lite'::"text", 'google/gemini-3-flash-preview'::"text", 'google/gemini-3-pro-preview'::"text", 'openai/gpt-5-mini'::"text", 'openai/gpt-5'::"text", 'flash'::"text"]))),
    CONSTRAINT "profiles_coding_question_style_check" CHECK (("coding_question_style" = ANY (ARRAY['simple'::"text", 'full'::"text"]))),
    CONSTRAINT "profiles_daily_question_limit_check" CHECK (("daily_question_limit" > 0)),
    CONSTRAINT "profiles_preferred_coding_language_check" CHECK (("preferred_coding_language" = ANY (ARRAY['python'::"text", 'java'::"text", 'javascript'::"text", 'cpp'::"text", 'c'::"text", 'csharp'::"text", 'go'::"text", 'rust'::"text", 'typescript'::"text"]))),
    CONSTRAINT "profiles_question_format_preference_check" CHECK (("question_format_preference" = ANY (ARRAY['multiple_choice'::"text", 'short_answer'::"text", 'coding'::"text", 'poll'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."question_format_preference" IS 'Instructor preference for lecture check-in question format';



COMMENT ON COLUMN "public"."profiles"."daily_question_limit" IS 'Maximum number of lecture check-in questions an instructor can send per day';



COMMENT ON COLUMN "public"."profiles"."auto_question_enabled" IS 'Enable/disable automatic question generation at fixed intervals during lecture recording';



COMMENT ON COLUMN "public"."profiles"."auto_question_interval" IS 'Interval in minutes for auto-generating questions during lecture (10, 15, 20, or 30)';



COMMENT ON COLUMN "public"."profiles"."last_auto_question_at" IS 'Timestamp of the last automatically generated question';



COMMENT ON COLUMN "public"."profiles"."auto_grade_model" IS 'AI model for auto-grading: flash (fast, standard) or pro (slower, more accurate)';



COMMENT ON COLUMN "public"."profiles"."auto_question_strict_mode" IS 'When enabled, forces question generation at every interval regardless of content quality';



COMMENT ON COLUMN "public"."profiles"."question_difficulty_preference" IS 'Instructor preference for generated question difficulty: easy, medium, or hard';



COMMENT ON COLUMN "public"."profiles"."difficulty_mix" IS 'Mix of question difficulty types: recall, application, reasoning (percentages)';



COMMENT ON COLUMN "public"."profiles"."style_mix" IS 'Mix of question styles: mcq, short_answer (percentages)';



COMMENT ON COLUMN "public"."profiles"."question_preset" IS 'Preset name: balanced, concept_check, deep_understanding, board_prep';



COMMENT ON COLUMN "public"."profiles"."question_preview_enabled" IS 'When true, shows preview dialog before sending voice/manual questions. When false (default), sends immediately.';



COMMENT ON COLUMN "public"."profiles"."preferred_coding_language" IS 'The programming language STEM instructors want coding questions generated and answered in';



CREATE TABLE IF NOT EXISTS "public"."question_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "pause_point_id" "uuid" NOT NULL,
    "report_type" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "reviewed_by" "uuid",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."question_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."question_send_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "question_text" "text" NOT NULL,
    "question_type" "text" NOT NULL,
    "source" "text" NOT NULL,
    "success" boolean NOT NULL,
    "error_message" "text",
    "error_type" "text",
    "student_count" integer NOT NULL,
    "successful_sends" integer DEFAULT 0 NOT NULL,
    "failed_sends" integer DEFAULT 0 NOT NULL,
    "batch_count" integer,
    "processing_time_ms" integer,
    "ai_confidence" numeric,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."question_send_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "count" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."remediation_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "lecture_video_id" "uuid" NOT NULL,
    "pause_point_id" "uuid",
    "misconception_detected" "text" NOT NULL,
    "missing_concept" "text",
    "remediation_timestamp" double precision NOT NULL,
    "remediation_end_timestamp" double precision,
    "ai_explanation" "text" NOT NULL,
    "follow_up_question" "jsonb",
    "follow_up_answered" boolean DEFAULT false,
    "follow_up_correct" boolean,
    "resolved" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."remediation_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."scheduled_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organizer_id" "uuid" NOT NULL,
    "event_name" "text" NOT NULL,
    "event_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "duration" "text" NOT NULL,
    "expected_attendance" integer NOT NULL,
    "tier" "text" NOT NULL,
    "capacity_tier" "text" NOT NULL,
    "price_cents" integer NOT NULL,
    "join_method" "text" DEFAULT 'both'::"text" NOT NULL,
    "require_name" boolean DEFAULT false NOT NULL,
    "show_live_results" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "session_code" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid"
);


ALTER TABLE "public"."scheduled_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seat_allocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "seat_license_id" "uuid" NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "allocated_seats" integer DEFAULT 1 NOT NULL,
    "allocated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "allocated_by" "uuid",
    "notes" "text",
    CONSTRAINT "positive_allocation" CHECK (("allocated_seats" > 0))
);


ALTER TABLE "public"."seat_allocations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."seat_licenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subscription_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "total_seats" integer NOT NULL,
    "used_seats" integer DEFAULT 0 NOT NULL,
    "price_per_seat_cents" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "positive_seats" CHECK (("total_seats" > 0)),
    CONSTRAINT "used_not_exceed_total" CHECK (("used_seats" <= "total_seats"))
);


ALTER TABLE "public"."seat_licenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slide_preset_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "material_id" "uuid" NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "slide_number" integer NOT NULL,
    "question_type" "text" DEFAULT 'mcq'::"text" NOT NULL,
    "question_content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "generation_source" "text" DEFAULT 'auto'::"text" NOT NULL,
    "org_id" "uuid",
    "course_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "question_name" "text"
);


ALTER TABLE "public"."slide_preset_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."spaced_repetition" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "problem_id" "uuid" NOT NULL,
    "interval_days" integer DEFAULT 1 NOT NULL,
    "ease_factor" numeric(3,2) DEFAULT 2.5 NOT NULL,
    "repetition_number" integer DEFAULT 0 NOT NULL,
    "next_review_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "last_reviewed_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spaced_repetition" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stem_problems" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject" "text" NOT NULL,
    "difficulty" "text" NOT NULL,
    "problem_text" "text" NOT NULL,
    "options" "jsonb",
    "correct_answer" "text" NOT NULL,
    "explanation" "text",
    "points_reward" integer DEFAULT 10 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "stem_problems_difficulty_check" CHECK (("difficulty" = ANY (ARRAY['beginner'::"text", 'intermediate'::"text", 'advanced'::"text"])))
);


ALTER TABLE "public"."stem_problems" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."stem_problems_student_view" WITH ("security_invoker"='true') AS
 SELECT "stem_problems"."id",
    "stem_problems"."subject",
    "stem_problems"."difficulty",
    "stem_problems"."problem_text",
    "stem_problems"."options",
    "stem_problems"."points_reward",
    "stem_problems"."created_at"
   FROM "public"."stem_problems";


ALTER TABLE "public"."stem_problems_student_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "draft_id" "uuid",
    "assignment_type" "public"."assignment_type" NOT NULL,
    "mode" "public"."assignment_mode" NOT NULL,
    "title" "text" NOT NULL,
    "content" "jsonb" NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "grade" numeric,
    "quiz_responses" "jsonb",
    "saved_by_student" boolean DEFAULT false,
    "auto_delete_at" timestamp with time zone,
    "opened_at" timestamp with time zone,
    "response_time_seconds" integer,
    "answers_released" boolean DEFAULT false NOT NULL,
    "auto_release_enabled" boolean DEFAULT false,
    "auto_release_minutes" integer,
    "auto_release_at" timestamp with time zone,
    "release_method" "text",
    "ai_summary" "jsonb",
    "org_id" "uuid",
    "course_id" "uuid"
);

ALTER TABLE ONLY "public"."student_assignments" REPLICA IDENTITY FULL;


ALTER TABLE "public"."student_assignments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."student_assignments"."opened_at" IS 'Timestamp when student first opened the assignment';



COMMENT ON COLUMN "public"."student_assignments"."response_time_seconds" IS 'Time taken to complete assignment in seconds';



COMMENT ON COLUMN "public"."student_assignments"."answers_released" IS 'Controls whether students can see correct answers and explanations after submission';



COMMENT ON COLUMN "public"."student_assignments"."ai_summary" IS 'Stores AI-generated summaries per question. Structure: {"0": {"summary": "...", "trend": "...", "generated_at": "...", "response_count": 10}, "1": {...}}';



CREATE TABLE IF NOT EXISTS "public"."student_concept_mastery" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "concept_name" "text" NOT NULL,
    "mastery_level" "text" DEFAULT 'unknown'::"text",
    "strength_score" numeric(3,2) DEFAULT 0.50,
    "total_attempts" integer DEFAULT 0,
    "correct_attempts" integer DEFAULT 0,
    "last_practiced_at" timestamp with time zone,
    "next_review_at" timestamp with time zone,
    "decay_factor" numeric(3,2) DEFAULT 2.50,
    "error_patterns" "jsonb" DEFAULT '[]'::"jsonb",
    "performance_by_type" "jsonb" DEFAULT '{"recall": {"correct": 0, "attempts": 0}, "reasoning": {"correct": 0, "attempts": 0}, "application": {"correct": 0, "attempts": 0}}'::"jsonb",
    "related_lectures" "uuid"[] DEFAULT '{}'::"uuid"[],
    "org_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."student_concept_mastery" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_connection_health" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "student_count" integer NOT NULL,
    "checked_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."student_connection_health" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_error_patterns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "error_type" "text" NOT NULL,
    "concept_a" "text" NOT NULL,
    "concept_b" "text",
    "occurrence_count" integer DEFAULT 1,
    "last_occurred_at" timestamp with time zone DEFAULT "now"(),
    "resolved" boolean DEFAULT false,
    "resolution_method" "text",
    "org_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."student_error_patterns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_lecture_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "lecture_video_id" "uuid" NOT NULL,
    "org_id" "uuid",
    "video_position" double precision DEFAULT 0,
    "completed_pause_points" "uuid"[] DEFAULT '{}'::"uuid"[],
    "responses" "jsonb" DEFAULT '{}'::"jsonb",
    "total_points_earned" integer DEFAULT 0,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "response_times" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."student_lecture_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_paste_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "pasted_text_length" integer NOT NULL,
    "pasted_at" timestamp with time zone DEFAULT "now"(),
    "assignment_title" "text",
    "student_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."student_paste_events" REPLICA IDENTITY FULL;


ALTER TABLE "public"."student_paste_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."student_problems" WITH ("security_invoker"='true') AS
 SELECT "stem_problems"."id",
    "stem_problems"."subject",
    "stem_problems"."difficulty",
    "stem_problems"."problem_text",
    "stem_problems"."options",
    "stem_problems"."points_reward",
    "stem_problems"."created_at"
   FROM "public"."stem_problems";


ALTER TABLE "public"."student_problems" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_study_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "org_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "material_type" "text" NOT NULL,
    "content" "text",
    "file_path" "text",
    "video_url" "text",
    "subject_tags" "text"[],
    "questions_generated" integer DEFAULT 0,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "instructor_id" "uuid",
    CONSTRAINT "student_study_materials_material_type_check" CHECK (("material_type" = ANY (ARRAY['note'::"text", 'image'::"text", 'video'::"text", 'pdf'::"text", 'audio'::"text"])))
);


ALTER TABLE "public"."student_study_materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_group_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid",
    CONSTRAINT "study_group_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."study_group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_group_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "group_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "shared_by" "uuid" NOT NULL,
    "shared_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid"
);


ALTER TABLE "public"."study_group_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid" NOT NULL,
    "org_id" "uuid",
    "invite_code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."study_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_plan_daily_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "scheduled_date" "date" NOT NULL,
    "task_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "content_reference" "jsonb" DEFAULT '{}'::"jsonb",
    "completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "study_plan_daily_tasks_task_type_check" CHECK (("task_type" = ANY (ARRAY['learn'::"text", 'review'::"text", 'practice'::"text", 'quiz'::"text"])))
);


ALTER TABLE "public"."study_plan_daily_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."study_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "exam_date" "date" NOT NULL,
    "start_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "material_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "total_concepts" integer DEFAULT 0,
    "concepts_mastered" integer DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "goal_type" "text" DEFAULT 'balanced'::"text",
    "org_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "study_plans_goal_type_check" CHECK (("goal_type" = ANY (ARRAY['mastery'::"text", 'balanced'::"text", 'quick'::"text"]))),
    CONSTRAINT "study_plans_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."study_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscription_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "price_cents" integer DEFAULT 0 NOT NULL,
    "billing_period" "text" DEFAULT 'semester'::"text" NOT NULL,
    "student_limit" integer,
    "features" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_price_id" "text",
    "course_limit" integer,
    "pricing_model" "text" DEFAULT 'flat_rate'::"text",
    "price_suffix" "text" DEFAULT '/semester'::"text"
);


ALTER TABLE "public"."subscription_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "org_id" "uuid",
    "tier_id" "uuid" NOT NULL,
    "stripe_subscription_id" "text",
    "stripe_customer_id" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "current_period_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_period_end" timestamp with time zone NOT NULL,
    "cancel_at_period_end" boolean DEFAULT false NOT NULL,
    "canceled_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subscription_scope" CHECK (((("user_id" IS NOT NULL) AND ("org_id" IS NULL)) OR (("user_id" IS NULL) AND ("org_id" IS NOT NULL)))),
    CONSTRAINT "valid_status" CHECK (("status" = ANY (ARRAY['active'::"text", 'canceled'::"text", 'past_due'::"text", 'trialing'::"text", 'incomplete'::"text", 'incomplete_expired'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usage_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "org_id" "uuid",
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "metric_type" "text" NOT NULL,
    "usage_count" integer DEFAULT 0 NOT NULL,
    "usage_limit" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "usage_scope" CHECK (((("user_id" IS NOT NULL) AND ("org_id" IS NULL)) OR (("user_id" IS NULL) AND ("org_id" IS NOT NULL)))),
    CONSTRAINT "valid_metric_type" CHECK (("metric_type" = ANY (ARRAY['active_students'::"text", 'ai_questions'::"text", 'video_minutes'::"text", 'lectures_created'::"text"])))
);


ALTER TABLE "public"."usage_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_achievements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "achievement_id" "uuid" NOT NULL,
    "earned_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid"
);


ALTER TABLE "public"."user_achievements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "experience_points" integer DEFAULT 0 NOT NULL,
    "level" integer DEFAULT 1 NOT NULL,
    "coins" integer DEFAULT 0 NOT NULL,
    "current_streak" integer DEFAULT 0 NOT NULL,
    "longest_streak" integer DEFAULT 0 NOT NULL,
    "last_activity_date" "date" DEFAULT CURRENT_DATE,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid",
    "total_gambles" integer DEFAULT 0,
    "successful_gambles" integer DEFAULT 0,
    "biggest_win" integer DEFAULT 0,
    "biggest_loss" integer DEFAULT 0,
    "confidence_accuracy" "jsonb" DEFAULT '{"low": {"total": 0, "correct": 0}, "high": {"total": 0, "correct": 0}, "medium": {"total": 0, "correct": 0}, "very_high": {"total": 0, "correct": 0}}'::"jsonb"
);


ALTER TABLE "public"."user_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "name" "text",
    "email" "text",
    "phone" "text",
    "age" integer,
    "created_at" timestamp without time zone DEFAULT "now"(),
    "user_id" "uuid"
);

ALTER TABLE ONLY "public"."users" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."achievements"
    ADD CONSTRAINT "achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."adaptive_difficulty"
    ADD CONSTRAINT "adaptive_difficulty_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."adaptive_difficulty"
    ADD CONSTRAINT "adaptive_difficulty_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."admin_dashboard_presets"
    ADD CONSTRAINT "admin_dashboard_presets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_instructors"
    ADD CONSTRAINT "admin_instructors_admin_id_instructor_id_key" UNIQUE ("admin_id", "instructor_id");



ALTER TABLE ONLY "public"."admin_instructors"
    ADD CONSTRAINT "admin_instructors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_explanation_cache"
    ADD CONSTRAINT "ai_explanation_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_quality_ratings"
    ADD CONSTRAINT "ai_quality_ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."answer_key_mcqs"
    ADD CONSTRAINT "answer_key_mcqs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."answer_key_problems"
    ADD CONSTRAINT "answer_key_problems_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."answer_key_usage_log"
    ADD CONSTRAINT "answer_key_usage_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."answer_version_history"
    ADD CONSTRAINT "answer_version_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."answer_version_history"
    ADD CONSTRAINT "answer_version_history_student_assignment_unique" UNIQUE ("student_id", "assignment_id");



ALTER TABLE ONLY "public"."checkin_streaks"
    ADD CONSTRAINT "checkin_streaks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkin_streaks"
    ADD CONSTRAINT "checkin_streaks_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."content_drafts"
    ADD CONSTRAINT "content_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_course_code_key" UNIQUE ("course_code");



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_challenges"
    ADD CONSTRAINT "daily_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_challenges"
    ADD CONSTRAINT "daily_challenges_user_id_challenge_date_challenge_type_key" UNIQUE ("user_id", "challenge_date", "challenge_type");



ALTER TABLE ONLY "public"."diagram_generations"
    ADD CONSTRAINT "diagram_generations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grade_sync_log"
    ADD CONSTRAINT "grade_sync_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instructor_answer_keys"
    ADD CONSTRAINT "instructor_answer_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instructor_invites"
    ADD CONSTRAINT "instructor_invites_org_id_email_key" UNIQUE ("org_id", "email");



ALTER TABLE ONLY "public"."instructor_invites"
    ADD CONSTRAINT "instructor_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instructor_question_bank"
    ADD CONSTRAINT "instructor_question_bank_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instructor_students"
    ADD CONSTRAINT "instructor_students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instructor_usage_tracking"
    ADD CONSTRAINT "instructor_usage_tracking_instructor_id_usage_month_key" UNIQUE ("instructor_id", "usage_month");



ALTER TABLE ONLY "public"."instructor_usage_tracking"
    ADD CONSTRAINT "instructor_usage_tracking_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lecture_concept_map"
    ADD CONSTRAINT "lecture_concept_map_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lecture_materials"
    ADD CONSTRAINT "lecture_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lecture_medical_entities"
    ADD CONSTRAINT "lecture_medical_entities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lecture_pause_points"
    ADD CONSTRAINT "lecture_pause_points_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lecture_questions"
    ADD CONSTRAINT "lecture_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lecture_summaries"
    ADD CONSTRAINT "lecture_summaries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lecture_videos"
    ADD CONSTRAINT "lecture_videos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_mastery"
    ADD CONSTRAINT "lesson_mastery_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lesson_mastery"
    ADD CONSTRAINT "lesson_mastery_user_id_lesson_id_key" UNIQUE ("user_id", "lesson_id");



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_participants"
    ADD CONSTRAINT "live_participants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_questions"
    ADD CONSTRAINT "live_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_responses"
    ADD CONSTRAINT "live_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_responses"
    ADD CONSTRAINT "live_responses_question_participant_unique" UNIQUE ("question_id", "participant_id");



COMMENT ON CONSTRAINT "live_responses_question_participant_unique" ON "public"."live_responses" IS 'Ensures each participant can only submit once per question - enforced at database level for race condition safety';



ALTER TABLE ONLY "public"."live_session_transcripts"
    ADD CONSTRAINT "live_session_transcripts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_session_code_key" UNIQUE ("session_code");



ALTER TABLE ONLY "public"."lti_contexts"
    ADD CONSTRAINT "lti_contexts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lti_contexts"
    ADD CONSTRAINT "lti_contexts_platform_id_context_id_key" UNIQUE ("platform_id", "context_id");



ALTER TABLE ONLY "public"."lti_platforms"
    ADD CONSTRAINT "lti_platforms_org_id_issuer_client_id_key" UNIQUE ("org_id", "issuer", "client_id");



ALTER TABLE ONLY "public"."lti_platforms"
    ADD CONSTRAINT "lti_platforms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lti_session_tokens"
    ADD CONSTRAINT "lti_session_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lti_session_tokens"
    ADD CONSTRAINT "lti_session_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."lti_token_cache"
    ADD CONSTRAINT "lti_token_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lti_tool_keys"
    ADD CONSTRAINT "lti_tool_keys_kid_key" UNIQUE ("kid");



ALTER TABLE ONLY "public"."lti_tool_keys"
    ADD CONSTRAINT "lti_tool_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lti_users"
    ADD CONSTRAINT "lti_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lti_users"
    ADD CONSTRAINT "lti_users_platform_id_lti_user_id_key" UNIQUE ("platform_id", "lti_user_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_domains"
    ADD CONSTRAINT "organization_domains_org_id_domain_key" UNIQUE ("org_id", "domain");



ALTER TABLE ONLY "public"."organization_domains"
    ADD CONSTRAINT "organization_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_admin_code_key" UNIQUE ("admin_code");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_instructor_invite_code_key" UNIQUE ("instructor_invite_code");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."personalized_questions"
    ADD CONSTRAINT "personalized_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pilot_rebates"
    ADD CONSTRAINT "pilot_rebates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."practice_goals"
    ADD CONSTRAINT "practice_goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."practice_sessions"
    ADD CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."problem_attempts"
    ADD CONSTRAINT "problem_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_admin_code_key" UNIQUE ("admin_code");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_instructor_code_key" UNIQUE ("instructor_code");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_reports"
    ADD CONSTRAINT "question_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."question_send_logs"
    ADD CONSTRAINT "question_send_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_key_window_start_key" UNIQUE ("key", "window_start");



ALTER TABLE ONLY "public"."rate_limits"
    ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."remediation_history"
    ADD CONSTRAINT "remediation_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_events"
    ADD CONSTRAINT "scheduled_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seat_allocations"
    ADD CONSTRAINT "seat_allocations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."seat_allocations"
    ADD CONSTRAINT "seat_allocations_seat_license_id_instructor_id_key" UNIQUE ("seat_license_id", "instructor_id");



ALTER TABLE ONLY "public"."seat_licenses"
    ADD CONSTRAINT "seat_licenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slide_preset_questions"
    ADD CONSTRAINT "slide_preset_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spaced_repetition"
    ADD CONSTRAINT "spaced_repetition_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."spaced_repetition"
    ADD CONSTRAINT "spaced_repetition_user_id_problem_id_key" UNIQUE ("user_id", "problem_id");



ALTER TABLE ONLY "public"."stem_problems"
    ADD CONSTRAINT "stem_problems_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_assignments"
    ADD CONSTRAINT "student_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_concept_mastery"
    ADD CONSTRAINT "student_concept_mastery_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_concept_mastery"
    ADD CONSTRAINT "student_concept_mastery_student_id_concept_name_key" UNIQUE ("student_id", "concept_name");



ALTER TABLE ONLY "public"."student_connection_health"
    ADD CONSTRAINT "student_connection_health_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_error_patterns"
    ADD CONSTRAINT "student_error_patterns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_lecture_progress"
    ADD CONSTRAINT "student_lecture_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_lecture_progress"
    ADD CONSTRAINT "student_lecture_progress_student_id_lecture_video_id_key" UNIQUE ("student_id", "lecture_video_id");



ALTER TABLE ONLY "public"."student_paste_events"
    ADD CONSTRAINT "student_paste_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_study_materials"
    ADD CONSTRAINT "student_study_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_group_members"
    ADD CONSTRAINT "study_group_members_group_id_user_id_key" UNIQUE ("group_id", "user_id");



ALTER TABLE ONLY "public"."study_group_members"
    ADD CONSTRAINT "study_group_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_group_questions"
    ADD CONSTRAINT "study_group_questions_group_id_question_id_key" UNIQUE ("group_id", "question_id");



ALTER TABLE ONLY "public"."study_group_questions"
    ADD CONSTRAINT "study_group_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_groups"
    ADD CONSTRAINT "study_groups_invite_code_key" UNIQUE ("invite_code");



ALTER TABLE ONLY "public"."study_groups"
    ADD CONSTRAINT "study_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_plan_daily_tasks"
    ADD CONSTRAINT "study_plan_daily_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."study_plans"
    ADD CONSTRAINT "study_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_tiers"
    ADD CONSTRAINT "subscription_tiers_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."subscription_tiers"
    ADD CONSTRAINT "subscription_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_records"
    ADD CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usage_records"
    ADD CONSTRAINT "usage_records_user_id_org_id_period_start_metric_type_key" UNIQUE ("user_id", "org_id", "period_start", "metric_type");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_achievement_id_key" UNIQUE ("user_id", "achievement_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."user_stats"
    ADD CONSTRAINT "user_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_stats"
    ADD CONSTRAINT "user_stats_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_adaptive_difficulty_user_id" ON "public"."adaptive_difficulty" USING "btree" ("user_id");



CREATE INDEX "idx_admin_dashboard_presets_admin" ON "public"."admin_dashboard_presets" USING "btree" ("admin_id");



CREATE INDEX "idx_ai_explanation_cache_cleanup" ON "public"."ai_explanation_cache" USING "btree" ("last_used_at", "usage_count");



CREATE INDEX "idx_ai_explanation_cache_lookup" ON "public"."ai_explanation_cache" USING "btree" ("question_hash", "wrong_answer", "correct_answer");



CREATE UNIQUE INDEX "idx_ai_explanation_cache_unique" ON "public"."ai_explanation_cache" USING "btree" ("question_hash", "wrong_answer", "correct_answer");



CREATE INDEX "idx_ai_quality_ratings_reference" ON "public"."ai_quality_ratings" USING "btree" ("reference_id", "rating_type");



CREATE INDEX "idx_ai_quality_ratings_user" ON "public"."ai_quality_ratings" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_answer_key_mcqs_answer_key_id" ON "public"."answer_key_mcqs" USING "btree" ("answer_key_id");



CREATE INDEX "idx_answer_key_mcqs_problem" ON "public"."answer_key_mcqs" USING "btree" ("problem_id");



CREATE INDEX "idx_answer_key_mcqs_source_type" ON "public"."answer_key_mcqs" USING "btree" ("source_type");



CREATE INDEX "idx_answer_key_mcqs_verified" ON "public"."answer_key_mcqs" USING "btree" ("verified");



CREATE INDEX "idx_answer_key_problems_answer_key" ON "public"."answer_key_problems" USING "btree" ("answer_key_id");



CREATE INDEX "idx_answer_key_problems_keywords" ON "public"."answer_key_problems" USING "gin" ("keywords");



CREATE INDEX "idx_answer_key_problems_topic_tags" ON "public"."answer_key_problems" USING "gin" ("topic_tags");



CREATE INDEX "idx_answer_key_problems_verified" ON "public"."answer_key_problems" USING "btree" ("verified_by_instructor");



CREATE INDEX "idx_answer_key_usage_instructor" ON "public"."answer_key_usage_log" USING "btree" ("instructor_id");



CREATE INDEX "idx_answer_key_usage_session" ON "public"."answer_key_usage_log" USING "btree" ("session_id");



CREATE INDEX "idx_answer_keys_instructor" ON "public"."instructor_answer_keys" USING "btree" ("instructor_id");



CREATE INDEX "idx_answer_keys_status" ON "public"."instructor_answer_keys" USING "btree" ("status");



CREATE INDEX "idx_answer_keys_subject" ON "public"."instructor_answer_keys" USING "btree" ("subject");



CREATE INDEX "idx_answer_version_history_assignment" ON "public"."answer_version_history" USING "btree" ("assignment_id");



CREATE INDEX "idx_concept_map_lecture" ON "public"."lecture_concept_map" USING "btree" ("lecture_video_id");



CREATE INDEX "idx_concept_map_timestamps" ON "public"."lecture_concept_map" USING "btree" ("start_timestamp", "end_timestamp");



CREATE INDEX "idx_concept_mastery_review" ON "public"."student_concept_mastery" USING "btree" ("student_id", "next_review_at");



CREATE INDEX "idx_concept_mastery_student" ON "public"."student_concept_mastery" USING "btree" ("student_id");



CREATE INDEX "idx_connection_health_instructor" ON "public"."student_connection_health" USING "btree" ("instructor_id", "checked_at" DESC);



CREATE INDEX "idx_content_drafts_instructor" ON "public"."content_drafts" USING "btree" ("instructor_id");



CREATE INDEX "idx_content_drafts_status" ON "public"."content_drafts" USING "btree" ("status");



CREATE INDEX "idx_courses_code" ON "public"."courses" USING "btree" ("course_code");



CREATE INDEX "idx_courses_instructor" ON "public"."courses" USING "btree" ("instructor_id");



CREATE INDEX "idx_courses_org" ON "public"."courses" USING "btree" ("org_id");



CREATE INDEX "idx_daily_challenges_user_date" ON "public"."daily_challenges" USING "btree" ("user_id", "challenge_date");



CREATE INDEX "idx_diagram_generations_student_date" ON "public"."diagram_generations" USING "btree" ("student_id", "created_at" DESC);



CREATE INDEX "idx_error_patterns_student" ON "public"."student_error_patterns" USING "btree" ("student_id");



CREATE INDEX "idx_grade_sync_log_status" ON "public"."grade_sync_log" USING "btree" ("sync_status");



CREATE INDEX "idx_grade_sync_log_student" ON "public"."grade_sync_log" USING "btree" ("student_id");



CREATE INDEX "idx_instructor_answer_keys_course" ON "public"."instructor_answer_keys" USING "btree" ("course_id");



CREATE INDEX "idx_instructor_students_course" ON "public"."instructor_students" USING "btree" ("course_id");



CREATE INDEX "idx_instructor_students_instructor" ON "public"."instructor_students" USING "btree" ("instructor_id");



CREATE INDEX "idx_instructor_students_student" ON "public"."instructor_students" USING "btree" ("student_id");



CREATE INDEX "idx_lecture_materials_course" ON "public"."lecture_materials" USING "btree" ("course_id");



CREATE INDEX "idx_lecture_materials_pdf_conversion_status" ON "public"."lecture_materials" USING "btree" ("pdf_conversion_status") WHERE ("pdf_conversion_status" IS NOT NULL);



CREATE INDEX "idx_lecture_medical_entities_type" ON "public"."lecture_medical_entities" USING "btree" ("entity_type");



CREATE INDEX "idx_lecture_medical_entities_video" ON "public"."lecture_medical_entities" USING "btree" ("lecture_video_id");



CREATE INDEX "idx_lecture_questions_course" ON "public"."lecture_questions" USING "btree" ("course_id");



CREATE INDEX "idx_lecture_questions_instructor" ON "public"."lecture_questions" USING "btree" ("instructor_id", "status");



CREATE INDEX "idx_lecture_questions_instructor_status" ON "public"."lecture_questions" USING "btree" ("instructor_id", "status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_lecture_videos_course" ON "public"."lecture_videos" USING "btree" ("course_id");



CREATE INDEX "idx_lecture_videos_instructor" ON "public"."lecture_videos" USING "btree" ("instructor_id");



CREATE INDEX "idx_lecture_videos_status" ON "public"."lecture_videos" USING "btree" ("status");



CREATE INDEX "idx_lesson_progress_user" ON "public"."lesson_progress" USING "btree" ("user_id");



CREATE INDEX "idx_live_participants_session" ON "public"."live_participants" USING "btree" ("session_id");



CREATE INDEX "idx_live_questions_session" ON "public"."live_questions" USING "btree" ("session_id", "sent_at" DESC);



CREATE INDEX "idx_live_responses_participant" ON "public"."live_responses" USING "btree" ("participant_id");



CREATE INDEX "idx_live_responses_question" ON "public"."live_responses" USING "btree" ("question_id");



CREATE INDEX "idx_live_session_transcripts_instructor" ON "public"."live_session_transcripts" USING "btree" ("instructor_id");



CREATE INDEX "idx_live_session_transcripts_session" ON "public"."live_session_transcripts" USING "btree" ("session_id", "chunk_index");



CREATE INDEX "idx_live_sessions_code" ON "public"."live_sessions" USING "btree" ("session_code") WHERE ("is_active" = true);



CREATE INDEX "idx_live_sessions_course" ON "public"."live_sessions" USING "btree" ("course_id");



CREATE INDEX "idx_live_sessions_instructor" ON "public"."live_sessions" USING "btree" ("instructor_id", "is_active");



CREATE INDEX "idx_lti_contexts_instructor" ON "public"."lti_contexts" USING "btree" ("instructor_id");



CREATE INDEX "idx_lti_contexts_platform" ON "public"."lti_contexts" USING "btree" ("platform_id");



CREATE INDEX "idx_lti_platforms_org" ON "public"."lti_platforms" USING "btree" ("org_id");



CREATE INDEX "idx_lti_session_tokens_expires" ON "public"."lti_session_tokens" USING "btree" ("expires_at");



CREATE INDEX "idx_lti_session_tokens_token" ON "public"."lti_session_tokens" USING "btree" ("token");



CREATE INDEX "idx_lti_token_cache_platform" ON "public"."lti_token_cache" USING "btree" ("platform_id");



CREATE INDEX "idx_lti_users_edvana" ON "public"."lti_users" USING "btree" ("edvana_user_id");



CREATE INDEX "idx_messages_recipient_read" ON "public"."messages" USING "btree" ("recipient_id", "read") WHERE ("read" = false);



CREATE INDEX "idx_pause_points_lecture" ON "public"."lecture_pause_points" USING "btree" ("lecture_video_id");



CREATE INDEX "idx_pause_points_timestamp" ON "public"."lecture_pause_points" USING "btree" ("pause_timestamp");



CREATE INDEX "idx_personalized_questions_difficulty" ON "public"."personalized_questions" USING "btree" ("difficulty");



CREATE INDEX "idx_personalized_questions_instructor_id" ON "public"."personalized_questions" USING "btree" ("instructor_id");



CREATE INDEX "idx_personalized_questions_material" ON "public"."personalized_questions" USING "btree" ("source_material_id");



CREATE INDEX "idx_personalized_questions_performance" ON "public"."personalized_questions" USING "btree" ("times_attempted", "times_correct");



CREATE INDEX "idx_personalized_questions_tags" ON "public"."personalized_questions" USING "gin" ("topic_tags");



CREATE INDEX "idx_personalized_questions_user" ON "public"."personalized_questions" USING "btree" ("user_id");



CREATE INDEX "idx_pilot_rebates_instructor" ON "public"."pilot_rebates" USING "btree" ("instructor_id");



CREATE INDEX "idx_pilot_rebates_status" ON "public"."pilot_rebates" USING "btree" ("status");



CREATE INDEX "idx_practice_goals_user_deadline" ON "public"."practice_goals" USING "btree" ("user_id", "deadline");



CREATE INDEX "idx_practice_sessions_created" ON "public"."practice_sessions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_practice_sessions_problem" ON "public"."practice_sessions" USING "btree" ("problem_id");



CREATE INDEX "idx_practice_sessions_user" ON "public"."practice_sessions" USING "btree" ("user_id");



CREATE INDEX "idx_profiles_auto_question" ON "public"."profiles" USING "btree" ("auto_question_enabled") WHERE ("auto_question_enabled" = true);



CREATE INDEX "idx_question_bank_course" ON "public"."instructor_question_bank" USING "btree" ("course_id");



CREATE INDEX "idx_question_bank_instructor" ON "public"."instructor_question_bank" USING "btree" ("instructor_id");



CREATE INDEX "idx_question_bank_org" ON "public"."instructor_question_bank" USING "btree" ("org_id");



CREATE INDEX "idx_question_bank_tags" ON "public"."instructor_question_bank" USING "gin" ("tags");



CREATE INDEX "idx_question_bank_type" ON "public"."instructor_question_bank" USING "btree" ("question_type");



CREATE INDEX "idx_question_logs_instructor" ON "public"."question_send_logs" USING "btree" ("instructor_id", "created_at" DESC);



CREATE INDEX "idx_question_logs_success" ON "public"."question_send_logs" USING "btree" ("success", "created_at" DESC);



CREATE INDEX "idx_rate_limits_key_window" ON "public"."rate_limits" USING "btree" ("key", "window_start" DESC);



CREATE INDEX "idx_remediation_lecture" ON "public"."remediation_history" USING "btree" ("lecture_video_id");



CREATE INDEX "idx_remediation_student" ON "public"."remediation_history" USING "btree" ("student_id");



CREATE INDEX "idx_seat_allocations_instructor" ON "public"."seat_allocations" USING "btree" ("instructor_id");



CREATE INDEX "idx_seat_licenses_org_id" ON "public"."seat_licenses" USING "btree" ("org_id");



CREATE INDEX "idx_slide_preset_questions_material" ON "public"."slide_preset_questions" USING "btree" ("material_id");



CREATE INDEX "idx_slide_preset_questions_slide" ON "public"."slide_preset_questions" USING "btree" ("material_id", "slide_number");



CREATE INDEX "idx_student_assignments_ai_summary" ON "public"."student_assignments" USING "gin" ("ai_summary");



CREATE INDEX "idx_student_assignments_answers_released" ON "public"."student_assignments" USING "btree" ("instructor_id", "answers_released", "completed") WHERE ("completed" = true);



CREATE INDEX "idx_student_assignments_auto_delete" ON "public"."student_assignments" USING "btree" ("auto_delete_at") WHERE (("assignment_type" = 'lecture_checkin'::"public"."assignment_type") AND ("saved_by_student" = false));



CREATE INDEX "idx_student_assignments_course" ON "public"."student_assignments" USING "btree" ("course_id");



CREATE INDEX "idx_student_assignments_instructor" ON "public"."student_assignments" USING "btree" ("instructor_id");



CREATE INDEX "idx_student_assignments_instructor_type" ON "public"."student_assignments" USING "btree" ("instructor_id", "assignment_type") WHERE ("assignment_type" = 'lecture_checkin'::"public"."assignment_type");



CREATE INDEX "idx_student_assignments_student" ON "public"."student_assignments" USING "btree" ("student_id");



CREATE INDEX "idx_student_assignments_student_completed" ON "public"."student_assignments" USING "btree" ("student_id", "completed");



CREATE INDEX "idx_student_materials_created" ON "public"."student_study_materials" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_student_materials_tags" ON "public"."student_study_materials" USING "gin" ("subject_tags");



CREATE INDEX "idx_student_materials_type" ON "public"."student_study_materials" USING "btree" ("material_type");



CREATE INDEX "idx_student_materials_user" ON "public"."student_study_materials" USING "btree" ("user_id");



CREATE INDEX "idx_student_progress_lecture" ON "public"."student_lecture_progress" USING "btree" ("lecture_video_id");



CREATE INDEX "idx_student_progress_student" ON "public"."student_lecture_progress" USING "btree" ("student_id");



CREATE INDEX "idx_student_study_materials_instructor_id" ON "public"."student_study_materials" USING "btree" ("instructor_id");



CREATE INDEX "idx_study_group_members_group_id" ON "public"."study_group_members" USING "btree" ("group_id");



CREATE INDEX "idx_study_group_members_user_id" ON "public"."study_group_members" USING "btree" ("user_id");



CREATE INDEX "idx_study_group_questions_group_id" ON "public"."study_group_questions" USING "btree" ("group_id");



CREATE INDEX "idx_study_group_questions_question_id" ON "public"."study_group_questions" USING "btree" ("question_id");



CREATE INDEX "idx_study_groups_invite_code" ON "public"."study_groups" USING "btree" ("invite_code");



CREATE INDEX "idx_study_plan_daily_tasks_completed" ON "public"."study_plan_daily_tasks" USING "btree" ("completed");



CREATE INDEX "idx_study_plan_daily_tasks_plan_id" ON "public"."study_plan_daily_tasks" USING "btree" ("plan_id");



CREATE INDEX "idx_study_plan_daily_tasks_scheduled_date" ON "public"."study_plan_daily_tasks" USING "btree" ("scheduled_date");



CREATE INDEX "idx_study_plans_status" ON "public"."study_plans" USING "btree" ("status");



CREATE INDEX "idx_study_plans_user_id" ON "public"."study_plans" USING "btree" ("user_id");



CREATE INDEX "idx_subscriptions_org_id" ON "public"."subscriptions" USING "btree" ("org_id") WHERE ("org_id" IS NOT NULL);



CREATE INDEX "idx_subscriptions_status" ON "public"."subscriptions" USING "btree" ("status");



CREATE INDEX "idx_subscriptions_stripe_id" ON "public"."subscriptions" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE INDEX "idx_subscriptions_user_id" ON "public"."subscriptions" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_usage_records_org_period" ON "public"."usage_records" USING "btree" ("org_id", "period_start") WHERE ("org_id" IS NOT NULL);



CREATE INDEX "idx_usage_records_user_period" ON "public"."usage_records" USING "btree" ("user_id", "period_start") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_usage_tracking_instructor_month" ON "public"."instructor_usage_tracking" USING "btree" ("instructor_id", "usage_month");



CREATE INDEX "idx_user_stats_user" ON "public"."user_stats" USING "btree" ("user_id");



CREATE UNIQUE INDEX "instructor_students_instructor_student_course_unique" ON "public"."instructor_students" USING "btree" ("instructor_id", "student_id", COALESCE("course_id", '00000000-0000-0000-0000-000000000000'::"uuid"));



CREATE INDEX "lessons_step_number_idx" ON "public"."lessons" USING "btree" ("step_number");



CREATE INDEX "lessons_user_id_idx" ON "public"."lessons" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "add_group_creator_as_owner_trigger" AFTER INSERT ON "public"."study_groups" FOR EACH ROW EXECUTE FUNCTION "public"."add_group_creator_as_owner"();



CREATE OR REPLACE TRIGGER "auto_connect_instructor_on_profile_update" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."auto_connect_instructor_to_org"();



CREATE OR REPLACE TRIGGER "auto_connect_on_seat_allocation_insert" AFTER INSERT ON "public"."seat_allocations" FOR EACH ROW EXECUTE FUNCTION "public"."auto_connect_on_seat_allocation"();



CREATE OR REPLACE TRIGGER "increment_mcq_usage_trigger" AFTER INSERT ON "public"."answer_key_usage_log" FOR EACH ROW EXECUTE FUNCTION "public"."increment_mcq_usage"();



CREATE OR REPLACE TRIGGER "set_admin_code_trigger" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_admin_code"();



CREATE OR REPLACE TRIGGER "set_answer_key_org_id_trigger" BEFORE INSERT ON "public"."instructor_answer_keys" FOR EACH ROW EXECUTE FUNCTION "public"."set_answer_key_org_id"();



CREATE OR REPLACE TRIGGER "set_auto_delete_trigger" BEFORE INSERT ON "public"."student_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_lecture_checkin_auto_delete"();



CREATE OR REPLACE TRIGGER "set_course_org_id_trigger" BEFORE INSERT ON "public"."courses" FOR EACH ROW EXECUTE FUNCTION "public"."set_course_org_id"();



CREATE OR REPLACE TRIGGER "set_event_session_code_trigger" BEFORE INSERT ON "public"."scheduled_events" FOR EACH ROW EXECUTE FUNCTION "public"."set_event_session_code"();



CREATE OR REPLACE TRIGGER "set_group_invite_code_trigger" BEFORE INSERT ON "public"."study_groups" FOR EACH ROW EXECUTE FUNCTION "public"."set_group_invite_code"();



CREATE OR REPLACE TRIGGER "set_lecture_summary_org_id_trigger" BEFORE INSERT ON "public"."lecture_summaries" FOR EACH ROW EXECUTE FUNCTION "public"."set_lecture_summary_org_id"();



CREATE OR REPLACE TRIGGER "set_lecture_video_org_id_trigger" BEFORE INSERT ON "public"."lecture_videos" FOR EACH ROW EXECUTE FUNCTION "public"."set_lecture_video_org_id"();



CREATE OR REPLACE TRIGGER "set_live_session_code" BEFORE INSERT ON "public"."live_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_session_code"();



CREATE OR REPLACE TRIGGER "set_profile_org_id_trigger" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_profile_org_id"();



CREATE OR REPLACE TRIGGER "set_question_bank_org_id_trigger" BEFORE INSERT ON "public"."instructor_question_bank" FOR EACH ROW EXECUTE FUNCTION "public"."set_question_bank_org_id"();



CREATE OR REPLACE TRIGGER "set_student_assignment_org" BEFORE INSERT OR UPDATE ON "public"."student_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_student_assignment_org_id"();



CREATE OR REPLACE TRIGGER "sync_student_org_on_connection" BEFORE INSERT OR UPDATE ON "public"."instructor_students" FOR EACH ROW EXECUTE FUNCTION "public"."sync_student_org_id"();



CREATE OR REPLACE TRIGGER "trigger_set_instructor_code" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_instructor_code"();



CREATE OR REPLACE TRIGGER "update_admin_dashboard_presets_updated_at" BEFORE UPDATE ON "public"."admin_dashboard_presets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_answer_key_mcqs_updated_at" BEFORE UPDATE ON "public"."answer_key_mcqs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_answer_key_problems_updated_at" BEFORE UPDATE ON "public"."answer_key_problems" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_answer_version_history_updated_at" BEFORE UPDATE ON "public"."answer_version_history" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_concept_mastery_updated_at" BEFORE UPDATE ON "public"."student_concept_mastery" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_courses_updated_at" BEFORE UPDATE ON "public"."courses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_instructor_answer_keys_updated_at" BEFORE UPDATE ON "public"."instructor_answer_keys" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_instructor_usage_tracking_updated_at" BEFORE UPDATE ON "public"."instructor_usage_tracking" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lecture_materials_updated_at" BEFORE UPDATE ON "public"."lecture_materials" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lecture_questions_updated_at" BEFORE UPDATE ON "public"."lecture_questions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lecture_videos_updated_at" BEFORE UPDATE ON "public"."lecture_videos" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lti_contexts_updated_at" BEFORE UPDATE ON "public"."lti_contexts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lti_platforms_updated_at" BEFORE UPDATE ON "public"."lti_platforms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lti_users_updated_at" BEFORE UPDATE ON "public"."lti_users" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_personalized_questions_updated_at" BEFORE UPDATE ON "public"."personalized_questions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_pilot_rebates_updated_at" BEFORE UPDATE ON "public"."pilot_rebates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_practice_goals_updated_at" BEFORE UPDATE ON "public"."practice_goals" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_problem_count_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."answer_key_problems" FOR EACH ROW EXECUTE FUNCTION "public"."update_answer_key_problem_count"();



CREATE OR REPLACE TRIGGER "update_question_bank_updated_at" BEFORE UPDATE ON "public"."instructor_question_bank" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_seat_licenses_updated_at" BEFORE UPDATE ON "public"."seat_licenses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_slide_preset_questions_updated_at" BEFORE UPDATE ON "public"."slide_preset_questions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_student_materials_updated_at" BEFORE UPDATE ON "public"."student_study_materials" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_study_plans_updated_at" BEFORE UPDATE ON "public"."study_plans" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_subscription_tiers_updated_at" BEFORE UPDATE ON "public"."subscription_tiers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_subscriptions_updated_at" BEFORE UPDATE ON "public"."subscriptions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_usage_records_updated_at" BEFORE UPDATE ON "public"."usage_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_stats_updated_at" BEFORE UPDATE ON "public"."user_stats" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_stats"();



CREATE OR REPLACE TRIGGER "validate_scheduled_event_trigger" BEFORE INSERT OR UPDATE ON "public"."scheduled_events" FOR EACH ROW EXECUTE FUNCTION "public"."validate_scheduled_event"();



ALTER TABLE ONLY "public"."adaptive_difficulty"
    ADD CONSTRAINT "adaptive_difficulty_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."admin_dashboard_presets"
    ADD CONSTRAINT "admin_dashboard_presets_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_instructors"
    ADD CONSTRAINT "admin_instructors_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_instructors"
    ADD CONSTRAINT "admin_instructors_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_instructors"
    ADD CONSTRAINT "admin_instructors_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."answer_key_mcqs"
    ADD CONSTRAINT "answer_key_mcqs_answer_key_id_fkey" FOREIGN KEY ("answer_key_id") REFERENCES "public"."instructor_answer_keys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."answer_key_mcqs"
    ADD CONSTRAINT "answer_key_mcqs_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."answer_key_problems"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."answer_key_problems"
    ADD CONSTRAINT "answer_key_problems_answer_key_id_fkey" FOREIGN KEY ("answer_key_id") REFERENCES "public"."instructor_answer_keys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."answer_key_usage_log"
    ADD CONSTRAINT "answer_key_usage_log_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."answer_key_usage_log"
    ADD CONSTRAINT "answer_key_usage_log_mcq_id_fkey" FOREIGN KEY ("mcq_id") REFERENCES "public"."answer_key_mcqs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."answer_key_usage_log"
    ADD CONSTRAINT "answer_key_usage_log_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."answer_key_problems"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."answer_key_usage_log"
    ADD CONSTRAINT "answer_key_usage_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."answer_version_history"
    ADD CONSTRAINT "answer_version_history_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."student_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."answer_version_history"
    ADD CONSTRAINT "answer_version_history_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_drafts"
    ADD CONSTRAINT "content_drafts_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."content_drafts"
    ADD CONSTRAINT "content_drafts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."daily_challenges"
    ADD CONSTRAINT "daily_challenges_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_challenges"
    ADD CONSTRAINT "daily_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instructor_students"
    ADD CONSTRAINT "fk_instructor_students_course" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."grade_sync_log"
    ADD CONSTRAINT "grade_sync_log_context_id_fkey" FOREIGN KEY ("context_id") REFERENCES "public"."lti_contexts"("id");



ALTER TABLE ONLY "public"."instructor_answer_keys"
    ADD CONSTRAINT "instructor_answer_keys_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."instructor_answer_keys"
    ADD CONSTRAINT "instructor_answer_keys_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instructor_answer_keys"
    ADD CONSTRAINT "instructor_answer_keys_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."instructor_invites"
    ADD CONSTRAINT "instructor_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."instructor_invites"
    ADD CONSTRAINT "instructor_invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instructor_question_bank"
    ADD CONSTRAINT "instructor_question_bank_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."instructor_question_bank"
    ADD CONSTRAINT "instructor_question_bank_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instructor_question_bank"
    ADD CONSTRAINT "instructor_question_bank_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instructor_question_bank"
    ADD CONSTRAINT "instructor_question_bank_source_material_id_fkey" FOREIGN KEY ("source_material_id") REFERENCES "public"."lecture_materials"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."instructor_students"
    ADD CONSTRAINT "instructor_students_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instructor_students"
    ADD CONSTRAINT "instructor_students_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instructor_students"
    ADD CONSTRAINT "instructor_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lecture_concept_map"
    ADD CONSTRAINT "lecture_concept_map_lecture_video_id_fkey" FOREIGN KEY ("lecture_video_id") REFERENCES "public"."lecture_videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lecture_materials"
    ADD CONSTRAINT "lecture_materials_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lecture_materials"
    ADD CONSTRAINT "lecture_materials_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."lecture_materials"
    ADD CONSTRAINT "lecture_materials_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lecture_medical_entities"
    ADD CONSTRAINT "lecture_medical_entities_lecture_video_id_fkey" FOREIGN KEY ("lecture_video_id") REFERENCES "public"."lecture_videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lecture_pause_points"
    ADD CONSTRAINT "lecture_pause_points_lecture_video_id_fkey" FOREIGN KEY ("lecture_video_id") REFERENCES "public"."lecture_videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lecture_questions"
    ADD CONSTRAINT "lecture_questions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lecture_questions"
    ADD CONSTRAINT "lecture_questions_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lecture_questions"
    ADD CONSTRAINT "lecture_questions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lecture_summaries"
    ADD CONSTRAINT "lecture_summaries_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lecture_summaries"
    ADD CONSTRAINT "lecture_summaries_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lecture_summaries"
    ADD CONSTRAINT "lecture_summaries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lecture_summaries"
    ADD CONSTRAINT "lecture_summaries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lecture_videos"
    ADD CONSTRAINT "lecture_videos_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lecture_videos"
    ADD CONSTRAINT "lecture_videos_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lecture_videos"
    ADD CONSTRAINT "lecture_videos_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."lesson_mastery"
    ADD CONSTRAINT "lesson_mastery_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lesson_progress"
    ADD CONSTRAINT "lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lessons"
    ADD CONSTRAINT "lessons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_participants"
    ADD CONSTRAINT "live_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_questions"
    ADD CONSTRAINT "live_questions_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_questions"
    ADD CONSTRAINT "live_questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_responses"
    ADD CONSTRAINT "live_responses_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "public"."live_participants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_responses"
    ADD CONSTRAINT "live_responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."live_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_session_transcripts"
    ADD CONSTRAINT "live_session_transcripts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."live_sessions"
    ADD CONSTRAINT "live_sessions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."lti_contexts"
    ADD CONSTRAINT "lti_contexts_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "public"."lti_platforms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lti_platforms"
    ADD CONSTRAINT "lti_platforms_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."lti_session_tokens"
    ADD CONSTRAINT "lti_session_tokens_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "public"."lti_platforms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lti_token_cache"
    ADD CONSTRAINT "lti_token_cache_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "public"."lti_platforms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."lti_users"
    ADD CONSTRAINT "lti_users_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "public"."lti_platforms"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_domains"
    ADD CONSTRAINT "organization_domains_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."organization_domains"
    ADD CONSTRAINT "organization_domains_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personalized_questions"
    ADD CONSTRAINT "personalized_questions_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."personalized_questions"
    ADD CONSTRAINT "personalized_questions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."personalized_questions"
    ADD CONSTRAINT "personalized_questions_source_material_id_fkey" FOREIGN KEY ("source_material_id") REFERENCES "public"."student_study_materials"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."personalized_questions"
    ADD CONSTRAINT "personalized_questions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pilot_rebates"
    ADD CONSTRAINT "pilot_rebates_institutional_subscription_id_fkey" FOREIGN KEY ("institutional_subscription_id") REFERENCES "public"."subscriptions"("id");



ALTER TABLE ONLY "public"."pilot_rebates"
    ADD CONSTRAINT "pilot_rebates_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pilot_rebates"
    ADD CONSTRAINT "pilot_rebates_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_goals"
    ADD CONSTRAINT "practice_goals_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_goals"
    ADD CONSTRAINT "practice_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."practice_sessions"
    ADD CONSTRAINT "practice_sessions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."practice_sessions"
    ADD CONSTRAINT "practice_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."problem_attempts"
    ADD CONSTRAINT "problem_attempts_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."stem_problems"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."problem_attempts"
    ADD CONSTRAINT "problem_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."question_reports"
    ADD CONSTRAINT "question_reports_pause_point_id_fkey" FOREIGN KEY ("pause_point_id") REFERENCES "public"."lecture_pause_points"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."remediation_history"
    ADD CONSTRAINT "remediation_history_lecture_video_id_fkey" FOREIGN KEY ("lecture_video_id") REFERENCES "public"."lecture_videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."remediation_history"
    ADD CONSTRAINT "remediation_history_pause_point_id_fkey" FOREIGN KEY ("pause_point_id") REFERENCES "public"."lecture_pause_points"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."remediation_history"
    ADD CONSTRAINT "remediation_history_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."scheduled_events"
    ADD CONSTRAINT "scheduled_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."scheduled_events"
    ADD CONSTRAINT "scheduled_events_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seat_allocations"
    ADD CONSTRAINT "seat_allocations_allocated_by_fkey" FOREIGN KEY ("allocated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."seat_allocations"
    ADD CONSTRAINT "seat_allocations_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seat_allocations"
    ADD CONSTRAINT "seat_allocations_seat_license_id_fkey" FOREIGN KEY ("seat_license_id") REFERENCES "public"."seat_licenses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seat_licenses"
    ADD CONSTRAINT "seat_licenses_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."seat_licenses"
    ADD CONSTRAINT "seat_licenses_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slide_preset_questions"
    ADD CONSTRAINT "slide_preset_questions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id");



ALTER TABLE ONLY "public"."slide_preset_questions"
    ADD CONSTRAINT "slide_preset_questions_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."lecture_materials"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slide_preset_questions"
    ADD CONSTRAINT "slide_preset_questions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."spaced_repetition"
    ADD CONSTRAINT "spaced_repetition_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "public"."stem_problems"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."spaced_repetition"
    ADD CONSTRAINT "spaced_repetition_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_assignments"
    ADD CONSTRAINT "student_assignments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_assignments"
    ADD CONSTRAINT "student_assignments_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "public"."content_drafts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_assignments"
    ADD CONSTRAINT "student_assignments_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_assignments"
    ADD CONSTRAINT "student_assignments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_concept_mastery"
    ADD CONSTRAINT "student_concept_mastery_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."student_error_patterns"
    ADD CONSTRAINT "student_error_patterns_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."student_lecture_progress"
    ADD CONSTRAINT "student_lecture_progress_lecture_video_id_fkey" FOREIGN KEY ("lecture_video_id") REFERENCES "public"."lecture_videos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_lecture_progress"
    ADD CONSTRAINT "student_lecture_progress_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."student_lecture_progress"
    ADD CONSTRAINT "student_lecture_progress_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_study_materials"
    ADD CONSTRAINT "student_study_materials_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."student_study_materials"
    ADD CONSTRAINT "student_study_materials_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."student_study_materials"
    ADD CONSTRAINT "student_study_materials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_group_members"
    ADD CONSTRAINT "study_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_group_members"
    ADD CONSTRAINT "study_group_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."study_group_questions"
    ADD CONSTRAINT "study_group_questions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."study_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_group_questions"
    ADD CONSTRAINT "study_group_questions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."study_group_questions"
    ADD CONSTRAINT "study_group_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."personalized_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_groups"
    ADD CONSTRAINT "study_groups_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."study_plan_daily_tasks"
    ADD CONSTRAINT "study_plan_daily_tasks_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."study_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."study_plans"
    ADD CONSTRAINT "study_plans_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "public"."subscription_tiers"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_records"
    ADD CONSTRAINT "usage_records_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usage_records"
    ADD CONSTRAINT "usage_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_stats"
    ADD CONSTRAINT "user_stats_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_stats"
    ADD CONSTRAINT "user_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can create organizations" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));



CREATE POLICY "Admins can manage org LTI platforms" ON "public"."lti_platforms" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"())))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"()))));



CREATE POLICY "Admins can manage org allocations" ON "public"."seat_allocations" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."seat_licenses" "sl"
  WHERE (("sl"."id" = "seat_allocations"."seat_license_id") AND ("sl"."org_id" = "public"."get_user_org_id"("auth"."uid"()))))))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."seat_licenses" "sl"
  WHERE (("sl"."id" = "seat_allocations"."seat_license_id") AND ("sl"."org_id" = "public"."get_user_org_id"("auth"."uid"())))))));



CREATE POLICY "Admins can manage org subscriptions" ON "public"."subscriptions" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"())))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"()))));



CREATE POLICY "Admins can manage org usage" ON "public"."usage_records" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"())))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"()))));



CREATE POLICY "Admins can manage seat licenses" ON "public"."seat_licenses" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"())))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"()))));



CREATE POLICY "Admins can update their organization" ON "public"."organizations" FOR UPDATE TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("id" = "public"."get_user_org_id"("auth"."uid"())))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("id" = "public"."get_user_org_id"("auth"."uid"()))));



CREATE POLICY "Admins can view org allocations" ON "public"."seat_allocations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."seat_licenses" "sl"
  WHERE (("sl"."id" = "seat_allocations"."seat_license_id") AND ("sl"."org_id" = "public"."get_user_org_id"("auth"."uid"()))))));



CREATE POLICY "Admins can view org member roles" ON "public"."user_roles" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "user_roles"."user_id") AND ("p"."org_id" = "public"."get_user_org_id"("auth"."uid"())))))));



CREATE POLICY "Admins can view org profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" IS NOT NULL) AND ("org_id" = "public"."get_user_org_id"("auth"."uid"()))));



CREATE POLICY "Admins can view org rebates" ON "public"."pilot_rebates" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."subscriptions" "s"
  WHERE (("s"."id" = "pilot_rebates"."subscription_id") AND (("s"."org_id" = "public"."get_user_org_id"("auth"."uid"())) OR (EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = "pilot_rebates"."instructor_id") AND ("p"."org_id" = "public"."get_user_org_id"("auth"."uid"())))))))))));



CREATE POLICY "Admins can view org usage" ON "public"."usage_records" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"()))));



CREATE POLICY "Admins manage org domains" ON "public"."organization_domains" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"())))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"()))));



CREATE POLICY "Admins manage org invites" ON "public"."instructor_invites" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"())))) WITH CHECK (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"()))));



CREATE POLICY "Admins manage their instructor connections" ON "public"."admin_instructors" USING ((("auth"."uid"() = "admin_id") AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"))) WITH CHECK ((("auth"."uid"() = "admin_id") AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Admins manage their own presets - delete" ON "public"."admin_dashboard_presets" FOR DELETE TO "authenticated" USING ((("admin_id" = "auth"."uid"()) AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Admins manage their own presets - insert" ON "public"."admin_dashboard_presets" FOR INSERT TO "authenticated" WITH CHECK ((("admin_id" = "auth"."uid"()) AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Admins manage their own presets - select" ON "public"."admin_dashboard_presets" FOR SELECT TO "authenticated" USING ((("admin_id" = "auth"."uid"()) AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Admins manage their own presets - update" ON "public"."admin_dashboard_presets" FOR UPDATE TO "authenticated" USING ((("admin_id" = "auth"."uid"()) AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Admins read org transcripts" ON "public"."live_session_transcripts" FOR SELECT USING ((("org_id" IS NOT NULL) AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"()))));



CREATE POLICY "Admins view managed instructor assignments" ON "public"."student_assignments" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."admin_instructors"
  WHERE (("admin_instructors"."admin_id" = "auth"."uid"()) AND ("admin_instructors"."instructor_id" = "student_assignments"."instructor_id"))))));



CREATE POLICY "Admins view org LTI contexts" ON "public"."lti_contexts" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."lti_platforms" "lp"
  WHERE (("lp"."id" = "lti_contexts"."platform_id") AND ("lp"."org_id" = "public"."get_user_org_id"("auth"."uid"())))))));



CREATE POLICY "Admins view org answer keys" ON "public"."instructor_answer_keys" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"()))));



CREATE POLICY "Admins view org courses" ON "public"."courses" FOR SELECT USING ((("org_id" IS NOT NULL) AND ("org_id" = "public"."get_user_org_id"("auth"."uid"())) AND "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")));



CREATE POLICY "Admins view org usage" ON "public"."instructor_usage_tracking" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"()))));



CREATE POLICY "Allow inserts for service role" ON "public"."lessons" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Allow user to insert their own lessons" ON "public"."lessons" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Anon can insert into active sessions" ON "public"."live_participants" FOR INSERT TO "anon" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."live_sessions"
  WHERE (("live_sessions"."id" = "live_participants"."session_id") AND ("live_sessions"."is_active" = true) AND ("live_sessions"."ends_at" > "now"())))));



CREATE POLICY "Anon can submit responses to active questions" ON "public"."live_responses" FOR INSERT TO "anon" WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."live_questions" "lq"
     JOIN "public"."live_sessions" "ls" ON (("ls"."id" = "lq"."session_id")))
  WHERE (("lq"."id" = "live_responses"."question_id") AND ("ls"."is_active" = true)))) AND (EXISTS ( SELECT 1
   FROM "public"."live_participants"
  WHERE ("live_participants"."id" = "live_responses"."participant_id")))));



CREATE POLICY "Anyone can read cached explanations" ON "public"."ai_explanation_cache" FOR SELECT USING (true);



CREATE POLICY "Anyone can view achievements" ON "public"."achievements" FOR SELECT USING (true);



CREATE POLICY "Anyone can view active sessions" ON "public"."live_sessions" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Anyone can view active tiers" ON "public"."subscription_tiers" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Deny all client access to session tokens" ON "public"."lti_session_tokens" TO "authenticated", "anon" USING (false);



CREATE POLICY "Deny all client access to tool keys" ON "public"."lti_tool_keys" USING (false) WITH CHECK (false);



CREATE POLICY "Enrolled students can read transcripts" ON "public"."live_session_transcripts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students" "ist"
  WHERE (("ist"."student_id" = "auth"."uid"()) AND ("ist"."instructor_id" = "live_session_transcripts"."instructor_id") AND (("live_session_transcripts"."course_id" IS NULL) OR ("ist"."course_id" = "live_session_transcripts"."course_id") OR ("ist"."course_id" IS NULL))))));



CREATE POLICY "Group members can share questions" ON "public"."study_group_questions" FOR INSERT WITH CHECK ((("auth"."uid"() = "shared_by") AND (EXISTS ( SELECT 1
   FROM "public"."study_group_members"
  WHERE (("study_group_members"."group_id" = "study_group_questions"."group_id") AND ("study_group_members"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."personalized_questions"
  WHERE (("personalized_questions"."id" = "study_group_questions"."question_id") AND ("personalized_questions"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Group members can view shared questions" ON "public"."study_group_questions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."study_group_members"
  WHERE (("study_group_members"."group_id" = "study_group_questions"."group_id") AND ("study_group_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Group owners and admins can add members" ON "public"."study_group_members" FOR INSERT WITH CHECK (("public"."can_manage_group"("auth"."uid"(), "group_id") OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Group owners and admins can update groups" ON "public"."study_groups" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."study_group_members"
  WHERE (("study_group_members"."group_id" = "study_groups"."id") AND ("study_group_members"."user_id" = "auth"."uid"()) AND ("study_group_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Group owners can delete groups" ON "public"."study_groups" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."study_group_members"
  WHERE (("study_group_members"."group_id" = "study_groups"."id") AND ("study_group_members"."user_id" = "auth"."uid"()) AND ("study_group_members"."role" = 'owner'::"text")))));



CREATE POLICY "Instructors can accept own invites" ON "public"."instructor_invites" FOR UPDATE TO "authenticated" USING (("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text")))) WITH CHECK (("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))));



CREATE POLICY "Instructors can create slide questions" ON "public"."slide_preset_questions" FOR INSERT TO "authenticated" WITH CHECK (("instructor_id" = "auth"."uid"()));



CREATE POLICY "Instructors can create their own questions" ON "public"."instructor_question_bank" FOR INSERT WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors can delete own summaries" ON "public"."lecture_summaries" FOR DELETE TO "authenticated" USING (("instructor_id" = "auth"."uid"()));



CREATE POLICY "Instructors can delete their own questions" ON "public"."instructor_question_bank" FOR DELETE USING (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors can delete their own slide questions" ON "public"."slide_preset_questions" FOR DELETE TO "authenticated" USING (("instructor_id" = "auth"."uid"()));



CREATE POLICY "Instructors can insert own admin connection" ON "public"."admin_instructors" FOR INSERT TO "authenticated" WITH CHECK ((("instructor_id" = "auth"."uid"()) AND "public"."has_role"("auth"."uid"(), 'instructor'::"public"."app_role")));



CREATE POLICY "Instructors can insert own summaries" ON "public"."lecture_summaries" FOR INSERT TO "authenticated" WITH CHECK (("instructor_id" = "auth"."uid"()));



CREATE POLICY "Instructors can insert their own logs" ON "public"."question_send_logs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors can log their own connection health" ON "public"."student_connection_health" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors can manage their ratings" ON "public"."ai_quality_ratings" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Instructors can update report status" ON "public"."question_reports" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."lecture_pause_points" "lpp"
     JOIN "public"."lecture_videos" "lv" ON (("lv"."id" = "lpp"."lecture_video_id")))
  WHERE (("lpp"."id" = "question_reports"."pause_point_id") AND ("lv"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors can update their own questions" ON "public"."instructor_question_bank" FOR UPDATE USING (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors can update their own slide questions" ON "public"."slide_preset_questions" FOR UPDATE TO "authenticated" USING (("instructor_id" = "auth"."uid"()));



CREATE POLICY "Instructors can view all problems" ON "public"."stem_problems" FOR SELECT TO "authenticated" USING ("public"."has_role"("auth"."uid"(), 'instructor'::"public"."app_role"));



CREATE POLICY "Instructors can view org LTI platforms" ON "public"."lti_platforms" FOR SELECT USING (("public"."has_role"("auth"."uid"(), 'instructor'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"()))));



CREATE POLICY "Instructors can view own admin connections" ON "public"."admin_instructors" FOR SELECT TO "authenticated" USING ((("instructor_id" = "auth"."uid"()) OR ("admin_id" = "auth"."uid"())));



CREATE POLICY "Instructors can view own summaries" ON "public"."lecture_summaries" FOR SELECT TO "authenticated" USING (("instructor_id" = "auth"."uid"()));



CREATE POLICY "Instructors can view paste events for their students" ON "public"."student_paste_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "student_paste_events"."student_id")))));



CREATE POLICY "Instructors can view reports for their lectures" ON "public"."question_reports" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."lecture_pause_points" "lpp"
     JOIN "public"."lecture_videos" "lv" ON (("lv"."id" = "lpp"."lecture_video_id")))
  WHERE (("lpp"."id" = "question_reports"."pause_point_id") AND ("lv"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors can view student daily tasks" ON "public"."study_plan_daily_tasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."study_plans" "sp"
     JOIN "public"."instructor_students" "ist" ON (("ist"."student_id" = "sp"."user_id")))
  WHERE (("sp"."id" = "study_plan_daily_tasks"."plan_id") AND ("ist"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors can view student difficulty settings" ON "public"."adaptive_difficulty" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "adaptive_difficulty"."user_id")))));



CREATE POLICY "Instructors can view student practice sessions" ON "public"."practice_sessions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "practice_sessions"."user_id")))));



CREATE POLICY "Instructors can view student study plans" ON "public"."study_plans" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "study_plans"."user_id")))));



CREATE POLICY "Instructors can view their allocations" ON "public"."seat_allocations" FOR SELECT USING (("instructor_id" = "auth"."uid"()));



CREATE POLICY "Instructors can view their own logs" ON "public"."question_send_logs" FOR SELECT USING (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors can view their own questions" ON "public"."instructor_question_bank" FOR SELECT USING (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors can view their own slide questions" ON "public"."slide_preset_questions" FOR SELECT TO "authenticated" USING (("instructor_id" = "auth"."uid"()));



CREATE POLICY "Instructors can view their rebates" ON "public"."pilot_rebates" FOR SELECT USING (("instructor_id" = "auth"."uid"()));



CREATE POLICY "Instructors can view their session participants" ON "public"."live_participants" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."live_sessions" "ls"
  WHERE (("ls"."id" = "live_participants"."session_id") AND ("ls"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors can view their session responses" ON "public"."live_responses" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."live_questions" "lq"
     JOIN "public"."live_sessions" "ls" ON (("ls"."id" = "lq"."session_id")))
  WHERE (("lq"."id" = "live_responses"."question_id") AND ("ls"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors can view their student connections" ON "public"."instructor_students" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors can view their students concept mastery" ON "public"."student_concept_mastery" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "student_concept_mastery"."student_id")))));



CREATE POLICY "Instructors can view their students error patterns" ON "public"."student_error_patterns" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "student_error_patterns"."student_id")))));



CREATE POLICY "Instructors can view their students materials" ON "public"."student_study_materials" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "student_study_materials"."user_id")))) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Instructors can view their students personalized questions" ON "public"."personalized_questions" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "personalized_questions"."user_id")))) OR ("auth"."uid"() = "user_id")));



CREATE POLICY "Instructors can view their students profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'instructor'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "profiles"."id"))))));



CREATE POLICY "Instructors can view their students' attempts" ON "public"."problem_attempts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."student_id" = "problem_attempts"."user_id") AND ("instructor_students"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors can view their students' check-in streaks" ON "public"."checkin_streaks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."student_id" = "checkin_streaks"."user_id") AND ("instructor_students"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors can view their students' mastery data" ON "public"."lesson_mastery" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."student_id" = "lesson_mastery"."user_id") AND ("instructor_students"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors insert usage logs" ON "public"."answer_key_usage_log" FOR INSERT WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors manage MCQs for their problems" ON "public"."answer_key_mcqs" USING ((EXISTS ( SELECT 1
   FROM ("public"."answer_key_problems" "p"
     JOIN "public"."instructor_answer_keys" "ak" ON (("ak"."id" = "p"."answer_key_id")))
  WHERE (("p"."id" = "answer_key_mcqs"."problem_id") AND ("ak"."instructor_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."answer_key_problems" "p"
     JOIN "public"."instructor_answer_keys" "ak" ON (("ak"."id" = "p"."answer_key_id")))
  WHERE (("p"."id" = "answer_key_mcqs"."problem_id") AND ("ak"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors manage own assignments" ON "public"."student_assignments" TO "authenticated" USING (("auth"."uid"() = "instructor_id")) WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors manage own materials" ON "public"."lecture_materials" TO "authenticated" USING ((("auth"."uid"() = "instructor_id") AND (("org_id" IS NULL) OR ("org_id" = "public"."get_user_org_id"("auth"."uid"())) OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")))) WITH CHECK ((("auth"."uid"() = "instructor_id") AND (("org_id" IS NULL) OR ("org_id" = "public"."get_user_org_id"("auth"."uid"())))));



CREATE POLICY "Instructors manage own questions" ON "public"."live_questions" USING (("auth"."uid"() = "instructor_id")) WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors manage own sessions" ON "public"."live_sessions" USING (("auth"."uid"() = "instructor_id")) WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors manage own transcripts" ON "public"."live_session_transcripts" USING (("auth"."uid"() = "instructor_id")) WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors manage problems in their answer keys" ON "public"."answer_key_problems" USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_answer_keys" "ak"
  WHERE (("ak"."id" = "answer_key_problems"."answer_key_id") AND ("ak"."instructor_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."instructor_answer_keys" "ak"
  WHERE (("ak"."id" = "answer_key_problems"."answer_key_id") AND ("ak"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors manage their LTI contexts" ON "public"."lti_contexts" USING (("auth"."uid"() = "instructor_id")) WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors manage their lecture concept maps" ON "public"."lecture_concept_map" USING ((EXISTS ( SELECT 1
   FROM "public"."lecture_videos"
  WHERE (("lecture_videos"."id" = "lecture_concept_map"."lecture_video_id") AND ("lecture_videos"."instructor_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."lecture_videos"
  WHERE (("lecture_videos"."id" = "lecture_concept_map"."lecture_video_id") AND ("lecture_videos"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors manage their lecture medical entities" ON "public"."lecture_medical_entities" USING ((EXISTS ( SELECT 1
   FROM "public"."lecture_videos"
  WHERE (("lecture_videos"."id" = "lecture_medical_entities"."lecture_video_id") AND ("lecture_videos"."instructor_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."lecture_videos"
  WHERE (("lecture_videos"."id" = "lecture_medical_entities"."lecture_video_id") AND ("lecture_videos"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors manage their lecture questions" ON "public"."lecture_questions" USING (("auth"."uid"() = "instructor_id")) WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors manage their lecture videos" ON "public"."lecture_videos" USING (("auth"."uid"() = "instructor_id")) WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors manage their own answer keys" ON "public"."instructor_answer_keys" USING (("auth"."uid"() = "instructor_id")) WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors manage their own courses" ON "public"."courses" USING (("auth"."uid"() = "instructor_id")) WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors manage their pause points" ON "public"."lecture_pause_points" USING ((EXISTS ( SELECT 1
   FROM "public"."lecture_videos"
  WHERE (("lecture_videos"."id" = "lecture_pause_points"."lecture_video_id") AND ("lecture_videos"."instructor_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."lecture_videos"
  WHERE (("lecture_videos"."id" = "lecture_pause_points"."lecture_video_id") AND ("lecture_videos"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors update own usage" ON "public"."instructor_usage_tracking" FOR UPDATE USING (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors view LTI users in their contexts" ON "public"."lti_users" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."lti_contexts" "lc"
  WHERE (("lc"."platform_id" = "lti_users"."platform_id") AND ("lc"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors view grade sync logs" ON "public"."grade_sync_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."lti_contexts" "lc"
  WHERE (("lc"."id" = "grade_sync_log"."context_id") AND ("lc"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors view own usage" ON "public"."instructor_usage_tracking" FOR SELECT USING (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors view question responses" ON "public"."live_responses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."live_questions" "lq"
  WHERE (("lq"."id" = "live_responses"."question_id") AND ("lq"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors view session participants" ON "public"."live_participants" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."live_sessions" "ls"
  WHERE (("ls"."id" = "live_participants"."session_id") AND ("ls"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors view student daily challenges" ON "public"."daily_challenges" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "daily_challenges"."user_id")))));



CREATE POLICY "Instructors view student practice goals" ON "public"."practice_goals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "practice_goals"."user_id")))));



CREATE POLICY "Instructors view student remediation history" ON "public"."remediation_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "remediation_history"."student_id")))));



CREATE POLICY "Instructors view student version history" ON "public"."answer_version_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."student_assignments" "sa"
  WHERE (("sa"."id" = "answer_version_history"."assignment_id") AND ("sa"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors view their connection health" ON "public"."student_connection_health" FOR SELECT USING (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Instructors view their students progress" ON "public"."student_lecture_progress" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."lecture_videos" "lv"
  WHERE (("lv"."id" = "student_lecture_progress"."lecture_video_id") AND ("lv"."instructor_id" = "auth"."uid"())))));



CREATE POLICY "Instructors view their usage logs" ON "public"."answer_key_usage_log" FOR SELECT USING (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Org members can view seat licenses" ON "public"."seat_licenses" FOR SELECT USING (("org_id" = "public"."get_user_org_id"("auth"."uid"())));



CREATE POLICY "Org-scoped achievements access" ON "public"."user_achievements" TO "authenticated" USING ((("org_id" = "public"."get_user_org_id"("auth"."uid"())) AND (("auth"."uid"() = "user_id") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'instructor'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "user_achievements"."user_id")))))))) WITH CHECK ((("org_id" = "public"."get_user_org_id"("auth"."uid"())) AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Org-scoped content drafts access" ON "public"."content_drafts" TO "authenticated" USING ((("org_id" = "public"."get_user_org_id"("auth"."uid"())) AND (("auth"."uid"() = "instructor_id") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")))) WITH CHECK ((("org_id" = "public"."get_user_org_id"("auth"."uid"())) AND ("auth"."uid"() = "instructor_id")));



CREATE POLICY "Org-scoped instructor student relationships" ON "public"."instructor_students" USING ((("org_id" = "public"."get_user_org_id"("auth"."uid"())) AND (("auth"."uid"() = "instructor_id") OR ("auth"."uid"() = "student_id") OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."admin_instructors"
  WHERE (("admin_instructors"."admin_id" = "auth"."uid"()) AND ("admin_instructors"."instructor_id" = "instructor_students"."instructor_id")))))))) WITH CHECK ((("org_id" = "public"."get_user_org_id"("auth"."uid"())) AND (("auth"."uid"() = "instructor_id") OR ("auth"."uid"() = "student_id"))));



CREATE POLICY "Org-scoped lesson progress access" ON "public"."lesson_progress" TO "authenticated" USING ((("org_id" = "public"."get_user_org_id"("auth"."uid"())) AND (("auth"."uid"() = "user_id") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'instructor'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "lesson_progress"."user_id")))))))) WITH CHECK ((("org_id" = "public"."get_user_org_id"("auth"."uid"())) AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Org-scoped messages access" ON "public"."messages" TO "authenticated" USING ((("org_id" = "public"."get_user_org_id"("auth"."uid"())) AND (("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "recipient_id") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")))) WITH CHECK ((("org_id" = "public"."get_user_org_id"("auth"."uid"())) AND ("auth"."uid"() = "sender_id")));



CREATE POLICY "Org-scoped user stats access" ON "public"."user_stats" TO "authenticated" USING ((("org_id" = "public"."get_user_org_id"("auth"."uid"())) AND (("auth"."uid"() = "user_id") OR "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") OR ("public"."has_role"("auth"."uid"(), 'instructor'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."instructor_id" = "auth"."uid"()) AND ("instructor_students"."student_id" = "user_stats"."user_id")))))))) WITH CHECK ((("org_id" = "public"."get_user_org_id"("auth"."uid"())) AND ("auth"."uid"() = "user_id")));



CREATE POLICY "Service role can insert grade sync logs" ON "public"."grade_sync_log" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can insert logs" ON "public"."question_send_logs" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can log connection health" ON "public"."student_connection_health" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can manage cache" ON "public"."ai_explanation_cache" USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Service role manages session tokens" ON "public"."lti_session_tokens" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role manages token cache" ON "public"."lti_token_cache" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role updates participants" ON "public"."live_participants" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Students access own assignments" ON "public"."student_assignments" TO "authenticated" USING (("auth"."uid"() = "student_id")) WITH CHECK ((("auth"."uid"() = "student_id") AND ("assignment_type" <> 'quiz'::"public"."assignment_type")));



CREATE POLICY "Students can insert own diagrams" ON "public"."diagram_generations" FOR INSERT WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can insert their own instructor connection" ON "public"."instructor_students" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can insert their own stats" ON "public"."user_stats" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Students can log their own pastes" ON "public"."student_paste_events" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can submit question reports" ON "public"."question_reports" FOR INSERT WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can view own diagrams" ON "public"."diagram_generations" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can view their instructor profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("public"."has_role"("auth"."uid"(), 'student'::"public"."app_role") AND (EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."student_id" = "auth"."uid"()) AND ("instructor_students"."instructor_id" = "profiles"."id"))))));



CREATE POLICY "Students can view their own instructor connections" ON "public"."instructor_students" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can view their own paste events" ON "public"."student_paste_events" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students can view their own reports" ON "public"."question_reports" FOR SELECT USING (("auth"."uid"() = "student_id"));



CREATE POLICY "Students manage their own progress" ON "public"."student_lecture_progress" USING (("auth"."uid"() = "student_id")) WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Students manage their own remediation history" ON "public"."remediation_history" USING (("auth"."uid"() = "student_id")) WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Students manage their version history" ON "public"."answer_version_history" USING (("auth"."uid"() = "student_id")) WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Students view assigned lecture videos" ON "public"."lecture_videos" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."student_id" = "auth"."uid"()) AND ("instructor_students"."instructor_id" = "lecture_videos"."instructor_id")))));



CREATE POLICY "Students view concept maps for assigned lectures" ON "public"."lecture_concept_map" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."lecture_videos" "lv"
     JOIN "public"."instructor_students" "ist" ON (("ist"."instructor_id" = "lv"."instructor_id")))
  WHERE (("lv"."id" = "lecture_concept_map"."lecture_video_id") AND ("ist"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students view enrolled courses" ON "public"."courses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."instructor_students"
  WHERE (("instructor_students"."course_id" = "courses"."id") AND ("instructor_students"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students view medical entities for assigned lectures" ON "public"."lecture_medical_entities" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."lecture_videos" "lv"
     JOIN "public"."instructor_students" "ist" ON (("ist"."instructor_id" = "lv"."instructor_id")))
  WHERE (("lv"."id" = "lecture_medical_entities"."lecture_video_id") AND ("ist"."student_id" = "auth"."uid"())))));



CREATE POLICY "Students view pause points for assigned lectures" ON "public"."lecture_pause_points" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."lecture_videos" "lv"
     JOIN "public"."instructor_students" "ist" ON (("ist"."instructor_id" = "lv"."instructor_id")))
  WHERE (("lv"."id" = "lecture_pause_points"."lecture_video_id") AND ("ist"."student_id" = "auth"."uid"())))));



CREATE POLICY "System can insert usage records" ON "public"."instructor_usage_tracking" FOR INSERT WITH CHECK (("auth"."uid"() = "instructor_id"));



CREATE POLICY "Users can access their own attempts" ON "public"."problem_attempts" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can access their own review schedule" ON "public"."spaced_repetition" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can check own invites" ON "public"."instructor_invites" FOR SELECT TO "authenticated" USING ((("lower"("email") = "lower"(("auth"."jwt"() ->> 'email'::"text"))) OR ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role") AND ("org_id" = "public"."get_user_org_id"("auth"."uid"())))));



CREATE POLICY "Users can create study groups" ON "public"."study_groups" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can delete their own lessons" ON "public"."lessons" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own materials" ON "public"."student_study_materials" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own personalized questions" ON "public"."personalized_questions" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own events" ON "public"."scheduled_events" FOR INSERT TO "authenticated" WITH CHECK (("organizer_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own difficulty settings" ON "public"."adaptive_difficulty" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own materials" ON "public"."student_study_materials" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own personalized questions" ON "public"."personalized_questions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own practice sessions" ON "public"."practice_sessions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can leave groups or admins can remove" ON "public"."study_group_members" FOR DELETE USING ((("auth"."uid"() = "user_id") OR "public"."can_manage_group"("auth"."uid"(), "group_id")));



CREATE POLICY "Users can manage own rate limits" ON "public"."rate_limits" TO "authenticated" USING ((("key" ~~ (('question_detection:'::"text" || ("auth"."uid"())::"text") || '%'::"text")) OR ("key" ~~ (('question_sending:'::"text" || ("auth"."uid"())::"text") || '%'::"text")))) WITH CHECK ((("key" ~~ (('question_detection:'::"text" || ("auth"."uid"())::"text") || '%'::"text")) OR ("key" ~~ (('question_sending:'::"text" || ("auth"."uid"())::"text") || '%'::"text"))));



CREATE POLICY "Users can manage their own check-in streaks" ON "public"."checkin_streaks" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own concept mastery" ON "public"."student_concept_mastery" USING (("auth"."uid"() = "student_id")) WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Users can manage their own daily tasks" ON "public"."study_plan_daily_tasks" USING ((EXISTS ( SELECT 1
   FROM "public"."study_plans"
  WHERE (("study_plans"."id" = "study_plan_daily_tasks"."plan_id") AND ("study_plans"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."study_plans"
  WHERE (("study_plans"."id" = "study_plan_daily_tasks"."plan_id") AND ("study_plans"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can manage their own error patterns" ON "public"."student_error_patterns" USING (("auth"."uid"() = "student_id")) WITH CHECK (("auth"."uid"() = "student_id"));



CREATE POLICY "Users can manage their own mastery data" ON "public"."lesson_mastery" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own study plans" ON "public"."study_plans" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their usage" ON "public"."usage_records" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can unshare their own questions" ON "public"."study_group_questions" FOR DELETE USING (("auth"."uid"() = "shared_by"));



CREATE POLICY "Users can update own events" ON "public"."scheduled_events" FOR UPDATE TO "authenticated" USING (("organizer_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own difficulty settings" ON "public"."adaptive_difficulty" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own lessons" ON "public"."lessons" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own materials" ON "public"."student_study_materials" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own personalized questions" ON "public"."personalized_questions" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own stats" ON "public"."user_stats" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view groups they are members of" ON "public"."study_groups" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."study_group_members"
  WHERE (("study_group_members"."group_id" = "study_groups"."id") AND ("study_group_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view members of their groups" ON "public"."study_group_members" FOR SELECT USING ("public"."is_group_member"("auth"."uid"(), "group_id"));



CREATE POLICY "Users can view own events" ON "public"."scheduled_events" FOR SELECT TO "authenticated" USING (("organizer_id" = "auth"."uid"()));



CREATE POLICY "Users can view their org subscription" ON "public"."subscriptions" FOR SELECT USING (("org_id" = "public"."get_user_org_id"("auth"."uid"())));



CREATE POLICY "Users can view their own LTI mapping" ON "public"."lti_users" FOR SELECT USING (("edvana_user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own difficulty settings" ON "public"."adaptive_difficulty" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own lessons" ON "public"."lessons" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own materials" ON "public"."student_study_materials" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own organization" ON "public"."organizations" FOR SELECT TO "authenticated" USING (("id" = "public"."get_user_org_id"("auth"."uid"())));



CREATE POLICY "Users can view their own personalized questions" ON "public"."personalized_questions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own practice sessions" ON "public"."practice_sessions" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own roles" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own stats" ON "public"."user_stats" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own subscription" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their usage" ON "public"."usage_records" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users manage their own daily challenges" ON "public"."daily_challenges" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage their own practice goals" ON "public"."practice_goals" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "View session questions" ON "public"."live_questions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."live_sessions" "ls"
  WHERE (("ls"."id" = "live_questions"."session_id") AND ("ls"."is_active" = true)))));



ALTER TABLE "public"."achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."adaptive_difficulty" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_dashboard_presets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_instructors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_explanation_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_quality_ratings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."answer_key_mcqs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."answer_key_problems" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."answer_key_usage_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."answer_version_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkin_streaks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."content_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_challenges" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deny_anon_all_access" ON "public"."users" AS RESTRICTIVE TO "anon" USING (false);



CREATE POLICY "deny_anon_select" ON "public"."users" AS RESTRICTIVE FOR SELECT TO "anon" USING (false);



ALTER TABLE "public"."diagram_generations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."grade_sync_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instructor_answer_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instructor_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instructor_question_bank" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instructor_students" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."instructor_usage_tracking" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lecture_concept_map" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lecture_materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lecture_medical_entities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lecture_pause_points" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lecture_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lecture_summaries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lecture_videos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lesson_mastery" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lesson_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lessons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."live_participants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."live_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."live_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."live_session_transcripts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."live_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lti_contexts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lti_platforms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lti_session_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lti_token_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lti_tool_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lti_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_domains" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personalized_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pilot_rebates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."practice_goals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."practice_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."problem_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."question_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."question_send_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."remediation_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "require_authentication" ON "public"."users" AS RESTRICTIVE USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



ALTER TABLE "public"."scheduled_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seat_allocations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."seat_licenses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."slide_preset_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."spaced_repetition" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stem_problems" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_concept_mastery" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_connection_health" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_error_patterns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_lecture_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_paste_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."student_study_materials" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_group_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_group_questions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_plan_daily_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."study_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_tiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_achievements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_delete_own" ON "public"."users" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "users_insert_own" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "users_select_instructor_students" ON "public"."users" FOR SELECT TO "authenticated" USING ("public"."can_view_user"("auth"."uid"(), "id"));



CREATE POLICY "users_select_own" ON "public"."users" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."instructor_students";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."live_participants";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."live_questions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."live_responses";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."live_session_transcripts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."live_sessions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."student_assignments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."student_paste_events";



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































GRANT ALL ON FUNCTION "public"."add_group_creator_as_owner"() TO "anon";
GRANT ALL ON FUNCTION "public"."add_group_creator_as_owner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_group_creator_as_owner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."add_lecture_minutes"("p_instructor_id" "uuid", "p_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."add_lecture_minutes"("p_instructor_id" "uuid", "p_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_lecture_minutes"("p_instructor_id" "uuid", "p_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_sync_org_members"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_sync_org_members"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_sync_org_members"() TO "service_role";



GRANT ALL ON FUNCTION "public"."assign_oauth_role"("p_user_id" "uuid", "p_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."assign_oauth_role"("p_user_id" "uuid", "p_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_oauth_role"("p_user_id" "uuid", "p_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_connect_instructor_to_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_connect_instructor_to_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_connect_instructor_to_org"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_connect_on_seat_allocation"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_connect_on_seat_allocation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_connect_on_seat_allocation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_release_expired_answers"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_release_expired_answers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_release_expired_answers"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_auto_release_time"("p_created_at" timestamp with time zone, "p_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_auto_release_time"("p_created_at" timestamp with time zone, "p_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_auto_release_time"("p_created_at" timestamp with time zone, "p_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_mastery_threshold"("p_user_id" "uuid", "p_lesson_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_mastery_threshold"("p_user_id" "uuid", "p_lesson_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_mastery_threshold"("p_user_id" "uuid", "p_lesson_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_group"("_user_id" "uuid", "_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_group"("_user_id" "uuid", "_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_group"("_user_id" "uuid", "_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_record_lecture"("p_instructor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_record_lecture"("p_instructor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_record_lecture"("p_instructor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_user"("_viewer_id" "uuid", "_target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_user"("_viewer_id" "uuid", "_target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_user"("_viewer_id" "uuid", "_target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_lti_tokens"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_lti_tokens"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_lti_tokens"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_question_logs"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_question_logs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_question_logs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_rate_limits"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_unsaved_lecture_checkins"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_unsaved_lecture_checkins"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_unsaved_lecture_checkins"() TO "service_role";



GRANT ALL ON FUNCTION "public"."connect_instructor_to_admin"("_admin_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."connect_instructor_to_admin"("_admin_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."connect_instructor_to_admin"("_admin_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_admin_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_admin_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_admin_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_course_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_course_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_course_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_group_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_group_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_group_invite_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_instructor_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_instructor_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_instructor_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_org_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_org_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_org_invite_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_session_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_session_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_session_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_adaptive_difficulty"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_adaptive_difficulty"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_adaptive_difficulty"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_connected_instructors"("_admin_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_connected_instructors"("_admin_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_connected_instructors"("_admin_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_usage"("p_instructor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_usage"("p_instructor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_usage"("p_instructor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invited_org_names"("_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invited_org_names"("_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invited_org_names"("_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_org_codes"("_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_org_codes"("_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_codes"("_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_problem_answer"("problem_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_problem_answer"("problem_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_problem_answer"("problem_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_question_success_rate"("p_instructor_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_question_success_rate"("p_instructor_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_question_success_rate"("p_instructor_id" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_student_limit"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_student_limit"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_student_limit"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_course_limit"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_course_limit"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_course_limit"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_org_id"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_org_id"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_org_id"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_subscription_tier"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_subscription_tier"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_subscription_tier"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_feature_access"("_user_id" "uuid", "_feature" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."has_feature_access"("_user_id" "uuid", "_feature" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_feature_access"("_user_id" "uuid", "_feature" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "anon";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_mcq_usage"() TO "anon";
GRANT ALL ON FUNCTION "public"."increment_mcq_usage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_mcq_usage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_group_member"("_user_id" "uuid", "_group_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_group_member"("_user_id" "uuid", "_group_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_group_member"("_user_id" "uuid", "_group_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."join_group_by_code"("_invite_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."join_group_by_code"("_invite_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."join_group_by_code"("_invite_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_admin_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_admin_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_admin_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_answer_key_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_answer_key_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_answer_key_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_auto_release_timer"("p_assignment_ids" "uuid"[], "p_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."set_auto_release_timer"("p_assignment_ids" "uuid"[], "p_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_auto_release_timer"("p_assignment_ids" "uuid"[], "p_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_course_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_course_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_course_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_event_session_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_event_session_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_event_session_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_group_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_group_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_group_invite_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_instructor_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_instructor_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_instructor_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_lecture_checkin_auto_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_lecture_checkin_auto_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_lecture_checkin_auto_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_lecture_summary_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_lecture_summary_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_lecture_summary_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_lecture_video_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_lecture_video_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_lecture_video_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_profile_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_profile_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_profile_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_question_bank_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_question_bank_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_question_bank_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_session_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_session_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_session_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_student_assignment_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_student_assignment_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_student_assignment_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."submit_quiz"("p_assignment_id" "uuid", "p_user_answers" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_quiz"("p_assignment_id" "uuid", "p_user_answers" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_quiz"("p_assignment_id" "uuid", "p_user_answers" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_student_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_student_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_student_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_adaptive_difficulty"("p_user_id" "uuid", "p_was_correct" boolean, "p_current_difficulty" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_adaptive_difficulty"("p_user_id" "uuid", "p_was_correct" boolean, "p_current_difficulty" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_adaptive_difficulty"("p_user_id" "uuid", "p_was_correct" boolean, "p_current_difficulty" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_answer_key_problem_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_answer_key_problem_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_answer_key_problem_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_assignment_grade"("p_assignment_id" "uuid", "p_short_answer_grades" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_assignment_grade"("p_assignment_id" "uuid", "p_short_answer_grades" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_assignment_grade"("p_assignment_id" "uuid", "p_short_answer_grades" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_admin_code"("_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_admin_code"("_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_admin_code"("_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_course_code"("code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_course_code"("code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_course_code"("code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_instructor_code"("code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_instructor_code"("code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_instructor_code"("code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_org_invite_code"("_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_org_invite_code"("_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_org_invite_code"("_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_scheduled_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_scheduled_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_scheduled_event"() TO "service_role";












SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;









GRANT ALL ON TABLE "public"."achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."achievements" TO "service_role";



GRANT ALL ON TABLE "public"."adaptive_difficulty" TO "authenticated";
GRANT ALL ON TABLE "public"."adaptive_difficulty" TO "service_role";



GRANT ALL ON TABLE "public"."admin_dashboard_presets" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_dashboard_presets" TO "service_role";



GRANT ALL ON TABLE "public"."admin_instructors" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_instructors" TO "service_role";



GRANT ALL ON TABLE "public"."ai_explanation_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_explanation_cache" TO "service_role";



GRANT ALL ON TABLE "public"."ai_quality_ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_quality_ratings" TO "service_role";



GRANT ALL ON TABLE "public"."answer_key_mcqs" TO "authenticated";
GRANT ALL ON TABLE "public"."answer_key_mcqs" TO "service_role";



GRANT ALL ON TABLE "public"."answer_key_problems" TO "authenticated";
GRANT ALL ON TABLE "public"."answer_key_problems" TO "service_role";



GRANT ALL ON TABLE "public"."answer_key_usage_log" TO "authenticated";
GRANT ALL ON TABLE "public"."answer_key_usage_log" TO "service_role";



GRANT ALL ON TABLE "public"."answer_version_history" TO "authenticated";
GRANT ALL ON TABLE "public"."answer_version_history" TO "service_role";



GRANT ALL ON TABLE "public"."checkin_streaks" TO "authenticated";
GRANT ALL ON TABLE "public"."checkin_streaks" TO "service_role";



GRANT ALL ON TABLE "public"."content_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."content_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";



GRANT ALL ON TABLE "public"."daily_challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_challenges" TO "service_role";



GRANT ALL ON TABLE "public"."diagram_generations" TO "authenticated";
GRANT ALL ON TABLE "public"."diagram_generations" TO "service_role";



GRANT ALL ON TABLE "public"."grade_sync_log" TO "authenticated";
GRANT ALL ON TABLE "public"."grade_sync_log" TO "service_role";



GRANT ALL ON TABLE "public"."instructor_answer_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."instructor_answer_keys" TO "service_role";



GRANT ALL ON TABLE "public"."instructor_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."instructor_invites" TO "service_role";



GRANT ALL ON TABLE "public"."instructor_question_bank" TO "authenticated";
GRANT ALL ON TABLE "public"."instructor_question_bank" TO "service_role";



GRANT ALL ON TABLE "public"."instructor_students" TO "authenticated";
GRANT ALL ON TABLE "public"."instructor_students" TO "service_role";



GRANT ALL ON TABLE "public"."instructor_usage_tracking" TO "authenticated";
GRANT ALL ON TABLE "public"."instructor_usage_tracking" TO "service_role";



GRANT ALL ON TABLE "public"."lecture_concept_map" TO "authenticated";
GRANT ALL ON TABLE "public"."lecture_concept_map" TO "service_role";



GRANT ALL ON TABLE "public"."lecture_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."lecture_materials" TO "service_role";



GRANT ALL ON TABLE "public"."lecture_medical_entities" TO "authenticated";
GRANT ALL ON TABLE "public"."lecture_medical_entities" TO "service_role";



GRANT ALL ON TABLE "public"."lecture_pause_points" TO "authenticated";
GRANT ALL ON TABLE "public"."lecture_pause_points" TO "service_role";



GRANT ALL ON TABLE "public"."lecture_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."lecture_questions" TO "service_role";



GRANT ALL ON TABLE "public"."lecture_summaries" TO "authenticated";
GRANT ALL ON TABLE "public"."lecture_summaries" TO "service_role";



GRANT ALL ON TABLE "public"."lecture_videos" TO "authenticated";
GRANT ALL ON TABLE "public"."lecture_videos" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_mastery" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_mastery" TO "service_role";



GRANT ALL ON TABLE "public"."lesson_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."lesson_progress" TO "service_role";



GRANT ALL ON TABLE "public"."lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."lessons" TO "service_role";



GRANT ALL ON TABLE "public"."live_participants" TO "authenticated";
GRANT ALL ON TABLE "public"."live_participants" TO "service_role";



GRANT ALL ON TABLE "public"."live_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."live_questions" TO "service_role";



GRANT ALL ON TABLE "public"."live_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."live_responses" TO "service_role";



GRANT ALL ON TABLE "public"."live_session_transcripts" TO "authenticated";
GRANT ALL ON TABLE "public"."live_session_transcripts" TO "service_role";



GRANT ALL ON TABLE "public"."live_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."live_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."lti_contexts" TO "authenticated";
GRANT ALL ON TABLE "public"."lti_contexts" TO "service_role";



GRANT ALL ON TABLE "public"."lti_platforms" TO "authenticated";
GRANT ALL ON TABLE "public"."lti_platforms" TO "service_role";



GRANT ALL ON TABLE "public"."lti_session_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."lti_session_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."lti_token_cache" TO "service_role";



GRANT ALL ON TABLE "public"."lti_tool_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."lti_tool_keys" TO "service_role";



GRANT ALL ON TABLE "public"."lti_users" TO "authenticated";
GRANT ALL ON TABLE "public"."lti_users" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."organization_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_domains" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."organizations" TO "authenticated";



GRANT SELECT("name"),UPDATE("name") ON TABLE "public"."organizations" TO "authenticated";



GRANT SELECT("slug") ON TABLE "public"."organizations" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."organizations" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."organizations" TO "authenticated";



GRANT ALL ON TABLE "public"."personalized_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."personalized_questions" TO "service_role";



GRANT ALL ON TABLE "public"."pilot_rebates" TO "authenticated";
GRANT ALL ON TABLE "public"."pilot_rebates" TO "service_role";



GRANT ALL ON TABLE "public"."practice_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_goals" TO "service_role";



GRANT ALL ON TABLE "public"."practice_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."practice_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."problem_attempts" TO "authenticated";
GRANT ALL ON TABLE "public"."problem_attempts" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."question_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."question_reports" TO "service_role";



GRANT ALL ON TABLE "public"."question_send_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."question_send_logs" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."remediation_history" TO "authenticated";
GRANT ALL ON TABLE "public"."remediation_history" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_events" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_events" TO "service_role";



GRANT ALL ON TABLE "public"."seat_allocations" TO "authenticated";
GRANT ALL ON TABLE "public"."seat_allocations" TO "service_role";



GRANT ALL ON TABLE "public"."seat_licenses" TO "authenticated";
GRANT ALL ON TABLE "public"."seat_licenses" TO "service_role";



GRANT ALL ON TABLE "public"."slide_preset_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."slide_preset_questions" TO "service_role";



GRANT ALL ON TABLE "public"."spaced_repetition" TO "authenticated";
GRANT ALL ON TABLE "public"."spaced_repetition" TO "service_role";



GRANT ALL ON TABLE "public"."stem_problems" TO "authenticated";
GRANT ALL ON TABLE "public"."stem_problems" TO "service_role";



GRANT ALL ON TABLE "public"."stem_problems_student_view" TO "authenticated";
GRANT ALL ON TABLE "public"."stem_problems_student_view" TO "service_role";



GRANT ALL ON TABLE "public"."student_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."student_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."student_concept_mastery" TO "authenticated";
GRANT ALL ON TABLE "public"."student_concept_mastery" TO "service_role";



GRANT ALL ON TABLE "public"."student_connection_health" TO "authenticated";
GRANT ALL ON TABLE "public"."student_connection_health" TO "service_role";



GRANT ALL ON TABLE "public"."student_error_patterns" TO "authenticated";
GRANT ALL ON TABLE "public"."student_error_patterns" TO "service_role";



GRANT ALL ON TABLE "public"."student_lecture_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."student_lecture_progress" TO "service_role";



GRANT ALL ON TABLE "public"."student_paste_events" TO "authenticated";
GRANT ALL ON TABLE "public"."student_paste_events" TO "service_role";



GRANT ALL ON TABLE "public"."student_problems" TO "authenticated";
GRANT ALL ON TABLE "public"."student_problems" TO "service_role";



GRANT ALL ON TABLE "public"."student_study_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."student_study_materials" TO "service_role";



GRANT ALL ON TABLE "public"."study_group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."study_group_members" TO "service_role";



GRANT ALL ON TABLE "public"."study_group_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."study_group_questions" TO "service_role";



GRANT ALL ON TABLE "public"."study_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."study_groups" TO "service_role";



GRANT ALL ON TABLE "public"."study_plan_daily_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."study_plan_daily_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."study_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."study_plans" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."usage_records" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_records" TO "service_role";



GRANT ALL ON TABLE "public"."user_achievements" TO "authenticated";
GRANT ALL ON TABLE "public"."user_achievements" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."user_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."user_stats" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."users" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























