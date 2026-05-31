# Speed up MCQ generation after question detection

## Diagnosis

After a candidate question is detected, `QuestionOnDeck.generatePreview` runs two LLM-backed edge functions **sequentially**:

1. `match-bank-question` — does a lexical filter, then (whenever any bank question overlaps ≥0.3) calls **Gemini 2.5 Flash** to semantically confirm. ~1.5–3s, even when it ultimately returns `null`.
2. `generate-mcq-options` — calls **Gemini 2.5 Flash** for the MCQ (~2–3s). A deterministic validator can then trigger a **Gemini 2.5 Pro** retry (~8–12s) — the `correct option weakly supported by transcript` branch fires often on noisy live transcripts and is the main cause of the long wait.

No multi-provider hopping (the file is named `callClaude` for legacy reasons but it routes Gemini via Lovable AI Gateway). The slowness is **sequential chaining** + **noisy Pro-tier retry**.

## Fix

### 1. Parallelize bank match and MCQ generation (`src/components/instructor/QuestionOnDeck.tsx`)

In `generatePreview`, fire both `match-bank-question` and `generate-mcq-options` / `generate-expected-answer` at the same time via `Promise.all`. When the bank lookup returns a high-confidence match (`source === 'exact_match'` or `confidence >= 0.8`), overwrite the AI-generated options with bank content; otherwise keep the AI result. Net: wall-clock = max(bank, mcq) instead of sum.

### 2. Stop the heuristic-driven Pro retry (`supabase/functions/generate-mcq-options/index.ts`)

Only escalate to `google/gemini-2.5-pro` when the validator's failure is structural:
- `correct_answer letter does not map to an option`
- `citation not found in transcript` (model claimed a citation that doesn't exist)
- `correct option does not overlap with its own citation`

Skip retry for the `correct option weakly supported by transcript` branch — that's an overlap heuristic on live ASR text and produces too many false rejects. Ship the Flash result with a `validator_warning` instead.

### 3. Reduce transcript context payload (`supabase/functions/generate-mcq-options/index.ts`)

Lower `source_transcript.slice(-6000)` to `slice(-3000)`. `prior_context` (focused recent teaching) already carries the immediate antecedent for pronoun resolution; trimming the broad context shaves Flash time-to-first-token without measurable quality loss.

## Files changed

- `src/components/instructor/QuestionOnDeck.tsx` — parallelize the two invokes in `generatePreview`.
- `supabase/functions/generate-mcq-options/index.ts` — gate Pro retry on structural failures only; trim broad context to 3000 chars.

No DB / schema changes. No client behavior change beyond faster preview.

## Expected impact

Typical detection → on-deck-ready time drops from ~5–8s (and up to ~15s on Pro-retry) to ~2–3s consistently.
