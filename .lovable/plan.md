
# Question Bank Results & Auto-Grading Plan

## Overview
This plan adds two key features for Question Bank questions:
1. **Dedicated Results Card**: A new component to view student responses for Question Bank-pushed questions (similar to `LectureCheckInResults` for live capture)
2. **Auto-Grading Integration**: Ensure short answer and coding questions from the Question Bank are auto-graded when students submit

## Current State Analysis

### Question Bank Push Flow
When questions are pushed via `push-bank-question`:
- Assignments are created with `assignment_type: "lecture_checkin"`
- Content includes `source: "question_bank"` to identify the origin
- Mode is set to `auto_grade` for MCQ and coding, `manual_grade` for short answer

### Auto-Grading Gap
Looking at `push-bank-question`, the mode for short answers is currently hardcoded to `manual_grade`:
```typescript
const getAssignmentMode = (questionType: string): string => {
  if (questionType === "multiple_choice") return "auto_grade";
  if (questionType === "coding_simple" || questionType === "coding") return "auto_grade";
  return "manual_grade"; // short_answer <-- This prevents auto-grading!
};
```

However, the student-side `AssignedContent.tsx` already handles auto-grading for short answers when `assignment_mode === 'auto_grade'`. The issue is that Question Bank short answers are not being sent as auto-grade.

### Results Visibility
Currently, `LectureCheckInResults.tsx` shows ALL `lecture_checkin` assignments without differentiating by source. Question Bank questions are mixed in with live capture questions.

---

## Implementation Plan

### Phase 1: Fix Auto-Grading for Question Bank Short Answers

**File**: `supabase/functions/push-bank-question/index.ts`

Change the mode logic to enable auto-grading for short answers:

```typescript
const getAssignmentMode = (questionType: string): string => {
  // All question types from Question Bank should be auto-graded
  // Instructors explicitly chose to push these, so auto-grading is expected
  if (questionType === "multiple_choice") return "auto_grade";
  if (questionType === "coding_simple" || questionType === "coding") return "auto_grade";
  if (questionType === "short_answer") return "auto_grade"; // NEW: Enable auto-grading
  return "manual_grade";
};
```

This single change enables auto-grading because the student-side already:
1. Calls `auto-grade-short-answer` edge function for short answers when mode is `auto_grade`
2. Calls `auto-grade-coding` for coding questions
3. Saves grades directly to `student_assignments`

### Phase 2: Create Question Bank Results Component

Create a new component that shows results specifically for Question Bank pushed questions.

**New File**: `src/components/instructor/QuestionBankResults.tsx`

