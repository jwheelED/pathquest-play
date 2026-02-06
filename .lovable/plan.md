
# Plan: Fix Check-In Results & Visual Analytics Accuracy

## Problem Summary
The instructor's check-in results card and visual analytics charts are showing inaccurate data:
1. Students appear as "didn't answer" when they actually did
2. Multiple students shown when only one answered
3. Charts display incorrect counts

## Root Cause Analysis

After exploring the codebase, I identified **three distinct bugs**:

### Bug 1: `QuestionAnalyticsChart` Deduplication Flaw
**Location**: `src/components/instructor/QuestionAnalyticsChart.tsx` (lines 43-71)

The chart component receives `group.assignments` directly (line 1389-1394 in `LectureCheckInResults.tsx`), but its deduplication logic has a critical flaw:

```typescript
const count = assignments.filter((a) => {
  if (!a.completed) return false;
  if (countedStudents.has(a.student_id)) return false;
  // ... check answer ...
  if (studentAnswer === letter) {
    countedStudents.add(a.student_id);
    return true;
  }
  return false;
}).length;
```

**The problem**: If a student's answer doesn't match the current option being counted, they're NOT added to `countedStudents`, so their OTHER assignments can still be counted for different options. This means:
- A single student with multiple assignment records could be counted multiple times across different options
- A student could appear as "not answered" if their first assignment record was incomplete, even if a later one was complete

### Bug 2: Answer Distribution Bar Lacks Deduplication
**Location**: `src/components/instructor/LectureCheckInResults.tsx` (lines 1591-1609)

The inline "Answer Distribution" bar chart counts responses without student deduplication:

```typescript
const count = questionAssignments.filter((a) => {
  if (!a.completed) return false;
  // ... finds student's answer ...
  return studentAnswer === optionLetter;
}).length;
```

If a student has multiple assignment records, they're counted multiple times.

### Bug 3: Stale React State on Real-time Updates
The component uses debounced fetching (300ms) and polling (5s) for real-time updates, but there's a subtle timing issue:
- When realtime triggers `fetchResults()`, the UI re-renders with old grouped data while waiting for the new fetch
- The `groupedResults` state can become stale if rapid updates occur

## Solution

### Part 1: Fix `QuestionAnalyticsChart` Deduplication

Deduplicate assignments **before** calculating answer distribution:

```typescript
// Deduplicate assignments - keep only latest per student
const uniqueStudents = new Map<string, Assignment>();
assignments.forEach((a) => {
  const existing = uniqueStudents.get(a.student_id);
  if (!existing || new Date((a as any).created_at) > new Date((existing as any).created_at)) {
    uniqueStudents.set(a.student_id, a);
  }
});
const deduplicatedAssignments = Array.from(uniqueStudents.values());

const answerDistribution = isMultipleChoice
  ? question.options?.map((opt: string, idx: number) => {
      const letter = String.fromCharCode(65 + idx);
      const count = deduplicatedAssignments.filter((a) => {
        if (!a.completed) return false;
        // ... rest of logic ...
      }).length;
```

### Part 2: Fix Answer Distribution Bar Deduplication

Add the same deduplication pattern to the inline answer distribution (lines 1591-1609):

```typescript
// Deduplicate by student_id
const uniqueStudents = new Map<string, Assignment>();
questionAssignments.forEach((a) => {
  const existing = uniqueStudents.get(a.student_id);
  if (!existing || new Date(a.created_at) > new Date(existing.created_at)) {
    uniqueStudents.set(a.student_id, a);
  }
});
const deduplicatedAssignments = Array.from(uniqueStudents.values());
const count = deduplicatedAssignments.filter((a) => { ... }).length;
```

### Part 3: Add `created_at` to Chart Assignment Interface

The `QuestionAnalyticsChart` component's `Assignment` interface doesn't include `created_at`:

```typescript
interface Assignment {
  id: string;
  student_id: string;
  completed: boolean;
  quiz_responses: any;
  grade: number | null;
  // Missing: created_at for deduplication
}
```

**Fix**: Add `created_at: string` to the interface.

### Part 4: Pass Deduplicated Data to Chart (Cleaner Alternative)

Instead of duplicating deduplication logic, we can pass already-deduplicated assignments to `QuestionAnalyticsChart`:

In `LectureCheckInResults.tsx`, before rendering the chart (around line 1389):
```typescript
// Pre-deduplicate for chart
const chartAssignments = (() => {
  const uniqueStudents = new Map<string, Assignment>();
  group.assignments.forEach((a) => {
    const existing = uniqueStudents.get(a.student_id);
    if (!existing || new Date(a.created_at) > new Date(existing.created_at)) {
      uniqueStudents.set(a.student_id, a);
    }
  });
  return Array.from(uniqueStudents.values());
})();

<QuestionAnalyticsChart
  question={question}
  assignments={chartAssignments}  // Pass deduplicated
  questionIndex={qIdx}
  stats={stats}
/>
```

## Files to Modify

| File | Change |
|------|--------|
| `src/components/instructor/QuestionAnalyticsChart.tsx` | Add `created_at` to interface, implement proper deduplication before counting |
| `src/components/instructor/LectureCheckInResults.tsx` | Fix inline answer distribution to deduplicate, pass pre-deduplicated data to chart |

## Technical Details

### Deduplication Strategy
The consistent pattern across all locations:
1. Build a `Map<student_id, Assignment>`
2. For each assignment, keep only if it's newer than existing (by `created_at`)
3. Convert map values to array for processing

### Matching Logic
Use question text matching (not array index) to handle cases where students receive questions in different orders:
```typescript
const studentQuestionIdx = assignmentQuestions.findIndex(
  (q: any) => q.question === question.question
);
```

This is already implemented correctly in most places but needs to be consistent in the chart component.

## Testing Approach
After implementation:
1. Send a question to multiple students
2. Have one student answer, verify count shows 1
3. Have the same student's assignment record duplicated (edge case), verify still shows 1
4. Check that "Not Answered" count excludes students who answered
