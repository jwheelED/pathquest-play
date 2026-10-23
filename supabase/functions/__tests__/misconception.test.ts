import { describe, it, expect } from "vitest";
import {
  checkMisconception,
  shuffleWithMisconceptions,
  MIN_MISCONCEPTION_SCORE,
} from "../generate-interval-question/misconception.ts";

const mcq = {
  question_text: "A ball is thrown straight up. At the very top, what is its acceleration?",
  options: ["A. 9.8 m/s² downward", "B. Zero", "C. 9.8 m/s² upward", "D. It depends on its speed"],
  correct_answer: "A",
  target_concept: "Acceleration vs velocity",
  target_misconception: "Zero velocity means zero acceleration",
  misconception_score: 0.9,
  distractor_misconceptions: {
    B: "Zero velocity means zero acceleration",
    C: "Acceleration points in the direction of motion",
    D: "Acceleration depends on speed",
  },
};

describe("checkMisconception", () => {
  it("accepts a strong misconception with every wrong choice explained", () => {
    const r = checkMisconception(mcq, "multiple_choice", true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.meta!.distractor_misconceptions).sort()).toEqual(["B", "C", "D"]);
  });

  it("waits when the misconception score is below the minimum during the grace window", () => {
    const r = checkMisconception({ ...mcq, misconception_score: MIN_MISCONCEPTION_SCORE - 0.1 }, "multiple_choice", true);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error_type).toBe("no_misconception_opportunity");
  });

  it("waits when a wrong choice has no misconception behind it", () => {
    const r = checkMisconception(
      { ...mcq, distractor_misconceptions: { B: "x", C: "y" } },
      "multiple_choice",
      true,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error_type).toBe("missing_distractor_rationale");
  });

  it("sends a best-effort question after the grace window even with a weak misconception", () => {
    const r = checkMisconception({ ...mcq, misconception_score: 0.2 }, "multiple_choice", false);
    expect(r.ok).toBe(true);
  });

  it("rejects 'None of the above' choices even after the grace window", () => {
    const r = checkMisconception(
      { ...mcq, options: [...mcq.options.slice(0, 3), "D. None of the above"] },
      "multiple_choice",
      false,
    );
    expect(r.ok).toBe(false);
  });
});

describe("shuffleWithMisconceptions", () => {
  it("keeps each misconception attached to its choice after shuffling", () => {
    // rand=0 swaps every item with index 0 -> deterministic reorder
    const r = shuffleWithMisconceptions(mcq.options, "A", mcq.distractor_misconceptions, () => 0)!;
    const correctText = r.options.find((o) => o.startsWith(`${r.correct_answer}.`));
    expect(correctText).toContain("9.8 m/s² downward");
    const zeroLetter = r.options.find((o) => o.endsWith("Zero"))!.charAt(0);
    expect(r.distractor_misconceptions[zeroLetter]).toBe("Zero velocity means zero acceleration");
    expect(r.distractor_misconceptions[r.correct_answer]).toBeUndefined();
  });
});
