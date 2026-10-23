-- ============================================================
-- Edvana — AI Whiteboard Math Tutor
-- ------------------------------------------------------------
-- Schema for the whiteboard-tutor feature. Instead of handing in
-- a page of answers, a student works a problem *with* the tutor:
-- the session (transcript, timestamped board, misconception tags,
-- time-on-task) IS the submission.
--
-- Follows the existing project conventions:
--   * public.has_role(auth.uid(), '<role>') for role gating
--   * Row Level Security on every table
--   * gen_random_uuid() primary keys, timestamptz audit columns
-- New migration file only — existing migrations are never edited.
-- ============================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

-- ---------- Enums ----------

DO $$ BEGIN
    CREATE TYPE "public"."whiteboard_work_mode" AS ENUM ('talk', 'type', 'draw', 'photo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "public"."whiteboard_tutor_behavior" AS ENUM ('socratic_only', 'hints_on_request', 'show_solution');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "public"."whiteboard_assignment_status" AS ENUM ('draft', 'published', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "public"."whiteboard_session_status" AS ENUM ('in_progress', 'recorded', 'graded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    -- Provenance of a board line, driving its styling on every screen.
    CREATE TYPE "public"."whiteboard_step_provenance" AS ENUM (
        'from_you', 'corrected', 'self_corrected', 'you_drew', 'answer'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "public"."whiteboard_speaker" AS ENUM ('ai', 'student');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "public"."whiteboard_tag_type" AS ENUM ('misconception', 'strength', 'pattern');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Shared updated_at trigger ----------

CREATE OR REPLACE FUNCTION "public"."set_whiteboard_updated_at"()
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."set_whiteboard_updated_at"() OWNER TO "postgres";

-- ============================================================
-- 1. Assignments (instructor authoring: setup screen)
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."whiteboard_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "course_id" "uuid",
    "org_id" "uuid",
    "title" "text" NOT NULL,
    "subtitle" "text",
    "status" "public"."whiteboard_assignment_status" DEFAULT 'draft'::"public"."whiteboard_assignment_status" NOT NULL,
    -- Tutor behavior
    "tutor_behavior" "public"."whiteboard_tutor_behavior" DEFAULT 'socratic_only'::"public"."whiteboard_tutor_behavior" NOT NULL,
    "work_modes" "public"."whiteboard_work_mode"[] DEFAULT ARRAY['talk','type','draw','photo']::"public"."whiteboard_work_mode"[] NOT NULL,
    -- Scoring: reasoning_weight + answer_weight always sum to 100
    "reasoning_weight" integer DEFAULT 70 NOT NULL,
    "answer_weight" integer GENERATED ALWAYS AS (100 - "reasoning_weight") STORED,
    "require_explanation" boolean DEFAULT true NOT NULL,
    "probe_depth" "text" DEFAULT 'standard'::"text" NOT NULL,
    "hint_budget" integer DEFAULT 0 NOT NULL,
    "variants_enabled" boolean DEFAULT true NOT NULL,
    "student_count" integer DEFAULT 0 NOT NULL,
    "due_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whiteboard_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whiteboard_assignments_reasoning_weight_check"
        CHECK ("reasoning_weight" >= 0 AND "reasoning_weight" <= 100)
);

ALTER TABLE "public"."whiteboard_assignments" OWNER TO "postgres";

COMMENT ON TABLE "public"."whiteboard_assignments" IS 'Instructor-authored whiteboard-tutor assignments (the setup screen).';
COMMENT ON COLUMN "public"."whiteboard_assignments"."reasoning_weight" IS 'Percent of the score from explanation quality (50-90). answer_weight is the complement.';

-- ============================================================
-- 2. Problems (one row per problem in an assignment set)
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."whiteboard_problems" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "title" "text" NOT NULL,
    "concept" "text",
    -- Prompt with placeholders, e.g. 'A spherical balloon is inflated at {rate} cm^3/s...'
    "prompt_template" "text" NOT NULL,
    "range_summary" "text",
    -- Instructor ranges used to generate per-student number sets, e.g.
    -- {"rate": {"min": 25, "max": 60}, "r": {"min": 4, "max": 12}}
    "variant_ranges" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whiteboard_problems_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whiteboard_problems_assignment_id_fkey"
        FOREIGN KEY ("assignment_id") REFERENCES "public"."whiteboard_assignments"("id") ON DELETE CASCADE,
    CONSTRAINT "whiteboard_problems_assignment_position_key"
        UNIQUE ("assignment_id", "position")
);

ALTER TABLE "public"."whiteboard_problems" OWNER TO "postgres";

COMMENT ON TABLE "public"."whiteboard_problems" IS 'Problems inside a whiteboard assignment, with per-student variant ranges.';

