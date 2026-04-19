

## Problem Analysis

After fixing the rolling buffer (Problem 1), the trigger capture still fires on **timer expiry** or **first sentence-ending punctuation** after the trigger. Neither is a reliable signal of *semantic completeness*:

- Deepgram appends `?` or `.` on intonation pauses mid-thought (e.g. *"What is the relationship between..."* → `?` lands after "between")
- The 4.5s `completionTimeoutMs` fires regardless of whether the speaker actually finished
- `is_final=true` on a chunk only means Deepgram's acoustic model committed — not that the thought is done

Result: fragments like *"What is the relationship between"* or *"How many of these"* still leak through to Gemini, which then either generates a nonsense question or guesses at the missing context.

## Fix Strategy: Semantic Completion Gate

Insert a **gate** between `finalizeCapture()` and `onCaptureCompleteRef.current?.(candidate)` in `useQuestionTriggerCapture.ts`. The gate evaluates the candidate slice and either:

- **PASS** → forward to generation (existing behavior)
- **HOLD** → extend the completion timer by `extensionMs` (default 2500ms) up to `maxExtensions` (default 2) and re-evaluate when more buffer arrives
- **REJECT** → drop the candidate, log reason, do not call generation

### Gate checks (all must pass)

Implemented in a new helper `evaluateCompleteness(text)` returning `{ status: 'pass' | 'hold' | 'reject', reason: string }`:

1. **Minimum word count** — < 6 words → `reject`. A real interrogative needs subject + verb + object minimum.
2. **Trailing dangling token** — ends in a preposition / conjunction / article / aux verb (`of, to, for, with, in, on, between, about, the, a, an, and, or, but, is, are, was, were, do, does, did, can, could, would, should`) → `hold`. These are mid-thought signals.
3. **Hanging interrogative** — ends with the trigger word itself or within 2 words of it (`What is?`, `How many of?`) → `hold`.
4. **Subject-verb presence** — must contain at least one noun-like token AFTER the trigger word. Heuristic: at least one word ≥4 chars that isn't a stopword between the trigger and the end → otherwise `hold`.
5. **Comparative / relational dangler** — ends with `than, as, like, versus, vs, compared` → `hold`.
6. **Repetition / stutter** — same trigram repeated 3+ times (Deepgram hallucination signature) → `reject`.
7. **Trailing filler** — ends with `um, uh, like, you know, sort of, kind of` after stripping → `hold`.
8. **Punctuation sanity** — if buffer never produced a `.`, `?`, or `!` AND elapsed time < `softCompleteMs` (3000ms) → `hold`.

### State machine update

```text
[armed] ──completion timer fires──► evaluateCompleteness(slice)
                                      │
                                ┌─────┼──────┐
                              pass  hold   reject
                                │     │      │
                                │     │      └─► drop, log [gate-reject]
                                │     │
                                │     └─► extend timer +2500ms
                                │         (max 2 extensions = +5s)
                                │         after max → final eval; if still hold → reject
                                │
                                └─► forward to onCaptureComplete
```

### New options on `useQuestionTriggerCapture`

| Option | Default | Purpose |
|---|---|---|
| `enableCompletionGate` | `true` | Master switch (lets us A/B test) |
| `extensionMs` | 2500 | How long to wait after a `hold` verdict |
| `maxExtensions` | 2 | Cap on extensions before forced reject |
| `minCompleteWords` | 6 | Reject threshold |
| `softCompleteMs` | 3000 | Min elapsed before allowing punctuation-less pass |

### Logging (debug mode)

- `🚦 [gate-pass] words=X`
- `🚦 [gate-hold] reason="trailing preposition: of" extension=1/2`
- `🚦 [gate-reject] reason="too short (4 words)"`

This makes it trivial to tune the dangling-token list and thresholds from console output during real lectures.

### Files touched

- `src/hooks/useQuestionTriggerCapture.ts` — add `evaluateCompleteness()` helper, extend state machine with `extensionsUsedRef`, wire into `finalizeCapture()`
- No edge function, DB, or downstream consumer changes. Candidate shape unchanged.

### Validation

Test cases (verified in console):
- *"What is the relationship between"* → `hold` (trailing `between`) → extends → if no more comes → `reject`
- *"What is the relationship between frequency and wavelength?"* → `pass`
- *"How many of"* → `hold` (trailing `of` + too short)
- *"How many planets are in our solar system?"* → `pass`
- *"Why does water boil at 100 degrees Celsius?"* → `pass`
- *"What is the"* → `reject` (too short, 3 words)

