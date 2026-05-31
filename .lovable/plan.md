# Stop premature question capture on premise clauses + intonation "?"

## Diagnosis

Two compounding bugs in `src/hooks/useQuestionTriggerCapture.ts` (mirrored in `usePassiveQuestionDetection.ts` and `_shared/questionDetection.ts`):

### Bug 1 — `suppose that` is both a trigger AND a premise subordinator

`TRIGGER_PATTERNS` includes `/\bsuppose\s+that\b/i`, but the same phrase is also in `PREMISE_SUBORDINATORS`. `suppose` / `suppose that` introduces the setup ("Suppose X, what would Y do?"), it is not itself the question. So the trigger fires on the premise, the completeness gate passes (the premise is grammatically complete), capture finalizes, the 12s cooldown locks in, and the real question that follows is dropped.

This is exactly what produced "Suppose that an array is already sorted?" in the screenshot — the instructor was about to continue with "...which search algorithm would you pick?", but the premise already armed and shipped.

### Bug 2 — "?" fast-path bypasses the completeness gate

In `feedChunk` (~line 635) any chunk ending in `?` triggers `finalizeCapture(now, true)` with `isForced=true`. With `isForced` the completeness gate's `hold` becomes a hard reject and silence-wait is skipped — but more importantly, the gate is still consulted; *however*, in many cases the gate passes on premise-shaped utterances (≥6 words, no dangling tail, trigger not near end). The fast-path makes the system trust Deepgram's intonation-driven `?`, which Deepgram routinely appends on dashes, commas, and rising-pitch pauses mid-sentence.

Combined effect: a single intonation unit at the start of a sentence ("Suppose that an array is already sorted —") gets a `?` from Deepgram, the fast-path finalizes immediately, and the cooldown blocks the real question.

## Fix

### 1. Remove `suppose that` from interrogative triggers (3 files)

`src/hooks/useQuestionTriggerCapture.ts`, `src/hooks/usePassiveQuestionDetection.ts`, and `supabase/functions/_shared/questionDetection.ts`:

Delete the `/\bsuppose\s+that\b/i` line from `TRIGGER_PATTERNS`. Keep `suppose` / `supposing` in `PREMISE_SUBORDINATORS` — that's where it belongs, and the premise-rescue path will still attach it to the real question when the actual interrogative trigger fires later in the same breath.

### 2. Tighten the "?" fast-path (`useQuestionTriggerCapture.ts`)

In `feedChunk`, when a chunk arrives ending in `?`:
- Still take the fast path (don't wait for min-silence), BUT
- Require **either** the held-for time `>= minHoldMs` (~400ms — proves it's not the very first chunk after arming) **and** at least one full silence/sentence-end since arming, **or** the buffer contains a strong interrogative shape (a clause-anchored WH-word or subject-aux inversion **plus** ≥8 words after the trigger).
- Otherwise treat the `?` like a normal sentence-end: run through the standard `finalizeCapture(now)` path (not forced), so the completeness gate can hold for one extension if the question still looks incomplete (trailing dangler, trigger near end, etc.).

Concretely: replace the unconditional `finalizeCapture(now, true)` with a gated version that only forces when `heldFor >= minHoldMs && wordCount(buffer-after-trigger) >= 8`.

### 3. Add regression tests (`src/__tests__/`)

- `useQuestionTriggerCapture` (or shared trigger tests): assert that "Suppose that an array is already sorted" alone does NOT arm a trigger, but "Suppose that an array is already sorted — which search algorithm would you pick?" DOES, and the resulting candidate text starts with "Which search algorithm…" with the premise carried in priorContext via the premise-rescue path.
- `questionDetection.test.ts`: assert `hasInterrogativeTrigger("Suppose that an array is already sorted")` returns `false`.

## Files changed

- `src/hooks/useQuestionTriggerCapture.ts` — drop `suppose that` trigger; gate the `?` fast-path on hold-time + word-count.
- `src/hooks/usePassiveQuestionDetection.ts` — drop `suppose that` trigger.
- `supabase/functions/_shared/questionDetection.ts` — drop `suppose that` trigger.
- `src/__tests__/questionDetection.test.ts` — add regression case.
- `src/__tests__/useQuestionTriggerCapture.test.ts` (create if absent) or extend `usePassiveQuestionDetection.test.ts` — premise-then-question scenario.

No DB / edge-function-deploy / schema changes.

## Expected impact

- Opening premises like "Suppose…", "Imagine…", "Consider…" no longer trigger on their own and burn the 12s cooldown.
- Deepgram's stray intonation-driven `?` mid-sentence no longer force-ships a half-formed question; the gate gets a chance to hold for the rest of the utterance.
- The real question that follows the premise is correctly captured, with the premise attached as context.
