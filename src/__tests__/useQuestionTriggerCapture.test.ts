import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useQuestionTriggerCapture } from "@/hooks/useQuestionTriggerCapture";
import type { PassiveQuestionCandidate } from "@/hooks/usePassiveQuestionDetection";

/**
 * Regression: long premise-led questions must arm the trigger even when the
 * WH-word is preceded by a comma or em-dash rather than a hard terminator.
 *
 * Before the fix, CLAUSE_START only allowed `.?!;` before WH-triggers, so
 * these realistic instructor questions never armed capture.
 */
describe("useQuestionTriggerCapture — premise-led questions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(overrides: Record<string, unknown> = {}) {
    const captured: PassiveQuestionCandidate[] = [];
    const { result } = renderHook(() =>
      useQuestionTriggerCapture({
        cooldownMs: 12000,
        minSilenceMs: 100,
        minHoldMs: 100,
        completionTimeoutMs: 500,
        extensionMs: 200,
        maxExtensions: 1,
        softCompleteMs: 300,
        debug: false,
        ...overrides,
      }),
    );
    act(() => {
      result.current.setOnCaptureComplete((c) => captured.push(c));
    });
    return { result, captured };
  }

  it("captures short natural WH questions like 'Who wrote the Emancipation Proclamation?'", () => {
    const { result, captured } = setup({ minCompleteWords: 5 });
    act(() => {
      result.current.feedChunk("Who wrote the Emancipation Proclamation?", 1000);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(captured.length).toBe(1);
    expect(captured[0].text.toLowerCase()).toContain("emancipation proclamation");
  });


  it("arms and finalizes on em-dash + WH-question", () => {
    const { result, captured } = setup();
    act(() => {
      result.current.feedChunk(
        "Suppose that the array is already sorted — which search algorithm would you pick, and how does its complexity compare to a linear scan?",
        1000,
      );
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(captured.length).toBe(1);
    expect(captured[0].text.toLowerCase()).toContain("which search algorithm");
  });

  it("captures a premise-led question split across Deepgram chunks without appending the premise to the end", () => {
    const { result, captured } = setup();
    act(() => {
      result.current.feedChunk("Supposing that the array is already sorted,", 1000);
    });
    act(() => {
      result.current.feedChunk(
        "which search algorithm would you pick, and how does its complexity compare to a linear scan?",
        2000,
      );
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(captured.length).toBe(1);
    expect(captured[0].text).toBe(
      "Supposing that the array is already sorted, which search algorithm would you pick, and how does its complexity compare to a linear scan?",
    );
  });

  it("does not re-arm from an older question that is still in the rolling buffer", () => {
    const { result, captured } = setup({ cooldownMs: 12000, minCompleteWords: 4 });
    act(() => {
      result.current.feedChunk("What determines the runtime complexity?", 1000);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(captured.length).toBe(1);

    act(() => {
      vi.advanceTimersByTime(13000);
      result.current.feedChunk("Supposing that the array is already sorted,", 16000);
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(captured.length).toBe(1);
  });

  it("arms and finalizes on comma + WH-question after a 'Considering…' premise", () => {
    const { result, captured } = setup();
    act(() => {
      result.current.feedChunk(
        "Considering the economic pressures we covered earlier, how did the war effort accelerate industrialization across the northern states?",
        1000,
      );
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(captured.length).toBe(1);
    expect(captured[0].text.toLowerCase()).toContain("how did the war effort");
  });

  it("arms and finalizes on comma + WH-question after a 'Given…' premise (gram-positive)", () => {
    const { result, captured } = setup();
    act(() => {
      result.current.feedChunk(
        "Given what we just said about peptidoglycan thickness, why does a gram-positive wall hold the crystal violet stain when a gram-negative wall does not?",
        1000,
      );
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(captured.length).toBe(1);
    expect(captured[0].text.toLowerCase()).toContain("why does a gram-positive wall");
  });



  it("does NOT arm on a mid-sentence WH inside a declarative", () => {
    const { result, captured } = setup();
    act(() => {
      result.current.feedChunk(
        "And we have to remember just how dangerous these components can be in everyday use.",
        1000,
      );
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(captured.length).toBe(0);
  });
});
