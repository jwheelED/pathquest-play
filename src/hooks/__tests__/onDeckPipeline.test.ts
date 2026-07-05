/**
 * End-to-end test for the live-lecture "question on deck" pipeline.
 *
 * SEAMS
 * -----
 * MOCKED (boundary only): the transcription output. jsdom has no real mic,
 *   MediaRecorder, or Deepgram WebSocket, so we cannot exercise audio capture
 *   itself. Instead we feed the EXACT shape `DeepgramStreamingClient.onTranscript`
 *   would produce after `sanitizeTranscript` — i.e. ordered final chunks with
 *   inter-chunk gaps — straight into the real downstream hooks.
 *
 * REAL (under test, NOT stubbed):
 *   - useQuestionTriggerCapture (buffering, premise rescue, semantic
 *     completion gate, priorContext slicing, cooldown).
 *   - usePassiveQuestionDetection (extractQuestions, hasInterrogativeTrigger,
 *     isRhetorical, trailing-silence promotion).
 *   - The fanout (`feedChunk` + `checkUtterance`) is wired identically to
 *     useLectureRecording.
 *
 * If detection regresses to emitting a card on declarative narration, the
 * fp-declarative-guard scenario fails loudly — that's the production bug
 * this suite is the regression net for.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SCENARIOS } from "./onDeckPipeline.fixtures";
import { renderPipeline, playChunks, readFinalCandidate } from "./onDeckPipeline.harness";

describe("on-deck question pipeline (e2e from transcript chunks)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  for (const scenario of SCENARIOS) {
    it(`${scenario.audioId}: ${scenario.note}`, () => {
      const api = renderPipeline();
      playChunks(api, scenario.chunks);
      const final = readFinalCandidate(api);

      if (scenario.expectedExtractedQuestion === null) {
        expect(
          final,
          `Expected NO on-deck card, but got: ${JSON.stringify(final)}`,
        ).toBeNull();
        return;
      }

      expect(final).not.toBeNull();
      expect(final!.text.toLowerCase()).toContain(
        scenario.expectedExtractedQuestion.toLowerCase(),
      );
      expect(final!.text.trim().endsWith("?")).toBe(true);

      if (scenario.expectPriorContext === "present") {
        expect(final!.priorContext && final!.priorContext.length > 0).toBe(true);
      }
      if (scenario.expectPriorContext === "absent") {
        // Self-contained question: pipeline should not attach unrelated narration.
        expect(final!.priorContext ?? "").toBe("");
      }
    });
  }

  // Optional live smoke — manual / opt-in. Skips cleanly when not requested,
  // and would require a real Deepgram proxy + audio fixture to actually run.
  const liveEnabled =
    typeof process !== "undefined" && process.env?.RUN_LIVE_PIPELINE === "1";
  (liveEnabled ? it : it.skip)(
    "[live] real transcription → real pipeline (manual)",
    () => {
      // Intentionally unimplemented: jsdom cannot host a real audio file +
      // Deepgram WS. Documented here so the next engineer knows where the
      // genuine live path would attach.
      expect(true).toBe(true);
    },
  );
});
