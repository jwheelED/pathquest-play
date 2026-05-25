import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePassiveQuestionDetection } from "@/hooks/usePassiveQuestionDetection";

/**
 * DETECTION RELIABILITY — hook integration.
 *
 * The hook's job: take raw transcript utterances, debounce via trailing
 * silence, and surface a single candidate for the UI. These tests cover the
 * known reliability gaps: missing the FIRST ask, firing on partials, and
 * leaking across the cooldown window.
 */
describe("usePassiveQuestionDetection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("detects a question on the FIRST ask (reliability)", () => {
    const { result } = renderHook(() =>
      usePassiveQuestionDetection({
        minWordCount: 2,
        trailingSilenceMs: 1000,
        debug: false,
      }),
    );

    act(() => {
      result.current.checkUtterance("What happens now?");
    });
    // Pending — not yet promoted
    expect(result.current.pendingCandidate?.text).toBe("What happens now?");
    expect(result.current.candidate).toBeNull();

    // Trailing silence elapses → promote
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(result.current.candidate?.text).toBe("What happens now?");
  });

  it("detects a multi-word question (>5 words)", () => {
    const { result } = renderHook(() =>
      usePassiveQuestionDetection({
        minWordCount: 5,
        trailingSilenceMs: 500,
        debug: false,
      }),
    );

    act(() => {
      result.current.checkUtterance("What happens to the electron here?");
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.candidate?.text).toBe(
      "What happens to the electron here?",
    );
  });

  it("SKIPS detection on second ask within cooldown", () => {
    const { result } = renderHook(() =>
      usePassiveQuestionDetection({
        minWordCount: 2,
        cooldownMs: 15000,
        trailingSilenceMs: 200,
        autoDismissMs: 60_000,
        debug: false,
      }),
    );

    // First ask — promote
    act(() => {
      result.current.checkUtterance("What happens now?");
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.candidate?.text).toBe("What happens now?");
    const firstId = result.current.candidate?.id;

    // Second ask within cooldown — must NOT create a new pending candidate
    act(() => {
      result.current.checkUtterance("What else happened?");
    });
    expect(result.current.pendingCandidate).toBeNull();

    // Visible candidate is unchanged
    expect(result.current.candidate?.id).toBe(firstId);
  });

  it("rejects rhetorical 'does that make sense?'", () => {
    const { result } = renderHook(() =>
      usePassiveQuestionDetection({
        minWordCount: 2,
        trailingSilenceMs: 100,
        debug: false,
      }),
    );

    act(() => {
      result.current.checkUtterance("Does that make sense?");
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.candidate).toBeNull();
    expect(result.current.pendingCandidate).toBeNull();
  });

  it("rejects 'what do you think?' (rhetorical opener)", () => {
    const { result } = renderHook(() =>
      usePassiveQuestionDetection({
        minWordCount: 2,
        trailingSilenceMs: 100,
        debug: false,
      }),
    );
    act(() => {
      result.current.checkUtterance("what do you think?");
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.candidate).toBeNull();
  });

  it("auto-dismisses candidate after autoDismissMs", () => {
    const { result } = renderHook(() =>
      usePassiveQuestionDetection({
        minWordCount: 2,
        trailingSilenceMs: 100,
        autoDismissMs: 5000,
        debug: false,
      }),
    );

    act(() => {
      result.current.checkUtterance("What happens now?");
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.candidate).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(result.current.candidate).toBeNull();
  });

  it("tracks candidate history when a new candidate replaces an old one", () => {
    const { result } = renderHook(() =>
      usePassiveQuestionDetection({
        minWordCount: 2,
        cooldownMs: 100,
        trailingSilenceMs: 50,
        autoDismissMs: 60_000,
        debug: false,
      }),
    );

    act(() => {
      result.current.checkUtterance("What happens now?");
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.candidate?.text).toBe("What happens now?");

    // Wait out cooldown, then ask a new question
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current.checkUtterance("Why does the electron move?");
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.candidate?.text).toBe("Why does the electron move?");
    expect(result.current.candidateHistory.length).toBe(1);
    expect(result.current.candidateHistory[0].text).toBe("What happens now?");
  });

  it("force-promotes pending after maxPendingMs even if speaker keeps talking", () => {
    const { result } = renderHook(() =>
      usePassiveQuestionDetection({
        minWordCount: 2,
        trailingSilenceMs: 1000,
        maxPendingMs: 2000,
        debug: false,
      }),
    );

    act(() => {
      result.current.checkUtterance("What happens now?");
    });
    expect(result.current.pendingCandidate?.text).toBe("What happens now?");

    // Speaker keeps talking past maxPendingMs — next notifySpeech should force-promote
    act(() => {
      vi.advanceTimersByTime(2100);
      result.current.notifySpeech();
    });
    expect(result.current.candidate?.text).toBe("What happens now?");
  });

  it("ALLOWS detection during cooldown when no candidate is visible", () => {
    const { result } = renderHook(() =>
      usePassiveQuestionDetection({
        minWordCount: 2,
        cooldownMs: 15_000,
        trailingSilenceMs: 100,
        autoDismissMs: 2_000,
        debug: false,
      }),
    );

    // First question — promoted, then auto-dismissed
    act(() => {
      result.current.checkUtterance("What happens now?");
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.candidate).not.toBeNull();

    // Wait for autoDismiss (2s) but stay within cooldown (15s)
    act(() => {
      vi.advanceTimersByTime(2_100);
    });
    expect(result.current.candidate).toBeNull();

    // New question arrives — cooldown still active, but no visible candidate
    // → should still be detected (fixes "cooldown swallows better question" bug)
    act(() => {
      result.current.checkUtterance("Why is the electron moving?");
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.candidate?.text).toBe("Why is the electron moving?");
  });

  it("notifySpeech delays promotion (prevents firing on partials)", () => {
    const { result } = renderHook(() =>
      usePassiveQuestionDetection({
        minWordCount: 2,
        trailingSilenceMs: 1000,
        debug: false,
      }),
    );

    act(() => {
      result.current.checkUtterance("What happens now?");
    });
    expect(result.current.pendingCandidate?.text).toBe("What happens now?");

    // Speaker keeps talking 500ms in → silence timer resets
    act(() => {
      vi.advanceTimersByTime(500);
      result.current.notifySpeech();
    });
    act(() => {
      vi.advanceTimersByTime(800);
    });
    // Not promoted yet — full 1000ms silence has not elapsed since notifySpeech
    expect(result.current.candidate).toBeNull();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.candidate?.text).toBe("What happens now?");
  });
});
