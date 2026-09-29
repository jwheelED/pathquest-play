/**
 * Hand-written types for the whiteboard_* demo tables.
 *
 * The generated src/integrations/supabase/types.ts is READ-ONLY and does not
 * include these tables, so this isolated module ships its own typed schema and
 * a dedicated Supabase client (see wbClient.ts). This keeps the module free of
 * `any` without touching generated files.
 */

export type WbRole = "instructor" | "student";
export type WorkMode = "talk" | "type" | "draw" | "photo";
export type AssignmentStatus = "draft" | "published" | "closed";
export type SessionStatus = "in_progress" | "recorded" | "graded";
export type Provenance =
  | "from_you"
  | "corrected"
  | "self_corrected"
  | "you_drew"
  | "answer";
export type Speaker = "ai" | "student";
export type TagType = "misconception" | "strength" | "pattern";

export type DemoUser = {
  id: string;
  role: WbRole;
  full_name: string;
  email: string | null;
  initials: string | null;
  created_at: string;
}

export type WbCourse = {
  id: string;
  instructor_id: string;
  code: string;
  title: string;
  term: string | null;
  created_at: string;
}

export type WbEnrollment = {
  id: string;
  course_id: string;
  student_id: string;
  created_at: string;
}

export type ExpectedStep = {
  expr: string;
  note: string;
}

export type VariantRange = {
  min: number;
  max: number;
}

export type WbAssignment = {
  id: string;
  instructor_id: string;
  course_id: string | null;
  org_id: string | null;
  title: string;
  subtitle: string | null;
  status: AssignmentStatus;
  tutor_behavior: string;
  work_modes: WorkMode[];
  reasoning_weight: number;
  answer_weight: number;
  require_explanation: boolean;
  probe_depth: string;
  hint_budget: number;
  variants_enabled: boolean;
  student_count: number;
  due_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export type WbProblem = {
  id: string;
  assignment_id: string;
  position: number;
  title: string;
  concept: string | null;
  prompt_template: string;
  range_summary: string | null;
  variant_ranges: Record<string, VariantRange>;
  expected_answer: string | null;
  expected_steps: ExpectedStep[];
  solution_notes: string | null;
  answer_key_status: "draft" | "approved";
  created_at: string;
  updated_at: string;
}

export type WbVariant = {
  id: string;
  problem_id: string;
  student_id: string;
  variant_label: string;
  numbers: Record<string, number>;
  prompt_text: string;
  created_at: string;
}

export type WbSession = {
  id: string;
  problem_id: string;
  variant_id: string | null;
  student_id: string;
  org_id: string | null;
  mode: WorkMode;
  status: SessionStatus;
  duration_seconds: number;
  probes_answered: number;
  hints_used: number;
  self_corrections: number;
  talk_seconds: number;
  words_written: number;
  suggested_score: number | null;
  final_score: number | null;
  graded_by: string | null;
  graded_at: string | null;
  started_at: string;
  recorded_at: string | null;
  last_activity_at: string | null;
  current_ask: string | null;
  reply_index: number;
  created_at: string;
  updated_at: string;
}

export type WbBoardStep = {
  id: string;
  session_id: string;
  position: number;
  at_seconds: number;
  content: string;
  provenance: Provenance;
  struck_through: boolean;
  highlighted: boolean;
  annotation: string | null;
  created_at: string;
}

export type WbTranscriptEntry = {
  id: string;
  session_id: string;
  position: number;
  at_seconds: number;
  speaker: Speaker;
  speaker_name: string | null;
  body: string;
  is_probe: boolean;
  created_at: string;
}

type Tbl<R> = { Row: R; Insert: Partial<R>; Update: Partial<R>; Relationships: [] };

export type WbDatabase = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      whiteboard_demo_users: Tbl<DemoUser>;
      whiteboard_courses: Tbl<WbCourse>;
      whiteboard_enrollments: Tbl<WbEnrollment>;
      whiteboard_assignments: Tbl<WbAssignment>;
      whiteboard_problems: Tbl<WbProblem>;
      whiteboard_problem_variants: Tbl<WbVariant>;
      whiteboard_sessions: Tbl<WbSession>;
      whiteboard_board_steps: Tbl<WbBoardStep>;
      whiteboard_transcript_entries: Tbl<WbTranscriptEntry>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
