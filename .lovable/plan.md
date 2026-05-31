## Diagnosis

From the edge-function logs and code review I traced three concrete bugs that match what you saw with the osmosis test.

### Bug 1 — "So why does it stop once equilibrium is reached?" gets dropped (unreliable pickup)

In `usePassiveQuestionDetection.ts`, the WH-trigger regex is anchored to a clause start (`^` or after `.?!;`). When Deepgram emits the question as `"So why does it stop…"`, the leading "So " sits between the clause start and the WH-word, so `hasInterrogativeTrigger` returns false and the candidate is dropped.

`useQuestionTriggerCapture.ts` strips `FILLER_PREFIXES` (`so|um|uh|well|now|and|but|…`) before scanning, but the passive hook and the shared module do not. That's the inconsistency causing missed pickups.

### Bug 2 — "Osmosis moves water…?" promoted as a question (false positive)

The MCQ log shows `Today, we'll be talking about osmosis?` and similar declaratives reaching `generate-mcq-options`. They get there via `acceptVettedCandidate` in the passive hook, which only checks word count + monologue shape and **does not** re-verify an interrogative trigger. A Deepgram-appended `?` on a declarative is enough to slip through, especially when paired with the fast-path immediate promote on trailing `?`.

### Bug 3 — "My question is, after remembering everything I said, why does this stop…?" (conflated text)

In `useQuestionTriggerCapture.ts` → `getSliceAroundTrigger`, the **premise-clause rescue** (lines ~426–446) prepends any context tail that ends with a comma onto the question. That correctly handles `"If a cell has X, what happens?"` but also catches generic preambles like `"…everything I said, why does this stop…"`, producing a 16-word run-on. The rescue should require an explicit subordinator (`if/when/given/suppose/…`), not just a trailing comma.

---

## Fix Plan

### 1. `src/hooks/usePassiveQuestionDetection.ts`

- Add a `stripLeadingFiller()` helper using the same `FILLER_PREFIXES` regex as the trigger-capture hook (`/^(so+|um+|uh+|like|well|okay so|okay|now|and so|but|or)\s+/i`, multi-pass).
- In `hasInterrogativeTrigger(text)`, test patterns against both `text` and `stripLeadingFiller(text)` so "So why…", "And how…", "Well, what…" trigger reliably.
- In `acceptVettedCandidate`, after the monologue/length guards, call `hasInterrogativeTrigger(stripLeadingFiller(text))` and reject if false. This closes the declarative-`?` false-positive path.
- When building the final candidate `text` for both `checkUtterance` and `acceptVettedCandidate`, strip the leading filler from the displayed question so the on-deck card shows `"Why does it stop once equilibrium is reached?"` rather than `"So why…"`.

### 2. `supabase/functions/_shared/questionDetection.ts`

- Mirror the same `stripLeadingFiller()` helper and apply it inside `hasInterrogativeTrigger` and `FALLBACK_INTERROGATIVE_PATTERN` testing. Keeps server-side video detection (`detect-speaker-questions`) consistent with the client.

### 3. `src/hooks/useQuestionTriggerCapture.ts`

- Tighten the premise-clause rescue: only prepend the context tail to the question when the tail **starts with a `PREMISE_SUBORDINATORS` token**. Drop the "ends with comma" branch — a bare trailing comma is not enough signal that the preceding clause is a question premise.
- After `postProcess(slice.question)`, strip the leading filler (`FILLER_PREFIXES`) from the question itself (currently only stripped from the buffer scan), so the emitted candidate never starts with "So/And/But/Well/Now".
- Final safety check before `onCaptureCompleteRef.current(candidate)`: run `hasInterrogativeTrigger` (imported from the shared module, post-strip) on the question. If false, log `gate-reject no-trigger` and abort with no cooldown — prevents declaratives leaking through when buffer-scan matched on `is/are/can` subject-aux that wasn't actually a question (the cause of `"Today, we'll be talking about osmosis?"`).

### 4. Tests — `src/__tests__/questionDetection.test.ts` + `usePassiveQuestionDetection.test.ts`

Add regression cases for the osmosis scenario:

- `hasInterrogativeTrigger("So why does it stop once equilibrium is reached?")` → `true`
- `hasInterrogativeTrigger("And how does osmosis work?")` → `true`
- `hasInterrogativeTrigger("Today, we'll be talking about osmosis?")` → `false`
- `hasInterrogativeTrigger("Osmosis moves water across a semipermeable membrane.")` → `false`
- Passive-hook integration: feed the 3-sentence osmosis passage as a single utterance — assert the surfaced candidate text is exactly `"Why does it stop once equilibrium is reached?"` (leading "So " stripped) and the `priorContext` (when fed via `acceptVettedCandidate`) contains the two preceding sentences.
- `acceptVettedCandidate("Today, we'll be talking about osmosis?")` → no pending candidate produced.

### Files to be edited

- `src/hooks/usePassiveQuestionDetection.ts`
- `src/hooks/useQuestionTriggerCapture.ts`
- `supabase/functions/_shared/questionDetection.ts`
- `src/__tests__/questionDetection.test.ts`
- `src/__tests__/usePassiveQuestionDetection.test.ts`

No DB/schema/edge-function-deploy changes required.
