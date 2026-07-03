import { describe, it, expect } from "vitest";
import {
  extractQuestions,
  isRhetorical,
  wordCount,
  hasInterrogativeTrigger,
  looksLikeMonologue,
} from "@/hooks/usePassiveQuestionDetection";

/**
 * DETECTION RELIABILITY — primary focus.
 *
 * These tests pin the pure detection helpers used by both the client hook
 * (`usePassiveQuestionDetection`) and the server function
 * (`supabase/functions/detect-speaker-questions`). They use realistic
 * transcript fragments from the diagnostic docs so regressions surface fast.
 */
describe("extractQuestions", () => {
  it("returns [] for a declarative with no interrogative phrasing", () => {
    expect(extractQuestions("This is a declarative sentence.")).toEqual([]);
  });

  // FE-AP-1: Deepgram drops the "?" on short/intonation-driven questions.
  // Detection must rely on interrogative phrasing, not punctuation.
  it("extracts a punctuation-free question (interrogative phrasing)", () => {
    expect(extractQuestions("What is mitosis")).toEqual(["What is mitosis"]);
  });

  it("extracts a punctuation-free question even with a trailing period", () => {
    expect(extractQuestions("How many bones are in the hand.")).toEqual([
      "How many bones are in the hand",
    ]);
  });

  it("extracts a punctuation-free question buried after a declarative", () => {
    const out = extractQuestions(
      "Today we covered the skeleton. How many bones are in the hand",
    );
    expect(out).toEqual(["How many bones are in the hand"]);
  });

  it("does NOT extract a WH-led declarative with no question phrasing", () => {
    // "and how dangerous … can be" is mid-sentence (no clause-start trigger),
    // so a punctuation-free monologue must still yield nothing.
    expect(
      extractQuestions(
        "We'll look at how they stain and how dangerous certain components can be.",
      ),
    ).toEqual([]);
  });

  it("extracts a single question from a single sentence", () => {
    expect(extractQuestions("What changed?")).toEqual(["What changed?"]);
  });

  it("splits multi-sentence input on terminal punctuation", () => {
    const out = extractQuestions(
      "Today we talked about ions. What happens to the electron? Then we move on.",
    );
    expect(out).toEqual(["What happens to the electron?"]);
  });

  it("returns multiple questions when several are present", () => {
    const out = extractQuestions("What is an ion? Why does it matter?");
    expect(out.length).toBe(2);
    expect(out[0]).toContain("What is an ion?");
    expect(out[1]).toContain("Why does it matter?");
  });

  it("handles CJK full-width question marks (？)", () => {
    expect(extractQuestions("これは何ですか？")).toEqual(["これは何ですか？"]);
  });

  it("handles mixed ASCII/CJK question marks in one input", () => {
    const out = extractQuestions("What is this? これは何ですか？");
    expect(out.length).toBe(2);
  });

  it("collapses whitespace before extraction", () => {
    expect(extractQuestions("  What    happened   here?  ")).toEqual([
      "What happened here?",
    ]);
  });

  it("does not crash on empty string", () => {
    expect(extractQuestions("")).toEqual([]);
  });

  it("handles trailing punctuation runs", () => {
    const out = extractQuestions("Why is that???");
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]).toContain("Why is that");
  });
});

describe("wordCount", () => {
  it("returns 0 for empty string", () => {
    expect(wordCount("")).toBe(0);
  });

  it("returns 1 for a single word", () => {
    expect(wordCount("hello")).toBe(1);
  });

  it("counts normal text correctly", () => {
    expect(wordCount("what happens to the electron")).toBe(5);
  });

  it("ignores extra whitespace", () => {
    expect(wordCount("  what    happens  ")).toBe(2);
  });
});

describe("isRhetorical — explicit blocklist phrases", () => {
  const rhetoricalSamples = [
    "right?",
    "okay?",
    "ok?",
    "got it?",
    "you know?",
    "does that make sense?",
    "make sense?",
    "any questions?",
    "is that clear?",
    "you see?",
    "shall we?",
    "sounds good?",
    "fair enough?",
    "what do you think?",
    "what do you all think?",
    "how about that?",
    "how does that sound?",
    // with leading filler tokens
    "so right?",
    "and okay?",
    "well does that make sense?",
    "um any questions?",
    // greetings
    "How is everyone?",
    "Good morning?",
    "How are you doing today?",
    "Can you hear me?",
    "Can everyone see the screen?",
    "How's it going?",
    "Are we all set?",
    "Hello?",
    "Hi?",
  ];

  for (const sample of rhetoricalSamples) {
    it(`rejects rhetorical/greeting: "${sample}"`, () => {
      expect(isRhetorical(sample)).toBe(true);
    });
  }
});

describe("isRhetorical — real questions pass through", () => {
  const realQuestions = [
    "What happens to the electron?",
    "Why does the ion form?",
    "How many protons are in carbon?",
    "When did this reaction occur?",
    "Where does the energy come from?",
    "Who discovered penicillin?",
    "Which structure stores DNA?",
  ];

  for (const q of realQuestions) {
    it(`accepts: "${q}"`, () => {
      expect(isRhetorical(q)).toBe(false);
    });
  }
});

