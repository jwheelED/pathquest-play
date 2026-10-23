// Cadence rule for misconception-targeted auto questions.
// When the instructor's interval is reached, the auto question waits up to a
// grace window for a strong misconception to test. After the window it sends
// the best grounded question anyway, so pacing never drifts far.

/** Longest wait after the interval is reached before sending a best-effort question. */
export const MISCONCEPTION_GRACE_MS = 2 * 60 * 1000;

/** Grace window for a given interval (never longer than the interval itself). */
export function misconceptionGraceMs(intervalMs: number): number {
  return Math.min(MISCONCEPTION_GRACE_MS, Math.max(0, intervalMs));
}

/**
 * Whether the next auto question must target a real misconception.
 * `dueAt` is when the interval was first reached this cycle (0 = not yet).
 */
export function isMisconceptionRequired(dueAt: number, now: number, intervalMs: number): boolean {
  if (dueAt <= 0) return true;
  return now - dueAt < misconceptionGraceMs(intervalMs);
}

/** Generator error types that mean "keep waiting for a misconception", not a failure. */
/** Quality rejections that should also retry quietly while inside the grace window. */
export const GRACE_QUIET_RETRY_ERRORS = new Set([
  "fallback_format_mismatch",
  "no_relevant_fallback",
]);

export const MISCONCEPTION_WAIT_ERRORS = new Set([
  "no_misconception_opportunity",
  "missing_distractor_rationale",
]);
