## Why the example fails today

For: `"If a cell has a high surface-area-to-volume ratio, what advantage does that give it?"`

Deepgram emits this as ~2 chunks split at the natural pause after `ratio,`. In `src/hooks/useQuestionTriggerCapture.ts`:

1. **Trigger never arms.** Line 38's pattern requires `what` to be followed by a fixed allow-list (`is/are/do/does/would/...`). `"what advantage"` is not in that list, so `feedChunk` finds no trigger and the question is dropped entirely.
2. **Even if it armed, the premise is lost.** `getSliceAroundTrigger` (lines 329-410) splits the buffer at the trigger word: everything before `what` is routed into `priorContext`, not `question`. The "If…ratio," clause — which defines the question — would not appear in the captured `question.text` sent to Question on Deck.

## Fix

Two surgical changes in `src/hooks/useQuestionTriggerCapture.ts`. No UI or schema changes.

### 1. Broaden the `what / how / why` triggers

Replace the strict allow-lists with patterns that also fire on `what <noun>`, `how <adj/adv>`, etc., while keeping existing rhetorical guards intact:

- `\bwhat\s+\w+` (was: `\bwhat\s+(is|are|...)`) — catches `what advantage`, `what mechanism`, `what role`.
- Same broadening for `how`, `why`, `which` (still excluding the rhetorical phrases already filtered by `RHETORICAL_BLOCKLIST` / `GREETING_PATTERNS`).
- Keep the embedded/conversational patterns unchanged.

The existing semantic completion gate (`evaluateCompleteness`) already rejects fragments like `"what is the"`, so loosening triggers does not raise false-positive risk meaningfully — it just lets the gate do its job on a wider net.

### 2. Pull a leading premise clause into `question`, not `context`

In `getSliceAroundTrigger`, after computing `triggerChunkPrefix` and `contextChunks`, detect whether the immediately-preceding text is a **premise clause of the same question** and, if so, prepend it to `question`. Heuristics (all must be cheap, no LLM):

- The text segment immediately before the trigger word, within the same topic segment, **ends with a comma** (`,`) with no intervening `.`/`?`/`!`, OR
- That segment **starts with a subordinator**: `if|when|whenever|suppose|given|assuming|provided|since|because|once|unless|although|though|while|as`
- AND the chunk-time gap between the premise chunk and the trigger chunk is ≤ `CHUNK_GAP_BOUNDARY_MS` (already 4000ms) — confirming "same breath/utterance".

When matched, that premise text moves from `context` into the front of `question`. Everything earlier still becomes `priorContext`.

### Example trace after fix

Buffer chunks:
```
[t=0]    "If a cell has a high surface-area-to-volume ratio,"
[t=1800] "what advantage does that give it?"
```

- Broader trigger matches `what advantage` at t=1800 → armed.
- `getSliceAroundTrigger` finds the trigger; the chunk before ends with `,` and starts with `If` → merged into `question`.
- `postProcess` → `"If a cell has a high surface-area-to-volume ratio, what advantage does that give it?"`
- Completion gate passes (≥6 words, no dangling tail) → delivered to Question on Deck.

### Technical details

File: `src/hooks/useQuestionTriggerCapture.ts`

- Lines 36-53 (`TRIGGER_PATTERNS`): broaden the WH patterns from explicit alternation lists to `\bwhat\s+\w+`, `\bwhy\s+\w+`, `\bhow\s+\w+`, `\bwhich\s+\w+`. Keep `who` slightly tighter since it's more often rhetorical, but allow `\bwho\s+\w+` too (rhetorical filter handles "who knows"/"who can tell me").
- Add a new constant `PREMISE_SUBORDINATORS` (regex) used only inside `getSliceAroundTrigger`.
- Lines 383-409: after building `contextChunks` and `triggerChunkPrefix`, inspect the trailing portion of the combined "context" text; if it satisfies the comma-end OR subordinator-start rule AND is within the same topic segment, slice it off the context and prepend it to `question` (with a single space before the trigger word).
- No changes to `evaluateCompleteness`, cooldowns, or the public API of the hook.

### Verification

- Unit-style mental trace on the user's example + a couple of variants:
  - `"When you compress a gas, what happens to its temperature?"` — premise via `When`.
  - `"Given a uniform field, how do charges accelerate?"` — premise via `Given`.
  - `"What is photosynthesis?"` — no premise, unchanged behavior.
- Watch dev console for `🎯 [trigger-armed]`, `🎯 [slice-split]`, `🚦 [gate-pass]` logs in a live recording and confirm the full sentence reaches Question on Deck.
- Confirm rhetorical guards still block `"what do you think?"`, `"how about that?"` (already covered by `RHETORICAL_BLOCKLIST`).

### Out of scope

- No changes to Deepgram chunking, edge functions, UI, or the passive detection path used for pre-recorded lectures.
- No LLM-based reassembly — kept fully deterministic to stay within the existing low-latency budget.
