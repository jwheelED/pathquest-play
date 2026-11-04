// Pure delivery-verification helpers, shared by the question fan-out
// (`format-and-send-question`) and its tests. Keep this file free of Deno-,
// browser-, or Supabase-specific imports so it stays portable and unit-testable
// via vitest (same convention as `_shared/questionDetection.ts`).

export interface DeliverySummary {
  /** How many distinct students should have received the assignment. */
  expected: number;
  /** How many distinct students actually have a row (verified from the DB). */
  delivered: number;
  /** Student ids that were expected but have no delivered row. */
  missing: string[];
  /** True when every expected student was delivered to. */
  complete: boolean;
}

/**
 * Compare the cohort we intended to deliver to against the rows that actually
 * landed. Both inputs are deduplicated; `deliveredIds` is intersected with the
 * expected set so stray/duplicate rows can never make a partial delivery look
 * complete. Covers the WHOLE cohort — not just the first N students.
 */
export function summarizeDelivery(
  expectedIds: string[],
  deliveredIds: string[],
): DeliverySummary {
  const expectedSet = new Set(expectedIds);
  const deliveredSet = new Set(deliveredIds);

  const missing: string[] = [];
  for (const id of expectedSet) {
    if (!deliveredSet.has(id)) missing.push(id);
  }

  // Count only delivered rows that belong to the expected cohort.
  let delivered = 0;
  for (const id of deliveredSet) {
    if (expectedSet.has(id)) delivered++;
  }

  return {
    expected: expectedSet.size,
    delivered,
    missing,
    complete: missing.length === 0,
  };
}
