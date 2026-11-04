// Pure prompt-building + response validation for the AI question scanner.
// No Deno / network imports so it can be unit-tested under vitest.

export type ScanFormat = "multiple_choice" | "short_answer" | "poll" | "coding";

export interface ScanInput {
  contextText: string;
  newText: string;
  recentlySent: string[];
  formatPreference?: ScanFormat | null;
  courseType?: string | null;
}

export interface ScanDetected {
  detected: true;
  question: string;
  format: ScanFormat;
  options?: string[];
  correctAnswer?: "A" | "B" | "C" | "D";
  expectedAnswer?: string;
  explanation?: string;
}

export type ScanResult = ScanDetected | { detected: false; reason?: string };

const FORBIDDEN_DISTRACTORS = [
  /none of the above/i,
  /all of the above/i,
  /not specified/i,
  /cannot be determined/i,
];

export const SCAN_TOOL = {
  type: "function" as const,
  function: {
    name: "report_question",
    description: "Report whether the instructor just asked the class a question, with answer data if so.",
    parameters: {
      type: "object",
      properties: {
        detected: { type: "boolean" },
        question: { type: "string", description: "Standalone, clean question for participants." },
        format: { type: "string", enum: ["multiple_choice", "short_answer", "poll", "coding"] },
        options: { type: "array", items: { type: "string" }, description: "Exactly 4 options for multiple_choice/poll, no letter prefixes." },
        correct_answer: { type: "string", enum: ["A", "B", "C", "D"] },
        expected_answer: { type: "string" },
        explanation: { type: "string" },
      },
      required: ["detected"],
    },
  },
};

export function buildScanMessages(input: ScanInput) {
  const fmt = input.formatPreference ?? "multiple_choice";
  const sent = input.recentlySent.filter(Boolean).slice(0, 5);
  const system = `You watch a live class transcript and decide if the instructor JUST asked or prompted the class with a question students are meant to answer.

Count as questions: direct questions ("Who wrote the Emancipation Proclamation"), prompts ("Tell me why Rome fell", "Calculate the speed here", "Think about which force wins"), and short questions after a setup ("We see a spike in year three. Why?"). Speech-to-text often drops question marks — judge by meaning.
Do NOT count: rhetorical or check-in lines ("Does that make sense?", "Right?", "Any questions?", "Ready?"), logistics, greetings, questions the instructor immediately answers themselves, or questions already sent (listed below).

Only look for the question inside NEW SPEECH. Use EARLIER CONTEXT only to make the question standalone (resolve "it", "this", "that one").

If found, rewrite it as a clean, standalone question (keep the instructor's meaning, fix fillers/false starts). Format: ${fmt}${fmt === "coding" ? "" : " (always use this format)"}.
- multiple_choice: exactly 4 options, 1 correct, 3 realistic, plausible distractors based on common misconceptions. Never use "None of the above", "All of the above", or "Not specified". No letter prefixes. Set correct_answer.
- poll: exactly 4 reasonable options, no correct answer needed.
- short_answer: give a brief expected_answer.
- coding: just the question.
Write math in plain Unicode (x², √, π), never LaTeX.
Call report_question with detected:false if no question was asked.`;

  const user = `EARLIER CONTEXT:\n${input.contextText.slice(-3000) || "(none)"}\n\nNEW SPEECH:\n${input.newText}\n\nALREADY SENT:\n${sent.length ? sent.map((s) => `- ${s}`).join("\n") : "(none)"}`;
  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}

const stripPrefix = (s: string) => s.replace(/^\s*(?:[A-D][\).:\-]\s+)/, "").trim();

/** Parse a model's JSON text reply, tolerating code fences and stray prose. */
export function parseJsonText(raw: unknown): unknown {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* try the first {...} block */ }
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}


export function parseScanResult(raw: unknown, preferred?: ScanFormat | null): ScanResult {
  if (!raw || typeof raw !== "object") return { detected: false, reason: "bad_output" };
  const r = raw as Record<string, unknown>;
  if (r.detected !== true) return { detected: false };
  const question = typeof r.question === "string" ? r.question.trim() : "";
  if (question.split(/\s+/).length < 2) return { detected: false, reason: "empty_question" };

  const allowed: ScanFormat[] = ["multiple_choice", "short_answer", "poll", "coding"];
  const format: ScanFormat =
    preferred && allowed.includes(preferred)
      ? preferred
      : allowed.includes(r.format as ScanFormat) ? (r.format as ScanFormat) : "multiple_choice";

  const base: ScanDetected = {
    detected: true,
    question,
    format,
    explanation: typeof r.explanation === "string" ? r.explanation : undefined,
  };

  if (format === "multiple_choice" || format === "poll") {
    const opts = Array.isArray(r.options)
      ? r.options.filter((o): o is string => typeof o === "string").map(stripPrefix).filter(Boolean)
      : [];
    const valid =
      opts.length === 4 &&
      new Set(opts.map((o) => o.toLowerCase())).size === 4 &&
      !opts.some((o) => FORBIDDEN_DISTRACTORS.some((p) => p.test(o)));
    const ca = r.correct_answer;
    const caValid = typeof ca === "string" && ["A", "B", "C", "D"].includes(ca);
    if (valid && (format === "poll" || caValid)) {
      base.options = opts;
      if (format === "multiple_choice") base.correctAnswer = ca as ScanDetected["correctAnswer"];
    }
    // Question is still worth surfacing; On Deck generates choices itself when missing.
  } else if (format === "short_answer" && typeof r.expected_answer === "string" && r.expected_answer.trim()) {
    base.expectedAnswer = r.expected_answer.trim();
  }
  return base;
}
