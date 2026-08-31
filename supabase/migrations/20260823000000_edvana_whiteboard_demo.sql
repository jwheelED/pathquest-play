-- ============================================================
-- Edvana Whiteboard Tutor — WORKING DEMO layer
-- ------------------------------------------------------------
-- Builds the standalone demo on top of the whiteboard_* schema:
--   * seeded demo identities (no signup) + a course roster
--   * instructor answer-key fields on problems
--   * session resume fields
--   * seed content (HW7 related rates + per-student variants)
--   * DEMO-permissive RLS (this is an isolated sandbox module;
--     these tables never hold real Edvana user data)
--
-- New migration file only — existing migrations are untouched.
-- ============================================================

SET statement_timeout = 0;
SET client_min_messages = warning;
SET row_security = off;

-- ---------- Demo identities & roster ----------

CREATE TABLE IF NOT EXISTS "public"."whiteboard_demo_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "email" "text",
    "initials" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whiteboard_demo_users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whiteboard_demo_users_role_check" CHECK ("role" IN ('instructor', 'student'))
);
ALTER TABLE "public"."whiteboard_demo_users" OWNER TO "postgres";
COMMENT ON TABLE "public"."whiteboard_demo_users" IS 'Seeded demo identities (instructor/student) — the demo has no signup.';

CREATE TABLE IF NOT EXISTS "public"."whiteboard_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "title" "text" NOT NULL,
    "term" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whiteboard_courses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whiteboard_courses_instructor_fkey"
        FOREIGN KEY ("instructor_id") REFERENCES "public"."whiteboard_demo_users"("id") ON DELETE CASCADE
);
ALTER TABLE "public"."whiteboard_courses" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."whiteboard_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "whiteboard_enrollments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "whiteboard_enrollments_course_fkey"
        FOREIGN KEY ("course_id") REFERENCES "public"."whiteboard_courses"("id") ON DELETE CASCADE,
    CONSTRAINT "whiteboard_enrollments_student_fkey"
        FOREIGN KEY ("student_id") REFERENCES "public"."whiteboard_demo_users"("id") ON DELETE CASCADE,
    CONSTRAINT "whiteboard_enrollments_unique" UNIQUE ("course_id", "student_id")
);
ALTER TABLE "public"."whiteboard_enrollments" OWNER TO "postgres";

-- ---------- Answer-key fields on problems (instructor authoring) ----------

ALTER TABLE "public"."whiteboard_problems"
    ADD COLUMN IF NOT EXISTS "expected_answer" "text",
    ADD COLUMN IF NOT EXISTS "expected_steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    ADD COLUMN IF NOT EXISTS "solution_notes" "text",
    ADD COLUMN IF NOT EXISTS "answer_key_status" "text" DEFAULT 'draft'::"text" NOT NULL;

COMMENT ON COLUMN "public"."whiteboard_problems"."expected_steps" IS 'AI-drafted, instructor-approved solution steps: [{"expr": "...", "note": "..."}].';
COMMENT ON COLUMN "public"."whiteboard_problems"."answer_key_status" IS 'draft | approved — instructor must approve the AI-drafted key before publishing.';

-- ---------- Session resume fields ----------

ALTER TABLE "public"."whiteboard_sessions"
    ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp with time zone,
    ADD COLUMN IF NOT EXISTS "current_ask" "text",
    ADD COLUMN IF NOT EXISTS "reply_index" integer DEFAULT 0 NOT NULL;

COMMENT ON COLUMN "public"."whiteboard_sessions"."current_ask" IS 'Newest tutor question, kept in sync with the "Edvana is asking" card.';

-- ---------- Indexes ----------

