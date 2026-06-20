import { act, renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { useQuestionTriggerCapture } from "@/hooks/useQuestionTriggerCapture";
import {
  usePassiveQuestionDetection,
  type PassiveQuestionCandidate,
} from "@/hooks/usePassiveQuestionDetection";
import type { ScriptedChunk } from "./onDeckPipeline.fixtures";

/**
 * Wires the two REAL hooks the way useLectureRecording wires them in
 * production: every final transcript chunk fans out to both
 * triggerCapture.feedChunk(text, ts) AND passive.checkUtterance(text).
 *
 * The on-deck card displayed to the instructor is sourced from either the
 * trigger-capture completion callback OR passive.candidate (whichever arms
 * first), so the helper exposes both.
 */
export function renderPipeline() {
  const captured: PassiveQuestionCandidate[] = [];
  const hook = renderHook(() => {
    const trigger = useQuestionTriggerCapture({ debug: false });
    const passive = usePassiveQuestionDetection({
      minWordCount: 4,
      trailingSilenceMs: 800,
      cooldownMs: 12000,
      autoDismissMs: 60_000,
      debug: false,
    });
    return { trigger, passive };
  });
  act(() => {
    hook.result.current.trigger.setOnCaptureComplete((c) => captured.push(c));
  });
  return { hook, captured };
}

/**
 * Plays scripted chunks through the pipeline using fake timers.
 * Pass explicit timestamps (mirrors existing tests) so feedChunk's gap math
 * is fully deterministic regardless of the surrounding clock.
 */
export function playChunks(
  api: ReturnType<typeof renderPipeline>,
  chunks: ScriptedChunk[],
) {
  let now = 1000;
  for (const c of chunks) {
    const ts = now;
    act(() => {
      api.hook.result.current.trigger.feedChunk(c.text, ts);
      api.hook.result.current.passive.checkUtterance(c.text, {
        confidence: c.confidence,
      });
    });
    const gap = c.gapMs ?? 1500;
    act(() => {
      vi.advanceTimersByTime(gap);
    });
    now += gap;
  }
  // Flush any remaining completion / extension / trailing-silence timers.
  act(() => {
    vi.advanceTimersByTime(5000);
  });
}

/**
 * Returns the final on-deck candidate: trigger-capture wins when it armed
 * (longer / premise-led questions), otherwise the passive promoted candidate
 * (short self-contained questions).
 */
export function readFinalCandidate(
  api: ReturnType<typeof renderPipeline>,
): PassiveQuestionCandidate | null {
  if (api.captured.length > 0) {
    return api.captured[api.captured.length - 1];
  }
  return api.hook.result.current.passive.candidate ?? null;
}
