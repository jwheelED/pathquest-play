// Pure derivation logic for the instructor Students tab: turns raw rows
// (lecture progress, check-in assignments, activity dates) into per-student
// participation/comprehension metrics and attention signals.
//
// Thresholds deliberately mirror the admin side so instructor and admin views
// agree on who needs help: misconception cutoffs come from lib/misconceptions,
// and the inactivity/grade boundaries match calculateRiskScore
// (components/admin/AtRiskStudentsTable). We don't call calculateRiskScore
// directly — it's shaped around org-wide admin inputs.

import type { Json } from "@/integrations/supabase/types";
import {
  MISCONCEPTION_MIN_RESPONSES,
  MISCONCEPTION_MAX_CORRECT_RATE,
} from "@/lib/misconceptions";

export interface AttentionSignal {
  label: string;
  weight: number;
  detail?: string;
}

export type StudentStatus = "needs-attention" | "quiet" | "on-track" | "new";

export type ConfidenceLevel = "absolutely_sure" | "pretty_sure" | "maybe" | "not_sure";

const CONFIDENT_LEVELS: ReadonlySet<string> = new Set(["absolutely_sure", "pretty_sure"]);

/** Short-answer entries carry a numeric grade instead of a boolean `correct`;
 * a grade at or above this counts as a correct response. */
export const GRADE_CORRECT_THRESHOLD = 70;

/** Signal score at or above which a student is flagged "needs-attention". */
export const ATTENTION_SCORE_THRESHOLD = 4;

const QUIET_DAYS = 7;

export interface ParsedResponse {
  pausePointId: string;
  answer: string;
  correct: boolean | null;
  grade: number | null;
  confidence: ConfidenceLevel | null;
  feedback: string | null;
  timestamp: string | null;
}

export interface RosterStudent {
  id: string;
  name: string;
  isSeed: boolean;
  lastActiveAt: string | null;
  checkIns: { avg: number; n: number } | null;
  videos: { started: number; completed: number; published: number };
  comprehension: { correctRate: number; n: number } | null;
  confidentWrongCount: number;
  status: StudentStatus;
  signals: AttentionSignal[];
  signalScore: number;
  suggestedAction: string | null;
}

// ---- raw row shapes (narrow slices of the Supabase rows the hooks select) ----

