import { describe, it, expect } from "vitest";
import { summarizeDelivery } from "../_shared/deliveryVerification.ts";

/**
 * BE-AP-7: delivery verification must cover the WHOLE cohort, not just the
 * first 10 students. These pin the pure aggregation the fan-out relies on.
 */
describe("summarizeDelivery", () => {
  it("reports complete when every expected student was delivered to", () => {
    const out = summarizeDelivery(["a", "b", "c"], ["a", "b", "c"]);
    expect(out).toEqual({ expected: 3, delivered: 3, missing: [], complete: true });
  });

  it("flags the missing tail of a large cohort", () => {
    const expected = Array.from({ length: 100 }, (_, i) => `s${i}`);
    const delivered = expected.slice(0, 90); // last 10 never landed
    const out = summarizeDelivery(expected, delivered);
    expect(out.expected).toBe(100);
    expect(out.delivered).toBe(90);
    expect(out.missing).toHaveLength(10);
    expect(out.missing).toContain("s99");
    expect(out.complete).toBe(false);
  });

  it("handles zero delivered rows", () => {
    const out = summarizeDelivery(["a", "b"], []);
    expect(out.delivered).toBe(0);
    expect(out.missing.sort()).toEqual(["a", "b"]);
    expect(out.complete).toBe(false);
  });

  it("dedupes delivered ids so a duplicate row can't fake completeness", () => {
    // 'a' delivered twice, 'b' never — must NOT count as 2/2 complete.
    const out = summarizeDelivery(["a", "b"], ["a", "a"]);
    expect(out.delivered).toBe(1);
    expect(out.missing).toEqual(["b"]);
    expect(out.complete).toBe(false);
  });

  it("ignores stray delivered ids outside the expected cohort", () => {
    const out = summarizeDelivery(["a", "b"], ["a", "b", "zzz"]);
    expect(out.expected).toBe(2);
    expect(out.delivered).toBe(2);
    expect(out.complete).toBe(true);
  });

  it("treats an empty expected cohort as complete", () => {
    const out = summarizeDelivery([], []);
    expect(out).toEqual({ expected: 0, delivered: 0, missing: [], complete: true });
  });

  it("dedupes expected ids when counting", () => {
    const out = summarizeDelivery(["a", "a", "b"], ["a", "b"]);
    expect(out.expected).toBe(2);
    expect(out.complete).toBe(true);
  });
});
