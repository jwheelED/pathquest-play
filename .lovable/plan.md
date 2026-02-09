

## Fix: Preserve Correct Answer for Backend Grading in Slide Questions

### Problem
Slide questions are hardcoded to poll mode, which blanks out the `correctAnswer` field (`correctAnswer: ''`). The `submit-live-response` edge function then compares a valid student answer like `"A"` against `""` and marks it as incorrect. The student UI already shows a neutral "Response Recorded" message (which is correct), but the instructor sees wrong grades in the Past Live Sessions section.

### Root Cause
In `send-slide-question/index.ts` (line 88):
```
correctAnswer: isPollMode ? '' : (questionData.correct_answer || ...)
```
This intentionally blanks the correct answer when poll mode is on. Since poll mode is always on for slides, grading always fails.

### Solution
**Stop blanking `correctAnswer` in `send-slide-question`.** Always include the correct answer in the question content so the backend can grade responses accurately. The student-facing UI already handles poll mode correctly -- it shows "Response Recorded" for all MCQs regardless of correctness.

### Changes

#### 1. `supabase/functions/send-slide-question/index.ts`
- Line 88: Change `correctAnswer: isPollMode ? '' : (...)` to always pass the correct answer
- Line 96: Similarly, always pass `expectedAnswer` for short answer questions
- Keep `isPoll: true` flag so the student UI continues to show neutral feedback

#### 2. No other changes needed
- `submit-live-response` already grades correctly when `correctAnswer` is populated
- `LiveStudent.tsx` already shows "Response Recorded" for MCQs (line 810-811) -- this is driven by the UI, not by the grading result
- Past Live Sessions reads `is_correct` from `live_responses`, which will now be accurate
- The `SlideQuestionPreviewDialog` stays in poll mode (no toggle needed)

### What stays the same
- Students still see "Response Recorded" (no correct/incorrect shown to them)
- Slide presenter still defaults to poll mode
- Instructor sees accurate correct/incorrect data in Past Live Sessions

