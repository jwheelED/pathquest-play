// Shared misconception helpers so the org-wide Learning Insights (useAdminDashboardData)
// and the per-course "Top misconception this week" drilldown (AdminDashboard course
// engagement) stay consistent. Keep thresholds in ONE place to prevent drift.

/** Statistical floor: ignore questions with fewer responses than this. */
export const MISCONCEPTION_MIN_RESPONSES = 3;
/** A question is a "misconception" when its correct rate is below this percent. */
export const MISCONCEPTION_MAX_CORRECT_RATE = 50;

/** Parse the canonical question text out of a live_questions.question_content value. */
export function parseQuestionText(questionContent: unknown): string {
  if (questionContent && typeof questionContent === "object") {
    const obj = questionContent as Record<string, unknown>;
    const text = obj.question ?? obj.text;
    if (typeof text === "string" && text.length > 0) return text;
    return "Unknown question";
  }
  return String(questionContent);
}

/** Truncate to the shared 80-char display length used across misconception views. */
export function truncateQuestionText(text: string, max = 80): string {
  return text.length > max ? text.substring(0, max) + "..." : text;
}
