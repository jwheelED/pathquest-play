

## Problem

Two related gaps remain in the trigger pipeline:

**Part 1 — Buffer is too short and topic-bound.** The rolling buffer in `useQuestionTriggerCapture.ts` keeps only ~12 s / 2000 chars and `getSliceAroundTrigger` slices to the **current sentence boundary** (line 327-340). When the instructor says *"So we just said the mitochondria produces ATP."* and then 15 s later asks *"class, what does it produce?"* — the antecedent ("mitochondria/ATP") has already been evicted AND the slice cuts at the `.` right before the question, so Gemini receives only *"class, what does it produce?"* with no referent. It hallucinates or replies "not enough context".

**Part 2 — Context and question are sent as one blob.** In `LectureTranscription.tsx` line 1342-1356 we send `question_text` (the captured slice) and `context` (`transcriptBufferRef.current.slice(-1500)`) to `format-and-send-question`. The prompt in `format-and-send-question/index.ts` (line 91-93) does separate them with `"The professor asked: ... Context from lecture: ..."` — but the captured `question_text` itself **still contains the trailing teaching prose** because we sliced from the prior sentence boundary forward. There's no explicit "background vs question" split, no instruction to resolve pronouns using earlier context, and the longer `transcriptBufferRef` is ignored when the captured slice already "looks complete".

## Fix Strategy

### 1. Extend rolling buffer to 60 s (`useQuestionTriggerCapture.ts`)

- `bufferWindowMs`: **12 000 → 60 000 ms**
- `maxBufferChars`: **2000 → 8000** (≈ 60 s of normal speech at ~130 wpm)
- `lookbackMs` (slice window): **8000 → 30 000 ms** so the slice can pull in referents up to 30 s before the trigger.
- Keep eviction logic (age-then-size) — unchanged shape.

### 2. Stop slicing at the prior sentence boundary; emit two fields

Change `getSliceAroundTrigger` to return **a structured object** instead of a single string:

```ts
{ question: string;   // only the trigger sentence (current behavior, trimmed)
  context:  string;   // the lookback window BEFORE the trigger sentence,
                      // up to lookbackMs old, NOT trimmed at boundary
}
```

- `question` = text from the last sentence boundary (`.`/`?`/`!`) up to `now` — same as today.
- `context` = text from `triggerTs - lookbackMs` up to that boundary — the teaching prose.
- Both pulled from the same persistent buffer; if no boundary exists (single long utterance), `context` is empty and `question` is the whole slice.

### 3. Propagate the split through the candidate

Extend `PassiveQuestionCandidate` (in `usePassiveQuestionDetection.ts`) with optional `priorContext?: string`:

```ts
export interface PassiveQuestionCandidate {
  text: string;
  detectedAt: number;
  id: string;
  priorContext?: string;   // NEW
}
```

- `useQuestionTriggerCapture` populates `priorContext` from the slice's context field (after light cleanup: strip leading filler, cap at ~1500 chars).
- `usePassiveQuestionDetection` candidates leave it `undefined` (unchanged behaviour for that path).

### 4. Plumb `priorContext` through to the edge function

In `LectureTranscription.tsx`:
- The trigger-capture handoff (`setTriggerCaptureComplete` callback, line 271-276) currently calls `checkPassiveQuestion(candidate.text)`. Change it to also stash `candidate.priorContext` on a ref (`pendingPriorContextRef`).
- In the send path (line 1342-1368), when `pendingPriorContextRef.current` is set, send it as a new field `prior_context` and prefer it over the generic `transcriptBufferRef.slice(-1500)` when building `context`. Concretely:

```ts
const priorContext = pendingPriorContextRef.current ?? '';
const transcriptTail = transcriptBufferRef.current.slice(-2000);
// Prefer the focused prior context; fall back to tail if empty
const context = priorContext || transcriptTail;
```

Clear the ref after the send completes (success or fail).

### 5. Restructure the Gemini prompt to separate teaching from question

In `supabase/functions/format-and-send-question/index.ts`, update both `generateMCQ` (line 91) and `generateCodingQuestion` (line 207) to a **labelled, role-explicit** prompt:

```
=== TEACHING CONTEXT (background — earlier in the lecture) ===
"${context}"

=== INSTRUCTOR'S QUESTION (what to turn into a check-in) ===
"${questionText}"

INSTRUCTIONS:
- The TEACHING CONTEXT is background information the instructor already covered.
- The INSTRUCTOR'S QUESTION is the short prompt the instructor just asked.
- Resolve any pronouns (it, this, they, that) in the question using the teaching context.
  Example: question "what does it produce?" + context "the mitochondria converts glucose"
           → resolved: "What does the mitochondria produce?"
- Generate the check-in based on the RESOLVED question, grounded in the teaching context.
- If the question still cannot be resolved after reading the context, set "needs_more_context": true in the response.
```

Apply the same split to short-answer generation if it exists in the same file. No changes to other edge functions in this pass.

### 6. Logging additions

- `🎯 [slice-split] question="..." context="..." (Xms lookback)` in trigger capture.
- `📤 [send] using priorContext from trigger (Xchars)` vs `📤 [send] using transcript tail (fallback)` in `LectureTranscription`.

## Tunables (final)

| Option | Old | New | Purpose |
|---|---|---|---|
| `bufferWindowMs` | 12 000 | **60 000** | Hold last minute of speech |
| `maxBufferChars` | 2000 | **8000** | Match 60 s capacity |
| `lookbackMs` | 8000 | **30 000** | How far back to grab context |

All other gate / cooldown / silence options unchanged.

## Files touched

- `src/hooks/useQuestionTriggerCapture.ts` — extend buffer, change slice to return `{question, context}`, populate `priorContext` on candidate.
- `src/hooks/usePassiveQuestionDetection.ts` — add optional `priorContext` to `PassiveQuestionCandidate` type.
- `src/components/instructor/LectureTranscription.tsx` — capture `priorContext` from trigger candidate via ref; send as `prior_context` in `format-and-send-question` body; prefer it over generic tail.
- `src/hooks/useLectureRecording.ts` — mirror buffer-size option changes for parity.
- `supabase/functions/format-and-send-question/index.ts` — restructure MCQ + coding prompts with labelled `TEACHING CONTEXT` / `INSTRUCTOR'S QUESTION` sections + pronoun-resolution instructions; accept new `prior_context` field in body and use it for `context` when present.

No DB / migration / other edge function changes. `PassiveQuestionCandidate` shape is additive (optional field), so all existing consumers keep working.

## Validation

Test the failing case end-to-end:
- Say *"So we just said the mitochondria produces ATP."* — pause 10–15 s — *"Class, what does it produce?"*
- Console should show:
  - `[buffer] chunks=N chars=~600 oldestAge=~15000ms` (proves the antecedent is still in buffer)
  - `[trigger-armed] word="what does"`
  - `[slice-split] question="Class, what does it produce?" context="So we just said the mitochondria produces ATP."`
  - `[send] using priorContext from trigger (Xchars)`
- Generated MCQ should resolve the pronoun and ask about ATP / mitochondria, not return "not enough context".

