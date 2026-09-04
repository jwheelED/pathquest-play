/** Data access for the whiteboard demo (reads via hooks, writes via helpers). */
import { useQuery } from "@tanstack/react-query";
import { wb, wbInvoke } from "./wbClient";
import {
  generateNumbers,
  interpolate,
  variantLabel,
} from "./variantGen";
import type {
  WbAssignment,
  WbBoardStep,
  WbCourse,
  WbProblem,
  WbSession,
  WbTranscriptEntry,
  WbVariant,
  WorkMode,
  Provenance,
  ExpectedStep,
} from "./wbTypes";

/* ---------------- Reads ---------------- */

export function useInstructorCourse(instructorId: string | undefined) {
  return useQuery({
    queryKey: ["wb", "course", instructorId],
    enabled: !!instructorId,
    queryFn: async (): Promise<WbCourse | null> => {
      const { data, error } = await wb
        .from("whiteboard_courses")
        .select("*")
        .eq("instructor_id", instructorId!)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as WbCourse | null) ?? null;
    },
  });
}

export function useStudentCourse(studentId: string | undefined) {
  return useQuery({
    queryKey: ["wb", "student-course", studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<WbCourse | null> => {
      const { data: enr, error: e1 } = await wb
        .from("whiteboard_enrollments")
        .select("course_id")
        .eq("student_id", studentId!)
        .limit(1)
        .maybeSingle();
      if (e1) throw e1;
      if (!enr) return null;
      const { data, error } = await wb
        .from("whiteboard_courses")
        .select("*")
        .eq("id", enr.course_id!)
        .maybeSingle();
      if (error) throw error;
      return (data as WbCourse | null) ?? null;
    },
  });
}

export function useAssignments(courseId: string | undefined, publishedOnly: boolean) {
  return useQuery({
    queryKey: ["wb", "assignments", courseId, publishedOnly],
    enabled: !!courseId,
    queryFn: async (): Promise<WbAssignment[]> => {
      let q = wb.from("whiteboard_assignments").select("*").eq("course_id", courseId!);
      if (publishedOnly) q = q.eq("status", "published");
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WbAssignment[];
    },
  });
}

export function useProblems(assignmentId: string | undefined) {
  return useQuery({
    queryKey: ["wb", "problems", assignmentId],
    enabled: !!assignmentId,
    queryFn: async (): Promise<WbProblem[]> => {
      const { data, error } = await wb
        .from("whiteboard_problems")
        .select("*")
        .eq("assignment_id", assignmentId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WbProblem[];
    },
  });
}

export function useSessionBundle(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["wb", "session-bundle", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const [steps, transcript] = await Promise.all([
        wb.from("whiteboard_board_steps").select("*").eq("session_id", sessionId!).order("position"),
        wb
          .from("whiteboard_transcript_entries")
          .select("*")
          .eq("session_id", sessionId!)
          .order("position"),
      ]);
      if (steps.error) throw steps.error;
      if (transcript.error) throw transcript.error;
      return {
        steps: (steps.data ?? []) as WbBoardStep[],
        transcript: (transcript.data ?? []) as WbTranscriptEntry[],
      };
    },
  });
}

/* ---------------- Writes / helpers ---------------- */

