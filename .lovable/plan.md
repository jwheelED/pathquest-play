
# Bug Fix Plan: Visual Analytics Count & MCQ Grading Issues

## Bug 1: Visual Analytics Showing Wrong Student Count

### Root Cause
The `QuestionAnalyticsChart.tsx` component uses a fixed `questionIndex` (the index within the group's merged questions array) to look up student responses:

```typescript
// Line 43-45 in QuestionAnalyticsChart.tsx
const count = assignments.filter(
  (a) => a.completed && a.quiz_responses?.[questionIndex.toString()] === letter
).length;
```

**Problem**: Each student's assignment may have the question at a DIFFERENT index. When questions are grouped together from multiple assignment batches, the group's `questionIndex` doesn't match the actual position in each student's individual assignment.

For example:
- Group shows Question A at index 0
- Student 1's assignment has Question A at index 0 ✓
- Student 2's assignment has Question A at index 1 (they received a different question first) ✗

This causes the chart to miss students who answered at different indices, or count wrong answers.

### The Fix Already Exists
The same bug was already fixed in `LectureCheckInResults.tsx` (line 422-428) for the main stats calculation. The fix is to find the question index within EACH student's assignment by matching the question text:

```typescript
const studentQuestionIdx = assignmentQuestions.findIndex(
  (q: any) => q.question === question.question
);
```

### Files to Modify
- `src/components/instructor/QuestionAnalyticsChart.tsx`

### Changes

1. **Pass the question object to the chart** (if not already available)
2. **Update answer distribution calculation** to find the correct question index per student:

```typescript
const answerDistribution = isMultipleChoice
  ? question.options?.map((opt: string, idx: number) => {
      const letter = String.fromCharCode(65 + idx);
      
      // FIX: Find question index within EACH student's assignment
      const count = assignments.filter((a) => {
        if (!a.completed) return false;
        const content = a.content as any;
        const assignmentQuestions = content?.questions || [];
        const studentQuestionIdx = assignmentQuestions.findIndex(
          (q: any) => q.question === question.question
        );
        const studentAnswer = studentQuestionIdx >= 0 
          ? a.quiz_responses?.[studentQuestionIdx.toString()]
          : null;
        return studentAnswer === letter;
      }).length;
      
      return { option: letter, count, label: opt, isCorrect: letter === correctAnswer };
    })
  : [];
```

3. **Add deduplication** to prevent counting duplicate submissions from the same student

---

## Bug 2: MCQ Sometimes Marked Incorrect

### Root Cause
There are two potential issues in the grading flow:

**Issue A: Nested vs Direct Format Mismatch**
The `submit-live-response` edge function handles two question content formats:
1. Nested: `{ questions: [{ correctAnswer, options, type }] }`
2. Direct: `{ correctAnswer, options, type }`

When questions are sent via `format-and-send-question`, they're stored in the `live_questions` table with the `formattedQuestion` object directly (line 788):
```typescript
question_content: formattedQuestion,  // Direct format: { question, type, options, correctAnswer }
```

However, when sent to `student_assignments`, they're wrapped in a `questions` array (line 833):
```typescript
content: {
  questions: [formattedQuestion],  // Nested format
  isLive: true,
  ...
}
```

The edge function correctly handles both, BUT there's still a potential issue:

**Issue B: Empty Options Array**
When the `options` array is empty or undefined in the stored question, the text-matching fallback in `normalizeAnswer()` won't work. The function relies on `options` to match text answers like "206 bones" to their corresponding letter "B".

If the question is stored without options (or options get lost), the normalization can fail.

### Verification
Looking at line 166 in `submit-live-response`:
```typescript
options = firstQuestion.options || [];
```

If `firstQuestion.options` is undefined/null, options becomes an empty array, and the text matching loop (lines 33-66) won't find any matches.

### The Fix
1. **Add logging** to trace when options are empty to identify the data source issue
2. **Ensure robust letter extraction** even without options by improving the fallback logic
3. **Add case normalization** to the comparison to catch edge cases

### Files to Modify
- `supabase/functions/submit-live-response/index.ts`

### Changes

1. **Add diagnostic logging** when options are missing:
```typescript
if (!options || options.length === 0) {
  console.warn(`⚠️ No options array found for MCQ grading. Question ID: ${questionId}`);
}
```

2. **Improve the normalization to handle edge cases**:
   - Trim whitespace from both student answer and correct answer before comparison
   - Handle case where correctAnswer might contain extra formatting
   - Add direct string comparison fallback AFTER normalization

3. **Add final comparison logging** to debug mismatches:
```typescript
console.log('Final comparison:', {
  studentAnswer: normalizedStudentAnswer,
  correctAnswer: normalizedCorrectAnswer,
  match: normalizedStudentAnswer === normalizedCorrectAnswer,
  rawStudent: answer,
  rawCorrect: correctAnswer
});
```

---

## Implementation Details

### QuestionAnalyticsChart.tsx Changes

The component needs access to the question object (specifically `question.question` text) to find the correct index per student. Currently it receives:
- `question` - the question object (already has this)
- `assignments` - the list of assignments
- `questionIndex` - the group's question index (not reliable)

The fix updates:
1. `answerDistribution` calculation (lines 40-55)
2. Any other place using `questionIndex` to access `quiz_responses`

### submit-live-response Changes

Add robustness to the normalization:

```typescript
// Before final comparison, ensure both are normalized
const normalizedStudentAnswer = normalizeAnswer(answer.toString().trim(), questionType, options);
const normalizedCorrectAnswer = normalizeAnswer(correctAnswer.toString().trim(), questionType, options);

// Direct comparison after normalization
const isCorrect = normalizedStudentAnswer.toUpperCase() === normalizedCorrectAnswer.toUpperCase();
```

---

## Summary of Changes

| File | Issue | Change |
|------|-------|--------|
| `src/components/instructor/QuestionAnalyticsChart.tsx` | Bug 1: Wrong count | Find question index per-student instead of using fixed group index |
| `supabase/functions/submit-live-response/index.ts` | Bug 2: Wrong grading | Add diagnostic logging and improve normalization robustness |

## Testing Recommendations

After implementation:
1. Create a live session with 2+ students
2. Send an MCQ question
3. Have students answer with different options
4. Verify the visual analytics chart shows correct counts
5. Verify answers are graded correctly (check edge function logs)
6. Test with answers in different formats: "A", "A.", "A) text", "just the text"
