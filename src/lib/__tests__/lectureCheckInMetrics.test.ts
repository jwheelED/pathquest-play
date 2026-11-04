import { describe, it, expect } from "vitest";
import { distinctStudentCount, studentCompletion, type CheckInRow } from "@/lib/lectureCheckInMetrics";

// Build N students × Q questions worth of rows (one row per student per
// question), mirroring what `format-and-send-question` writes.
function rows(students: number, questions: number, completedStudentIdxs: number[] = []): CheckInRow[] {
  const out: CheckInRow[] = [];
  for (let s = 0; s < students; s++) {
    for (let q = 0; q < questions; q++) {
      out.push({ student_id: `stu-${s}`, completed: completedStudentIdxs.includes(s) });
    }
  }
  return out;
}

describe("distinctStudentCount", () => {
  it("counts distinct students, NOT rows (regression: 2 questions × 9 students must be 9, not 18)", () => {
    expect(distinctStudentCount(rows(9, 2))).toBe(9);
  });

  it("equals the student count when there is one question", () => {
    expect(distinctStudentCount(rows(9, 1))).toBe(9);
  });

  it("is 0 for an empty group", () => {
    expect(distinctStudentCount([])).toBe(0);
  });
});

describe("studentCompletion", () => {
  it("total is distinct students, not rows", () => {
    expect(studentCompletion(rows(9, 2)).total).toBe(9);
  });

  it("a student is complete only when ALL their questions are answered", () => {
    // 3 students × 2 questions; only student 0 has both rows completed.
    const r = rows(3, 2, [0]);
    // student 1: complete one of two questions → not complete
    r[2].completed = true; // stu-1, question 0 only
    const out = studentCompletion(r);
    expect(out).toEqual({ complete: 1, total: 3 });
  });

  it("counts every fully-done student", () => {
    expect(studentCompletion(rows(5, 2, [0, 1, 2, 3, 4]))).toEqual({ complete: 5, total: 5 });
  });

  it("reports zero complete when nobody finished", () => {
    expect(studentCompletion(rows(9, 2))).toEqual({ complete: 0, total: 9 });
  });

  it("is {0,0} for an empty group", () => {
    expect(studentCompletion([])).toEqual({ complete: 0, total: 0 });
  });
});
