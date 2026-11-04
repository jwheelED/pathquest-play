/**
 * Edvana Whiteboard Tutor — fixed demo content.
 *
 * The pedagogical spine is a Calculus I related-rates problem: a spherical
 * balloon inflating at 40 cm³/s, find dr/dt at r = 8 cm. The chain-rule
 * omission at 00:51 that the student self-corrects is referenced by four
 * screens, so this timeline is the single source of truth.
 */

export type Screen =
  | "session"
  | "assign"
  | "recorded"
  | "review"
  | "setup"
  | "integrity";

export type Mode = "talk" | "type" | "draw" | "photo";

export type Provenance =
  | "from_you"
  | "corrected"
  | "self_corrected"
  | "you_drew"
  | "answer";

export interface BoardStep {
  time: string;
  content: string;
  provenance: Provenance;
  label: string;
  struck?: boolean;
  highlight?: boolean;
  annotation?: string;
}

export interface Msg {
  who: "you" | "ai";
  time: string;
  text: string;
}

/** The six board steps, in order. */
export const BOARD_STEPS: BoardStep[] = [
  {
    time: "00:31",
    content: "Given  dV/dt = 40 cm³/s,  r = 8 cm   ·   Find  dr/dt",
    provenance: "from_you",
    label: "from you",
  },
  {
    time: "00:38",
    content: "V = (4/3)πr³",
    provenance: "from_you",
    label: "from you",
  },
  {
    time: "00:51",
    content: "dV/dt = 4πr²",
    provenance: "corrected",
    label: "corrected",
    struck: true,
    annotation: "Edvana asked about this line",
  },
  {
    time: "01:06",
    content: "dV/dt = 4πr² · (dr/dt)",
    provenance: "self_corrected",
    label: "self-corrected",
    highlight: true,
  },
  {
    time: "01:44",
    content: "40 = 4π(8)² · dr/dt",
    provenance: "you_drew",
    label: "you drew",
  },
  {
    time: "02:09",
    content: "dr/dt = 40 / 256π ≈ 0.0497 cm/s",
    provenance: "answer",
    label: "answer",
  },
];

/** The fixed transcript script — verbatim copy is the pedagogy. */
export const BASE_TRANSCRIPT: Msg[] = [
  { who: "ai", time: "00:14", text: "Tell me what's changing here, and what you're trying to find." },
  { who: "you", time: "00:22", text: "Air's going in at 40 cubic centimeters a second, so the volume is changing. I want how fast the radius is growing when r is 8." },
  { who: "ai", time: "00:31", text: "Good — I've put that on the board. Which formula ties volume to radius?" },
  { who: "you", time: "00:38", text: "V equals four-thirds pi r cubed." },
  // (attachment block rendered between 00:38 and 00:51)
  { who: "you", time: "00:51", text: "So I differentiated it and got dV/dt equals 4 pi r squared." },
  { who: "ai", time: "00:53", text: "Your paper shows 4πr² sitting on its own. The left side is a rate in time — what has to ride along with the 4πr²?" },
  { who: "you", time: "01:06", text: "Oh — times dr/dt. Chain rule." },
  { who: "ai", time: "01:08", text: "That's it. Now say why the chain rule shows up here at all." },
  { who: "you", time: "01:15", text: "Because r isn't a constant — it's a function of time. So differentiating r cubed with respect to t gives 3r squared times dr/dt." },
];

/**
 * The fixed script, with the 01:31 line resolved for the current mode: the
 * "out loud" clause drops in typed (quiet) mode.
 */
export const transcriptFor = (mode: Mode): Msg[] => [
  ...BASE_TRANSCRIPT,
  {
    who: "ai",
    time: "01:31",
    text:
      mode === "type"
        ? "That's the whole idea. Substitute your numbers and I'll write it."
        : "That's the whole idea. Substitute your numbers out loud and I'll write it.",
  },
];

/** The 00:53 probe is rendered as an amber callout, not a plain bubble. */
export const PROBE_INDEX = BASE_TRANSCRIPT.findIndex(
  (m) => m.who === "ai" && m.time === "00:53",
);

/** The "Edvana is asking" seed question, before any composer turn. */
export const initialAsk = (mode: Mode): string =>
  mode === "type"
    ? "You wrote 0.0497. Zero point zero four nine seven of what, per what?"
    : "You got 0.0497. Zero point zero four nine seven of what, per what?";

/** Seconds → mm:ss */
export const fmtClock = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

/** Canned Socratic reply queue for the typed composer (last item repeats). */
export const REPLY_QUEUE: string[] = [
  "Centimetres per second — that's the right unit. So say what the number means physically: what is moving 0.0497 cm every second?",
  "Good. Last one: if you keep pumping at 40 cm³/s, does dr/dt get bigger or smaller as the balloon grows? Say why.",
  "That's the insight I was looking for. Wrap it up and finish the problem.",
];

/** Composer symbol keys: glyph + tooltip. */
export const SYMBOL_KEYS: { glyph: string; tip: string }[] = [
  { glyph: "π", tip: "pi" },
  { glyph: "²", tip: "squared" },
  { glyph: "³", tip: "cubed" },
  { glyph: "·", tip: "times" },
  { glyph: "≈", tip: "approximately" },
  { glyph: "√", tip: "root" },
  { glyph: "dV/dt", tip: "rate of volume" },
  { glyph: "dr/dt", tip: "rate of radius" },
];

/** Mode-driven copy, keyed by work mode. */
export const MODE_COPY: Record<
  Mode,
  { pill: string; boardSubtitle: string; dockHint: string }
> = {
  talk: {
    pill: "RECORDING",
    boardSubtitle: "Edvana writes what you narrate — draw over it any time",
    dockHint: "Scratch paper is fine. Photograph it and talk me through what you wrote.",
  },
  type: {
    pill: "QUIET MODE",
    boardSubtitle: "Edvana writes what you type — quiet mode, no mic",
    dockHint:
      "In a library or a shared room? Type your steps instead. Edvana probes them exactly the same way — mic stays off.",
  },
  draw: {
    pill: "RECORDING",
    boardSubtitle: "Write directly on the board — Edvana reads and responds",
    dockHint:
      "Write on the board yourself. Edvana reads what you draw and asks about the lines you wrote.",
  },
  photo: {
    pill: "RECORDING",
    boardSubtitle: "Photograph your paper — Edvana transcribes it onto the board",
    dockHint:
      "Photograph your paper. Edvana reads your handwriting and asks about specific lines.",
  },
};

export const round1 = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);

/** Honest-session suggested score: 8.4 reasoning · 10 answer, weighted. */
export const suggestedScore = (reasoningWeight: number): string => {
  const f = reasoningWeight / 100;
  return round1(8.4 * f + 10 * (1 - f));
};

/** Copied-answer score: 1.0 reasoning · 10 answer, weighted. */
export const copiedScore = (reasoningWeight: number): string => {
  const f = reasoningWeight / 100;
  return round1(1.0 * f + 10 * (1 - f));
};
