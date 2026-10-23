import { describe, it, expect } from "vitest";
import { isMisconceptionRequired } from "../misconceptionCadence";

const FIVE_MIN = 5 * 60 * 1000;

describe("misconception cadence", () => {
  it("requires a misconception right when the interval is reached", () => {
    expect(isMisconceptionRequired(1_000, 1_000, FIVE_MIN)).toBe(true);
  });

  it("still requires one 90 seconds after the interval", () => {
    expect(isMisconceptionRequired(1_000, 1_000 + 90_000, FIVE_MIN)).toBe(true);
  });

  it("sends a best-effort question once 2 minutes have passed", () => {
    expect(isMisconceptionRequired(1_000, 1_000 + 120_000, FIVE_MIN)).toBe(false);
  });

  it("never waits longer than a 1-minute interval", () => {
    expect(isMisconceptionRequired(1_000, 1_000 + 60_000, 60_000)).toBe(false);
  });
});