/** Get or create this student's variant for a problem. */
export async function ensureVariant(problem: WbProblem, studentId: string): Promise<WbVariant> {
  const existing = await wb
    .from("whiteboard_problem_variants")
    .select("*")
    .eq("problem_id", problem.id)
    .eq("student_id", studentId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as WbVariant;

  const numbers = generateNumbers(problem.variant_ranges, studentId, problem.id);
  const insert = {
    problem_id: problem.id,
    student_id: studentId,
    variant_label: variantLabel(studentId, problem.id),
    numbers,
    prompt_text: interpolate(problem.prompt_template, numbers),
  };
  const { data, error } = await wb
    .from("whiteboard_problem_variants")
    .insert(insert)
    .select("*")
    .single();
  if (error) throw error;
  return data as WbVariant;
}

/** Get the in-progress/recorded session for (student, problem) or create one. */
export async function ensureSession(
  problem: WbProblem,
  studentId: string,
  variant: WbVariant,
  mode: WorkMode,
): Promise<WbSession> {
  const existing = await wb
    .from("whiteboard_sessions")
    .select("*")
    .eq("problem_id", problem.id)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as WbSession;

  const { data, error } = await wb
    .from("whiteboard_sessions")
    .insert({
      problem_id: problem.id,
      student_id: studentId,
      variant_id: variant.id,
      mode,
      status: "in_progress",
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as WbSession;
}

export interface TutorTurn {
  board_step: null | {
    expr: string;
    provenance: Provenance;
    struck: boolean;
    annotation: string | null;
  };
  reply: string;
  misconception: null | { body: string };
  is_probe: boolean;
  accepted: boolean;
}

export async function callTutorTurn(args: {
  problemText: string;
  expectedAnswer: string | null;
  expectedSteps: ExpectedStep[];
  solutionNotes: string | null;
  board: { expr: string; provenance: string }[];
  transcript: { who: "you" | "ai"; text: string }[];
  studentMessage: string;
  mode: WorkMode;
}): Promise<TutorTurn> {
  const res = await wbInvoke<{ turn: TutorTurn }>("wb-tutor-turn", args);
  return res.turn;
}

/** Persist one student turn: student line, optional board step, tutor reply. */
export async function persistTurn(args: {
  session: WbSession;
  studentName: string;
  studentMessage: string;
  clockSeconds: number;
  nextPositionBoard: number;
  nextPositionTranscript: number;
  turn: TutorTurn;
}): Promise<void> {
  const { session, turn } = args;
  const tPos = args.nextPositionTranscript;

  const inserts: Promise<unknown>[] = [];

  inserts.push(
    wb.from("whiteboard_transcript_entries").insert({
      session_id: session.id,
      position: tPos,
      at_seconds: args.clockSeconds + 22,
      speaker: "student",
      speaker_name: args.studentName,
      body: args.studentMessage,
    }) as unknown as Promise<unknown>,
  );

  if (turn.board_step) {
    inserts.push(
      wb.from("whiteboard_board_steps").insert({
        session_id: session.id,
        position: args.nextPositionBoard,
        at_seconds: args.clockSeconds + 22,
        content: turn.board_step.expr,
        provenance: turn.board_step.provenance,
        struck_through: turn.board_step.struck,
        annotation: turn.board_step.annotation,
      }) as unknown as Promise<unknown>,
    );
  }

  inserts.push(
    wb.from("whiteboard_transcript_entries").insert({
      session_id: session.id,
      position: tPos + 1,
      at_seconds: args.clockSeconds + 28,
      speaker: "ai",
      speaker_name: "Edvana",
      body: turn.reply,
      is_probe: turn.is_probe,
    }) as unknown as Promise<unknown>,
  );

  await Promise.all(inserts);

  await wb
    .from("whiteboard_sessions")
    .update({
      current_ask: turn.reply,
      probes_answered: session.probes_answered + (turn.is_probe ? 1 : 0),
      self_corrections:
        session.self_corrections +
        (turn.board_step?.provenance === "self_corrected" ? 1 : 0),
      words_written: session.words_written + args.studentMessage.trim().split(/\s+/).length,
      last_activity_at: new Date().toISOString(),
    })
    .eq("id", session.id);
}

export async function finishSession(sessionId: string): Promise<void> {
  const { error } = await wb
    .from("whiteboard_sessions")
    .update({ status: "recorded", recorded_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw error;
}

/* ---------------- Instructor authoring ---------------- */

export interface AuthorDraft {
  title: string;
  concept: string;
  prompt_template: string;
  range_summary: string;
  variant_ranges: Record<string, { min: number; max: number }>;
  expected_answer: string;
  expected_steps: ExpectedStep[];
  solution_notes: string;
  suggested_reasoning_weight: number;
}

export async function callAuthorDraft(problemText: string, title?: string): Promise<AuthorDraft> {
  const res = await wbInvoke<{ draft: AuthorDraft }>("wb-author-draft", { problemText, title });
  return res.draft;
}

export async function createAssignment(args: {
  instructorId: string;
  courseId: string;
  title: string;
  reasoningWeight: number;
  workModes: WorkMode[];
}): Promise<WbAssignment> {
  const { data, error } = await wb
    .from("whiteboard_assignments")
    .insert({
      instructor_id: args.instructorId,
      course_id: args.courseId,
      title: args.title,
      status: "draft",
      reasoning_weight: args.reasoningWeight,
      work_modes: args.workModes,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as WbAssignment;
}

export async function addProblem(args: {
  assignmentId: string;
  position: number;
  draft: AuthorDraft;
  approved: boolean;
}): Promise<WbProblem> {
  const d = args.draft;
  const { data, error } = await wb
    .from("whiteboard_problems")
    .insert({
      assignment_id: args.assignmentId,
      position: args.position,
      title: d.title,
      concept: d.concept,
      prompt_template: d.prompt_template,
      range_summary: d.range_summary,
      variant_ranges: d.variant_ranges,
      expected_answer: d.expected_answer,
      expected_steps: d.expected_steps,
      solution_notes: d.solution_notes,
      answer_key_status: args.approved ? "approved" : "draft",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as WbProblem;
}

export async function publishAssignment(assignmentId: string, studentCount: number): Promise<void> {
  const { error } = await wb
    .from("whiteboard_assignments")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      student_count: studentCount,
    })
    .eq("id", assignmentId);
  if (error) throw error;
}
