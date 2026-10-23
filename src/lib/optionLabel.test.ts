import { describe, expect, it } from "vitest";
import { stripOptionLabel } from "./optionLabel";

describe("stripOptionLabel", () => {
  it("keeps the first letter of options starting with A-D", () => {
    expect(stripOptionLabel("Carbon dioxide")).toBe("Carbon dioxide");
    expect(stripOptionLabel("Abraham Lincoln")).toBe("Abraham Lincoln");
    expect(stripOptionLabel("A cell wall")).toBe("A cell wall");
    expect(stripOptionLabel("D.C. is the capital")).toBe("D.C. is the capital");
  });
  it("removes real labels", () => {
    expect(stripOptionLabel("A. Carbon")).toBe("Carbon");
    expect(stripOptionLabel("b) Oxygen")).toBe("Oxygen");
    expect(stripOptionLabel("(C) Neon")).toBe("Neon");
    expect(stripOptionLabel("D: Argon")).toBe("Argon");
  });
});
