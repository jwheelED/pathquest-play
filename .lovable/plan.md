## Why it is still coming up as MCQ

It is probably not onboarding. Your saved profile can be `coding/simple`, but there are still two code paths that can fall back to MCQ:

1. `QuestionOnDeck` displays `suggestedType = 'multiple_choice'` until `formatPreference` is loaded.
2. `LiveCopilotHero` does not support `coding` in its `effectiveFormat`; it maps anything other than short answer/poll to `mcq`, so if that hero preview path is the one you are seeing, it will still generate MCQ options.
3. The review modal converts `coding` / `coding_simple` back to short answer, which can create another fallback if on-deck does not bypass it.

## Fix plan

1. **Make coding an explicit loaded state**
   - Keep `questionFormatPreference` nullable while profile settings load.
   - Do not render or generate an on-deck preview until the instructor preference is known.
   - Show a small “Loading format…” state instead of allowing the MCQ default to appear.

2. **Hard-lock `QuestionOnDeck` generation by preference**
   - If `formatPreference === 'coding'`, only call `generate-coding-preview`.
   - Never call `generate-mcq-options` or `match-bank-question` for coding previews.
   - Clear MCQ options before and after coding generation so stale MCQ state cannot render.

3. **Fix the alternate Live Copilot preview path**
   - Update `LiveCopilotHero` so `formatPreference === 'coding'` resolves to coding, not `mcq`.
   - For coding format, do not generate MCQ options in the hero path.
   - Send coding as `coding_simple` or `coding` depending on `coding_question_style`.

4. **Prevent the modal fallback from changing coding into another type**
   - Ensure coding on-deck sends bypass the modal with coding payload.
   - If a coding item ever reaches the modal path, keep the wire type as coding instead of converting it to MCQ/short answer.

5. **Add regression coverage**
   - Add/update a focused test verifying that when the profile preference is Coding → Simple, the on-deck pipeline does not call MCQ generation and sends `coding_simple`.
   - Add a second check for Coding → Full sending `coding`.

## Expected result

When Question Format Settings is set to Coding, Question on Deck will be coding-only. MCQ options will not generate, display, or send from that on-deck flow.