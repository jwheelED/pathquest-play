// Single source of truth for the AI models used across Edvana edge functions.
// Change it here to upgrade every call at once.

export const GEMINI_FLASH = "google/gemini-3.8-flash";

// Fastest Gemini on the Lovable AI Gateway (~0.6s for a scan in testing).
// Send it WITHOUT reasoning_effort: "low" turned thinking on and took ~3s.
export const GEMINI_FLASH_LITE = "google/gemini-3.1-flash-lite";

// Llama 3.1 8B on Groq (needs GROQ_API_KEY) — lowest time-to-first-token,
// used by the live question scanner.
export const GROQ_LLAMA_FAST = "llama-3.1-8b-instant";

// Gemini 3.8 Flash thinks by default, which took ~4.5s vs ~1s for a short MCQ
// in testing. "low" keeps live-session calls as fast as the old 2.5 models.
// Callers can pass a higher effort (e.g. "medium") when quality beats speed.
export type ReasoningEffort = "low" | "medium" | "high";
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "low";
