## Why your exact-match question still got AI-generated options

The bank-matching logic exists, but it's **only wired into one of two question entry paths**.

### Two paths, only one checks the bank

1. **Passive trigger pipeline** (the `Question on Deck` card that appears automatically when speech is detected as a question)
   - Lives in `QuestionOnDeck.tsx`
   - Calls `match-bank-question` first, falls back to `generate-mcq-options` only if no match
   - This path works correctly

2. **Voice command pipeline** ("Hey Edvana, ask…" or manual button) — **this is the path you used**
   - Voice → `extract-voice-command-question` edge fn → `VoiceQuestionPreviewDialog` opens
   - `VoiceQuestionPreviewDialog` calls `generate-mcq-options` immediately to fill the preview
   - On confirm → `format-and-send-question` with the AI-generated options
   - **`match-bank-question` is never called anywhere in this flow**

That's why "What is the main function of ribosomes?" came back with freshly generated MCQ options even though `instructor_question_bank` row `524999f4-…` exists with the exact text and the exact A/B/C/D options the slide PDF parsed. I confirmed the row exists and has the four ribosome options verbatim.

### Secondary issue in the matcher itself

Even if we wire the voice path to call `match-bank-question`, the matcher has one subtle gap that could miss obvious matches:

- The lexical pre-filter requires `overlap >= 0.4` of non-stopword tokens. For very short questions ("ribosomes function") it's fine, but it never short-circuits on near-identical strings, so the LLM step is always required (extra latency + a chance the AI returns `match_index = -1` despite a verbatim match).
- The matcher filters `course_id.eq.X,course_id.is.null` only when `course_id` is provided. If the voice flow doesn't pass `course_id` we'd silently see all instructor bank items, which is fine — but we should make sure the voice flow does pass it for consistency.

## The fix

### 1. Inject bank lookup into the voice preview dialog

In `src/components/instructor/VoiceQuestionPreviewDialog.tsx`, before either `generate-mcq-options` or `generate-expected-answer` call:

- Call `supabase.functions.invoke('match-bank-question', { body: { question_text, course_id, format } })`
- If `match.question_content` is returned:
  - For MCQ/poll: set the 4 options + correct answer from the bank row, set a `bankMatch` state so we can label it in the UI ("Matched from Question Bank: <title>")
  - For short answer: set the expected answer from the bank row
  - Skip the AI generation call entirely
- Otherwise fall through to current AI generation

### 2. Pass the bank match through to send

When the user confirms the preview, include the bank options/correct_answer in the `editedQuestion` payload (it already supports `options`, `correct_answer`, `expected_answer`). `format-and-send-question` already has a "use pre-generated options" branch — so if the bank match makes it into the dialog, the send path will respect it without further changes.

Optionally also pass a `source_bank_item_id` field through `format-and-send-question` so analytics can show "served from bank" vs "AI generated". Same field is already used by `QuestionOnDeck`.

### 3. Tighten the matcher for verbatim hits

In `supabase/functions/match-bank-question/index.ts`:

- Before the lexical/AI pipeline, do a normalized exact-string compare (lowercase, strip punctuation, collapse whitespace) on `question_content.question`. If any row matches → return immediately with `confidence: 1.0, source: 'exact_match'`. This guarantees verbatim questions like the ribosome one always hit.
- Lower the lexical pre-filter threshold from `0.4` to `0.3` so the AI step gets to evaluate a few more candidates for short questions.
- Add a small log line on the chosen branch (`exact`, `lexical_fallback`, `ai_match`, `no_lexical_match`, `low_confidence`) so future debugging doesn't require sifting through silent runs.

### 4. Also wire bank lookup into the auto-interval question path

`generate-interval-question` (used when the auto-question timer fires every N minutes) currently doesn't consult the bank either. As long as we're touching the bank-match logic, add the same pre-check there so timer-fired questions also prefer bank items when content matches. Low risk, same pattern.

### Files touched

- `src/components/instructor/VoiceQuestionPreviewDialog.tsx` — add bank lookup before AI generation, surface a "from bank" indicator, plumb `course_id` from props
- `src/components/instructor/LectureTranscription.tsx` — pass `courseId` prop into `VoiceQuestionPreviewDialog` (one-line addition where the dialog is rendered)
- `supabase/functions/match-bank-question/index.ts` — exact-match short-circuit, lower threshold to 0.3, add branch logging
- `supabase/functions/generate-interval-question/index.ts` — call `match-bank-question` first, skip AI generation on hit (optional but recommended)

### How you'll know it worked

After the change, asking the ribosome question via voice will show the preview dialog with the four PDF-parsed options pre-filled and a small "Matched from Question Bank: Slide 1 Question 2" badge. Pushing it sends those exact options to students. Edge logs for `match-bank-question` will show `source=exact_match, confidence=1.0`.