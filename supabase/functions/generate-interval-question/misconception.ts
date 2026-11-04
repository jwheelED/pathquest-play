// Pure helpers for misconception-targeted interval questions.
// Import-free so vitest can load them (see supabase/functions/__tests__).

/** Minimum misconception_score for a question when a misconception is required. */
export const MIN_MISCONCEPTION_SCORE = 0.6;

const LETTERS = ["A", "B", "C", "D"] as const;

const BANNED_DISTRACTORS = [
  /none of the above/i,
  /all of the above/i,
  /not specified/i,
  /not mentioned/i,
  /cannot be determined/i,
];

export interface MisconceptionMeta {
  target_concept: string;
  target_misconception: string;
  misconception_score: number;
  /** Letter -> misconception that leads to picking that wrong choice. */
  distractor_misconceptions: Record<string, string>;
}

/** Prompt section that tells the model how to find and test a misconception. */
export function buildMisconceptionInstructions(
  format: string,
  groundingSource: string,
): string {
  const base = `MISCONCEPTION-FIRST QUESTION DESIGN:
Step 1 — Scan the ENTIRE ${groundingSource} for "misconception opportunities": concepts that were taught where participants commonly form a WRONG mental model. Strong signals:
- The instructor contrasted two similar ideas or terms (e.g. velocity vs acceleration, mitosis vs meiosis, correlation vs causation).
- A counterintuitive result, exception, or edge case was explained.
- The instructor said things like "a common mistake is", "people often think", "be careful", "this is NOT", "the trick here".
- A cause/effect chain or multi-step procedure where a step is easy to swap or skip.
Step 2 — Pick the SINGLE strongest opportunity (most likely to trip up the room AND clearly taught in the ${groundingSource}).
Step 3 — Write a diagnostic question that a participant with the correct mental model answers right, and a participant holding the misconception answers wrong. Prefer applying the concept to a short scenario over asking for a definition.
Step 4 — Score "misconception_score" from 0.0 to 1.0:
- 0.8-1.0: a specific, common misconception about something clearly taught
- 0.6-0.7: a plausible misconception, concept taught but briefly
- below 0.6: content is mostly logistics, recap, or facts with no real misconception to test`;

  if (format === "multiple_choice" || format === "poll" || !format) {
    return `${base}
Step 5 — For multiple choice, EVERY wrong choice must be exactly what a participant holding one specific misconception would pick. Name that misconception in "distractor_misconceptions", keyed by the wrong choice's letter. The primary "target_misconception" must be one of them. Never use "None of the above", "All of the above", or "Not specified".`;
  }
  if (format === "short_answer") {
    return `${base}
Step 5 — For short answer, phrase the question so a participant holding the misconception would reveal it in their answer. Put the correct answer in "expected_answer".`;
  }
  return `${base}
Step 5 — For coding, target a common bug or wrong mental model about the code concept that was taught (e.g. off-by-one, reference vs value, mutation side effects).`;
}

/** Extra JSON fields the model must return alongside the question. */
export const MISCONCEPTION_JSON_FIELDS = `  "target_concept": "the concept being checked",
  "target_misconception": "the specific wrong belief this question exposes",
  "misconception_score": 0.0-1.0,
  "distractor_misconceptions": { "<wrong letter>": "misconception that leads to this choice", ... },
  "expected_answer": "model answer (short answer only)",`;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeLetter(v: unknown): string {
  const s = str(v).toUpperCase();
  const m = s.match(/^[A-D]/);
  return m ? m[0] : "";
}

export type MisconceptionCheck =
  | { ok: true; meta: MisconceptionMeta | null }
  | { ok: false; error_type: string; reason: string };

/**
 * Validate the misconception parts of a parsed model response.
 * When `required` is true the question must target a real misconception
 * (score >= MIN_MISCONCEPTION_SCORE) and, for MCQ, explain every wrong choice.
 * When false, a best-effort question passes and meta is kept if usable.
 */
export function checkMisconception(
  parsed: Record<string, unknown>,
  format: string,
  required: boolean,
): MisconceptionCheck {
  const score = typeof parsed.misconception_score === "number" ? parsed.misconception_score : 0;
  const concept = str(parsed.target_concept);
  const misconception = str(parsed.target_misconception);
  const isMcq = format === "multiple_choice" || !format;

  if (isMcq && Array.isArray(parsed.options)) {
    for (const opt of parsed.options) {
      if (BANNED_DISTRACTORS.some((re) => re.test(String(opt)))) {
        return { ok: false, error_type: "banned_distractor", reason: `Vague choice not allowed: "${String(opt).slice(0, 60)}"` };
      }
    }
  }

  // Map letter -> misconception for the wrong choices only.
  const correct = normalizeLetter(parsed.correct_answer);
  const raw = parsed.distractor_misconceptions;
  const distractors: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const letter = normalizeLetter(k);
      const text = str(v);
      if (letter && letter !== correct && text) distractors[letter] = text;
    }
  }

  const wrongLetters = isMcq ? LETTERS.filter((l) => l !== correct) : [];
  const allExplained = wrongLetters.every((l) => distractors[l]);

  if (required) {
    if (!misconception || score < MIN_MISCONCEPTION_SCORE) {
      return {
        ok: false,
        error_type: "no_misconception_opportunity",
        reason: `No strong misconception yet (score ${score.toFixed(2)})`,
      };
    }
    if (isMcq && (!correct || !allExplained)) {
      return {
        ok: false,
        error_type: "missing_distractor_rationale",
        reason: "Not every wrong choice maps to a misconception",
      };
    }
  }

  const meta: MisconceptionMeta | null = misconception
    ? {
        target_concept: concept,
        target_misconception: misconception,
        misconception_score: Math.max(0, Math.min(1, score)),
        distractor_misconceptions: distractors,
      }
    : null;
  return { ok: true, meta };
}

/**
 * Shuffle 4 MCQ options (Fisher-Yates) while carrying the correct flag and the
 * per-choice misconception, so the letters stay consistent after shuffling.
 * Returns null when options are malformed or duplicated (caller keeps order).
 */
export function shuffleWithMisconceptions(
  options: string[],
  correctLetter: string,
  distractors: Record<string, string>,
  rand: () => number = Math.random,
): { options: string[]; correct_answer: string; distractor_misconceptions: Record<string, string> } | null {
  const correctIdx = LETTERS.indexOf(normalizeLetter(correctLetter) as typeof LETTERS[number]);
  if (options.length !== 4 || correctIdx === -1) return null;

  const items = options.map((o, i) => ({
    text: String(o).replace(/^\(?[A-Da-d][.):](?:\s+|$)/, "").trim(),
    wasCorrect: i === correctIdx,
    misconception: distractors[LETTERS[i]] ?? "",
  }));
  if (new Set(items.map((o) => o.text.toLowerCase())).size < 4) return null;

  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  const newCorrect = items.findIndex((o) => o.wasCorrect);
  const remapped: Record<string, string> = {};
  items.forEach((o, i) => {
    if (!o.wasCorrect && o.misconception) remapped[LETTERS[i]] = o.misconception;
  });
  return {
    options: items.map((o, i) => `${LETTERS[i]}. ${o.text}`),
    correct_answer: LETTERS[newCorrect],
    distractor_misconceptions: remapped,
  };
}
