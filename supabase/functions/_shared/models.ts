// Single source of truth for the AI models used across Edvana edge functions.
// Change it here to upgrade every call at once.

export const GEMINI_FLASH = "google/gemini-3.8-flash";

// Fastest Gemini on the Lovable AI Gateway (~0.6s for a scan in testing).
// Send it WITHOUT reasoning_effort: "low" turned thinking on and took ~3s.
export const GEMINI_FLASH_LITE = "google/gemini-3.1-flash-lite";

// Live question scanner model on Groq (needs GROQ_API_KEY). Llama models are no
// longer offered on Groq (Oct 2026); gpt-oss-120b answered a scan in ~0.3–0.5s.
// It's a reasoning model: send reasoning_effort "low" and no max_tokens.
export const GROQ_SCANNER_MODEL = "openai/gpt-oss-120b";

// Question pictures via the project's own OpenAI key. DALL-E 3 is retired;
// gpt-image-1.5 at "low" quality was the fastest tested (~6.4s vs ~8–10s).
export const OPENAI_IMAGE_MODEL = "gpt-image-1.5";

// Gemini 3.8 Flash thinks by default, which took ~4.5s vs ~1s for a short MCQ
// in testing. "low" keeps live-session calls as fast as the old 2.5 models.
// Callers can pass a higher effort (e.g. "medium") when quality beats speed.
export type ReasoningEffort = "low" | "medium" | "high";
export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "low";
