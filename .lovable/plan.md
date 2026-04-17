

## Problem

Two issues, one root cause: the **Question on Deck preview** (MCQ options + short-answer expected answer) is generated from the **question text alone**, with no lecture transcript context.

### What's happening today

In `src/components/instructor/QuestionOnDeck.tsx` (lines 281–296), when a candidate question is captured, it calls:

```ts
supabase.functions.invoke('generate-mcq-options', { body: { question_text } })
supabase.functions.invoke('generate-expected-answer', { body: { question_text } })
```

Notice — **no transcript is passed**. The full lecture transcript (`transcriptBufferRef.current`) lives in `LectureTranscription.tsx` but is never piped down into `QuestionOnDeck`.

The edge functions (`generate-mcq-options`, `generate-expected-answer`) already accept an optional `source_transcript` field — they just never receive it from this code path. And `generate-expected-answer`'s prompt literally says *"Base your answer on the lecture context above, not general knowledge"* — so when context is empty, the model has nothing to ground on and produces vague or wrong "ideal" answers, which then makes auto-grading wrong.

Separately, even where transcript IS passed elsewhere in the app, only `.slice(-800)` (≈last 800 chars, ~30 seconds) is used — way too narrow for "full context."

## Fix

Three small, surgical changes:

### 1. Pipe the full lecture transcript into Question on Deck
Add a `transcriptContext: string` prop to `QuestionOnDeck`. In `LectureTranscription.tsx`, pass `transcriptBufferRef.current` (the running lecture buffer) on every render where Question on Deck is rendered.

### 2. Forward transcript to both edge functions
Update the two `supabase.functions.invoke` calls in `QuestionOnDeck.generatePreview()` to include `source_transcript: transcriptContext`.

### 3. Widen the context window in the edge functions
In `generate-mcq-options` and `generate-expected-answer`, change `source_transcript.slice(-800)` to `source_transcript.slice(-6000)` (≈last 3–4 minutes, well within Gemini Flash's context window). Also strengthen the prompts:
- **MCQ**: "Use the lecture context as the primary source for the correct answer. Use world knowledge only as a fallback."
- **Short answer**: Keep "ground in lecture" but add: "If the lecture explicitly states the answer, quote/paraphrase it directly. The expected answer should be specific and factually correct, not vague."

### 4. (Bonus) Also widen context for the candidate text itself
The trigger-capture system pulls a ~500-char window around the trigger. That stays as-is for *detecting* the question, but the **transcript passed to AI generation** should be the full rolling lecture buffer (not just the trigger window) — which is what change #1 accomplishes.

## Files Changed

| File | Change |
|---|---|
| `src/components/instructor/QuestionOnDeck.tsx` | Add `transcriptContext` prop, pass it into the two `invoke()` calls |
| `src/components/instructor/LectureTranscription.tsx` | Pass `transcriptContext={transcriptBufferRef.current}` to `<QuestionOnDeck />` |
| `supabase/functions/generate-mcq-options/index.ts` | Increase slice to 6000, strengthen prompt to prefer lecture context |
| `supabase/functions/generate-expected-answer/index.ts` | Increase slice to 6000, strengthen prompt for specific/grounded answers |

## Expected Outcome

- **MCQ options**: Correct answer + distractors are derived from what was actually said in the lecture, not just the question stem.
- **Short answer expected answer**: Becomes a clear, specific, lecture-grounded reference — so AI grading correctly marks correct student answers as correct.
- **Question on Deck text itself**: Stays as the captured trigger utterance (that's the actual instructor question — paraphrasing it would be wrong). Only the *answer/options generation* gets the full context, which is what was missing.

