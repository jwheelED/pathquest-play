import { describe, it, expect } from "vitest";
import {
  studentSignUpSchema,
  instructorAdminSignUpSchema,
  signInSchema,
  passwordSchema,
} from "@/lib/validation";

/**
 * CRITICAL PATH #1 — Authentication invariants
 * These tests pin the input contracts used by every auth handler
 * (Auth.tsx, InstructorAuth.tsx, AdminAuth.tsx). Do not weaken these
 * without explicitly updating CRITICAL_PATHS.md.
 */
describe("passwordSchema", () => {
  it("rejects passwords shorter than 8 chars", () => {
    expect(passwordSchema.safeParse("Aa1!aa").success).toBe(false);
  });
  it("rejects passwords missing uppercase", () => {
    expect(passwordSchema.safeParse("aaaaaa1!").success).toBe(false);
  });
  it("rejects passwords missing number", () => {
    expect(passwordSchema.safeParse("Aaaaaaa!").success).toBe(false);
  });
  it("rejects passwords missing special char", () => {
    expect(passwordSchema.safeParse("Aaaaaaa1").success).toBe(false);
  });
  it("accepts a valid strong password", () => {
    expect(passwordSchema.safeParse("Aaaaaaa1!").success).toBe(true);
  });
});

describe("studentSignUpSchema", () => {
  const valid = { email: "a@b.co", password: "Aaaaaaa1!", name: "Jane Doe", instructorCode: "" };
  it("accepts valid input with empty instructor code", () => {
    expect(studentSignUpSchema.safeParse(valid).success).toBe(true);
  });
  it("accepts a 6-char instructor code", () => {
    expect(studentSignUpSchema.safeParse({ ...valid, instructorCode: "ABC123" }).success).toBe(true);
  });
  it("rejects malformed instructor code", () => {
    expect(studentSignUpSchema.safeParse({ ...valid, instructorCode: "abc" }).success).toBe(false);
  });
  it("rejects names with digits", () => {
    expect(studentSignUpSchema.safeParse({ ...valid, name: "Jane2" }).success).toBe(false);
  });
});

describe("instructorAdminSignUpSchema", () => {
  it("requires a name", () => {
    const r = instructorAdminSignUpSchema.safeParse({ email: "a@b.co", password: "Aaaaaaa1!", name: "" });
    expect(r.success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("requires a non-empty password", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
  it("accepts any non-empty password (we don't re-validate strength on sign-in)", () => {
    expect(signInSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });
});