export interface LectureProgressInput {
  lecture_video_id: string;
  responses: Json | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface CheckInInput {
  grade: number | null;
  completed: boolean | null;
  opened_at: string | null;
}

export interface DeriveStudentInput {
  id: string;
  name: string;
  lastActivityDate: string | null; // user_stats.last_activity_date
  enrolledAt: string | null; // instructor_students.created_at
  checkIns: CheckInInput[];
  lectureProgress: LectureProgressInput[];
  publishedVideoCount: number;
  now?: Date; // injectable for tests
}

// ---- parsing ----

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asConfidence(v: unknown): ConfidenceLevel | null {
  return v === "absolutely_sure" || v === "pretty_sure" || v === "maybe" || v === "not_sure"
    ? v
    : null;
}

/** Narrow guard over student_lecture_progress.responses: a JSONB map of
 * pausePointId → { grade?, answer, correct?, feedback?, confidence?, timestamp? }. */
export function parseResponses(json: Json | null): ParsedResponse[] {
  if (!isRecord(json)) return [];
  const out: ParsedResponse[] = [];
  for (const [pausePointId, raw] of Object.entries(json)) {
    if (!isRecord(raw)) continue;
    out.push({
      pausePointId,
      answer: typeof raw.answer === "string" ? raw.answer : "",
      correct: typeof raw.correct === "boolean" ? raw.correct : null,
      grade: typeof raw.grade === "number" ? raw.grade : null,
      confidence: asConfidence(raw.confidence),
      feedback: typeof raw.feedback === "string" ? raw.feedback : null,
      timestamp: typeof raw.timestamp === "string" ? raw.timestamp : null,
    });
  }
  return out;
}

/** A response counts toward comprehension if it has a boolean `correct` (MCQ)
 * or a numeric `grade` (short answer, correct at ≥ GRADE_CORRECT_THRESHOLD). */
export function isCountable(r: ParsedResponse): boolean {
  return r.correct !== null || r.grade !== null;
}

export function isCorrectResponse(r: ParsedResponse): boolean {
  if (r.correct !== null) return r.correct;
  return r.grade !== null && r.grade >= GRADE_CORRECT_THRESHOLD;
}

export function isConfidentWrong(r: ParsedResponse): boolean {
  return r.correct === false && r.confidence !== null && CONFIDENT_LEVELS.has(r.confidence);
}

// ---- derivation ----

const DAY_MS = 24 * 60 * 60 * 1000;

function latestDate(candidates: Array<string | null | undefined>): string | null {
  let best: number | null = null;
  let bestStr: string | null = null;
  for (const c of candidates) {
    if (!c) continue;
    const t = new Date(c).getTime();
    if (Number.isNaN(t)) continue;
    if (best === null || t > best) {
      best = t;
      bestStr = c;
    }
  }
  return bestStr;
}

export function deriveRosterStudent(input: DeriveStudentInput, isSeed: boolean): RosterStudent {
  const now = input.now ?? new Date();

  const responses = input.lectureProgress.flatMap(lp => parseResponses(lp.responses));

  const countable = responses.filter(isCountable);
  const correctCount = countable.filter(isCorrectResponse).length;
  const comprehension =
    countable.length > 0
      ? { correctRate: Math.round((correctCount / countable.length) * 100), n: countable.length }
      : null;
  const confidentWrongCount = responses.filter(isConfidentWrong).length;

  const grades = input.checkIns
    .map(c => c.grade)
    .filter((g): g is number => g !== null);
  const checkIns =
    grades.length > 0
      ? { avg: Math.round(grades.reduce((a, b) => a + b, 0) / grades.length), n: grades.length }
      : null;

  const started = input.lectureProgress.length;
  const completed = input.lectureProgress.filter(lp => lp.completed_at !== null).length;
  const videos = { started, completed, published: input.publishedVideoCount };

  const lastActiveAt = latestDate([
    input.lastActivityDate,
    ...input.lectureProgress.flatMap(lp => [lp.started_at, lp.completed_at]),
    ...responses.map(r => r.timestamp),
    ...input.checkIns.map(c => c.opened_at),
  ]);

  const daysSinceActive =
    lastActiveAt !== null
      ? Math.floor((now.getTime() - new Date(lastActiveAt).getTime()) / DAY_MS)
      : null;
  const daysSinceEnrolled =
    input.enrolledAt !== null
      ? Math.floor((now.getTime() - new Date(input.enrolledAt).getTime()) / DAY_MS)
      : null;

  // ---- attention signals ----
  const signals: AttentionSignal[] = [];

  if (daysSinceActive !== null && daysSinceActive >= QUIET_DAYS) {
    signals.push({
      label: `Inactive ${daysSinceActive} days`,
      weight: 2,
      detail: "No recorded activity in over a week",
    });
  }

  if (checkIns && checkIns.n >= 2) {
    if (checkIns.avg < 60) {
      signals.push({
        label: `Check-in average ${checkIns.avg}%`,
        weight: 3,
        detail: `Across ${checkIns.n} check-ins`,
      });
    } else if (checkIns.avg < 70) {
      signals.push({
        label: `Check-in average ${checkIns.avg}%`,
        weight: 2,
        detail: `Across ${checkIns.n} check-ins`,
      });
    }
  }

  if (
    comprehension &&
    comprehension.n >= MISCONCEPTION_MIN_RESPONSES &&
    comprehension.correctRate < MISCONCEPTION_MAX_CORRECT_RATE
  ) {
    signals.push({
      label: `${comprehension.correctRate}% correct on lecture questions`,
      weight: 2,
      detail: `${comprehension.n} responses`,
    });
  }

  if (confidentWrongCount >= 2) {
    signals.push({
      label: `${confidentWrongCount} confident-but-wrong answers`,
      weight: 2,
      detail: "Answered wrong while sure of the answer",
    });
  }

  if (
    videos.published >= 2 &&
    started === 0 &&
    daysSinceEnrolled !== null &&
    daysSinceEnrolled > 7
  ) {
    signals.push({
      label: "Hasn't started any assigned videos",
      weight: 1,
      detail: `${videos.published} published in this course`,
    });
  }

  const missedCheckIns = input.checkIns.filter(c => c.completed === false).length;
  if (missedCheckIns >= 2) {
    signals.push({
      label: `${missedCheckIns} missed check-ins`,
      weight: 1,
    });
  }

  const signalScore = signals.reduce((s, sig) => s + sig.weight, 0);

  // ---- status ----
  const hasAnyData = (checkIns?.n ?? 0) > 0 || started > 0 || countable.length > 0;
  let status: StudentStatus;
  if (!hasAnyData) {
    // Nothing to judge — never "at risk" on zero data.
    status = "new";
  } else if (signalScore >= ATTENTION_SCORE_THRESHOLD) {
    status = "needs-attention";
  } else if (daysSinceActive === null || daysSinceActive >= QUIET_DAYS) {
    status = "quiet";
  } else {
    status = "on-track";
  }

  // ---- suggested action: dominant (highest-weight) signal decides ----
  let suggestedAction: string | null = null;
  if (signals.length > 0) {
    const dominant = [...signals].sort((a, b) => b.weight - a.weight)[0];
    if (dominant.label.startsWith("Inactive")) suggestedAction = "Send a check-in message";
    else if (dominant.label.startsWith("Check-in average")) suggestedAction = "Review their check-in answers";
    else if (dominant.label.includes("correct on lecture questions")) suggestedAction = "Revisit this material in your next lecture";
    else if (dominant.label.includes("confident-but-wrong")) suggestedAction = "Address the misconception — release answer explanations";
    else if (dominant.label.startsWith("Hasn't started")) suggestedAction = "Remind them about assigned videos";
    else if (dominant.label.includes("missed check-ins")) suggestedAction = "Flag for follow-up";
  }

  return {
    id: input.id,
    name: input.name,
    isSeed,
    lastActiveAt,
    checkIns,
    videos,
    comprehension,
    confidentWrongCount,
    status,
    signals,
    signalScore,
    suggestedAction,
  };
}

/** Default roster ordering: students needing eyes first. */
export const STATUS_PRIORITY: Record<StudentStatus, number> = {
  "needs-attention": 0,
  quiet: 1,
  new: 2,
  "on-track": 3,
};

export function compareByAttention(a: RosterStudent, b: RosterStudent): number {
  const p = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
  if (p !== 0) return p;
  if (b.signalScore !== a.signalScore) return b.signalScore - a.signalScore;
  return a.name.localeCompare(b.name);
}
