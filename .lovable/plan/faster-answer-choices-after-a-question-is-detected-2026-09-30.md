# Faster answer choices after a question is detected

## Goal
Once a question lands in the preview card, the 4 answer choices should appear in ~1–2s every time, not sometimes 8–15s.

## Likely causes of the slow cases (to confirm first)
- A second AI call (retry) runs whenever the quick check flags a problem with the first answer, which roughly doubles the wait.
- Long lecture history is sent with every request, so late in a session requests get bigger and slower.
- There is no time limit, so one slow AI response holds up the card.
- The spinner waits for both the saved-question lookup and the AI before clearing.

## Changes
1. **Check real timings** from the existing per-call timing logs to confirm which of the above causes the slow cases.
2. **Show the first result right away** — if the check flags an issue, show the first choices at once and run the correction quietly in the background, replacing them only if it succeeds and the instructor hasn't edited.
3. **Trim the context** — cap recent teaching and older history so late-session requests stay small.
4. **Add a time limit** (~6s) on the AI call, with one quick retry, so a stuck request doesn't block the card.
5. **Clear the spinner as soon as options exist**, whichever source finishes first.
6. **Start sooner** — begin generating as soon as a question is detected, instead of waiting for it to reach the card.

## Technical details
- `supabase/functions/generate-mcq-options/index.ts`: return primary result with `needs_review` flag; cap `focusedContext` ~1200 chars / `broadContext` ~2500; AbortController timeout around `callClaude`; add `max_tokens` ~300.
- New optional `refine: true` request path for the background retry (flash), called from the client when `needs_review` is set.
- `QuestionOnDeck.tsx` / `LiveCopilotHero.tsx`: set `isGenerating=false` on first populated result; fire background refine; skip overwrite if edited.
- Prefetch keyed by candidate text in the capture hook so the card reads a cached promise.
- Correctness logic and prompt rules unchanged; redeploy the function.
