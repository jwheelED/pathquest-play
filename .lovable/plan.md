## Problem

The detector now over-fires. The screenshots show long monologue passages captured as "questions" — e.g. *"How they stain, how they interact with antibiotics, and how dangerous certain bacterial components can be… Gram positive is thick peptidoglycan?"* That is a teaching statement, not a question. It got captured because:

1. **Trigger patterns are too permissive.** `\bwhat\s+\w+`, `\bhow\s+\w+`, etc. match *anywhere* in the text. Phrases like "how they stain", "how dangerous", "how they interact" inside a declarative paragraph all trigger.
2. **No sentence-boundary requirement.** A WH-word buried 20 words deep in a monologue counts the same as one that starts a real question.
3. **No length ceiling.** Real spoken questions are short (typically ≤ 20 words). Multi-sentence paragraphs slip through.
4. **`?` placement isn't checked.** Deepgram occasionally appends `?` based on intonation at the end of a declarative; if any WH-word appears earlier in that blob, it passes.

## Fix

Tighten both detection paths (`usePassiveQuestionDetection.ts` + `useQuestionTriggerCapture.ts`) and the shared `_shared/questionDetection.ts`:

1. **WH-word must start the question clause.** Replace the broad `\b(what|why|how|…)\s+\w+` patterns with anchored ones that require the WH-word at the start of the sentence, after a clause boundary (`. ! ? ; ,` + space), or after a known subordinator (`if/when/suppose/given/…`). Keep the existing yes/no inversion patterns (`is/are/do/can + pronoun`) but also require them at clause start.
2. **Hard word-count ceiling for passive candidates.** Reject any candidate over ~22 words — real spoken questions don't run that long; longer hits are monologue blobs.
3. **Trigger must be close to the `?`.** In `extractQuestions`, after splitting on terminal punctuation, require the trigger to appear within the same clause as the `?` (not 30 words back).
4. **Strip declarative-paragraph captures.** If the candidate contains more than one sentence-terminator (`.` or `!`) before the `?`, treat it as monologue and reject.
5. **Update tests.** Add regression cases for the three offending captures from the screenshots; keep all existing passing tests green.

## Files

- `src/hooks/usePassiveQuestionDetection.ts` — tighten `TRIGGER_PATTERNS`, add length cap + monologue check in `checkUtterance`.
- `src/hooks/useQuestionTriggerCapture.ts` — same trigger tightening + same length/monologue gate before emitting.
- `supabase/functions/_shared/questionDetection.ts` — mirror the trigger tightening so server-side detection stays consistent.
- `src/__tests__/questionDetection.test.ts` + `usePassiveQuestionDetection.test.ts` — add regression cases for the three false-positive transcripts.

## Out of scope

The "All of the above" distractor visible in screenshot #3 is an MCQ generation issue (separate from detection). Not touched here unless you want it bundled.