CREATE INDEX IF NOT EXISTS "idx_whiteboard_courses_instructor" ON "public"."whiteboard_courses" ("instructor_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_enrollments_course" ON "public"."whiteboard_enrollments" ("course_id");
CREATE INDEX IF NOT EXISTS "idx_whiteboard_enrollments_student" ON "public"."whiteboard_enrollments" ("student_id");

-- ============================================================
-- DEMO-permissive RLS
-- The whiteboard_* tables are an isolated sandbox with seeded
-- (non-auth) identities, so we replace the strict, auth.uid()-based
-- policies with open policies scoped to these tables only. This is
-- explicitly a demo posture and must be revisited before any real
-- student data lives here.
-- ============================================================

DO $$
DECLARE
    t "text";
    demo_tables "text"[] := ARRAY[
        'whiteboard_assignments',
        'whiteboard_problems',
        'whiteboard_problem_variants',
        'whiteboard_sessions',
        'whiteboard_board_steps',
        'whiteboard_transcript_entries',
        'whiteboard_attachments',
        'whiteboard_session_tags',
        'whiteboard_objective_mastery',
        'whiteboard_demo_users',
        'whiteboard_courses',
        'whiteboard_enrollments'
    ];
    pol "record";
BEGIN
    FOREACH t IN ARRAY demo_tables LOOP
        EXECUTE format('ALTER TABLE "public"."%s" ENABLE ROW LEVEL SECURITY;', t);

        -- Drop every existing policy on the table (strict policies from the
        -- first migration, if present) so we can install the demo posture.
        FOR pol IN
            SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = t
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON "public"."%s";', pol.policyname, t);
        END LOOP;

        EXECUTE format(
            'CREATE POLICY "wb_demo_open" ON "public"."%s" TO "anon", "authenticated" USING (true) WITH CHECK (true);',
            t
        );

        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."%s" TO "anon", "authenticated";', t);
    END LOOP;
END $$;

-- ============================================================
-- Seed content (idempotent, fixed UUIDs)
-- ============================================================

-- Demo identities
INSERT INTO "public"."whiteboard_demo_users" ("id", "role", "full_name", "email", "initials") VALUES
    ('a0000000-0000-4000-8000-000000000001', 'instructor', 'Dr. Amara Osei', 'amara.osei@demo.edu', 'AO'),
    ('a0000000-0000-4000-8000-000000000002', 'student', 'Jordan Rivera', 'jordan.rivera@demo.edu', 'JR'),
    ('a0000000-0000-4000-8000-000000000003', 'student', 'Priya Shah', 'priya.shah@demo.edu', 'PS'),
    ('a0000000-0000-4000-8000-000000000004', 'student', 'Marcus Lee', 'marcus.lee@demo.edu', 'ML')
ON CONFLICT ("id") DO NOTHING;

-- Course + roster
INSERT INTO "public"."whiteboard_courses" ("id", "instructor_id", "code", "title", "term") VALUES
    ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
     'MATH 151 · Section 04', 'Calculus I', 'Fall 2026')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "public"."whiteboard_enrollments" ("course_id", "student_id") VALUES
    ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'),
    ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003'),
    ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004')
ON CONFLICT ("course_id", "student_id") DO NOTHING;

-- Published assignment: Homework 7 — Related rates
INSERT INTO "public"."whiteboard_assignments"
    ("id", "instructor_id", "course_id", "title", "subtitle", "status",
     "tutor_behavior", "work_modes", "reasoning_weight", "require_explanation",
     "probe_depth", "hint_budget", "variants_enabled", "student_count", "due_at", "published_at")
VALUES
    ('44000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-000000000001',
     'c0000000-0000-4000-8000-000000000001',
     'Homework 7 — Related rates',
     '5 problems · about 35 minutes · Dr. Amara Osei',
     'published',
     'socratic_only',
     ARRAY['talk','type','photo']::"public"."whiteboard_work_mode"[],
     70, true, 'standard', 0, true, 3,
     "now"() + interval '5 days', "now"())
ON CONFLICT ("id") DO NOTHING;

-- Problem 3 (the hero): inflating balloon, fully keyed & approved
INSERT INTO "public"."whiteboard_problems"
    ("id", "assignment_id", "position", "title", "concept", "prompt_template",
     "range_summary", "variant_ranges", "expected_answer", "expected_steps",
     "solution_notes", "answer_key_status")