-- ============================================================
-- 3. Problem variants (per-student generated number sets)
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."whiteboard_problem_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "problem_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "variant_label" "text" NOT NULL,
    -- Concrete numbers for this student, e.g. {"rate": 40, "r": 8}
    "numbers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "prompt_text" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whiteboard_problem_variants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whiteboard_problem_variants_problem_id_fkey"
        FOREIGN KEY ("problem_id") REFERENCES "public"."whiteboard_problems"("id") ON DELETE CASCADE,
    CONSTRAINT "whiteboard_problem_variants_problem_student_key"
        UNIQUE ("problem_id", "student_id")
);

ALTER TABLE "public"."whiteboard_problem_variants" OWNER TO "postgres";

COMMENT ON TABLE "public"."whiteboard_problem_variants" IS 'Per-student generated number set for a problem (e.g. VARIANT B-14).';

-- ============================================================
-- 4. Sessions (a student's working session = the submission)
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."whiteboard_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "problem_id" "uuid" NOT NULL,
    "variant_id" "uuid",
    "student_id" "uuid" NOT NULL,
    "org_id" "uuid",
    "mode" "public"."whiteboard_work_mode" DEFAULT 'talk'::"public"."whiteboard_work_mode" NOT NULL,
    "status" "public"."whiteboard_session_status" DEFAULT 'in_progress'::"public"."whiteboard_session_status" NOT NULL,
    -- Effort / signal metrics surfaced on the recorded + review screens
    "duration_seconds" integer DEFAULT 0 NOT NULL,
    "probes_answered" integer DEFAULT 0 NOT NULL,
    "hints_used" integer DEFAULT 0 NOT NULL,
    "self_corrections" integer DEFAULT 0 NOT NULL,
    "talk_seconds" integer DEFAULT 0 NOT NULL,
    "words_written" integer DEFAULT 0 NOT NULL,
    -- Scoring
    "suggested_score" numeric(4,1),
    "final_score" numeric(4,1),
    "graded_by" "uuid",
    "graded_at" timestamp with time zone,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "recorded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whiteboard_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whiteboard_sessions_problem_id_fkey"
        FOREIGN KEY ("problem_id") REFERENCES "public"."whiteboard_problems"("id") ON DELETE CASCADE,
    CONSTRAINT "whiteboard_sessions_variant_id_fkey"
        FOREIGN KEY ("variant_id") REFERENCES "public"."whiteboard_problem_variants"("id") ON DELETE SET NULL
);

ALTER TABLE "public"."whiteboard_sessions" OWNER TO "postgres";

COMMENT ON TABLE "public"."whiteboard_sessions" IS 'A student working session — the submission. Holds effort metrics and scores.';

-- ============================================================
-- 5. Board steps (timestamped whiteboard lines)
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."whiteboard_board_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "at_seconds" integer NOT NULL,
    "content" "text" NOT NULL,
    "provenance" "public"."whiteboard_step_provenance" DEFAULT 'from_you'::"public"."whiteboard_step_provenance" NOT NULL,
    "struck_through" boolean DEFAULT false NOT NULL,
    "highlighted" boolean DEFAULT false NOT NULL,
    "annotation" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whiteboard_board_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whiteboard_board_steps_session_id_fkey"
        FOREIGN KEY ("session_id") REFERENCES "public"."whiteboard_sessions"("id") ON DELETE CASCADE,
    CONSTRAINT "whiteboard_board_steps_session_position_key"
        UNIQUE ("session_id", "position")
);

ALTER TABLE "public"."whiteboard_board_steps" OWNER TO "postgres";

COMMENT ON TABLE "public"."whiteboard_board_steps" IS 'Timestamped board lines with provenance (from_you, corrected, self_corrected, ...).';

-- ============================================================
-- 6. Transcript entries
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."whiteboard_transcript_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "at_seconds" integer NOT NULL,
    "speaker" "public"."whiteboard_speaker" NOT NULL,
    "speaker_name" "text",
    "body" "text" NOT NULL,
    "is_probe" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whiteboard_transcript_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whiteboard_transcript_entries_session_id_fkey"
        FOREIGN KEY ("session_id") REFERENCES "public"."whiteboard_sessions"("id") ON DELETE CASCADE,
    CONSTRAINT "whiteboard_transcript_entries_session_position_key"
        UNIQUE ("session_id", "position")
);

ALTER TABLE "public"."whiteboard_transcript_entries" OWNER TO "postgres";

COMMENT ON TABLE "public"."whiteboard_transcript_entries" IS 'Full spoken/typed transcript of a session, in order.';

-- ============================================================
-- 7. Attachments (scratch-work photos)
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."whiteboard_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "at_seconds" integer,
    "kind" "text" DEFAULT 'scratch_work'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "caption" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whiteboard_attachments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whiteboard_attachments_session_id_fkey"
        FOREIGN KEY ("session_id") REFERENCES "public"."whiteboard_sessions"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."whiteboard_attachments" OWNER TO "postgres";

