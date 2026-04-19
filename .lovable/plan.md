
## Problem Analysis

Looked at `useQuestionTriggerCapture.ts` and `usePassiveQuestionDetection.ts`. The current capture flow:

1. **Trigger detection runs per-chunk** on a 5-chunk / 500-char sliding window
2. Once an interrogative pattern (`what is`, `how many`, etc.) matches, it **immediately enters "capturing" mode** starting from the trigger word
3. It then accumulates subsequent chunks until either: silence gap (1.5s), sentence-ending punctuation, max words (200), or max duration (15s)

**Root causes of partial / inconsistent captures:**

- **Trigger word can land mid-utterance**: If Deepgram finalizes "what is the wavelength" as one chunk and "smaller but the number of waves per second stays the same" follows, but the question was actually "if the frequency goes up, what is the wavelength doing — it gets smaller but the number of waves per second stays the same?" — the leading conditional context before "what is" is **discarded** because `recentChunksRef` is cleared on trigger and capture starts at `triggerIdx`.
- **Single-chunk early exit**: If the triggering chunk already ends with `.`, `!`, or `?` (Deepgram often appends `?` on rising intonation), `finishCapture()` runs immediately on just that one chunk — no rolling buffer, no surrounding context.
- **Reactive, not retrospective**: There is no continuous rolling buffer of finalized prose. The 500-char window exists only to *find* a trigger; it is wiped the moment one fires. There is no "look back 5–10s before the trigger and look forward 5–10s after" semantic.
- **Silence-gap finalization is fragile**: A 1.5s pause inside a long question (e.g. instructor pausing for emphasis) ends capture prematurely.

## Fix Strategy

Replace the "trigger → start capturing forward" model with a **continuous rolling utterance buffer** that always holds the last N seconds of finalized transcript. When a trigger fires, generation uses the **full buffer slice around the trigger**, not just chunks after it.

### Architecture

```text
finalized chunks ──► RollingBuffer (last 10s, ~1500 chars)
                          │
                          ├──► trigger scanner (every chunk)
                          │         │
                          │         └─► on match: arm "complete-utterance" timer
                          │
                          └──► on timer fire OR sentence-end:
                                   slice = buffer.windowAround(triggerTime, -8s, +5s)
                                   send slice to generator
```

### Concrete changes to `src/hooks/useQuestionTriggerCapture.ts`

1. **Introduce a persistent `RollingBuffer`** (replaces the wipe-on-trigger `recentChunksRef`):
   - Stores `{text, timestamp}` chunks
   - Eviction: drop chunks older than `bufferWindowMs` (default 12000ms) AND cap at ~2000 chars
   - Never cleared on trigger; only trimmed by age
   - Exposes `getSliceAround(centerTs, lookbackMs, lookaheadMs)` returning concatenated text

2. **Decouple "trigger detected" from "capture started"**:
   - On trigger match, record `pendingTriggerTs` and `pendingTriggerWord` — do NOT slice immediately
   - Start a `completionTimer` (default 4–5s after trigger) to allow the full utterance to land in the buffer
   - Cancel/restart the timer if a sentence-ending punctuation (`?`, `.`, `!`) lands AFTER the trigger
   - On timer fire OR sentence-end-after-trigger, slice the buffer: lookback 8s before trigger, lookahead from trigger to "now"

3. **Remove single-chunk early-finish path**: even if the triggering chunk ends with `?`, still wait at least `minHoldMs` (e.g. 800ms) so the buffer can absorb 1–2 more finalized chunks of preceding context that may finalize out of order.

4. **Preserve preceding context**: the slice MUST start at the older of (a) `triggerTs - lookbackMs` or (b) the start of the current sentence (split on prior `.`/`?`/`!`). This is what fixes the "smaller but the number of waves per second" bug — the conditional clause before the trigger word is included.

5. **Soft silence handling**: silence gap no longer hard-finalizes; it just *enables* finalization once the completion timer has also expired. Long pauses inside a question don't truncate.

6. **Post-process unchanged**: existing `postProcess()` overlap-dedup + filler-strip + `?` enforcement still runs on the final slice.

### Tunables (exported via options)

| Option | Default | Purpose |
|---|---|---|
| `bufferWindowMs` | 12000 | How far back the rolling buffer retains chunks |
| `lookbackMs` | 8000 | How much pre-trigger context to include in slice |
| `completionTimeoutMs` | 4500 | How long to wait after trigger before finalizing |
| `minHoldMs` | 800 | Minimum hold before allowing sentence-end finalization |
| `silenceGapMs` | 2500 | Raised from 1500; pause tolerance inside questions |
| `cooldownMs` | 15000 | Unchanged |

### Logging additions (debug mode)

- `[buffer]` log on every chunk: current buffer size in chars + age of oldest chunk
- `[trigger-armed]` log with trigger word, position, and current buffer length
- `[slice]` log showing the final text passed to generation, with `lookback=Xms, lookahead=Yms` annotations

This makes it obvious in console whether the buffer was healthy at trigger time.

### Files touched

- `src/hooks/useQuestionTriggerCapture.ts` — the entire `feedChunk` + state machine
- No changes to `usePassiveQuestionDetection.ts`, edge functions, or DB. The downstream consumer (`onCaptureCompleteRef`) still receives a `PassiveQuestionCandidate` with the same shape — just a more complete `text` field.

### Validation plan

After implementation, verify with the exact failure case the user described ("if frequency goes up, what is the wavelength doing — it gets smaller but…"):
- Console should show `[buffer]` accumulating the conditional clause
- `[trigger-armed]` fires on "what is"
- `[slice]` should include the **entire** sentence including the pre-trigger conditional
- Final candidate text should be the full question, not the post-trigger fragment
