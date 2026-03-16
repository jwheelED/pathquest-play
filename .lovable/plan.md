

## Bugs and Improvements

Three issues to fix:

### 1. Preview dialog missing "Poll (Ungraded)" as a question type

**File:** `src/components/instructor/VoiceQuestionPreviewDialog.tsx`

The `RadioGroup` on line ~380 only offers `short_answer` and `multiple_choice`. Need to add a third option: `poll`. This requires:

- Expanding the type union to include `'poll'` across the component state and the `ExtractedVoiceQuestion` interface (line 23)
- Adding a Poll radio option in the RadioGroup (around line 396-411)
- When `poll` is selected, show MCQ-style options UI but hide the "correct answer" selector (polls have no correct answer)
- Update `handleConfirm` to pass `poll` type through

### 2. "How are you guys feeling today?" not blocked by greeting filter

**File:** `src/hooks/usePassiveQuestionDetection.ts`

The `GREETING_PATTERNS` array (line 68-81) doesn't cover "how are you guys feeling" — the existing patterns check for "how are you doing/today/this" but not "feeling". Fix:

- Add pattern: `/^how are (you|you guys|y'all|everyone|everybody) feeling/i`
- Also add a broader catch: `/^how('?s| is| are) (you|everyone|everybody|you guys) feeling/i`

### 3. Sentence-boundary splitting before question extraction

**File:** `src/hooks/usePassiveQuestionDetection.ts`, function `extractQuestions` (line 88)

Currently, the function receives the full transcript chunk (e.g., "I like grapes. Anchovies are great. Do you want to eat a marshmallow?") and extracts everything up to the `?` as one candidate. The regex `[^?？]*[?？]` captures from the start of the string, so it would return "I like grapes, cherries, and mangoes. Anchovies and pickles are a sweet combo. Do you want to eat a blueberry marshmallow?" as one big segment.

**Fix:** Before extracting question-mark segments, split on sentence-ending punctuation (`.` `!` `;` `:`) first, then only look for `?` within each resulting sentence. This way only the sentence "Do you want to eat a blueberry marshmallow?" becomes the candidate.

Updated `extractQuestions`:
```ts
function extractQuestions(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized.includes('?') && !normalized.includes('？')) return [];

  // Split on sentence-ending punctuation (period, exclamation, semicolon, colon)
  // but NOT commas or question marks
  const sentences = normalized.split(/[.!;:]\s+/);

  const questions: string[] = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.includes('?') || trimmed.includes('？')) {
      // Extract question-mark-terminated segments within this sentence
      const matches = trimmed.match(/[^?？]*[?？]/g);
      if (matches) {
        questions.push(...matches.map(s => s.trim()).filter(Boolean));
      } else {
        questions.push(trimmed);
      }
    }
  }

  return questions;
}
```

### Summary of changes

| File | Change |
|------|--------|
| `src/hooks/usePassiveQuestionDetection.ts` | Add greeting pattern for "feeling"; rewrite `extractQuestions` to split on `.!;:` before extracting `?` segments |
| `src/components/instructor/VoiceQuestionPreviewDialog.tsx` | Add `'poll'` to type union, add Poll radio option, hide correct-answer UI when poll is selected, pass poll type through on confirm |

