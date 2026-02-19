
# Show All Students with Smart Sorting in Question Bank Results

## Problem
The current results view truncates the student list due to a fixed `max-h-80` constraint on the scroll area, and students are displayed in arbitrary database order rather than sorted by grade/submission status.

## Changes

### File: `src/components/instructor/QuestionBankResults.tsx`

**1. Sort assignments within each group before rendering**

Add a sorting function that orders assignments in this priority:
- Submitted students first, sorted by grade highest to lowest
- Not-submitted students at the bottom

The sort will extract the grade from `assignment.grade` or `quiz_responses._ai_recommendations["0"].grade`, then:
- Completed with grade: sorted descending by grade
- Completed without grade: after graded ones
- Not submitted: at the bottom

**2. Remove the height cap and allow full scrolling**

Change `<ScrollArea className="max-h-80">` to a taller limit (e.g., `max-h-[600px]`) so all students are visible in a scrollable container without cutting off after just 5-6 entries.

**3. Keep the expand/collapse pattern**

Each student row remains individually expandable for coding and short answer responses -- no changes needed to the existing `ExpandableResponse` component.

## Technical Details

The sorting logic will be added inline before the `.map()` call:

```typescript
const sortedAssignments = [...group.assignments].sort((a, b) => {
  const gradeA = getGrade(a);
  const gradeB = getGrade(b);
  const submittedA = a.completed;
  const submittedB = b.completed;
  
  // Submitted before not submitted
  if (submittedA && !submittedB) return -1;
  if (!submittedA && submittedB) return 1;
  
  // Both submitted: higher grade first
  if (submittedA && submittedB) {
    if (gradeA !== null && gradeB !== null) return gradeB - gradeA;
    if (gradeA !== null) return -1;
    if (gradeB !== null) return 1;
  }
  
  return 0;
});
```

A helper `getGrade(assignment)` function extracts the grade from either the top-level `grade` field or the embedded `_ai_recommendations`.

### Summary of edits
- Add `getGrade` helper function
- Sort `group.assignments` before rendering
- Change `max-h-80` to `max-h-[600px]` on the ScrollArea
