/**
 * Instant Confidence Check — Phrase Detector
 *
 * Pure, synchronous detection of instructor confidence-check cues in
 * transcript chunks. Safe to call on every transcript chunk (hot path).
 */

export type ConfidenceResponseType = "yes_no" | "scale_1_5" | "thumbs";

export interface ConfidencePhraseEntry {
  phrase: string;
  responseType: ConfidenceResponseType;
  templateId: string;
}

export interface ConfidenceMatch {
  phrase: string;
  responseType: ConfidenceResponseType;
  templateId: string;
}

/**
 * Full phrase map. Order matters: longer / more specific phrases come first
 * so they win over shorter overlapping ones (e.g., "does that make sense"
 * before "make sense?").
 */
export const CONFIDENCE_PHRASES: ReadonlyArray<ConfidencePhraseEntry> = [
  { phrase: "does that make sense", responseType: "yes_no", templateId: "makes_sense_that" },
  { phrase: "does this make sense", responseType: "yes_no", templateId: "makes_sense_this" },
  { phrase: "how are we feeling about this", responseType: "scale_1_5", templateId: "how_feeling" },
  { phrase: "how confident are you", responseType: "scale_1_5", templateId: "how_confident" },
  { phrase: "any questions so far", responseType: "thumbs", templateId: "any_questions" },
  { phrase: "everyone following", responseType: "yes_no", templateId: "everyone_following" },
  { phrase: "are you following", responseType: "yes_no", templateId: "are_you_following" },
  { phrase: "still with me", responseType: "yes_no", templateId: "still_with_me" },
  { phrase: "are we good", responseType: "thumbs", templateId: "are_we_good" },
  { phrase: "on a scale", responseType: "scale_1_5", templateId: "on_a_scale" },
  { phrase: "make sense?", responseType: "yes_no", templateId: "makes_sense_short" },
  { phrase: "got it?", responseType: "yes_no", templateId: "got_it" },
] as const;

/**
 * Detect a confidence-check phrase in a transcript chunk.
 * Case-insensitive substring match. Returns the first matching entry by
 * declared order, or null when no phrase is found / input is invalid.
 */
export function detectConfidencePhrase(transcript: string): ConfidenceMatch | null {
  if (typeof transcript !== "string" || transcript.length === 0) {
    return null;
  }

  const haystack = transcript.toLowerCase();

  for (const entry of CONFIDENCE_PHRASES) {
    if (haystack.includes(entry.phrase)) {
      return {
        phrase: entry.phrase,
        responseType: entry.responseType,
        templateId: entry.templateId,
      };
    }
  }

  return null;
}
