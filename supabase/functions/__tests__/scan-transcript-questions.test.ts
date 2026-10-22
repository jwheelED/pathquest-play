import { describe, it, expect } from "vitest";
import { parseScanResult, buildScanMessages } from "../scan-transcript-questions/scanner.ts";

const good = {
  detected: true,
  question: "Who wrote the Emancipation Proclamation?",
  options: ["Abraham Lincoln", "Frederick Douglass", "Ulysses S. Grant", "Andrew Johnson"],
  correct_answer: "A",
};

describe("parseScanResult", () => {
  it("passes through detected:false", () => {
    expect(parseScanResult({ detected: false }, "multiple_choice")).toEqual({ detected: false });
  });

  it("keeps a valid MCQ with its choices and correct answer", () => {
    const r = parseScanResult(good, "multiple_choice");
    expect(r.detected).toBe(true);
    if (r.detected) {
      expect(r.options).toHaveLength(4);
      expect(r.correctAnswer).toBe("A");
    }
  });

  it("drops choices containing 'None of the above'", () => {
    const r = parseScanResult({ ...good, options: [...good.options.slice(0, 3), "None of the above"] }, "multiple_choice");
    expect(r.detected && r.options).toBeFalsy();
  });

  it("drops MCQ choices when the correct answer is missing", () => {
    const { correct_answer: _c, ...noAnswer } = good;
    const r = parseScanResult(noAnswer, "multiple_choice");
    expect(r.detected && r.options).toBeFalsy();
  });

  it("forces the instructor's format preference", () => {
    const r = parseScanResult({ ...good, format: "multiple_choice", expected_answer: "Lincoln" }, "short_answer");
    expect(r.detected && r.format).toBe("short_answer");
  });

  it("puts only new speech in the NEW SPEECH section", () => {
    const [, user] = buildScanMessages({ contextText: "old part", newText: "Why?", recentlySent: [] });
    expect(user.content).toContain("NEW SPEECH:\nWhy?");
  });
});
