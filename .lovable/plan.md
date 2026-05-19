
# Plan: Stricter Passive Detection with Pause-After-Question Confirmation

Implements option #5 (stricter passive detection) and adds a "trailing silence" requirement: a candidate question only fires after the instructor *stops talking* for a moment, proving they finished asking.

## What changes (UX)
Today: you say something with a "?" → it gets picked up almost immediately, sometimes mid-thought.
After: a candidate is only proposed when **all** of these are true:
1. Utterance contains a real interrogative trigger (`what/how/why/which/who/when/where` + verb), not just a "?" Deepgram guessed.
2. Utterance is **≥ 8 words** (raised from 5).
3. Deepgram transcript confidence ≥ **0.8** (today there's no confidence floor for passive).
4. Not in the rhetorical/greeting blocklist (kept as-is, lightly expanded).
5. **NEW — Trailing silence:** at least **1200ms of no new transcript chunks** after the "?" before we fire. If you keep talking ("…what is the death penalty *— and also why do we use it?*"), the candidate gets **replaced** by the newer, longer version instead of firing the first one.

Result: opinions, asides, and half-formed thoughts almost never trigger. Real questions you finish and pause on still do — just ~1 second later than today.

## Visual indicator (small but important)
While the silence timer is counting down, the existing passive-question toast shows a thin amber progress bar ("Listening for pause…") so you can *see* it's about to fire and abort by speaking again. No new component, just a 4px bar on the existing toast.

## Files to modify

### 1. `src/hooks/usePassiveQuestionDetection.ts` (core logic)
- Add new option `minTranscriptConfidence` (default `0.8`).
- Add new option `trailingSilenceMs` (default `1200`).
- Raise `minWordCount` default from `5` → `8`.
- Change `checkUtterance(text, recentTranscript?)` signature → `checkUtterance(text, { confidence?, recentTranscript? })`.
- New internal state: `pendingCandidate` (the question waiting for silence) + `silenceTimerRef`.
  - When a candidate passes all filters, store as `pendingCandidate` and start a `trailingSilenceMs` timer.
  - Each new transcript chunk that arrives during the wait:
    - If it contains another interrogative → **replace** `pendingCandidate` and restart timer.
    - If it's just more speech (no new trigger) → **extend** `pendingCandidate.text` and restart timer (handles "what is X… and Y?").
    - If it's a topic-shift marker or > 4s gap → **discard** `pendingCandidate`.
  - When timer fires with no new chunks → promote `pendingCandidate` → `candidate` (existing flow takes over, toast appears).
- Stricter trigger check: require a `TRIGGER_PATTERNS` match (reuse the regex set from `useQuestionTriggerCapture.ts`) in addition to the existing `?`/rhetorical filters. Reject "I think the answer is yes?" (no trigger word).
- Expand `RHETORICAL_BLOCKLIST` with: "what was i saying", "where was i going", "you get it", "make sense to you".

### 2. `src/hooks/useLectureRecording.ts` (or wherever `checkUtterance` is called — confirm during impl)
- Pass `confidence` from Deepgram's response to `checkUtterance({ confidence, recentTranscript })`. Deepgram already exposes this per-utterance.
- Surface `pendingCandidate` (or a derived `isPending` + `pendingProgress 0-1`) from the hook for the toast.

### 3. Passive question toast component (whichever renders `candidate`)
- When `isPending` is true, render a thin amber `<div>` at the bottom with `style={{ width: progress*100 + '%' }}` updating via `requestAnimationFrame`. ~10 LOC.
- Tooltip: "Will send when you pause. Keep talking to refine."

## Files NOT touched
- `src/pages/LiveStudent.tsx`
- Any `supabase/functions/*` edge function
- `useQuestionTriggerCapture.ts` (it already has its own min-silence; this plan only changes the *passive* path)

## Edge cases handled
- **Long question with mid-sentence pause**: `trailingSilenceMs` is short (1.2s). Natural breath pauses < 1.2s won't fire prematurely because we also require terminal `?` first.
- **Two questions back-to-back**: second interrogative replaces first; only the most recent fires.
- **You speak again right as it's about to fire**: new chunk arrives before timer → timer resets. No accidental sends.
- **Low-confidence Deepgram hallucination**: filtered before becoming a candidate.
- **Reduced-motion users**: progress bar respects `prefers-reduced-motion` (no animation, just static amber fill at current %).

## Tunables (all exposed as hook options for easy A/B later)
| Option | Default | Today |
|---|---|---|
| `minWordCount` | 8 | 5 |
| `minTranscriptConfidence` | 0.8 | (none) |
| `trailingSilenceMs` | 1200 | (none) |
| `cooldownMs` | 15000 | 15000 (unchanged) |

## Test checklist (manual, after build)
1. Say "What is the death penalty?" then stop → fires ~1.2s later. ✅
2. Say "What is the death penalty? And why do we use it?" with no pause → only second question fires. ✅
3. Say "I think this is interesting?" (no trigger word) → never fires. ✅
4. Say "What was I saying?" → blocked by rhetorical list. ✅
5. Mumble a question with Deepgram confidence 0.6 → never fires. ✅
6. Say a 5-word question "What is photosynthesis exactly?" → blocked (< 8 words). ✅ — *flag for review: may be too strict, revisit if real questions get dropped.*

## Open question for you
**Item 6 above** — raising min word count to 8 is the most aggressive change here. Real short questions like "What is photosynthesis?" (3 words) would get filtered. Two options:
- **(A)** Keep 8 — maximum precision, lose some short legit questions.
- **(B)** Set to 6 — middle ground, catches "What is X exactly?" but still blocks 2-3 word filler.

I'd default to **(B) = 6** unless you say otherwise. Confirm and I'll build.
