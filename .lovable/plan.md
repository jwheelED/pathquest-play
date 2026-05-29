# Why "are they more or less likely…?" isn't captured

You're right — it's because it's an A/B (polar) question with no WH word.

The utterance is:
> "If two genes are very close together on the same chromosome, **are they** more or less likely to be separated by crossing over?"

Both `useQuestionTriggerCapture.ts` and `usePassiveQuestionDetection.ts` only arm on WH-fronted patterns (`what/why/how/when/where/who/which + \w+`) plus a few embedded forms (`tell me…`, `anyone know…`, `do you know…`, `what would happen`, `suppose that`). They have **no patterns for subject-auxiliary inversion** — i.e. classic yes/no questions:

- "**Are** they more or less likely…"
- "**Is** this an example of…"
- "**Does** the cell divide…"
- "**Can** anyone see why…"
- "**Will** the reaction…"

So the trigger never arms, the premise rescue never runs, and Question on Deck stays empty. The "If…" prefix doesn't help — `if` is only used as a premise *subordinator* after a trigger fires; it can't fire one itself.

Note: this also means "or" choice questions ("Is it A or B?", "More or less?") are missed too — same root cause.

## Fix

Add a polar-question trigger family to **both** hooks, mirroring the WH approach (broad regex + existing semantic/rhetorical gates handle false positives).

### 1. `src/hooks/useQuestionTriggerCapture.ts` — extend `TRIGGER_PATTERNS`

Append polar inversion patterns. To minimise false positives on declaratives like "There **are** two genes…", we require the aux to be followed by a **pronoun, determiner, or quantifier** typical of question subjects:

```ts
// Subject-aux inversion (yes/no & A-or-B questions)
/\b(is|are|was|were|am)\s+(it|this|that|these|those|there|he|she|they|we|you|i|any|all|both|either|neither|some|most|more|less|fewer|every|each|no|one|two|three)\b/i,
/\b(do|does|did)\s+(it|this|that|these|those|he|she|they|we|you|i|any|all|both|either|neither|some|most|every|each)\b/i,
/\b(can|could|would|should|will|shall|may|might|must)\s+(it|this|that|these|those|he|she|they|we|you|i|any|all|both|either|neither|some|most|every|each|anyone|anybody|someone|somebody|everyone|everybody)\b/i,
/\b(has|have|had)\s+(it|this|that|these|those|he|she|they|we|you|i|any|all|both|either|neither|anyone|anybody|someone|somebody|everyone|everybody)\b/i,
```

Because the premise-rescue logic already keys off `PREMISE_SUBORDINATORS` (which includes `if/when/given/…`) and a comma at the end of the tail, the "If two genes…, are they…" form will be reconstructed correctly once the trigger arms on `are they`.

### 2. `src/hooks/usePassiveQuestionDetection.ts` — mirror the same patterns

Add the identical four polar patterns to its `TRIGGER_PATTERNS` so the defense-in-depth passive path also accepts these. The existing `RHETORICAL_BLOCKLIST` already covers the common false positives ("does that make sense", "are we good", "can you hear me", etc.).

### 3. No changes needed

- `acceptVettedCandidate` bridge is unchanged.
- Semantic completion gate (`evaluateCompleteness`) still applies: 6-word minimum, no-dangling-tail, hanging-interrogative check, etc. — these continue to filter rhetorical "Right?", "Okay?", "Are we good?" type fragments.
- Premise-clause rescue is unchanged; it already handles the "If X, are they Y?" shape.

## Expected console after fix

```
🎯 [trigger-armed] word="are they"
🎯 [slice-split] question="are they more or less likely to be separated by crossing over"
                  context="If two genes are very close together on the same chromosome,"
🎯 [premise-rescue] tail moved into question
🚦 [gate-pass] 17 words
🎯 Trigger capture emitted question: If two genes are very close together on the same chromosome, are they more or less likely to be separated by crossing over?
✅ [passive] promoted pending → candidate
```

## Files touched
- `src/hooks/useQuestionTriggerCapture.ts` — append 4 polar regexes to `TRIGGER_PATTERNS`.
- `src/hooks/usePassiveQuestionDetection.ts` — append the same 4 regexes to its `TRIGGER_PATTERNS`.

No DB, edge-function, or API changes.
