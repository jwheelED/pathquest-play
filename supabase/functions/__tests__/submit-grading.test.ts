import { describe, it, expect } from "vitest";
import { normalizeAnswer, calculatePoints } from "../submit-live-response/grading.ts";

const OPTS = ["A. 106 bones", "B. 206 bones", "C. 306 bones", "D. 406 bones"];

describe("normalizeAnswer", () => {
  it("returns trimmed text unchanged for non-MCQ", () => {
    expect(normalizeAnswer("  the mitochondria ", "short_answer")).toBe("the mitochondria");
  });

  it("uppercases a bare letter", () => {
    expect(normalizeAnswer("b", "multiple_choice", OPTS)).toBe("B");
  });

  it("extracts the letter from a prefixed answer", () => {
    expect(normalizeAnswer("C) something", "multiple_choice", OPTS)).toBe("C");
    expect(normalizeAnswer("D. text", "multiple_choice", OPTS)).toBe("D");
  });

  it("matches full option text to its letter", () => {
    expect(normalizeAnswer("206 bones", "multiple_choice", OPTS)).toBe("B");
  });

  it("matches a unique numeric token to its letter", () => {
    expect(normalizeAnswer("206", "multiple_choice", OPTS)).toBe("B");
  });

  it("does NOT guess from the first character of a word (regression)", () => {
    // "Bones" must not be read as "B".
    expect(normalizeAnswer("Bones", "multiple_choice", OPTS)).toBe("Bones");
  });

  it("returns the input when nothing matches", () => {
    expect(normalizeAnswer("zzz", "multiple_choice", OPTS)).toBe("zzz");
  });
});

describe("calculatePoints", () => {
  it("awards base×multiplier when correct", () => {
    expect(calculatePoints(true, "low")).toEqual({ points: 10, multiplier: 1 });
    expect(calculatePoints(true, "medium")).toEqual({ points: 20, multiplier: 2 });
    expect(calculatePoints(true, "high")).toEqual({ points: 30, multiplier: 3 });
    expect(calculatePoints(true, null)).toEqual({ points: 10, multiplier: 1 });
  });

  it("penalizes confident wrong answers", () => {
    expect(calculatePoints(false, "high")).toEqual({ points: -15, multiplier: 3 });
    expect(calculatePoints(false, "medium")).toEqual({ points: -5, multiplier: 2 });
    expect(calculatePoints(false, "low")).toEqual({ points: 0, multiplier: 1 });
    expect(calculatePoints(false, null)).toEqual({ points: 0, multiplier: 1 });
  });
});
