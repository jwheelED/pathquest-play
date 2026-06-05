/**
 * Scenarios for the on-deck question pipeline end-to-end test.
 *
 * Each scenario represents one logical audio clip ("audioId") and the ordered
 * list of FINAL transcript chunks the transcription stage would emit for that
 * clip (matching `DeepgramStreamingClient.onTranscript` post-`sanitizeTranscript`).
 */

export interface ScriptedChunk {
  text: string;
  /** ms of silence after this chunk before the next is emitted. Default 1500. */
  gapMs?: number;
  confidence?: number;
}

export interface PipelineScenario {
  audioId: string;
  note: string;
  chunks: ScriptedChunk[];
  /** Substring expected in final on-deck candidate text. `null` = no card. */
  expectedExtractedQuestion: string | null;
  expectPriorContext?: "present" | "absent";
}

export const SCENARIOS: PipelineScenario[] = [
  {
    audioId: "tp-short",
    note: "TRUE POSITIVE — short self-contained question, single chunk.",
    chunks: [{ text: "What happens to the electron here?", gapMs: 2500 }],
    expectedExtractedQuestion: "what happens to the electron",
    expectPriorContext: "absent",
  },
  {
    audioId: "tp-long-multichunk",
    note: "TRUE POSITIVE — premise-led question split across chunks.",
    chunks: [
      { text: "Suppose that the array is already sorted —", gapMs: 600 },
      { text: "which search algorithm would you pick,", gapMs: 600 },
      {
        text: "and how does its complexity compare to a linear scan?",
        gapMs: 2500,
      },
    ],
    expectedExtractedQuestion: "which search algorithm would you pick",
  },
  {
    audioId: "fp-declarative-guard",
    note:
      "FALSE POSITIVE GUARD — declarative narration with trigger words + rhetorical fillers. Must NOT produce a card.",
    chunks: [
      {
        text:
          "We'll look at how they stain, how they interact with antibiotics, and how dangerous certain components can be.",
        gapMs: 1500,
      },
      { text: "Right? Make sense? Any questions?", gapMs: 1500 },
      {
        text:
          "And we have to remember just how dangerous these components can be in everyday use.",
        gapMs: 3000,
      },
    ],
    expectedExtractedQuestion: null,
  },
  {
    audioId: "context-pull",
    note:
      "CONTEXT-PULL — back-reference pronoun question preceded by topic narration. priorContext must carry the antecedent.",
    chunks: [
      {
        text:
          "Diffusion drives particles from regions of high concentration to low concentration until the gradient flattens out.",
        gapMs: 1200,
      },
      {
        text: "So why does it stop once equilibrium is reached?",
        gapMs: 2500,
      },
    ],
    expectedExtractedQuestion: "why does it stop once equilibrium is reached",
    expectPriorContext: "present",
  },
];
