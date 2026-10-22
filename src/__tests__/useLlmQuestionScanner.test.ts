import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLlmQuestionScanner, type ScanResponse } from "@/hooks/useLlmQuestionScanner";

const yes = (q: string): ScanResponse => ({ detected: true, question: q, format: "multiple_choice" });

describe("useLlmQuestionScanner", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("scans after a 0.5s pause, not while the instructor keeps talking", async () => {
    const scan = vi.fn(async () => ({ detected: false }) as ScanResponse);
    const { result } = renderHook(() => useLlmQuestionScanner({ enabled: true, scan, onDetected: vi.fn() }));
    act(() => result.current.feed("So looking at this graph"));
    await act(async () => { vi.advanceTimersByTime(400); });
    act(() => result.current.feed("we see a spike. Why?"));
    await act(async () => { vi.advanceTimersByTime(450); });
    expect(scan).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("waits at least 1s between scans", async () => {
    const scan = vi.fn(async () => ({ detected: false }) as ScanResponse);
    const { result } = renderHook(() => useLlmQuestionScanner({ enabled: true, scan, onDetected: vi.fn() }));
    act(() => result.current.feed("What is the derivative of sine"));
    await act(async () => { vi.advanceTimersByTime(550); });
    expect(scan).toHaveBeenCalledTimes(1);
    act(() => result.current.feed("and what about cosine"));
    await act(async () => { vi.advanceTimersByTime(550); });
    expect(scan).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(450); });
    expect(scan).toHaveBeenCalledTimes(2);
  });

  it("never runs two scans at once", async () => {
    let resolve: (v: ScanResponse) => void = () => {};
    const scan = vi.fn(() => new Promise<ScanResponse>((r) => { resolve = r; }));
    const { result } = renderHook(() => useLlmQuestionScanner({ enabled: true, scan, onDetected: vi.fn(), minGapMs: 0 }));
    act(() => result.current.feed("What is the derivative of sine"));
    await act(async () => { vi.advanceTimersByTime(1700); });
    act(() => result.current.feed("and what about cosine here"));
    await act(async () => { vi.advanceTimersByTime(1700); });
    expect(scan).toHaveBeenCalledTimes(1);
    await act(async () => { resolve({ detected: false }); });
  });

  it("ignores a repeat of the same question", async () => {
    const onDetected = vi.fn();
    const scan = vi.fn(async () => yes("Who wrote the Emancipation Proclamation?"));
    const { result } = renderHook(() => useLlmQuestionScanner({ enabled: true, scan, onDetected, minGapMs: 0 }));
    act(() => result.current.feed("who wrote the emancipation proclamation"));
    await act(async () => { vi.advanceTimersByTime(1700); });
    act(() => result.current.feed("again, who wrote the emancipation proclamation"));
    await act(async () => { vi.advanceTimersByTime(1700); });
    expect(scan).toHaveBeenCalledTimes(2);
    expect(onDetected).toHaveBeenCalledTimes(1);
  });
});
