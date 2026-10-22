// Single source of truth for the Gemini model used across Edvana edge functions.
// Change it here to upgrade every Gemini call at once.

export const GEMINI_FLASH = "google/gemini-3.8-flash";

// Gemini 3.8 Flash thinks by default, which took ~4.5s vs ~1s for a short MCQ
// in testing. "low" keeps live-session calls as fast as the old 2.5 models.
// Callers can pass a higher effort (e.g. "medium") when quality beats speed.
export type ReasoningEffort = "low" | "medium" | "high";
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "low";
