## Diagnosis

Your saved database settings are correct: `question_format_preference = coding` and `coding_question_style = simple` for the current instructor.

The logs show the actual bug: when the question was detected, **both** preview generators ran for the same on-deck question:

- `generate-coding-preview` ran with `style=simple`
- `generate-mcq-options` also ran immediately afterward

That means Question on Deck briefly uses the correct coding preference, but an older/default MCQ preview request can still complete and write MCQ options into the same card. The UI then renders the stale MCQ state, which is why you see an MCQ badge/options even though the setting is Coding → Simple check-in.

## Plan

1. **Make preview generation request-safe**
   - Add a monotonically increasing request id in `QuestionOnDeck.tsx`.
   - Every `generatePreview` call captures its own id.
   - Before any async response updates preview state, verify it is still the latest request.
   - If a stale MCQ response returns after a newer coding request, ignore it.

2. **Clear incompatible preview state per format**
   - When format is `coding`, explicitly keep `mcqOptions` empty and never allow MCQ options to render from a previous request.
   - When format is MCQ/poll, clear coding payload/expected answer as appropriate.

3. **Lock the on-deck render to the resolved format**
   - Ensure the right-side preview can only render the coding simple check-in panel when `effectiveFormat === 'coding'` and `codingStyle === 'simple'`.
   - This prevents stale MCQ options from visually overriding the chosen format.

4. **Add focused regression coverage**
   - Add/update a test around the on-deck pipeline so a candidate that starts with the default MCQ state and then resolves to Coding Simple cannot display or send as MCQ.

5. **Optional deploy note**
   - If the deployed edge function logs still show stale function behavior after the frontend fix, deploy `generate-coding-preview` / related functions so the preview environment matches the repo.