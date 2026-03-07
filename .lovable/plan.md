

## Plan: Rework Live Session Logic — Grading Accuracy & Timer Reliability

### Diagnosed Bugs

**Bug 1 — MCQ answers marked wrong when correct:**
The `submit-live-response` edge function extracts `correctAnswer` from `question_content`. When AI generates questions via `format-and-send-question`, the `correctAnswer` is stored as a letter (e.g., `"B"`). However, the `normalizeAnswer` function on the server has a fallback (step 4) that takes the first character of any string starting with A-D — this can incorrectly match strings like `"Bones..."` to `"B"`. Additionally, when `question_content` uses the nested `questions[]` format, the correct answer extraction can silently fail if the structure is unexpected, resulting in an empty `correctAnswer` — causing ALL answers to be graded as incorrect.

**Bug 2 — ALL answers occasionally marked incorrect:**
When `correctAnswer` resolves to an empty string (e.g., nested format missing the field, or AI response missing `correctAnswer`), the comparison `normalizedStudentAnswer === normalizedCorrectAnswer` fails for every student. The edge function does not guard against empty correct answers. This is the root cause of entire sessions being broken.

**Bug 3 — Auto-question timer unreliability:**
The auto-question `useEffect` (line 2005) includes `lastAutoQuestionTime` and `retryAttempts` in its dependency array. Every time the timer fires and updates `lastAutoQuestionTime`, the effect tears down and recreates the `setInterval`, causing timing drift. The `.finally()` block (line 2154) references `retryAttempts` from a stale closure, causing the generation lock (`isGeneratingAutoQuestionRef`) to sometimes never unlock.

**Bug 4 — Student UI shows "Response Recorded" instead of correct/incorrect for MCQ:**
Lines 810-830 of `LiveStudent.tsx` always render `<CheckCircle2>` with "Response Recorded" for MCQ results, ignoring the `isCorrect` state that was already set by the edge function response. The correct/incorrect data exists but the UI doesn't branch on it.

---

### Implementation Plan

#### 1. Fix MCQ result display in LiveStudent.tsx (Bug 4)

**File: `src/pages/LiveStudent.tsx` (lines 808-830)**

Replace the MCQ result section that currently shows "Response Recorded" with a conditional that checks `isCorrect`:
- If `isCorrect === true`: Show green checkmark, "Correct!" text, and the correct answer
- If `isCorrect === false`: Show red X, "Incorrect" text, show student's answer vs the correct answer
- If `isCorrect === null` (edge case): Show current "Response Recorded" as fallback
- Keep the XP display and AI explanation button

#### 2. Guard against empty correctAnswer in submit-live-response (Bug 2)

**File: `supabase/functions/submit-live-response/index.ts`**

After extracting `correctAnswer` (around line 140), add a guard:
- If `correctAnswer` is empty/falsy AND `questionType` is `multiple_choice`, return an error response telling the instructor the question has no correct answer configured, rather than silently grading everything as incorrect
- For short_answer/coding types, empty `correctAnswer` is acceptable (AI grading handles it)
- Log a warning with the question ID for debugging

#### 3. Harden normalizeAnswer to avoid false positives (Bug 1)

**File: `supabase/functions/submit-live-response/index.ts`**

Remove the dangerous fallback in step 4 of `normalizeAnswer` (line 63) that takes the first character if it's A-D. This causes words starting with A-D (like "Bones", "Cells", "Atoms", "DNA") to be misinterpreted as answer letters. Only match explicit letter prefixes.

#### 4. Fix auto-question timer stability (Bug 3)

**File: `src/components/instructor/LectureTranscription.tsx` (lines 2004-2168)**

Refactor the timer effect to use refs instead of state in the dependency array:
- Store `lastAutoQuestionTime` in a ref (alongside the state setter for UI)
- Remove `lastAutoQuestionTime` and `retryAttempts` from the dependency array — the `setInterval` callback should read from refs
- Fix the `.finally()` block to read `retryAttempts` from a ref instead of the stale closure
- This prevents the interval from being torn down/recreated every time the timer fires

#### 5. Add correct answer to student feedback response

**File: `supabase/functions/submit-live-response/index.ts`**

The edge function already returns `correctAnswer` in the response payload (line 238). Ensure the client-side code in `LiveStudent.tsx` reads and displays it. After an MCQ submission, show the correct answer text (resolved from the options array) so the student can learn from mistakes.

---

### Files to Change

| File | Change |
|------|--------|
| `src/pages/LiveStudent.tsx` | Replace "Response Recorded" MCQ result with correct/incorrect display |
| `supabase/functions/submit-live-response/index.ts` | Guard empty correctAnswer, remove dangerous first-char fallback |
| `src/components/instructor/LectureTranscription.tsx` | Stabilize timer with refs, fix stale closure in retry logic |

