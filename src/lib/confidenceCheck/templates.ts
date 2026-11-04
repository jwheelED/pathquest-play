/**
 * Instant Confidence Check — Response Template Registry
 *
 * Pre-built, fixed templates mapped to response types. NOT AI-generated.
 * Fires when a confidence phrase is detected by the detector module.
 */

export type ConfidenceResponseType = "yes_no" | "scale_1_5" | "thumbs";

export interface ConfidenceTemplate {
  id: string;
  prompt: string;
  responseType: ConfidenceResponseType;
  options: string[];
}

const YES_NO_TEMPLATE: ConfidenceTemplate = {
  id: "yes_no_confidence",
  prompt: "Quick check — are you following so far?",
  responseType: "yes_no",
  options: ["Yes, I'm following", "Not quite yet"],
};

const SCALE_TEMPLATE: ConfidenceTemplate = {
  id: "scale_confidence",
  prompt: "Rate your confidence on this topic so far.",
  responseType: "scale_1_5",
  options: ["1 - Not confident", "2", "3", "4", "5 - Very confident"],
};

const THUMBS_TEMPLATE: ConfidenceTemplate = {
  id: "thumbs_confidence",
  prompt: "How are we doing?",
  responseType: "thumbs",
  options: ["👍 Good", "👎 Need more"],
};

const TEMPLATES_BY_TYPE: Record<ConfidenceResponseType, ConfidenceTemplate> = {
  yes_no: YES_NO_TEMPLATE,
  scale_1_5: SCALE_TEMPLATE,
  thumbs: THUMBS_TEMPLATE,
};

/**
 * Get a template by response type. Returns null if the type is unknown.
 */
export function getTemplate(responseType: string): ConfidenceTemplate | null {
  if (responseType in TEMPLATES_BY_TYPE) {
    return TEMPLATES_BY_TYPE[responseType as ConfidenceResponseType];
  }
  return null;
}

/**
 * Get all templates as an array.
 */
export function getAllTemplates(): ConfidenceTemplate[] {
  return [YES_NO_TEMPLATE, SCALE_TEMPLATE, THUMBS_TEMPLATE];
}