Features:
- Filter assignments where `content.source === "question_bank"`
- Group by `content.questionBankId` (the original question ID) + timestamp
- Show question title prominently (from the bank question's title)
- Display student responses with grades
- Real-time updates via Supabase subscription
- AI summary generation (reuse existing pattern)
- Export to PDF/CSV

Component structure:
```text
QuestionBankResults
├── Header with title + refresh/export buttons
├── Accordion for each pushed question batch
│   ├── Question title + push timestamp
│   ├── Response stats (completed/total, avg grade)
│   ├── Student responses list
│   │   ├── Student name
│   │   ├── Answer (MCQ letter / short text / code block)
│   │   ├── Grade badge
│   │   └── AI feedback (if available)
│   └── AI Summary section
└── Empty state when no results
```

### Phase 3: Integrate into Question Bank Tab

**File**: `src/components/instructor/QuestionBankTab.tsx`

Add the results component below the question list:

```typescript
import { QuestionBankResults } from "./QuestionBankResults";

// In the return JSX, after the questions Card:
<QuestionBankResults />
```

---

## Technical Details

### QuestionBankResults Component

Key differences from LectureCheckInResults:
1. Filter by `content.source === 'question_bank'` (client-side since Realtime doesn't support JSONB filters)
2. Group by `questionBankId` instead of timestamp alone
3. Show the question title from the bank prominently
4. Include reference to original bank question for context

**Data Fetching Logic**:
```typescript
// Filter assignments with question_bank source
const { data: assignments } = await supabase
  .from("student_assignments")
  .select("*")
  .eq("instructor_id", user.id)
  .eq("course_id", selectedCourseId)
  .eq("assignment_type", "lecture_checkin")
  .order("created_at", { ascending: false })
  .limit(200);

// Client-side filter for question_bank source
const bankAssignments = assignments?.filter(
  (a) => a.content?.source === "question_bank"
) || [];
```

**Grouping Logic**:
```typescript
// Group by questionBankId + timestamp (5 min window)
const groups = groupByBankQuestion(bankAssignments);

interface BankQuestionGroup {
  questionBankId: string;
  title: string;
  timestamp: string;
  assignments: Assignment[];
  questionContent: any;
}
```

### Auto-Grading Flow (Already Works)

When a student submits a Question Bank question:

1. `AssignedContent.tsx` calls `submit_quiz` RPC
2. RPC returns `has_short_answer: true` and `assignment_mode: 'auto_grade'`
3. Frontend loops through short answer questions calling `auto-grade-short-answer`
4. Frontend loops through coding questions calling `auto-grade-coding`
5. Frontend saves grades directly to `student_assignments`
6. Realtime subscription updates instructor's results view

The only fix needed is in `push-bank-question` to set the correct mode.

---

## Files to Create

| File | Description |
|------|-------------|
| `src/components/instructor/QuestionBankResults.tsx` | New results component for Question Bank questions |

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/push-bank-question/index.ts` | Change short_answer mode to `auto_grade` |
| `src/components/instructor/QuestionBankTab.tsx` | Import and render QuestionBankResults |

---

## Component Design: QuestionBankResults.tsx

```text
+------------------------------------------+
| 📊 Question Bank Results         [🔄][📥] |
+------------------------------------------+
|                                          |
| ▼ "Derivative of x²" (MCQ)               |
|   Pushed: Feb 3, 2:15 PM • 25 students   |
|   ┌────────────────────────────────────┐ |
|   │ 92% correct • Avg: 12s response    │ |
|   └────────────────────────────────────┘ |
|   ┌────────────────────────────────────┐ |
|   │ 👤 John Smith      [A] ✓   100%    │ |
|   │ 👤 Jane Doe        [B] ✗    0%     │ |
|   │ ...                                │ |
|   └────────────────────────────────────┘ |
|                                          |
| ▼ "Explain osmosis" (Short Answer)       |
|   Pushed: Feb 3, 1:00 PM • 25 students   |
|   ┌────────────────────────────────────┐ |
|   │ Avg Grade: 78% (AI graded)         │ |
|   └────────────────────────────────────┘ |
|   ┌────────────────────────────────────┐ |
|   │ 👤 Alice Brown     85%             │ |
|   │   "Osmosis is the movement of..."  │ |
|   │   💬 AI: Good explanation of...    │ |
|   └────────────────────────────────────┘ |
|                                          |
+------------------------------------------+
```

---

## Reliability Considerations

### Realtime Updates
- Subscribe to `student_assignments` changes filtered by instructor_id
- Client-side filter for `question_bank` source
- Debounce rapid updates (300ms) for large classes
- Polling fallback (5s) for reliability

### Auto-Grading Reliability
- Already implemented in AssignedContent.tsx with:
  - Loading toast during grading
  - Error handling per question
  - Direct save to database
  - Retry logic for failed grades

---

## Implementation Order

1. **Fix auto-grading mode** in `push-bank-question` edge function
2. **Create QuestionBankResults component** with:
   - Data fetching + filtering
   - Grouping logic
   - Basic results display
3. **Add realtime subscription** for live updates
4. **Add AI summary** using existing pattern
5. **Add export functionality** (PDF/CSV)
6. **Integrate into QuestionBankTab**
7. **Deploy edge function** and test end-to-end