COMMENT ON TABLE "public"."whiteboard_attachments" IS 'Uploaded scratch-work photos attached to a session.';

-- ============================================================
-- 8. Misconception / strength / pattern tags
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."whiteboard_session_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "tag_type" "public"."whiteboard_tag_type" NOT NULL,
    "body" "text" NOT NULL,
    "jump_to_seconds" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whiteboard_session_tags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whiteboard_session_tags_session_id_fkey"
        FOREIGN KEY ("session_id") REFERENCES "public"."whiteboard_sessions"("id") ON DELETE CASCADE
);

ALTER TABLE "public"."whiteboard_session_tags" OWNER TO "postgres";

COMMENT ON TABLE "public"."whiteboard_session_tags" IS 'Instructor-facing reasoning tags: MISCONCEPTION, STRENGTH, PATTERN.';

-- ============================================================
-- 9. Per-objective mastery (the "Where you stand" bars)
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."whiteboard_objective_mastery" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "objective" "text" NOT NULL,
    "score_pct" integer NOT NULL,
    "verdict" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whiteboard_objective_mastery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whiteboard_objective_mastery_session_id_fkey"
        FOREIGN KEY ("session_id") REFERENCES "public"."whiteboard_sessions"("id") ON DELETE CASCADE,
    CONSTRAINT "whiteboard_objective_mastery_score_check"
        CHECK ("score_pct" >= 0 AND "score_pct" <= 100)
);

ALTER TABLE "public"."whiteboard_objective_mastery" OWNER TO "postgres";

