

## Plan: Use Auto-Grade for Practice Short Answers

### Problem
Currently, short answer practice questions use `generate-detailed-explanation` which has a broken correctness check (compares first character only — line 41) and the client tries to parse AI prose to guess correctness. This always results in "Not quite."

### Solution
Replace the `generate-detailed-explanation` call with the existing `auto-grade-short-answer` edge function, which already provides component-based partial grading (0-100) with detailed feedback.

### Changes

#### Edit: `src/components/student/PracticeQuestionsCard.tsx`

**Grading logic (lines 90-124):**
- Call `auto-grade-short-answer` instead of `generate-detailed-explanation`
- Pass `{ studentAnswer, expectedAnswer, question }` (the params it expects)
- Use the returned `grade` (0-100) to determine correctness: grade >= 70 = correct
- Store the grade number and component scores in state
- Store the `feedback` string in `aiFeedback`

**New state:**
- `aiGrade: number | null` — the 0-100 score
- `aiComponents: { conceptual_understanding, accuracy, completeness, application } | null`

**Feedback UI (lines 326-368):**
- Replace the binary "Correct!" / "Not quite — the answer is: X" with a graded display:
  - Grade >= 85: green "Great answer! (92/100)"
  - Grade 70-84: green "Good answer (75/100)"  
  - Grade 50-69: amber "Partially correct (62/100)"
  - Grade < 50: red "Needs improvement (35/100)"
- Show a small 4-segment bar for component scores (conceptual, accuracy, completeness, application)
- Show the AI `feedback` text below (already handles the "why your answer needs work" explanation)
- Remove the raw `correct_answer` display for short answers — the feedback covers it

**Correctness tracking:**
- `isCorrect` for session stats: `grade >= 70`
- This feeds into `sessionCorrect` / `sessionTotal` and `times_correct` in the DB

No edge function changes needed — `auto-grade-short-answer` already exists and works.

