

# Enhance "Hard" Difficulty for Auto Interval Questions

## Problem
The current "hard" difficulty prompt is a single generic sentence: *"Generate a challenging question requiring analysis, synthesis, or evaluation."* This doesn't give the AI enough guidance to produce genuinely harder questions or craft plausible, competitive distractors for MCQ.

## Solution
Expand the difficulty instructions in the `generate-interval-question` edge function with detailed pedagogical guidance for "hard" mode — both for the question stem and for MCQ distractors. Also lower the temperature slightly for hard mode to get more precise, deliberate outputs.

## Changes

### `supabase/functions/generate-interval-question/index.ts`

**1. Replace the hard difficulty instruction block (line 313)** with a detailed multi-paragraph prompt covering:

- **Question stem**: Require multi-concept synthesis, cause-effect reasoning, "what would happen if" scenarios, compare/contrast, edge cases, or predicting outcomes — not just recall with harder vocabulary
- **MCQ distractors**: Each distractor must represent a specific, named misconception or common error (e.g., confusing similar terms, applying the wrong formula, reversing cause and effect). No vague or obviously wrong options. Distractors should be the same length and grammatical structure as the correct answer

**2. Add a conditional temperature adjustment**: Use `temperature: 0.5` for hard (more focused reasoning) vs `0.7` for medium/easy

### Specific prompt additions for hard mode

```text
DIFFICULTY LEVEL: HARD
Question Stem Requirements:
- Ask students to APPLY, ANALYZE, or EVALUATE — never just recall a definition.
- Prefer "What would happen if...", "Why does X lead to Y rather than Z?", 
  "Compare X and Y in the context of...", or "Which of these scenarios 
  demonstrates [concept]?"
- Require connecting TWO or more concepts from the transcript.
- Avoid questions answerable by someone who only memorized a glossary.

MCQ Distractor Requirements (when format is multiple_choice):
- Each distractor must represent a SPECIFIC misconception or common student error.
- Distractors should be plausible to someone who partially understands the material.
- Match the length, detail, and grammatical structure of the correct answer.
- NEVER use "All of the above", "None of the above", or vague fillers.
- At least one distractor should be a "near-miss" — correct logic but wrong 
  conclusion, or right concept applied to the wrong context.
```

### Files modified
| File | Change |
|------|--------|
| `supabase/functions/generate-interval-question/index.ts` | Expand hard difficulty prompt, add distractor guidance, adjust temperature |

No database changes, no client-side changes, no new files.