COMMENT ON TABLE "public"."whiteboard_objective_mastery" IS 'Per-objective mastery bars shown on the recorded receipt.';

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS "idx_whiteboard_assignments_instructor" ON "public"."whiteboard_assignments" ("instructor_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_assignments_course" ON "public"."whiteboard_assignments" ("course_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_problems_assignment" ON "public"."whiteboard_problems" ("assignment_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_variants_student" ON "public"."whiteboard_problem_variants" ("student_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_sessions_student" ON "public"."whiteboard_sessions" ("student_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_sessions_problem" ON "public"."whiteboard_sessions" ("problem_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_board_steps_session" ON "public"."whiteboard_board_steps" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_transcript_session" ON "public"."whiteboard_transcript_entries" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_attachments_session" ON "public"."whiteboard_attachments" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_tags_session" ON "public"."whiteboard_session_tags" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_mastery_session" ON "public"."whiteboard_objective_mastery" ("session_id");

-- ============================================================
-- updated_at triggers
-- ============================================================

DROP TRIGGER IF EXISTS "trg_whiteboard_assignments_updated_at" ON "public"."whiteboard_assignments";
CREATE TRIGGER "trg_whiteboard_assignments_updated_at"
    BEFORE UPDATE ON "public"."whiteboard_assignments"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_whiteboard_updated_at"();

DROP TRIGGER IF EXISTS "trg_whiteboard_problems_updated_at" ON "public"."whiteboard_problems";
CREATE TRIGGER "trg_whiteboard_problems_updated_at"
    BEFORE UPDATE ON "public"."whiteboard_problems"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_whiteboard_updated_at"();

DROP TRIGGER IF EXISTS "trg_whiteboard_sessions_updated_at" ON "public"."whiteboard_sessions";
CREATE TRIGGER "trg_whiteboard_sessions_updated_at"
    BEFORE UPDATE ON "public"."whiteboard_sessions"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_whiteboard_updated_at"();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE "public"."whiteboard_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whiteboard_problems" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whiteboard_problem_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whiteboard_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whiteboard_board_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whiteboard_transcript_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whiteboard_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whiteboard_session_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."whiteboard_objective_mastery" ENABLE ROW LEVEL SECURITY;

-- ---- Assignments: instructors own their own; students read published ones ----

CREATE POLICY "Instructors manage own whiteboard assignments"
    ON "public"."whiteboard_assignments" TO "authenticated"
    USING ("instructor_id" = "auth"."uid"())
    WITH CHECK ("instructor_id" = "auth"."uid"() AND "public"."has_role"("auth"."uid"(), 'instructor'::"public"."app_role"));

CREATE POLICY "Students read published whiteboard assignments"
    ON "public"."whiteboard_assignments" FOR SELECT TO "authenticated"
    USING ("status" = 'published'::"public"."whiteboard_assignment_status");

-- ---- Problems: visible with their assignment; instructors write ----

CREATE POLICY "Read whiteboard problems of visible assignments"
    ON "public"."whiteboard_problems" FOR SELECT TO "authenticated"
    USING (EXISTS (
        SELECT 1 FROM "public"."whiteboard_assignments" a
        WHERE a."id" = "whiteboard_problems"."assignment_id"
          AND (a."instructor_id" = "auth"."uid"()
               OR a."status" = 'published'::"public"."whiteboard_assignment_status")
    ));

CREATE POLICY "Instructors write whiteboard problems"
    ON "public"."whiteboard_problems" TO "authenticated"
    USING (EXISTS (
        SELECT 1 FROM "public"."whiteboard_assignments" a
        WHERE a."id" = "whiteboard_problems"."assignment_id"
          AND a."instructor_id" = "auth"."uid"()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM "public"."whiteboard_assignments" a
        WHERE a."id" = "whiteboard_problems"."assignment_id"
          AND a."instructor_id" = "auth"."uid"()
    ));

-- ---- Variants: a student sees their own; instructors see their assignment's ----

CREATE POLICY "Students read own whiteboard variants"
    ON "public"."whiteboard_problem_variants" FOR SELECT TO "authenticated"
    USING ("student_id" = "auth"."uid"());

CREATE POLICY "Instructors read whiteboard variants of own assignments"
    ON "public"."whiteboard_problem_variants" FOR SELECT TO "authenticated"
    USING (EXISTS (
        SELECT 1 FROM "public"."whiteboard_problems" p
        JOIN "public"."whiteboard_assignments" a ON a."id" = p."assignment_id"
        WHERE p."id" = "whiteboard_problem_variants"."problem_id"
          AND a."instructor_id" = "auth"."uid"()
    ));

-- ---- Sessions: students own theirs; instructors read sessions on their assignments ----

CREATE POLICY "Students manage own whiteboard sessions"
    ON "public"."whiteboard_sessions" TO "authenticated"
    USING ("student_id" = "auth"."uid"())
    WITH CHECK ("student_id" = "auth"."uid"());

CREATE POLICY "Instructors read whiteboard sessions on own assignments"
    ON "public"."whiteboard_sessions" FOR SELECT TO "authenticated"
    USING (EXISTS (
        SELECT 1 FROM "public"."whiteboard_problems" p
        JOIN "public"."whiteboard_assignments" a ON a."id" = p."assignment_id"
        WHERE p."id" = "whiteboard_sessions"."problem_id"
          AND a."instructor_id" = "auth"."uid"()
    ));

CREATE POLICY "Instructors grade whiteboard sessions on own assignments"
    ON "public"."whiteboard_sessions" FOR UPDATE TO "authenticated"
    USING (EXISTS (
        SELECT 1 FROM "public"."whiteboard_problems" p
        JOIN "public"."whiteboard_assignments" a ON a."id" = p."assignment_id"
        WHERE p."id" = "whiteboard_sessions"."problem_id"
          AND a."instructor_id" = "auth"."uid"()
    ));

-- ---- Child rows of a session: owner student writes, instructor reads ----
-- Applied uniformly to board steps, transcript, attachments, tags, mastery.

DO $$
DECLARE
    t "text";
    child_tables "text"[] := ARRAY[
        'whiteboard_board_steps',
        'whiteboard_transcript_entries',
        'whiteboard_attachments',
        'whiteboard_session_tags',
        'whiteboard_objective_mastery'
    ];
BEGIN
    FOREACH t IN ARRAY child_tables LOOP
        EXECUTE format($f$
            CREATE POLICY "Students manage own %1$s"
                ON "public"."%1$s" TO "authenticated"
                USING (EXISTS (
                    SELECT 1 FROM "public"."whiteboard_sessions" s
                    WHERE s."id" = "%1$s"."session_id"
                      AND s."student_id" = "auth"."uid"()
                ))
                WITH CHECK (EXISTS (
                    SELECT 1 FROM "public"."whiteboard_sessions" s
                    WHERE s."id" = "%1$s"."session_id"
                      AND s."student_id" = "auth"."uid"()
                ));
        $f$, t);

        EXECUTE format($f$
            CREATE POLICY "Instructors read %1$s on own assignments"
                ON "public"."%1$s" FOR SELECT TO "authenticated"
                USING (EXISTS (
                    SELECT 1 FROM "public"."whiteboard_sessions" s
                    JOIN "public"."whiteboard_problems" p ON p."id" = s."problem_id"
                    JOIN "public"."whiteboard_assignments" a ON a."id" = p."assignment_id"
                    WHERE s."id" = "%1$s"."session_id"
                      AND a."instructor_id" = "auth"."uid"()
                ));
        $f$, t);
    END LOOP;
END $$;

-- ============================================================
-- Grants (match project convention: authenticated role uses tables)
-- ============================================================

GRANT ALL ON TABLE "public"."whiteboard_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."whiteboard_problems" TO "authenticated";
GRANT ALL ON TABLE "public"."whiteboard_problem_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."whiteboard_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."whiteboard_board_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."whiteboard_transcript_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."whiteboard_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."whiteboard_session_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."whiteboard_objective_mastery" TO "authenticated";
