import { describe, it, expect } from "vitest";
import { buildThemes, shouldRegroup } from "../group-live-answers/themes.ts";

const rows = ["a", "b", "c", "d"].map((x, i) => ({ id: `r${i}`, answer: x }));

describe("group-live-answers themes", () => {
  it("counts every answer exactly once, unmatched ones under Other", () => {
    const t = buildThemes({ themes: [{ label: "Big idea", answer_numbers: [1, 2, 2, 99] }] }, rows);
    expect(t.map((x) => [x.label, x.count])).toEqual([["Big idea", 2], ["Other", 2]]);
  });
  it("does not group fewer than 3 answers", () => {
    expect(shouldRegroup(null, 2)).toBe(false);
    expect(shouldRegroup(null, 3)).toBe(true);
  });
  it("regroups after 5 new answers even within 10 seconds, not for 1 new answer", () => {
    const now = Date.now();
    const stored = { response_count: 10, updated_at: new Date(now - 2000).toISOString() };
    expect(shouldRegroup(stored, 11, now)).toBe(false);
    expect(shouldRegroup(stored, 15, now)).toBe(true);
  });
});
