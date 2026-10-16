# Fix short-answer auto-grading

## What's actually happening
Auto-grade is on and the grader does get called when a participant submits. The AI service rejects every request, though. The log shows: "invalid temperature: only 1 is allowed for this model". The grader goes to Kimi (Moonshot) first because a Moonshot key is set, and it sends a temperature setting that Kimi doesn't accept. The student's screen ignores the failure, saves no grade and shows only "response received". The instructor results then count the ungraded answer as incorrect. The data matches this: 8 of the 9 recent auto-graded short-answer check-ins have no grade. The coding grader has the same problem.

## Changes
1. **Grader works again:** stop sending the temperature setting when the request goes to Kimi. Keep it for the Lovable AI fallback. Fix it once in the shared AI helper, so the short-answer and coding graders are both covered.
2. **No more silent failures:** if grading fails for every question, the participant sees "Grading delayed — your instructor will review". The loading message is cleared and the answer is marked for review instead of being left blank.
3. **Instructor results:** an ungraded short answer shows as "Needs grading", not "Incorrect".
4. **Backfill:** add a "Re-run auto-grade" action on the check-in results page. It grades already-submitted short answers that have no grade, including the 8 stuck ones.

## Verify
- Call the grader directly and confirm it returns a grade.
- Submit a short answer as a participant with auto-grade on. Confirm the grade toast appears and the instructor results show a score.

## Technical details
- `supabase/functions/_shared/aiProvider.ts`: in `callAiProvider`, drop `temperature` when `ai.name === "Moonshot"` (or force it to 1). Redeploy `auto-grade-short-answer` and `auto-grade-coding`.
- `src/components/student/AssignedContent.tsx` (~line 780–940): track failures. When `avgGrade === null` in auto mode, dismiss the toast, clear `gradingInProgress` and show a warning toast.
- `LectureCheckInResults.tsx`: treat `completed && grade == null && has short answer` as pending, not incorrect. Add the re-run button, which invokes the grader and updates `grade`/`quiz_responses._ai_recommendations`.
