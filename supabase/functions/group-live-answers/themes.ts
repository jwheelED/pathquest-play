// Pure helpers for grouping ungraded short answers into themes.

export interface AnswerRow { id: string; answer: string }
export interface Theme { label: string; count: number; response_ids: string[]; samples: string[] }

/** Minimum answers before the AI groups them (fewer are just listed). */
export const MIN_TO_GROUP = 3;
/** Regroup no more often than this, unless enough new answers arrived. */
export const MIN_INTERVAL_MS = 10_000;
export const MAX_ANSWERS = 200;

export function shouldRegroup(
  stored: { response_count: number; updated_at: string } | null,
  currentCount: number,
  now = Date.now(),
): boolean {
  if (currentCount < MIN_TO_GROUP) return false;
  if (!stored) return true;
  if (stored.response_count === currentCount) return false;
  return now - new Date(stored.updated_at).getTime() >= MIN_INTERVAL_MS ||
    currentCount - stored.response_count >= 5;
}

/**
 * Turn the model's `{themes:[{label, answer_numbers}]}` into stored themes.
 * Answers the model skipped or numbered wrongly go into "Other", so every
 * answer is counted exactly once.
 */
export function buildThemes(raw: unknown, rows: AnswerRow[]): Theme[] {
  const used = new Set<number>();
  const themes: Theme[] = [];
  const list = (raw as { themes?: Array<{ label?: unknown; answer_numbers?: unknown }> })?.themes;
  for (const t of Array.isArray(list) ? list.slice(0, 6) : []) {
    const label = typeof t?.label === "string" ? t.label.trim().slice(0, 80) : "";
    if (!label || !Array.isArray(t.answer_numbers)) continue;
    const idx = [...new Set(t.answer_numbers.map((n) => Number(n) - 1))]
      .filter((i) => Number.isInteger(i) && i >= 0 && i < rows.length && !used.has(i));
    if (idx.length === 0) continue;
    idx.forEach((i) => used.add(i));
    themes.push(toTheme(label, idx.map((i) => rows[i])));
  }
  const rest = rows.filter((_, i) => !used.has(i));
  if (rest.length) themes.push(toTheme("Other", rest));
  return themes.sort((a, b) => (a.label === "Other" ? 1 : b.label === "Other" ? -1 : b.count - a.count));
}

function toTheme(label: string, rows: AnswerRow[]): Theme {
  return {
    label,
    count: rows.length,
    response_ids: rows.map((r) => r.id),
    samples: rows.slice(0, 5).map((r) => r.answer.slice(0, 300)),
  };
}
