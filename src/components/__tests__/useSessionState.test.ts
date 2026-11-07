import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionState } from "@/components/live/useSessionState";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), insert: undefined as ((payload: { new: Record<string, unknown> }) => void) | undefined }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    auth: { getSession: vi.fn() },
    channel: () => {
      const channel = {
        on: (_kind: string, filter: { event: string; table: string }, callback: (payload: { new: Record<string, unknown> }) => void) => {
          if (filter.event === "INSERT") mocks.insert = callback;
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));

const question = (number: number) => ({
  id: `q${number}`, question_number: number,
  sent_at: `2026-11-07T02:00:${String(number).padStart(2, "0")}Z`,
  question_content: { question: `Question ${number}`, type: "multiple_choice", options: ["A. First", "B. Second"], correctAnswer: "A" },
  image_kind: null,
});
const state = (questions: Record<string, unknown>[]) => ({ data: { session: { id: "session", title: "Test", is_active: true }, questions }, error: null });
async function flush() { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); }

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.setItem("participantId:123456", "participant");
  mocks.invoke.mockReset();
  mocks.insert = undefined;
  mocks.invoke.mockResolvedValue(state([]));
});
afterEach(() => { cleanup(); vi.useRealTimers(); localStorage.clear(); });

describe("live question delivery", () => {
  it("keeps an answer open past the former timeout and submits only on request", async () => {
    mocks.invoke.mockResolvedValue(state([question(1)]));
    const hook = renderHook(() => useSessionState("123456"));
    await flush();
    act(() => { hook.result.current.selectOption("B"); hook.result.current.selectConfidence(2); });
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(hook.result.current.phase).toBe("checkin");
    expect(hook.result.current.selectedOption).toBe("B");
    expect(mocks.invoke.mock.calls.filter(([name]) => name === "submit-live-response")).toHaveLength(0);
    await act(async () => { await hook.result.current.submitAnswer(); });
    expect(mocks.invoke).toHaveBeenCalledWith("submit-live-response", {
      body: { questionId: "q1", participantId: "participant", answer: "B", confidenceLevel: "2", responseTimeMs: 120_000 },
    });
    expect(hook.result.current.phase).toBe("feedback");
  });

  it("recovers a missed realtime question within three seconds without needing an image", async () => {
    const hook = renderHook(() => useSessionState("123456"));
    await flush();
    mocks.invoke.mockResolvedValue(state([question(1)]));
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(hook.result.current.currentQuestion?.id).toBe("q1");
  });

  it("preserves an active answer and delivers every queued question after feedback", async () => {
    mocks.invoke.mockResolvedValueOnce(state([question(1)]));
    const hook = renderHook(() => useSessionState("123456"));
    await flush();
    act(() => { hook.result.current.selectOption("B"); hook.result.current.selectConfidence(2); });
    act(() => { mocks.insert?.({ new: question(2) }); mocks.insert?.({ new: question(3) }); });
    expect(hook.result.current.currentQuestion?.id).toBe("q1");
    expect(hook.result.current.selectedOption).toBe("B");
    expect(hook.result.current.confidence).toBe(2);
    await act(async () => { await hook.result.current.submitAnswer(); });
    act(() => hook.result.current.dismissFeedback());
    expect(hook.result.current.currentQuestion?.id).toBe("q2");
    await act(async () => { await hook.result.current.submitAnswer(); });
    act(() => hook.result.current.dismissFeedback());
    expect(hook.result.current.currentQuestion?.id).toBe("q3");
  });

  it("does not let a slow previous submission hide the next question", async () => {
    let finishSubmission: ((value: { data: { response: { isCorrect: boolean } } }) => void) | undefined;
    mocks.invoke.mockImplementation((name: string) => name === "submit-live-response"
      ? new Promise((resolve) => { finishSubmission = resolve; })
      : Promise.resolve(state([question(1)])));
    const hook = renderHook(() => useSessionState("123456"));
    await flush();
    let submission: Promise<void> | undefined;
    act(() => { submission = hook.result.current.submitAnswer(); });
    act(() => mocks.insert?.({ new: question(2) }));
    await act(async () => { finishSubmission?.({ data: { response: { isCorrect: true } } }); await submission; });
    act(() => hook.result.current.dismissFeedback());
    expect(hook.result.current.currentQuestion?.id).toBe("q2");
    expect(hook.result.current.phase).toBe("checkin");
  });

  it("recovers all newer questions in a newest-first poll without replaying old questions", async () => {
    mocks.invoke.mockResolvedValueOnce(state([question(1)]));
    const hook = renderHook(() => useSessionState("123456"));
    await flush();
    mocks.invoke.mockResolvedValue(state([question(3), question(2), question(1)]));
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await act(async () => { await hook.result.current.submitAnswer(); });
    act(() => hook.result.current.dismissFeedback());
    expect(hook.result.current.currentQuestion?.id).toBe("q2");
    await act(async () => { await hook.result.current.submitAnswer(); });
    act(() => hook.result.current.dismissFeedback());
    expect(hook.result.current.currentQuestion?.id).toBe("q3");
  });
});