describe("hasInterrogativeTrigger", () => {
  it("matches `what + helper` form", () => {
    expect(hasInterrogativeTrigger("what is an ion")).toBe(true);
  });

  it("matches `why + helper` form", () => {
    expect(hasInterrogativeTrigger("why does it matter")).toBe(true);
  });

  it("matches `how many` form", () => {
    expect(hasInterrogativeTrigger("how many protons")).toBe(true);
  });

  it("rejects a bare question mark with no interrogative", () => {
    expect(hasInterrogativeTrigger("the electron is gone?")).toBe(false);
  });

  it("matches `do you think` form", () => {
    expect(hasInterrogativeTrigger("do you think this works")).toBe(true);
  });

  // Regression tests for the "first-ask unreliability" bug — these previously
  // failed the specific verb-list patterns and now pass via the permissive
  // interrogative-led fallback.
  it("matches short past-tense `what changed`", () => {
    expect(hasInterrogativeTrigger("what changed")).toBe(true);
  });

  it("matches `what broke`", () => {
    expect(hasInterrogativeTrigger("what broke")).toBe(true);
  });

  it("matches `why now`", () => {
    expect(hasInterrogativeTrigger("why now")).toBe(true);
  });

  it("still requires more than just a bare interrogative word", () => {
    expect(hasInterrogativeTrigger("what")).toBe(false);
    expect(hasInterrogativeTrigger("why")).toBe(false);
  });



  it("rejects a mid-sentence WH-word inside a declarative paragraph", () => {
    // Regression: previously `\\bhow\\s+\\w+` matched "how they" mid-paragraph.
    expect(
      hasInterrogativeTrigger(
        "and how dangerous certain bacterial components can be"
      )
    ).toBe(false);
    expect(
      hasInterrogativeTrigger(
        "before we go deeper, remember this phrase. gram positive is thick peptidoglycan"
      )
    ).toBe(false);
  });

  it("still matches a WH-word at the start of the string", () => {
    expect(hasInterrogativeTrigger("How dangerous is this?")).toBe(true);
  });

  it("matches a WH-word right after a sentence terminator", () => {
    expect(
      hasInterrogativeTrigger("That covers cells. What happens to the electron?")
    ).toBe(true);
  });

  it("does NOT match a bare premise clause starting with 'Suppose that'", () => {
    // Regression: "Suppose that an array is already sorted" used to fire as a
    // standalone question, burning the cooldown before the real question
    // ("which search algorithm would you pick?") could be captured.
    expect(
      hasInterrogativeTrigger("Suppose that an array is already sorted")
    ).toBe(false);
    expect(
      hasInterrogativeTrigger("Suppose that the temperature increases")
    ).toBe(false);
  });

  it("still matches the real WH-question that follows a 'Suppose' premise after a sentence terminator", () => {
    expect(
      hasInterrogativeTrigger(
        "Suppose that an array is already sorted. Which search algorithm would you pick?"
      )
    ).toBe(true);
  });





  it("matches WH-questions led by discourse fillers (So/Well/Now/Okay)", () => {
    // Regression: instructors often introduce a question with "So why…".
    // Previously the clause-start anchor rejected these because the WH-word
    // wasn't the first token. Filler-strip restores reliable pickup.
    expect(
      hasInterrogativeTrigger("So why does it stop once equilibrium is reached?")
    ).toBe(true);
    expect(hasInterrogativeTrigger("Well, what does this mean?")).toBe(true);
    expect(hasInterrogativeTrigger("Now how does osmosis work?")).toBe(true);
    expect(hasInterrogativeTrigger("Okay, why is that?")).toBe(true);
  });

  it("does NOT treat declaratives ending in '?' as questions", () => {
    // Regression: Deepgram occasionally appends "?" to a declarative based on
    // rising intonation. These must not pass the trigger gate.
    expect(
      hasInterrogativeTrigger("Today, we'll be talking about osmosis?")
    ).toBe(false);
    expect(
      hasInterrogativeTrigger(
        "Osmosis moves water across a semipermeable membrane."
      )
    ).toBe(false);
  });
});

describe("looksLikeMonologue", () => {
  // Regression for the three false-positive captures shown in the screenshots:
  // multi-sentence teaching prose ending in an intonation-driven "?".
  it("flags the 'Is this. Both types of bacteria…' blob as monologue", () => {
    expect(
      looksLikeMonologue(
        "Is this. Both types of bacteria have a cell membrane and a cell wall?"
      )
    ).toBe(true);
  });

  it("flags the 'How they stain… peptidoglycan?' blob as monologue", () => {
    expect(
      looksLikeMonologue(
        "How they stain, how they interact with antibiotics, and how dangerous certain bacterial components can be. Before we go deeper, remember this phrase. Gram positive is thick peptidoglycan?"
      )
    ).toBe(true);
  });

  it("does not flag a normal single-sentence question", () => {
    expect(looksLikeMonologue("What happens to the electron?")).toBe(false);
    expect(looksLikeMonologue("How many protons are in a carbon atom?")).toBe(false);
  });
});

describe("isRhetorical — precedence", () => {
  it("rejects 'what do you think?' even though it starts with `what`", () => {
    // Regression: server used to short-circuit on leading interrogative and
    // let blocklist phrases like this through. Blocklist must win.
    expect(isRhetorical("what do you think?")).toBe(true);
  });

  it("rejects 'how about that?' even with leading `how`", () => {
    expect(isRhetorical("how about that?")).toBe(true);
  });

  it("rejects 'who knows?' even with leading `who`", () => {
    expect(isRhetorical("who knows?")).toBe(true);
  });
});
