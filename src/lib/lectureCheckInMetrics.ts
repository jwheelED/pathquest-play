// Pure metrics helpers for the instructor live check-in results.
//
// A live question creates ONE `student_assignments` row per student per
// question, so a ~5-minute "group" holds (students × questions) rows. Rendering
// that array length as the student count double-counts — e.g. a 2-question
// session sent to 9 students showed "18 student(s)". These helpers derive
// DISTINCT-student figures instead. Kept pure + import-free so they're
// unit-testable (regression guard).

export interface CheckInRow {
  student_id: string;
  completed?: boolean | null;
}

/** Number of DISTINCT students across the rows (not the raw row count). */
export function distinctStudentCount(rows: ReadonlyArray<CheckInRow>): number {
  return new Set(rows.map((r) => r.student_id)).size;
}

/**
 * Per-student completion. A student counts as "complete" only when EVERY one of
 * their rows (every question they were sent) is completed. `total` is the number
 * of distinct students — so `complete`/`total` reads naturally next to the
 * "N student(s)" label.
 */
export function studentCompletion(
  rows: ReadonlyArray<CheckInRow>,
): { complete: number; total: number } {
  const allDoneByStudent = new Map<string, boolean>();
  for (const r of rows) {
    const prev = allDoneByStudent.get(r.student_id);
    const done = r.completed === true;
    allDoneByStudent.set(r.student_id, prev === undefined ? done : prev && done);
  }
  let complete = 0;
  for (const allDone of allDoneByStudent.values()) {
    if (allDone) complete++;
  }
  return { complete, total: allDoneByStudent.size };
}
