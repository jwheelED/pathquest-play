# Fix: long premise-led questions not detected

## Root cause

In `src/hooks/useQuestionTriggerCapture.ts`, trigger patterns were anchored to:

```js
const CLAUSE_START = '(?:^|[.?!;]\\s+)';
```

This only accepts `.`, `?`, `!`, `;`, or buffer-start as a valid clause boundary immediately before a WH word or subject-aux inversion. Real instructor questions almost always have the shape:

- "Suppose that the array is already sorted **— which** search algorithm would you pick…"
- "Considering the economic pressures we covered earlier**, how** did the war effort…"
- "If a cell has high SA:V ratio**, what** advantage…"

The boundary before the trigger is a comma or em/en-dash, not a sentence terminator, so the trigger never arms. Combined with `suppose` / `considering` correctly being premise subordinators (not triggers), the whole utterance scrolls by undetected.

## Change

### 1. `src/hooks/useQuestionTriggerCapture.ts`

Broaden the clause-start anchor to include commas and dashes:

```js
// Accept: buffer start, hard terminator (.?!;), or a soft clause boundary
// (comma / em-dash / en-dash) that almost always precedes a premise-led
// WH question like "…sorted — which algorithm…" or "…earlier, how did…".
const CLAUSE_START = '(?:^|[.?!;,\\u2014\\u2013]\\s+|\\s[\\u2014\\u2013]\\s+)';
```

Notes:
- `\u2014` is em-dash (—), `\u2013` is en-dash (–). Deepgram emits both depending on locale/model.
- The second alternative `\\s[\\u2014\\u2013]\\s+` covers dashes surrounded by spaces with no preceding token-terminating char.
- Comma is added because every "premise, WH-question" pattern uses it.

False-positive defenses already in place stay intact:
- `RHETORICAL_BLOCKLIST` + greeting patterns still filter "what do you think", greetings, etc.
- `evaluateCompleteness` still rejects short/dangling/stutter chunks.
- Final `hasInterrogativeTrigger(question)` recheck on the cleaned question text (line 566) still blocks declaratives whose slice didn't actually produce a real question.

### 2. `src/__tests__/questionDetection.test.ts`

Add regression tests so the two reported sentences (and similar shapes) stay detected:

- "Suppose that the array is already sorted — which search algorithm would you pick, and how does its complexity compare to a linear scan?" → triggers, premise attached via subordinator-rescue path.
- "Considering the economic pressures we covered earlier, how did the war effort accelerate industrialization across the northern states?" → triggers on `how`, premise attached.
- Negative regression: "…and how dangerous these components can be in everyday use." → still does NOT trigger (no comma/dash directly before `how`; mid-sentence WH inside a declarative).

### 3. `src/hooks/usePassiveQuestionDetection.ts` + `supabase/functions/_shared/questionDetection.ts`

Audit for the same `CLAUSE_START`-style anchor. The passive hook and shared module use a different pattern set (no clause-start anchor — they use `\\b(what|why|how…)\\s+(is|are|do|does…)\\b` style), so they already catch these examples. No change needed there unless audit shows otherwise.

## Out of scope

- No changes to slice/context extraction, completeness gate thresholds, cooldown logic, or edge functions.
- No model/prompt changes.

## Verification

- `bun test` — all existing tests + new regression cases pass.
- Manual: speak both example sentences live; on-deck preview should populate within ~2s of the question ending, with the premise carried as part of `question` (subordinator-rescue path) or `priorContext`.
