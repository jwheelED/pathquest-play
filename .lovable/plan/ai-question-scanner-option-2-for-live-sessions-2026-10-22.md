# AI Question Scanner (Option 2) for live sessions

## What changes for the instructor
- Instead of fixed word rules, the AI reads what you just said every time you pause and decides if you asked the class a question, including "Tell me why…", "Calculate the speed", or a short "Why?" after a setup.
- When it finds one, the question and its 4 answer choices appear On Deck together (about 1.5–2s after you stop talking). You don't have to wait for choices separately.
- Rhetorical lines ("Does that make sense?", "Right?") and questions you already sent are ignored.
- A switch in the live session screen: **AI scanner** (default) or **Classic detection**. If the AI is slow or fails, Classic keeps running in the background as a safety net.

## How it works
```text
transcript lines -> rolling 60s buffer
      | instructor pauses >= 1.6s  OR  ~35 new words spoken
      v
scan-transcript-questions (Gemini 3.8 Flash, low thinking)
      | { detected:false }  -> nothing happens
      | { detected:true, question, type, options, correct, explanation }
      v
On Deck card filled immediately (choices already there)
```
- Only new speech is checked: each scan sends the last ~60s for context but asks only about the text since the previous scan.
- At most one scan in flight; minimum 4s between scans; nothing is sent while no one is talking.
- Cost: about 2–4 small AI calls per minute of active talking.

## Technical details
- **New edge function `supabase/functions/scan-transcript-questions/`**
  - Auth: instructor JWT + `has_role('instructor')`, same pattern as `detect-speaker-questions`.
  - Input: `{ sessionId, contextText, newText, recentlySent: string[], formatPreference, courseType }`.
  - One `callClaude` call with `GEMINI_FLASH` and `DEFAULT_REASONING_EFFORT` from `_shared/models.ts`, tool/JSON output. Prompt rules: only questions aimed at students in `newText`; reject rhetorical/check-in phrases; rewrite fragments into a standalone question using context; respect the instructor's format preference; MCQ distractors realistic (no "None/All of the above"); Unicode math only.
  - Detection logic in a pure `scanner.ts` (prompt build + response parse/validate) so it can be unit-tested with a mocked model.
  - Handles 429/402 by returning `{ detected:false, reason }` so the client falls back quietly.
- **New hook `src/hooks/useLlmQuestionScanner.ts`**
  - Fed from the same transcript-final path in `LectureTranscription.tsx` that feeds `checkPassiveQuestion` / `feedTriggerChunk`.
  - Pause timer (1.6s) reset on each speech event; word-count trigger (~35); in-flight lock; 4s spacing; clears buffer on recording start/stop (same as the stale-chunk fix).
  - Dedup: normalized-text similarity against last detected and sent questions.
  - Calls `supabase.auth.refreshSession()` only when the token is near expiry (latency).
- **`usePassiveQuestionDetection.ts`**: add `acceptAiCandidate(text, prebuilt)` that promotes immediately and skips the rule filters (the AI already vetted it), still honoring "candidate visible" cooldown.
- **`QuestionOnDeck.tsx`**: when a candidate carries prebuilt choices, show them instantly and skip the `generate-mcq-options` call (regenerate button still uses it). Image pre-generation still kicks off as today.
- **`LectureTranscription.tsx`**: mode switch (persisted in localStorage); in AI mode, classic detection still runs but only surfaces a candidate if the AI scan for that window failed/timed out.
- PostHog: `trackQuestionDetected` with `source: 'ai_scan' | 'classic'`, plus scan latency and detected/not-detected counts, so we can compare hit rates.
- **Tests**: `supabase/functions/__tests__/scan-transcript-questions.test.ts` (parse rejects forbidden distractors, rejects missing correct answer, `detected:false` passthrough) and `src/__tests__/useLlmQuestionScanner.test.ts` (fires after 1.6s pause, not while talking, no overlapping scans, dedups a repeated question).
- Deploy the new function; existing regex tests must keep passing.
