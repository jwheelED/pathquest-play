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

  it("scans a question spoken during a busy scan as soon as that scan returns", async () => {
    let resolveFirst: (v: ScanResponse) => void = () => {};
    const scan = vi
      .fn()
      .mockImplementationOnce(() => new Promise<ScanResponse>((r) => { resolveFirst = r; }))
      .mockImplementation(async () => yes("What is four plus four?"));
    const onDetected = vi.fn();
    const { result } = renderHook(() => useLlmQuestionScanner({ enabled: true, scan, onDetected, minGapMs: 0 }));
    act(() => result.current.feed("okay let's warm up"));
    await act(async () => { vi.advanceTimersByTime(550); });
    expect(scan).toHaveBeenCalledTimes(1);
    act(() => result.current.feed("what's four plus four"));
    await act(async () => { vi.advanceTimersByTime(550); });
    expect(scan).toHaveBeenCalledTimes(1);
    await act(async () => { resolveFirst({ detected: false }); });
    expect(scan).toHaveBeenCalledTimes(2);
    expect(onDetected).toHaveBeenCalledTimes(1);
  });

  it("scans live text once it stops changing, without waiting for the final line", async () => {
    const scan = vi.fn(async () => yes("What is two plus two?"));
    const onDetected = vi.fn();
    const { result } = renderHook(() => useLlmQuestionScanner({ enabled: true, scan, onDetected }));
    act(() => result.current.feedInterim("What is two"));
    await act(async () => { vi.advanceTimersByTime(900); });
    act(() => result.current.feedInterim("What is two plus two?"));
    await act(async () => { vi.advanceTimersByTime(900); });
    act(() => result.current.feedInterim("What is two plus two?")); // unchanged repeat
    expect(scan).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(250); });
    expect(scan).toHaveBeenCalledTimes(1);
    expect(onDetected).toHaveBeenCalledTimes(1);
    // The late FINAL for the same words is not scanned again.
    act(() => result.current.feed("What is two plus two?"));
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it("lets a repeat through when the first detection could not be shown", async () => {
    const onDetected = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const scan = vi.fn(async () => yes("What is four plus four?"));
    const { result } = renderHook(() => useLlmQuestionScanner({ enabled: true, scan, onDetected, minGapMs: 0 }));
    act(() => result.current.feed("what is four plus four"));
    await act(async () => { vi.advanceTimersByTime(600); });
    act(() => result.current.feed("again, what is four plus four"));
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(onDetected).toHaveBeenCalledTimes(2);
  });

  it("treats the same question asked again after 2 minutes as new", async () => {
    const onDetected = vi.fn();
    const scan = vi.fn(async () => yes("What is four plus four?"));
    const { result } = renderHook(() => useLlmQuestionScanner({ enabled: true, scan, onDetected, minGapMs: 0 }));
    act(() => result.current.feed("what is four plus four"));
    await act(async () => { vi.advanceTimersByTime(600); });
    await act(async () => { vi.advanceTimersByTime(121_000); });
    act(() => result.current.feed("what is four plus four"));
    await act(async () => { vi.advanceTimersByTime(600); });
    expect(onDetected).toHaveBeenCalledTimes(2);
  });
});
