## Goal

Verify (with an automated test) that all three premise-led instructor questions arm and finalize through `useQuestionTriggerCapture`, producing a candidate whose text contains the real WH-question:

1. "Considering the economic pressures we covered earlier, how did the war effort accelerate industrialization across the northern states?"
2. "Suppose that the array is already sorted — which search algorithm would you pick, and how does its complexity compare to a linear scan?"
3. "Given what we just said about peptidoglycan thickness, why does a gram-positive wall hold the crystal violet stain when a gram-negative wall does not?"

Sentences (1) and (2) are already covered in `src/__tests__/useQuestionTriggerCapture.test.ts`. Sentence (3) is not — it uses the `Given …, why …` premise shape, which exercises the same comma + WH-trigger path as (1).

## Changes

**`src/__tests__/useQuestionTriggerCapture.test.ts`** — add one test:

```ts
it("arms and finalizes on comma + WH-question after a 'Given…' premise (gram-positive)", () => {
  const { result, captured } = setup();
  act(() => {
    result.current.feedChunk(
      "Given what we just said about peptidoglycan thickness, why does a gram-positive wall hold the crystal violet stain when a gram-negative wall does not?",
      1000,
    );
  });
  act(() => { vi.advanceTimersByTime(2000); });
  expect(captured.length).toBe(1);
  expect(captured[0].text.toLowerCase()).toContain("why does a gram-positive wall");
});
```

No production code changes — this is a verification-only run. If the new test fails, that surfaces a real gap in `CLAUSE_START` / premise-rescue handling and we'll address it in a follow-up.

## Run

```bash
bunx vitest run src/__tests__/useQuestionTriggerCapture.test.ts src/__tests__/questionDetection.test.ts src/__tests__/usePassiveQuestionDetection.test.ts
```

Report per-sentence pass/fail and the captured `text` for each.

## Out of scope

- No edits to detection logic.
- No edge-function changes.
- No UI changes.
