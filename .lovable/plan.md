

## Instant Confidence Check — Phrase Detector Module

Build a single, dependency-free phrase detection module at `src/lib/confidenceCheck/detector.ts` that scans transcript chunks for instructor confidence-check cues (e.g., "does that make sense", "are we good") and returns the matched phrase along with the appropriate response widget type.

### What gets built

A new file: `src/lib/confidenceCheck/detector.ts`

Two exports:
1. `CONFIDENCE_PHRASES` — the full phrase map constant
2. `detectConfidencePhrase(transcript: string)` — pure synchronous detector

### Phrase map

| Phrase | Response Type | Template ID |
|---|---|---|
| does that make sense | yes_no | makes_sense_that |
| does this make sense | yes_no | makes_sense_this |
| make sense? | yes_no | makes_sense_short |
| are we good | thumbs | are_we_good |
| everyone following | yes_no | everyone_following |
| are you following | yes_no | are_you_following |
| still with me | yes_no | still_with_me |
| how confident are you | scale_1_5 | how_confident |
| how are we feeling about this | scale_1_5 | how_feeling |
| on a scale | scale_1_5 | on_a_scale |
| any questions so far | thumbs | any_questions |
| got it? | yes_no | got_it |

### Detection logic

- Lowercase the transcript once per call.
- Iterate the phrase map in declared order and return the first phrase whose lowercase form is found via `String.prototype.includes` in the transcript.
- Returns `null` when no phrase matches or input is empty/non-string.
- Longer/more specific phrases (e.g., "does that make sense") are listed before shorter overlapping ones (e.g., "make sense?") so the more descriptive template wins when both could match.
- Pure function: no async, no I/O, no regex compilation in the hot path beyond plain `includes` checks. Safe to call on every transcript chunk.

### Return shape

```ts
type ConfidenceMatch = {
  phrase: string;          // the matched phrase, exactly as in the map
  responseType: "yes_no" | "scale_1_5" | "thumbs";
  templateId: string;
} | null;
```

### Constraints honored

- No other files touched.
- No new dependencies.
- No edits to `src/integrations/supabase/types.ts`, `supabase/migrations/`, or `package-lock.json`.
- TypeScript strict — explicit types, no `any`.

### Out of scope (future work, not in this task)

- Wiring the detector into the live transcript pipeline (`useQuestionTriggerCapture` / `usePassiveQuestionDetection`).
- UI widgets for yes_no / scale_1_5 / thumbs responses.
- Cooldown/debouncing across chunks (this module is pure; dedupe lives at the call site).

