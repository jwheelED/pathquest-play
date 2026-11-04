// Pure grading helpers for submit-live-response, extracted so they can be
// unit-tested directly (audit EV-012). Logic preserved from the original
// index.ts; only the diagnostic console output was dropped.

/**
 * Normalize an MCQ answer to a single letter (A–D). Non-MCQ answers are just
 * trimmed. Falls back to matching against the options array by full text or a
 * unique numeric token. Returns the trimmed input if nothing matches.
 */
export function normalizeAnswer(answer: string, questionType: string, options?: string[]): string {
  if (questionType !== "multiple_choice") {
    return answer.trim();
  }

  const trimmed = answer.trim();

  // 1. Already a single letter.
  if (/^[A-Da-d]$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  // 2. Letter prefix: "B) text", "B. text", "B - text", "B text".
  const letterMatch = trimmed.match(/^([A-Da-d])[\).\-\s]/);
  if (letterMatch) {
    return letterMatch[1].toUpperCase();
  }

  // 3. Match against the options array (text-only answers).
  if (options && options.length > 0) {
    const letters = ["A", "B", "C", "D"];
    for (let i = 0; i < options.length && i < 4; i++) {
      const option = options[i];
      const optionText = option.replace(/^[A-Da-d][\).\-\s]+\s*/, "").trim();

      if (
        trimmed.toLowerCase() === option.toLowerCase() ||
        trimmed.toLowerCase() === optionText.toLowerCase()
      ) {
        return letters[i];
      }

      // Unique-numeric match: "206" → "B. 206 bones" (only if unambiguous).
      const answerNumbers = trimmed.match(/\d+/g);
      const optionNumbers = optionText.match(/\d+/g);
      if (
        answerNumbers && optionNumbers &&
        answerNumbers.length === 1 && optionNumbers.length >= 1 &&
        optionNumbers.includes(answerNumbers[0])
      ) {
        const matchingOptions = options.filter((opt) => {
          const nums = opt.match(/\d+/g);
          return nums && nums.includes(answerNumbers[0]);
        });
        if (matchingOptions.length === 1) {
          return letters[i];
        }
      }
    }
  }

  // 4. No match — return original (will likely be marked incorrect).
  return trimmed;
}

/**
 * Points = base 10 × confidence multiplier when correct. Wrong answers with
 * higher stated confidence incur a penalty (high −15, medium −5, low 0).
 */
export function calculatePoints(
  isCorrect: boolean,
  confidenceLevel: string | null,
): { points: number; multiplier: number } {
  const basePoints = 10;
  const confidenceMultipliers: Record<string, number> = { low: 1, medium: 2, high: 3 };
  const multiplier = confidenceLevel ? (confidenceMultipliers[confidenceLevel] || 1) : 1;

  if (isCorrect) {
    return { points: basePoints * multiplier, multiplier };
  }
  if (confidenceLevel === "high") {
    return { points: -15, multiplier };
  }
  if (confidenceLevel === "medium") {
    return { points: -5, multiplier };
  }
  return { points: 0, multiplier };
}
