/**
 * Edvana Whiteboard Tutor — design tokens.
 *
 * The design handoff specifies inline, literal HSL values throughout (there are
 * no CSS classes to map). These are the exact triplets from the handoff README's
 * colour table, expressed as ready-to-use `hsl(...)` strings so screen components
 * can drop them straight into inline styles.
 */

export const T = {
  // Emerald workhorse
  primary: "hsl(160 84% 29%)",
  primaryHover: "hsl(160 84% 24%)",
  secondary: "hsl(199 89% 48%)",
  emerald50: "hsl(152 76% 96%)",
  emerald100: "hsl(149 69% 88%)",
  emerald300: "hsl(156 60% 60%)",
  emerald500: "hsl(160 84% 39%)",
  emerald600: "hsl(160 84% 34%)",
  emerald700: "hsl(160 84% 25%)",

  // Surfaces & neutrals
  surfaceApp: "hsl(40 20% 97%)",
  surfaceEmeraldSoft: "hsl(160 45% 96%)",
  white: "hsl(0 0% 100%)",
  border: "hsl(220 15% 91%)",
  ink: "hsl(220 25% 15%)",
  textMuted: "hsl(220 12% 45%)",
  textSubtle: "hsl(220 10% 55%)",
  slate50: "hsl(210 20% 98%)",
  slate100: "hsl(220 15% 94%)",
  slate200: "hsl(220 15% 88%)",
  slate300: "hsl(200 15% 78%)",

  // Sky
  sky50: "hsl(199 90% 95%)",
  sky100: "hsl(199 90% 88%)",
  sky600: "hsl(199 85% 34%)",

  // Amber / warning — the error at 00:51 and the MISCONCEPTION tag
  amber: "hsl(45 93% 47%)",
  amberBg: "hsl(45 93% 96%)",
  amberBorder: "hsl(45 93% 82%)",
  amberBorder2: "hsl(45 93% 86%)",
  amberBorder3: "hsl(45 93% 88%)",
  amberText: "hsl(38 80% 35%)",
  amberTextStrong: "hsl(38 80% 32%)",
  amberText40: "hsl(38 80% 40%)",
  amberStrike: "hsl(38 80% 45%)",
  amberProbeBody: "hsl(30 30% 22%)",

  // Red / failure — only the "answer arrived from somewhere else" card
  redBorder: "hsl(0 60% 88%)",
  redBg: "hsl(0 70% 98%)",
  redText: "hsl(0 60% 38%)",
  redText2: "hsl(0 60% 42%)",
  redMuted: "hsl(0 30% 55%)",
  redInk: "hsl(0 25% 30%)",

  // Body greys / misc
  ink18: "hsl(220 20% 18%)",
  ink20: "hsl(220 20% 20%)",
  ink22: "hsl(220 20% 22%)",
  ink25: "hsl(220 20% 25%)",
  ink28: "hsl(220 20% 28%)",
  ink30: "hsl(220 20% 30%)",
  successBody: "hsl(160 40% 20%)",
  successBody2: "hsl(160 35% 22%)",
  gridLine: "hsl(220 15% 94% / 0.55)",
  tileBorder: "hsl(220 15% 92%)",
  eyebrowGreen: "hsl(160 50% 38%)",

  shadowSm: "0 1px 3px 0 hsl(220 25% 15% / 0.04)",
} as const;

export const FONT_SANS = "'DM Sans', system-ui, -apple-system, sans-serif";
export const FONT_MONO = "'DM Mono', ui-monospace, 'SFMono-Regular', monospace";
/** Marker handwriting for the tutor's whiteboard. */
export const FONT_HAND = "'Caveat', 'Segoe Script', 'Bradley Hand', cursive";
