## Short answer: Yes, this is fully possible.

Today the Live Copilot pipeline (voice → "Question on Deck" → MCQ choices) is completely independent from the Question Bank. When you speak a question, `QuestionOnDeck` calls the `generate-mcq-options` edge function, which asks Claude to invent 4 fresh distractors using only the lecture transcript — it never looks at `instructor_question_bank`, even if that exact question was extracted from a PDF you uploaded.

We can fix that by adding a "bank-first" lookup step before the AI generates new options.

---

## How it works today

1. Instructor uploads a PDF → questions get parsed and stored in `instructor_question_bank` (with `question_content` JSONB containing `question`, `options`, `correctAnswer`, etc.).
2. During a live session, voice detection produces a candidate question and hands it to `QuestionOnDeck`.
3. `QuestionOnDeck` calls `generate-mcq-options` with just `{ question_text, source_transcript, prior_context }`.
4. Claude invents 4 brand-new options based on the lecture transcript — **the bank is never queried**.

So even if you spoke an exact bank question, the choices on deck would be AI-fabricated and could differ from what's in the bank.

## Proposed change

Add a semantic match step that, when a candidate question appears, first searches the instructor's question bank for a close match. If found, populate the on-deck preview with the bank's exact options/correct answer. If not found, fall back to today's AI generation.

### Pipeline

```text
voice candidate
      │
      ▼
┌────────────────────────┐    match found
│ match-bank-question    │──────────────► use bank's options + correctAnswer
│ (new edge function)    │                (mark as "From bank: <title>")
└────────────────────────┘
      │ no match
      ▼
generate-mcq-options (existing) ─────► AI-generated options
```

### Matching strategy (new edge function `match-bank-question`)

1. Pull the instructor's bank rows scoped to the active `course_id` (and org), filtered to MCQ-compatible types (`multiple_choice`, `mcq`, plus `short_answer` for SA format).
2. Cheap lexical pre-filter: normalize text (lowercase, strip punctuation) and keep candidates with ≥40% token overlap with the spoken question.
3. Send the candidate + top ~10 pre-filtered bank items to Gemini/Claude with a tool call that returns `{ match_id | null, confidence }`.
4. Accept the match only if `confidence ≥ 0.75`. Return the full `question_content` so the client can use it verbatim.

### Client changes (`QuestionOnDeck.tsx`)

- In the existing `generatePreview` flow, call `match-bank-question` first.
- On match: set `mcqOptions`/`correctAnswer` (or `expectedAnswer` for short answer) directly from `question_content`, skip `generate-mcq-options`, and show a small "From your question bank" badge above the preview panel.
- On no match: keep current behavior (call `generate-mcq-options`).
- Pass the matched `bank_item_id` through `OnDeckSendData` so the eventual send can increment `times_used` / `last_used_at` on the bank row (reusing the existing `push-bank-question` accounting logic where reasonable).

### Format respect

- If the bank item's type doesn't match the instructor's current `formatPreference` (e.g. bank has MCQ but preference is short_answer), still prefer bank content but adapt: show the bank's `question` text and either (a) use bank options if format aligns, or (b) fall back to AI for the alternate format. Simplest v1: only use the bank match when types align; otherwise fall back to AI.

### Optional enhancement (low cost, high value)

Also pass the top 3 pre-filtered bank items as **additional context** into `generate-mcq-options` even when no match crosses the confidence threshold. This way AI-generated distractors stay consistent with the style/terminology the instructor used in their bank PDF.

## Files to change

- `supabase/functions/match-bank-question/index.ts` — new edge function (auth + instructor role check, like `generate-mcq-options`).
- `src/components/instructor/QuestionOnDeck.tsx` — call match function first in `generatePreview`, show "From bank" badge, pass `bank_item_id` in send data.
- `src/components/instructor/QuestionOnDeck.tsx` (`OnDeckSendData` type) — add optional `sourceBankItemId?: string`.
- `src/components/instructor/LectureTranscription.tsx` — when `sourceBankItemId` is present in send data, route through `push-bank-question` (or include the id in the standard send so usage tracking fires).

## Risks / things to watch

- Latency: bank match adds one extra call before MCQ generation. We'll run match + generation in a "match-or-fallback" sequence; for instructors with empty banks we short-circuit (skip match entirely if the bank query returns 0 rows).
- False matches: confidence threshold of 0.75 + token overlap pre-filter keeps this conservative. Always show the bank title in the badge so the instructor can spot a wrong match before sending.
- Bank items with non-standard JSON shape: normalize on read; if `options`/`correctAnswer` missing, treat as no match and fall back to AI.
