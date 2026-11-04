/**
 * Strip a leading choice label like "A. ", "b) ", "(C) " or "D: " from an
 * answer option. The label must be followed by whitespace (or end of text) so
 * options that simply start with A–D ("Carbon", "A cell", "D.C.") stay intact.
 */
const OPTION_LABEL_RE = /^\(?[A-Da-d][.):](?:\s+|$)/;

export function stripOptionLabel(option: string): string {
  return String(option ?? "").replace(OPTION_LABEL_RE, "").trim();
}
