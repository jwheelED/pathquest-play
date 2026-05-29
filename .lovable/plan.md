
# Fix: question detection + MCQ generation latency

Two independent fixes — one frontend, one edge function. Both safe to ship together.

---

## Part 1 — Detection lag (~5-7s → ~2-3s)

Current pipeline stacks these timers after the user finishes speaking:
- `minSilenceMs` 1200ms (wait for silence)
- `completionTimeoutMs` 3500ms (wait for more words)
- optional `extensionMs` +1500ms
- `trailingSilenceMs` 1200ms (pending → visible)
= ~6s minimum, plus Deepgram's own ~1-2s final-chunk lag.

Most of these timers exist to handle the **risk that the speaker hasn't finished yet**. That risk is near-zero when the finalized utterance already ends in `?` and passes the trigger + word-count gate. We add a fast path for that case.

### Changes

**`src/hooks/useQuestionTriggerCapture.ts`**
- Add a helper `endsWithQuestionMark(text)` that checks the cleaned tail.
- In the gate logic (around line 477 and 670-680), when the buffered candidate **ends with `?` AND passes the 6-word + trigger gate**, bypass `completionTimeoutMs` and `extensionMs` entirely — emit immediately on the next finalize.
- Lower defaults for the "no question mark" path:
  - `completionTimeoutMs`: 3500 → **2000**
  - `extensionMs`: 1500 → **800**
  - `minSilenceMs`: 1200 → **700**

**`src/hooks/usePassiveQuestionDetection.ts`**
- Same `endsWithQuestionMark` shortcut: skip `trailingSilenceMs` and promote pending → visible on the same tick.
- Lower default `trailingSilenceMs`: 1200 → **700** for the non-`?` path.

**`src/components/instructor/LectureTranscription.tsx`** (lines 261-284)
- Update the hook call sites to match the new defaults (or drop the overrides so defaults apply).

Net effect: a clean utterance ending in "?" surfaces in ~0.5-1s after Deepgram's final; ambiguous (no `?`) utterances still get a ~2s safety window instead of ~5s.

---

## Part 2 — MCQ generation lag (~12-17s → ~4-6s)

Logs prove the real cause is a **double Gemini Pro call**: the validator's token-overlap check rejects the first attempt because there are only ~229 chars of focused context, then we retry with Pro again. Two Pro calls = ~16s.

```
Context received — broad=229 chars, focused=229 chars
MCQ validator REJECTED first attempt: ...weakly supported by transcript (score=0.13, best=0.40)
MCQ retry also rejected: ...(score=0.13, best=0.50). Shipping retry result anyway.
```

The overlap heuristic is unreliable on short contexts — it's flagging answers that are actually correct.

### Changes (single file: `supabase/functions/generate-mcq-options/index.ts`)

1. **Use Flash as primary, escalate to Pro only on true failures.**
   - Replace the `focusedContext.length > 80 ? 'gemini-2.5-pro' : 'gemini-3.5-flash'` rule with always `google/gemini-2.5-flash` on the first call.
   - Flash is ~2-3s vs Pro's ~8-12s, and is more than capable for 4-option MCQs grounded in a short transcript.

2. **Skip token-overlap validation when focused context is small/unreliable.**
   - In `validateAnswer`, if `transcript.length < 400` AND no `citation` is provided, treat as `{ ok: true }` (we can't meaningfully validate). Right now we mis-reject in this regime.
   - Keep the citation-based validation (when the model returns a citation, we still verify it appears in the transcript).

3. **On retry, escalate to Pro once — not twice.**
   - Current code already calls Pro on retry; with change #1 this becomes Flash → Pro (only when actually rejected), instead of Pro → Pro.
   - Cap to one retry (already the case).

4. **Lower `max_tokens` implicit ceiling** by leaving as-is (Gateway default is fine); don't add anything new here.

Expected timing after fix: first Flash call ~2-4s, validator passes, ship → **~4-6s total**. On the rare bad output, Flash + Pro retry ≈ ~10s, still better than today's worst case.

### Why not just remove the validator?

It still catches the "wrong letter assigned to right text" failure mode when a citation is provided. Keeping it for that case; only short-context+no-citation gets the bypass.

---

## Files touched

- `src/hooks/useQuestionTriggerCapture.ts` — add `endsWithQuestionMark` fast path, lower default timers.
- `src/hooks/usePassiveQuestionDetection.ts` — same fast path + lower `trailingSilenceMs`.
- `src/components/instructor/LectureTranscription.tsx` — update override values (or remove) at lines 266, 280.
- `supabase/functions/generate-mcq-options/index.ts` — Flash-first model selection, skip overlap validation when transcript < 400 chars and no citation.

No DB, schema, or new env vars.

## Verification

1. Speak: "What is mitosis?" — should appear in Question on Deck within ~1-2s of finishing.
2. Click Send — MCQ options should appear within ~4-6s.
3. Check edge function logs: should see one `MCQ options generated successfully` per send, not preceded by `REJECTED` + `retry`.
4. Speak a fragment that's not actually a question — confirm the longer (~2s) gate still suppresses it.

