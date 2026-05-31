## Goal

Add a deterministic, vitest/jsdom test that drives the on-deck question pipeline end-to-end from "transcription output" through the real capture + passive detection hooks, asserting the final extracted question (or absence).

## Honest seam choice

`useLectureRecording.ts` performs two non-testable things in jsdom: mic capture (`getUserMedia` + `MediaRecorder`) and Deepgram streaming. Past those, every final transcript chunk is fanned out into:

1. `triggerCapture.feedChunk(text, Date.now())` — real `useQuestionTriggerCapture`
2. `passive.checkUtterance(text)` — real `usePassiveQuestionDetection`

…and the on-deck UI reads `triggerCapture` capture-complete callback OR `passive.candidate`. That fanout is the contract.

So the test mocks **only** the transcription boundary by directly driving those two hooks with scripted final chunks (the exact shape `DeepgramStreamingClient.onTranscript` would produce after `sanitizeTranscript`). Everything downstream — trigger arming, buffering, semantic completion gate, premise rescue, priorContext slicing, rhetorical/greeting filtering, trailing-silence promotion, cooldown — runs as real production code. No stubbing of the logic under test. This is the most faithful e2e shape achievable without Playwright + real mic + real Deepgram.

A `// SEAMS:` header comment in the test file will document this.

## Files

```text
src/hooks/__tests__/
  onDeckPipeline.fixtures.ts        # scenarios
  onDeckPipeline.harness.ts         # renderHook wiring + chunk driver
  onDeckPipeline.test.ts            # the test
```

### `onDeckPipeline.fixtures.ts`

Exports `SCENARIOS: PipelineScenario[]`:

```ts
type Chunk = { text: string; gapMs?: number; confidence?: number };
type PipelineScenario = {
  audioId: string;              // logical clip id (no real audio)
  note: string;
  chunks: Chunk[];              // scripted final transcript chunks
  expectedExtractedQuestion: string | null;
  expectPriorContext?: 'present' | 'absent';
};
```

Four required scenarios:

1. **tp-short** — single chunk `"What happens to the electron here?"` → expected exactly that, `priorContext: 'absent'`.
2. **tp-long-multichunk** — split across 3 chunks of `"Suppose that the array is already sorted —"`, `"which search algorithm would you pick,"`, `"and how does its complexity compare to a linear scan?"` with small gaps → expected merged form containing `"which search algorithm would you pick"` and ending with `?`.
3. **fp-declarative-guard** — narration with trigger words used declaratively + rhetorical fillers, e.g.:
   - `"We'll look at how they stain, how they interact with antibiotics, and how dangerous certain components can be."`
   - `"Right? Make sense? Any questions?"`
   - `"And we have to remember just how dangerous these components can be in everyday use."`
   → `expectedExtractedQuestion: null`.
4. **context-pull** — topic narration chunk, short pause, then `"So why does it stop once equilibrium is reached?"` → expected captured question without leading filler, `priorContext: 'present'` containing antecedent prose. Paired sub-assertion confirms scenario 1 (self-contained) has no priorContext.

### `onDeckPipeline.harness.ts`

```ts
export function renderPipeline(opts?) {
  // renderHook(() => {
  //   const trigger = useQuestionTriggerCapture({ debug: false, ...opts.trigger });
  //   const passive = usePassiveQuestionDetection({ debug: false, ...opts.passive });
  //   return { trigger, passive };
  // })
}

export async function playChunks(api, chunks) {
  // For each chunk:
  //   act(() => { api.trigger.feedChunk(c.text, nowRef); api.passive.checkUtterance(c.text); });
  //   act(() => { vi.advanceTimersByTime(c.gapMs ?? 1500); nowRef += gap });
  // After last chunk: advance enough time to flush trailing-silence + completion timer + max extensions.
}

export function readFinalCandidate(api, captured) {
  // Prefer trigger-capture callback result (the production on-deck source);
  // fall back to passive.candidate if no trigger fired (short questions path).
}
```

Helper also wires `setOnCaptureComplete` to push into a captured[] array.

### `onDeckPipeline.test.ts`

Top comment block documenting seams (mocked: transcription output only; real: capture, detection, gating, promotion). Uses `vi.useFakeTimers()` / `vi.useRealTimers()` (matching `usePassiveQuestionDetection.test.ts` style).

```ts
describe.each(SCENARIOS)('on-deck pipeline — $audioId', (s) => {
  it('produces the expected on-deck question', async () => {
    const api = renderPipeline();
    const captured: PassiveQuestionCandidate[] = [];
    act(() => api.trigger.setOnCaptureComplete(c => captured.push(c)));
    await playChunks(api, s.chunks);
    const final = readFinalCandidate(api, captured);
    if (s.expectedExtractedQuestion === null) {
      expect(final).toBeNull();
    } else {
      expect(final).not.toBeNull();
      expect(final!.text.toLowerCase()).toContain(s.expectedExtractedQuestion.toLowerCase());
      if (s.expectPriorContext === 'present') expect(final!.priorContext).toBeTruthy();
      if (s.expectPriorContext === 'absent') expect(final!.priorContext ?? '').toBe('');
    }
  });
});
```

The false-positive guard scenario will **fail loudly** if detection regresses to emitting a card on declarative narration — exactly the production bug being prevented.

## Optional live smoke (skipped by default)

`it.skipIf(!process.env.RUN_LIVE_PIPELINE)('live smoke', ...)` — placeholder that, when both `RUN_LIVE_PIPELINE=1` and `VITE_DEEPGRAM_PROXY_URL` are set, would `supabase.functions.invoke('transcribe-lecture', { audio: <fixture> })` and feed real output through the same harness. Documented as manual-only because jsdom has no audio API.

## Out of scope (called out explicitly)

- `useLectureRecording` itself isn't rendered. Rendering it would require stubbing `getUserMedia`, `MediaRecorder`, `DeepgramStreamingClient`, **and** the transcription edge function — that's four mocks around the same boundary instead of one, with no added coverage of real logic. The fanout being verified (`feedChunk` + `checkUtterance`) is a one-line wiring that's better asserted (if desired) with a separate tiny unit test rather than an audio-simulating shell.
- No Playwright/Cypress, no real network, no real `MediaRecorder` polyfill, no new deps.

## Verification

Run `bunx vitest run src/hooks/__tests__/onDeckPipeline.test.ts` and paste output. If any scenario fails I'll diagnose against the real hook (not loosen the assertion) and report; the false-positive guard in particular must stay strict.
