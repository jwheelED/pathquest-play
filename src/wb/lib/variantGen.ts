/** Deterministic per-student variant generation from instructor ranges. */
import type { VariantRange } from "./wbTypes";

/** Small deterministic hash → 0..1, seeded by student+problem+key. */
function seeded(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // map to [0,1)
  return ((h >>> 0) % 100000) / 100000;
}

/** Pick a stable integer in [min,max] for this student/problem/placeholder. */
export function pickValue(
  range: VariantRange,
  studentId: string,
  problemId: string,
  key: string,
): number {
  const t = seeded(`${studentId}:${problemId}:${key}`);
  const span = Math.max(0, range.max - range.min);
  return range.min + Math.round(t * span);
}

/** Generate a full number set for a student from a problem's ranges. */
export function generateNumbers(
  ranges: Record<string, VariantRange>,
  studentId: string,
  problemId: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, range] of Object.entries(ranges ?? {})) {
    out[key] = pickValue(range, studentId, problemId, key);
  }
  return out;
}

/** Replace {key} tokens in a template with concrete values. */
export function interpolate(template: string, numbers: Record<string, number>): string {
  return (template ?? "").replace(/\{(\w+)\}/g, (m, key) =>
    key in numbers ? String(numbers[key]) : m,
  );
}

/** A short human variant label, e.g. "B-14", stable per student/problem. */
export function variantLabel(studentId: string, problemId: string): string {
  const n = Math.floor(seeded(`${studentId}:${problemId}:label`) * 90) + 10;
  return `B-${n}`;
}
