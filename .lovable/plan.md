# Speed up MCQ "Preparing…" on Question on Deck

## What's slow today

When a question is detected, `QuestionOnDeck` calls `generate-mcq-options`, which in turn calls Gemini 2.5 Flash via the Lovable AI Gateway with a forced tool call. End-to-end this is typically 2–4s but spikes to 6–10s+ because:

1. The model is forced to emit a structured tool call that includes a long `citation` field (extra output tokens = more latency).
2. The system prompt is ~2 KB of instructions and the user prompt includes up to 3 000 chars of transcript tail every time, even for tiny questions like "Who wrote the Emancipation Proclamation?".
3. We block until the full MCQ JSON is parsed — there's no streaming or progressive reveal.
4. `match-bank-question` runs in parallel (good) but the UI still waits for whichever finishes last because `Promise.all` is used instead of "first useful response wins".
5. Generation only starts after `formatPreference` is loaded from the profile — for fresh sessions that adds a noticeable delay before we even hit the model.

## Plan

### 1. Use a faster model + smaller payload in `generate-mcq-options`
- Switch the primary model to `google/gemini-2.5-flash-lite` (keep `gemini-2.5-flash` as the structural-retry model instead of Pro). Flash-lite TTFT on a 4-option MCQ is ~600–900 ms vs Flash's 2–3 s.
- Trim `source_transcript` from the last 3 000 chars to the last 1 200 chars when `prior_context` is present (focused context already covers pronoun resolution; the long tail is mostly dead weight).
- Make `citation` optional in the tool schema and drop it from `required`. The validator already tolerates missing citations and falls back to token-overlap scoring.
- Shorten the system prompt — collapse rules 1–5 into a tight ~600-char version while keeping the "transcript overrides training data" and "no vague distractors" rules.

### 2. Stream MCQ options into the UI
- Add a streaming branch to `generate-mcq-options` that emits an SSE-style `text/event-stream` of `{ option_index, text }` events as soon as the model produces each option, followed by a final `{ correct_answer, explanation }` event.
- Update `QuestionOnDeck.generatePreview` to consume the stream via `fetch` (not `supabase.functions.invoke`) so each option fills its skeleton row the moment it arrives, and "Preparing…" flips to "Ready" as soon as the correct-answer event lands.

### 3. Don't block on bank match
- Replace `Promise.all([bankPromise, aiPromise])` with a "race-with-fallback" pattern: render AI options as soon as they stream in; if a high-confidence bank match arrives first or while streaming, swap to it and cancel the stream via `AbortController`. This guarantees the deck never waits on the slower of the two.

### 4. Start generation as soon as the candidate is detected
- In `QuestionOnDeck`, kick off `generatePreview` with the last-known/default format the instant `candidate` appears, and re-run only if `formatPreference` resolves to something different by the time it loads. Today we wait for `formatPreference !== undefined`, which adds 200–600 ms on cold loads.

### 5. Observability
- Keep the existing `mcq.llm_call` / `mcq.complete` JSON logs, and add `mcq.first_option_ms` so we can confirm the streaming win in the Functions dashboard.

## Files to change

- `supabase/functions/generate-mcq-options/index.ts` — model swap, prompt trim, optional citation, streaming branch, new timing log.
- `src/components/instructor/QuestionOnDeck.tsx` — streaming consumer, race-with-fallback bank match, earlier kickoff.
- `src/components/instructor/LiveCopilotHero.tsx` — same streaming consumer for the hero preview path (parity).

## Out of scope

- Changing detection or trigger-capture logic.
- Changing the Coding or Short Answer preview paths (they already render incrementally).
- Switching providers away from the Lovable AI Gateway.