VALUES
    ('55000000-0000-4000-8000-000000000003',
     '44000000-0000-4000-8000-000000000001',
     3, 'Inflating balloon', 'Related rates · spherical volume',
     'A spherical weather balloon is inflated at a rate of {rate} cm³/s. How fast is the radius increasing at the instant the radius is {r} cm?',
     'dV/dt ∈ [25, 60] cm³/s · r ∈ [4, 12] cm',
     '{"rate": {"min": 25, "max": 60}, "r": {"min": 4, "max": 12}}'::"jsonb",
     'dr/dt = {rate} / (4π·{r}²) cm/s',
     '[{"expr": "Given dV/dt = {rate} cm³/s, r = {r} cm; Find dr/dt", "note": "identify rates"},
       {"expr": "V = (4/3)πr³", "note": "volume of a sphere"},
       {"expr": "dV/dt = 4πr² · dr/dt", "note": "differentiate implicitly — chain rule is essential"},
       {"expr": "{rate} = 4π({r})² · dr/dt", "note": "substitute"},
       {"expr": "dr/dt = {rate} / (4π·{r}²) cm/s", "note": "solve; state units"}]'::"jsonb",
     'Key misconception: dropping the · dr/dt (chain rule) when differentiating V. A self-correction after one probe is a positive signal.',
     'approved')
ON CONFLICT ("id") DO NOTHING;

-- A few lighter sibling problems so the set looks real
INSERT INTO "public"."whiteboard_problems"
    ("id", "assignment_id", "position", "title", "concept", "prompt_template", "range_summary", "variant_ranges", "answer_key_status")
VALUES
    ('55000000-0000-4000-8000-000000000001', '44000000-0000-4000-8000-000000000001', 1, 'Sliding ladder', 'Pythagorean',
     'A {len} ft ladder slides down a wall; its base moves away at {rate} ft/s. How fast is the top sliding when the base is {x} ft out?',
     'Pythagorean · 2 variants of setup', '{"len":{"min":10,"max":20},"rate":{"min":1,"max":3},"x":{"min":4,"max":8}}'::"jsonb", 'approved'),
    ('55000000-0000-4000-8000-000000000002', '44000000-0000-4000-8000-000000000001', 2, 'Draining cone', 'Similar triangles',
     'Water drains from a conical tank at {rate} cm³/s. How fast is the depth falling when the water is {h} cm deep?',
     'Similar triangles · radius/height ratio varied', '{"rate":{"min":20,"max":80},"h":{"min":5,"max":15}}'::"jsonb", 'approved'),
    ('55000000-0000-4000-8000-000000000004', '44000000-0000-4000-8000-000000000001', 4, 'Walking shadow', 'Similar triangles',
     'A {height} ft person walks from a {lamp} ft lamppost at {rate} ft/s. How fast is the shadow tip moving?',
     'Lamp height and walk speed varied', '{"height":{"min":5,"max":6},"lamp":{"min":12,"max":18},"rate":{"min":3,"max":6}}'::"jsonb", 'approved'),
    ('55000000-0000-4000-8000-000000000005', '44000000-0000-4000-8000-000000000001', 5, 'Two cars at an intersection', 'Pythagorean',
     'Car A heads north at {a} mph, car B east at {b} mph from the same point. How fast is the distance between them growing after {t} h?',
     'Speeds and starting distances varied', '{"a":{"min":30,"max":60},"b":{"min":30,"max":60},"t":{"min":1,"max":3}}'::"jsonb", 'approved')
ON CONFLICT ("id") DO NOTHING;

-- Per-student variants for the balloon problem (mirror the integrity screen)
INSERT INTO "public"."whiteboard_problem_variants"
    ("problem_id", "student_id", "variant_label", "numbers", "prompt_text")
VALUES
    ('55000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', 'B-14',
     '{"rate": 40, "r": 8}'::"jsonb",
     'A spherical weather balloon is inflated at a rate of 40 cm³/s. How fast is the radius increasing at the instant the radius is 8 cm?'),
    ('55000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'B-27',
     '{"rate": 55, "r": 6}'::"jsonb",
     'A spherical weather balloon is inflated at a rate of 55 cm³/s. How fast is the radius increasing at the instant the radius is 6 cm?'),
    ('55000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004', 'B-31',
     '{"rate": 31, "r": 11}'::"jsonb",
     'A spherical weather balloon is inflated at a rate of 31 cm³/s. How fast is the radius increasing at the instant the radius is 11 cm?')
ON CONFLICT ("problem_id", "student_id") DO NOTHING;
